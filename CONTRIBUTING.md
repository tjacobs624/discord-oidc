# Contributing to Discord OIDC Provider

Thank you for your interest in contributing to the Discord OIDC Provider for Cloudflare Access! This guide will help you set up your local development environment.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher recommended)
- **npm** (comes with Node.js)
- A **Cloudflare account** (free tier works fine)
- A **Discord Developer Application** - [Create one here](https://discord.com/developers/applications)

## Local Development Setup

### 1. Fork and Clone the Repository

First, fork the repository on GitHub, then clone your fork:

```bash
git clone https://github.com/YOUR_USERNAME/discord-oidc.git
cd discord-oidc
```

Replace `YOUR_USERNAME` with your GitHub username.

### 2. Install Dependencies

```bash
npm install
```

This will install:
- `hono` - Web framework for Cloudflare Workers
- `jose` - JavaScript implementation of JOSE (JWT, JWE, JWS, JWK, JWA)
- `wrangler` - Cloudflare Workers CLI

### 3. Configure Your Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or select an existing one
3. Navigate to the OAuth2 section
4. Add a redirect URI for local development:
   - For Cloudflare Access: `https://YOURNAME.cloudflareaccess.com/cdn-cgi/access/callback`
   - For local testing: `http://localhost:8787/callback` (if needed)
5. Copy your **Client ID** and **Client Secret**

### 4. Set Up Configuration

Create your local configuration file:

```bash
cp config.sample.json config.json
```

Edit `config.json` with your Discord application credentials:

```json
{
    "clientId": "YOUR_DISCORD_APPLICATION_ID",
    "clientSecret": "YOUR_DISCORD_APPLICATION_SECRET",
    "redirectURL": "https://YOURNAME.cloudflareaccess.com/cdn-cgi/access/callback",
    "serversToCheckRolesFor": []
}
```

**Note:** `config.json` is gitignored to prevent accidentally committing secrets.

### 5. Set Up Cloudflare KV Namespace

You'll need a Cloudflare KV namespace for storing signing keys:

1. Log in to Cloudflare: `npx wrangler login`
2. Create a KV namespace:
   ```bash
   npx wrangler kv:namespace create "KV"
   ```
3. For local development, create a preview namespace:
   ```bash
   npx wrangler kv:namespace create "KV" --preview
   ```
4. Update `wrangler.toml` with your namespace IDs:
   ```toml
   kv_namespaces = [
     { binding = "KV", id = "YOUR_NAMESPACE_ID", preview_id = "YOUR_PREVIEW_NAMESPACE_ID" }
   ]
   ```

### 6. (Optional) Set Up Discord Bot Token for Role Checking

If you want to test role-based authentication:

1. Create a bot in your Discord application
2. Generate a bot token
3. Invite the bot to your test server
4. Set the token as a secret:
   ```bash
   npx wrangler secret put DISCORD_TOKEN
   ```
   Enter your bot token when prompted
5. Add your server ID to `config.json`:
   ```json
   "serversToCheckRolesFor": ["YOUR_SERVER_ID"]
   ```

## Running Locally

Start the development server:

```bash
npm start
```

This runs `wrangler dev --local`, which starts a local development server at `http://localhost:8787`.

### Available Endpoints

- `GET /authorize/:scopemode` - OIDC authorization endpoint (`:scopemode` can be `email` or `guilds`)
- `POST /token` - OIDC token endpoint
- `GET /jwks.json` - JSON Web Key Set endpoint
- `GET /debug/logs` - View debug logs (for troubleshooting)
- `DELETE /debug/logs` - Clear debug logs

### Testing the Worker

You can test endpoints using curl or tools like Postman:

```bash
# Test the JWKS endpoint
curl http://localhost:8787/jwks.json

# View debug logs
curl http://localhost:8787/debug/logs
```

## Development Workflow

### Making Changes

1. Create a new branch for your feature or fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes to the code

3. Test your changes locally with `npm start`

4. Ensure your code follows the existing style and conventions

### Code Style

- Use tabs for indentation (as per existing code)
- Follow the existing code structure and patterns
- Keep functions focused and readable
- Add comments for complex logic

### Testing Your Changes

1. Run the worker locally: `npm start`
2. Test all affected endpoints
3. Check the debug logs for any errors: `http://localhost:8787/debug/logs`
4. Verify that existing functionality still works

### Committing Changes

1. Stage your changes: `git add .`
2. Commit with a descriptive message:
   ```bash
   git commit -m "Add feature: description of what you did"
   ```
3. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

### Creating a Pull Request

1. Go to the repository on GitHub
2. Click "New Pull Request"
3. Select your branch
4. Fill out the PR template with:
   - Description of your changes
   - Why the changes are needed
   - How to test the changes
   - Any relevant issue numbers

## Deployment

To deploy your changes to production:

```bash
npx wrangler publish
```

**Note:** Only maintainers should deploy to production. Contributors should focus on submitting PRs.

## Troubleshooting

### Dependencies Not Installing

If you see `UNMET DEPENDENCY` errors:
```bash
rm -rf node_modules package-lock.json
npm install
```

### KV Namespace Issues

If you get KV-related errors:
- Ensure you've created the KV namespace
- Check that `wrangler.toml` has the correct namespace IDs
- For local development, ensure you have a `preview_id` set

### Wrangler Login Issues

If `wrangler login` doesn't work:
- Try `npx wrangler login` instead
- Clear your browser cache and try again
- Check that you have a Cloudflare account

### Config File Not Found

Ensure you've copied `config.sample.json` to `config.json` and filled in your credentials.

## Getting Help

- Check existing [Issues](../../issues) on GitHub
- Read the [README](README.md) for usage instructions
- Review the [Discord API Documentation](https://discord.com/developers/docs)

## Security

If you find a security vulnerability:
- **DO NOT** create a public issue
- Contact the maintainer privately (see README for contact info)
- Use GitHub's [Security Advisories](../../security/advisories) feature

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing! 🎉
