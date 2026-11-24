# Model Vault — Cloudflare model gallery

A small 3D model gallery built for **Cloudflare Workers + R2**.

- Anyone can browse and view models.
- Only `g21633290@gmail.com` and `gzsteve551@gmail.com` can upload.
- The restriction is enforced server-side by validating the Cloudflare Access JWT. Hiding the upload button is only a UI detail, not the security boundary.
- Supported single-file formats: `.glb`, `.obj`, `.stl`. GLB is recommended because textures can be embedded in one file.

## 1. Create the R2 bucket

In the Cloudflare dashboard:
1. Open **R2 Object Storage**.
2. Create a bucket, for example `model-vault-files`.
3. Copy the exact bucket name into `wrangler.toml`, replacing `REPLACE_WITH_YOUR_R2_BUCKET_NAME`.

## 2. Configure Cloudflare Access for the two uploader accounts

1. Open **Zero Trust → Access → Applications**.
2. Add a **Self-hosted** application for the hostname you will use, such as `models.example.com`.
3. Set the application path to `/api/admin/*` (or protect the full `/api/admin` path, depending on the dashboard's path matching UI).
4. Add an **Allow** policy with an **Emails** selector containing exactly:
   - `g21633290@gmail.com`
   - `gzsteve551@gmail.com`
5. Create a second self-hosted Access application on the same hostname for `/api/upload` and add the same exact email allowlist. If your Access setup supports one application covering both paths, use `/api/admin/*` and `/api/upload`.
6. Use Google as an identity provider in Access. Users must complete the Google sign-in flow with one of the allowed addresses.

Important: do not create an allow policy for everyone on these protected paths. Keep the email allowlist exact.

## 3. Set the Access JWT values

After creating the Access application, copy its **AUD tag**. Find your team domain in Zero Trust, usually `https://YOUR-TEAM.cloudflareaccess.com`.

Replace these values in `wrangler.toml`:
- `ACCESS_TEAM_DOMAIN`
- `ACCESS_AUD`

The app validates the signed Access JWT and checks the email claim against the two-address allowlist.

## 4. Install and deploy

Install Node.js (LTS), then in this folder run:

```bash
npm install
npx wrangler login
npx wrangler deploy
```

If Wrangler asks to create or configure the R2 bucket binding, make sure it is bound to the existing bucket name in `wrangler.toml`.

For local development:

```bash
npm run dev
```

Local upload authorization will not work unless requests carry a valid Cloudflare Access JWT. Test uploader sign-in on the deployed hostname protected by Access.

## 5. DNS / hostname

Attach the Worker to your chosen hostname using a Worker custom domain or route. The hostname must be proxied through Cloudflare. Configure the Access applications against that same hostname.

## How it works

- `GET /api/models` lists R2 objects.
- `GET /api/models/{key}` streams a model from R2 to the viewer.
- `GET /api/admin/me` checks the signed-in Access identity and returns the email if it is on the allowlist.
- `POST /api/upload` validates the Access JWT and uploads the file to R2.

## Notes

- The gallery is public by design; only the admin endpoints are behind Access.
- Upload limit defaults to 100 MB. Change `MAX_UPLOAD_MB` in `wrangler.toml` if needed.
- For OBJ, upload a self-contained OBJ. MTL files and external textures are not bundled by this starter. STL has no embedded materials. Use GLB for textured models.
- For a private gallery as well as private uploads, protect the entire hostname with Cloudflare Access and adjust the public API policy accordingly.
- Before going live, verify that the Access applications match the actual paths and that the two-email policy is the only allow policy on those paths.
