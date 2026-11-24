# Model Vault (GitHub storage, no R2)

This version stores model files in a separate GitHub repository and does not require Cloudflare R2.

## Important public-file warning
The `model-vault-storage` repository must be public for the gallery's direct model previews to work without an additional download proxy. That means uploaded model files are publicly downloadable. Do not upload private or confidential models. The website's upload API still restricts uploads to the two email addresses in `src/index.js`.

## 1. GitHub storage repository
Create a separate repository named `model-vault-storage`. Set it to **Public**. It can be empty.

Create a GitHub fine-grained personal access token:
- Repository access: Only select repositories → `model-vault-storage`
- Repository permissions: Contents → Read and write

In Cloudflare Worker settings, add a secret named `GITHUB_TOKEN` with that token as its value. Never put the token in frontend code or commit it to GitHub.

## 2. Cloudflare Access
Protect the Worker hostname with a Cloudflare Access application using Google sign-in. Create an allow policy for only:
- g21633290@gmail.com
- gzsteve551@gmail.com

Copy the Access application audience (AUD) and your team domain.

## 3. Configure wrangler.toml
Replace these placeholders:
- `ACCESS_TEAM_DOMAIN`: your Cloudflare Access team domain, e.g. `https://your-team.cloudflareaccess.com`
- `ACCESS_AUD`: the Access application's AUD tag
- `GITHUB_OWNER`: your GitHub username
- `GITHUB_REPO`: `model-vault-storage`

Do not add an R2 bucket binding. This project does not use R2.

## 4. Deploy as a Worker
Use Cloudflare Workers Builds connected to the website-code repository, with the project root containing `wrangler.toml`.
Build command: `npm install`
Deploy command: `npx wrangler deploy`

Or locally:
```bash
npm install
npx wrangler deploy
```

## Notes
- Upload limit defaults to 20 MB (`MAX_UPLOAD_MB`).
- Supported formats: `.glb`, `.gltf`, `.obj`, `.stl`.
- GitHub API limits and Cloudflare Worker request-size/runtime limits apply. This is not unlimited file hosting.
- The browser loads Three.js and its loaders from jsDelivr.
