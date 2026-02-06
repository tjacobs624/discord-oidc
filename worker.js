import * as config from './config.json'
import { Hono } from 'hono'
import * as jose from 'jose'

const algorithm = {
	name: 'RSASSA-PKCS1-v1_5',
	modulusLength: 2048,
	publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
	hash: { name: 'SHA-256' },
}

const importAlgo = {
	name: 'RSASSA-PKCS1-v1_5',
	hash: { name: 'SHA-256' },
}

async function loadOrGenerateKeyPair(KV) {
	let keyPair = {}
	let keyPairJson = await KV.get('keys', { type: 'json' })

	if (keyPairJson !== null) {
		keyPair.publicKey = await crypto.subtle.importKey('jwk', keyPairJson.publicKey, importAlgo, true, ['verify'])
		keyPair.privateKey = await crypto.subtle.importKey('jwk', keyPairJson.privateKey, importAlgo, true, ['sign'])

		return keyPair
	} else {
		keyPair = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify'])

		await KV.put('keys', JSON.stringify({
			privateKey: await crypto.subtle.exportKey('jwk', keyPair.privateKey),
			publicKey: await crypto.subtle.exportKey('jwk', keyPair.publicKey)
		}))

		return keyPair
	}

}

async function appendDebugLog(KV, entry) {
	const logId = `debug:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`
	entry.timestamp = new Date().toISOString()
	entry.logId = logId
	// Store individual log entry with 24h TTL
	await KV.put(logId, JSON.stringify(entry, null, 2), { expirationTtl: 86400 })

	// Maintain an index of recent log IDs
	let index = await KV.get('debug:index', { type: 'json' }) || []
	index.push(logId)
	// Keep only last 50 entries in index
	if (index.length > 50) index = index.slice(-50)
	await KV.put('debug:index', JSON.stringify(index), { expirationTtl: 86400 })
}

const app = new Hono()

app.get('/authorize/:scopemode', async (c) => {

	if (c.req.query('client_id') !== config.clientId
		|| c.req.query('redirect_uri') !== config.redirectURL
		|| !['guilds', 'email'].includes(c.req.param('scopemode'))) {
		return c.text('Bad request.', 400)
	}

	const params = new URLSearchParams({
		'client_id': config.clientId,
		'redirect_uri': config.redirectURL,
		'response_type': 'code',
		'scope': c.req.param('scopemode') == 'guilds' ? 'identify email guilds' : 'identify email',
		'state': c.req.query('state'),
		'prompt': 'none'
	}).toString()

	return c.redirect('https://discord.com/oauth2/authorize?' + params)
})

app.post('/token', async (c) => {
	const body = await c.req.parseBody()
	const code = body['code']
	const params = new URLSearchParams({
		'client_id': config.clientId,
		'client_secret': config.clientSecret,
		'redirect_uri': config.redirectURL,
		'code': code,
		'grant_type': 'authorization_code',
		'scope': 'identify email'
	}).toString()

	const tokenResp = await fetch('https://discord.com/api/v10/oauth2/token', {
		method: 'POST',
		body: params,
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		}
	})
	const tokenRespStatus = tokenResp.status
	const r = await tokenResp.json()

	console.log('[DEBUG /token] Discord token exchange status:', tokenRespStatus)
	console.log('[DEBUG /token] Discord token response:', JSON.stringify(r))

	if (r === null || tokenRespStatus !== 200) {
		await appendDebugLog(c.env.KV, {
			step: 'token_exchange_failed',
			tokenRespStatus,
			tokenResponse: r,
		})
		return new Response("Bad request.", { status: 400 })
	}
	const userInfoResp = await fetch('https://discord.com/api/v10/users/@me', {
		headers: {
			'Authorization': 'Bearer ' + r['access_token']
		}
	})
	const userInfoStatus = userInfoResp.status
	const userInfo = await userInfoResp.json()

	console.log('[DEBUG /token] User info status:', userInfoStatus)
	console.log('[DEBUG /token] User info:', JSON.stringify(userInfo))

	if (!userInfo['verified']) {
		await appendDebugLog(c.env.KV, {
			step: 'user_not_verified',
			userInfoStatus,
			userInfo,
			tokenResponse: { scope: r.scope, token_type: r.token_type },
		})
		return c.text('Bad request.', 400)
	}

	let servers = []

	const serverResp = await fetch('https://discord.com/api/v10/users/@me/guilds', {
		headers: {
			'Authorization': 'Bearer ' + r['access_token']
		}
	})

	if (serverResp.status === 200) {
		const serverJson = await serverResp.json()
		servers = serverJson.map(item => {
			return item['id']
		})
	}

	let roleClaims = {}

	if (c.env.DISCORD_TOKEN && 'serversToCheckRolesFor' in config) {
		await Promise.all(config.serversToCheckRolesFor.map(async guildId => {
			if (servers.includes(guildId)) {
				let memberPromise = fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userInfo['id']}`, {
					headers: {
						'Authorization': 'Bot ' + c.env.DISCORD_TOKEN
					}
				})
				// i had issues doing this any other way?
				const memberResp = await memberPromise
				const memberJson = await memberResp.json()

				roleClaims[`roles:${guildId}`] = memberJson.roles
			}

		}
		))
	}

	let preferred_username = userInfo['username']

	if (userInfo['discriminator'] && userInfo['discriminator'] !== '0'){
		preferred_username += `#${userInfo['discriminator']}`
	}

	let displayName = userInfo['global_name'] ?? userInfo['username']

	const idTokenClaims = {
		iss: 'https://cloudflare.com',
		aud: config.clientId,
		preferred_username,
		...userInfo,
		...roleClaims,
		email: userInfo['email'],
		global_name: userInfo['global_name'],
		name: displayName,
		guilds: servers
	}

	console.log('[DEBUG /token] ID token claims:', JSON.stringify(idTokenClaims))

	const idToken = await new jose.SignJWT(idTokenClaims)
		.setProtectedHeader({ alg: 'RS256' })
		.setExpirationTime('1h')
		.setAudience(config.clientId)
		.sign((await loadOrGenerateKeyPair(c.env.KV)).privateKey)

	const tokenResponse = {
		...r,
		scope: 'identify email',
		id_token: idToken
	}

	// Persist full debug info for this auth attempt
	await appendDebugLog(c.env.KV, {
		step: 'token_issued',
		userInfo,
		servers,
		roleClaims,
		idTokenClaims,
		tokenResponseMeta: {
			scope: tokenResponse.scope,
			token_type: tokenResponse.token_type,
			expires_in: tokenResponse.expires_in,
		},
	})

	return c.json(tokenResponse)
})

app.get('/debug/logs', async (c) => {
	const index = await c.env.KV.get('debug:index', { type: 'json' }) || []
	const logs = await Promise.all(
		index.map(id => c.env.KV.get(id, { type: 'json' }))
	)
	return c.json(logs.filter(Boolean).reverse())
})

app.get('/debug/logs/:id', async (c) => {
	const entry = await c.env.KV.get(`debug:${c.req.param('id')}`, { type: 'json' })
	if (!entry) return c.text('Not found', 404)
	return c.json(entry)
})

app.delete('/debug/logs', async (c) => {
	const index = await c.env.KV.get('debug:index', { type: 'json' }) || []
	await Promise.all(index.map(id => c.env.KV.delete(id)))
	await c.env.KV.delete('debug:index')
	return c.json({ cleared: index.length })
})

app.get('/jwks.json', async (c) => {
	let publicKey = (await loadOrGenerateKeyPair(c.env.KV)).publicKey
	return c.json({
		keys: [{
			alg: 'RS256',
			kid: 'jwtRS256',
			...(await crypto.subtle.exportKey('jwk', publicKey))
		}]
	})
})

export default app