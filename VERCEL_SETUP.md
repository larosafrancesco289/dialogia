# Vercel Deployment Setup

This guide explains how to deploy Dialogia to Vercel with the tiered access system.

## Overview

Dialogia supports three access tiers:

| Tier | Access | Models | Voice Mode |
|------|--------|--------|------------|
| **Free** | No code required | Free models only | No |
| **Individual** | One-time use code | All models | No |
| **Developer** | Developer code | All models | Yes |

## Quick Setup

### 1. Create a Vercel Project

1. Import your repository to Vercel
2. Configure the framework preset as "Next.js"
3. Deploy

### 2. Add Vercel KV Store

Vercel KV is used to track consumed one-time codes.

1. Go to your project in Vercel Dashboard
2. Navigate to **Storage** tab
3. Click **Create Database** → **KV**
4. Name it (e.g., `dialogia-codes`)
5. Click **Create**
6. The environment variables are automatically added:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
   - `KV_REST_API_READ_ONLY_TOKEN`
   - `KV_URL`

### 3. Configure Environment Variables

Go to **Settings** → **Environment Variables** and add:

#### Required Variables

```
AUTH_COOKIE_SECRET=<random-32-char-hex>
ACCESS_CODE_PEPPER=<random-32-char-hex>
OPENROUTER_API_KEY=<your-openrouter-api-key>
```

#### Optional: Free Tier API Key

```
OPENROUTER_FREE_API_KEY=<separate-openrouter-api-key>
```

If not set, free tier will use the main `OPENROUTER_API_KEY`.

#### Access Codes (Hashed)

```
ACCESS_CODES_INDIVIDUAL_HASHED=<hash1>,<hash2>,<hash3>
ACCESS_CODES_DEVELOPER_HASHED=<dev-hash>
```

See [Generating Access Codes](#generating-access-codes) below.

#### Voice Mode (Developer Tier Only)

```
XAI_API_KEY=<your-xai-api-key>
```

## Generating Access Codes

Access codes are stored as HMAC-SHA256 hashes for security.

### Using Node.js

Create a file `generate-code.js`:

```javascript
const crypto = require('crypto');

const pepper = process.env.ACCESS_CODE_PEPPER || 'your-pepper-here';
const code = process.argv[2];

if (!code) {
  console.log('Usage: node generate-code.js <plaintext-code>');
  process.exit(1);
}

const hash = crypto.createHmac('sha256', pepper).update(code, 'utf8').digest('hex');
console.log(`Code: ${code}`);
console.log(`Hash: ${hash}`);
```

Run it:

```bash
ACCESS_CODE_PEPPER=your-pepper node generate-code.js my-secret-code
```

### Example: Creating Codes

```bash
# Set your pepper (must match ACCESS_CODE_PEPPER in Vercel)
export ACCESS_CODE_PEPPER="your-32-char-random-pepper"

# Generate developer code
node generate-code.js dev-secret-2024
# Output: Hash: abc123...

# Generate individual codes
node generate-code.js user-code-001
node generate-code.js user-code-002
node generate-code.js user-code-003
```

Then set in Vercel:
```
ACCESS_CODES_DEVELOPER_HASHED=abc123...
ACCESS_CODES_INDIVIDUAL_HASHED=def456...,ghi789...,jkl012...
```

## Generating Random Secrets

For `AUTH_COOKIE_SECRET` and `ACCESS_CODE_PEPPER`:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using OpenSSL
openssl rand -hex 32
```

## Free Models Configuration

Edit `src/data/freeModels.ts` to set which models are available for free tier users.

Find free models on OpenRouter:
1. Go to https://openrouter.ai/models
2. Look for models with `:free` suffix or $0 pricing
3. Add their IDs to `FREE_MODEL_IDS` array

Example:
```typescript
export const FREE_MODEL_IDS: string[] = [
  'meta-llama/llama-3.2-3b-instruct:free',
  'google/gemma-2-9b-it:free',
  'mistralai/mistral-7b-instruct:free',
];
```

## Environment Variables Summary

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_COOKIE_SECRET` | Yes | Secret for signing auth tokens (32+ hex chars) |
| `ACCESS_CODE_PEPPER` | Yes | Pepper for hashing access codes (32+ hex chars) |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key for paid tiers |
| `OPENROUTER_FREE_API_KEY` | No | Separate API key for free tier |
| `ACCESS_CODES_INDIVIDUAL_HASHED` | Yes* | Comma-separated hashed individual codes |
| `ACCESS_CODES_DEVELOPER_HASHED` | Yes* | Comma-separated hashed developer codes |
| `XAI_API_KEY` | No | xAI API key for voice mode |
| `KV_REST_API_URL` | Auto | Vercel KV URL (auto-configured) |
| `KV_REST_API_TOKEN` | Auto | Vercel KV token (auto-configured) |

*At least one of the code hash variables must be set for code-based access.

## Local Development

In development mode (`bun dev`), the access gate is bypassed and you automatically get developer tier access.

To test tiers locally:

1. **Developer tier**: Just run `bun dev` - automatic
2. **Test with production auth**: Set `NODE_ENV=production` and configure env vars
3. **Vercel KV locally**: Either connect to your production KV or codes won't be consumed

## Multiple Deployments

You can create separate Vercel projects for different use cases:

### Free-Only Deployment
- Only set `OPENROUTER_FREE_API_KEY`
- Leave `ACCESS_CODES_*` empty
- Users go straight to free tier

### Full Deployment
- Set all env vars
- Users can choose free tier or enter codes

## Troubleshooting

### "codes_unconfigured" Error
- Ensure `ACCESS_CODES_INDIVIDUAL_HASHED` or `ACCESS_CODES_DEVELOPER_HASHED` is set
- Check for trailing commas or whitespace in the hash list

### Codes Not Being Consumed
- Check Vercel KV is connected
- Look for warnings in Vercel function logs about KV configuration

### Voice Mode Not Showing
- Voice mode only appears for developer tier
- Ensure `XAI_API_KEY` is set
- Check the tier cookie is correctly set

### Model Access Denied (403)
- Free tier users can only use models in `FREE_MODEL_IDS`
- Update `src/data/freeModels.ts` to add more free models
