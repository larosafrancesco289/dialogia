# Vercel Deployment Setup

## Quick Start

### 1. Deploy to Vercel

1. Import your repository to Vercel
2. Set the framework to "Next.js"
3. Add environment variables (see below)
4. Deploy

### 2. Environment Variables

Go to **Settings** → **Environment Variables** and add:

```
AUTH_COOKIE_SECRET=<random-32-char-hex>
ACCESS_CODE_PEPPER=<random-32-char-hex>
OPENROUTER_API_KEY=<your-openrouter-key>
ACCESS_CODES_DEVELOPER_HASHED=<your-dev-code-hash>
ACCESS_CODES_INDIVIDUAL_HASHED=<friend-code-hash-1>,<friend-code-hash-2>
```

Optional (for free tier with separate key):
```
OPENROUTER_FREE_API_KEY=<separate-openrouter-key>
```

Optional (for voice mode - developer tier only):
```
XAI_API_KEY=<your-xai-key>
```

## Generating Secrets & Codes

### Generate Random Secrets

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use this for both `AUTH_COOKIE_SECRET` and `ACCESS_CODE_PEPPER`.

### Generate Code Hashes

Create `generate-code.js`:
```javascript
const crypto = require('crypto');
const pepper = process.argv[2];
const code = process.argv[3];
const hash = crypto.createHmac('sha256', pepper).update(code, 'utf8').digest('hex');
console.log(`Code: ${code} → Hash: ${hash}`);
```

Run it:
```bash
node generate-code.js YOUR_PEPPER my-secret-dev-code
node generate-code.js YOUR_PEPPER friend-code-1
node generate-code.js YOUR_PEPPER friend-code-2
```

## Access Tiers

| Tier | Code | Models | Voice |
|------|------|--------|-------|
| **Free** | None | Free models only | No |
| **Individual** | From `ACCESS_CODES_INDIVIDUAL_HASHED` | All models | No |
| **Developer** | From `ACCESS_CODES_DEVELOPER_HASHED` | All models | Yes |

## Local Development

In dev mode (`bun dev`), you automatically get developer tier - no code needed.

## Limiting API Costs

On OpenRouter:
1. Go to your account settings
2. Set a **credit limit** (e.g., $2)
3. This limits total spend across all users

For extra safety, create a separate OpenRouter API key for this deployment.
