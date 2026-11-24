import { jwtVerify, createRemoteJWKSet } from "jose";

const ALLOWED_EMAILS = new Set([
  "g21633290@gmail.com",
  "gzsteve551@gmail.com"
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function safeName(name) {
  return String(name || "model").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

async function requireAllowedUser(request, env) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new Error("Please sign in with an authorized Google account.");
  const team = env.ACCESS_TEAM_DOMAIN.replace(/\/$/, "");
  const JWKS = createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`));
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: team,
    audience: env.ACCESS_AUD
  });
  const email = String(payload.email || "").toLowerCase();
  if (!ALLOWED_EMAILS.has(email)) throw new Error("This account is not allowed to upload.");
  return email;
}

async function githubRequest(path, env, options = {}) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  return fetch(url, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Model-Vault",
      ...(options.headers || {})
    }
  });
}

async function handleApi(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/models" && request.method === "GET") {
    const res = await githubRequest("models", env);
    if (res.status === 404) return json([]);
    if (!res.ok) return json({ error: "Could not read the storage repository. Check its name and permissions." }, 502);
    const entries = await res.json();
    const models = (Array.isArray(entries) ? entries : [])
      .filter(x => x.type === "file" && /\.(glb|gltf|obj|stl)$/i.test(x.name))
      .map(x => ({ name: x.name, download: x.download_url, size: x.size }));
    return json(models);
  }

  if (url.pathname === "/api/upload" && request.method === "POST") {
    let email;
    try {
      email = await requireAllowedUser(request, env);
    } catch (e) {
      return json({ error: e.message || "Access denied." }, 401);
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") return json({ error: "Choose a model file first." }, 400);
    const name = safeName(file.name);
    if (!/\.(glb|gltf|obj|stl)$/i.test(name)) return json({ error: "Supported formats: GLB, GLTF, OBJ, STL." }, 400);

    const maxBytes = Math.max(1, Number(env.MAX_UPLOAD_MB || 20)) * 1024 * 1024;
    if (file.size > maxBytes) return json({ error: `File exceeds the ${env.MAX_UPLOAD_MB || 20} MB upload limit.` }, 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const content = btoa(binary);
    const path = `models/${Date.now()}-${name}`;

    const res = await githubRequest(path, env, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Add model ${name} via Model Vault (${email})`,
        content
      })
    });
    if (!res.ok) {
      const detail = await res.text();
      return json({ error: "GitHub rejected the upload. Check GITHUB_TOKEN permissions and repository settings.", detail: detail.slice(0, 500) }, 502);
    }
    return json({ ok: true, name });
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env);
      } catch (e) {
        return json({ error: e.message || "Server error." }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
