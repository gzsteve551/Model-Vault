import { createRemoteJWKSet, jwtVerify } from "jose";

const ALLOWED_TYPES = new Set(["glb", "obj", "stl"]);
const MAX_DEFAULT_BYTES = 100 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function extension(name = "") {
  return name.split(".").pop()?.toLowerCase() || "";
}

async function requireAllowedUser(request, env) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new Error("Sign in through Cloudflare Access first.");

  const teamDomain = env.ACCESS_TEAM_DOMAIN.replace(/\/$/, "");
  const jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
  const { payload } = await jwtVerify(token, jwks, {
    issuer: teamDomain,
    audience: env.ACCESS_AUD
  });

  const email = String(payload.email || "").toLowerCase();
  const allowed = new Set(["g21633290@gmail.com", "gzsteve551@gmail.com"]);
  if (!allowed.has(email)) throw new Error("This Google account is not allowed to upload.");
  return email;
}

function errorResponse(error) {
  const message = error?.message || "Request failed.";
  const status = message.includes("not allowed") ? 403 :
    message.includes("Sign in") ? 401 : 400;
  return json({ error: message }, status);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === "GET" && path === "/api/models") {
        const listed = await env.MODELS.list({ limit: 200 });
        const models = listed.objects.map(obj => ({
          key: obj.key,
          name: obj.customMetadata?.originalName || obj.key,
          size: obj.size,
          uploaded: obj.uploaded
        })).sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
        return json({ models });
      }

      if (request.method === "GET" && path.startsWith("/api/models/")) {
        const key = decodeURIComponent(path.slice("/api/models/".length));
        if (!key || key.includes("/") || key.includes("..")) return json({ error: "Invalid model key." }, 400);
        const object = await env.MODELS.get(key);
        if (!object) return json({ error: "Model not found." }, 404);
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        headers.set("cache-control", "public, max-age=3600");
        headers.set("content-disposition", `inline; filename="${(object.customMetadata?.originalName || key).replace(/["\\]/g, "")}"`);
        return new Response(object.body, { headers });
      }

      if (request.method === "GET" && path === "/api/admin/me") {
        const email = await requireAllowedUser(request, env);
        return json({ allowed: true, email });
      }

      if (request.method === "POST" && path === "/api/upload") {
        const email = await requireAllowedUser(request, env);
        const form = await request.formData();
        const file = form.get("model");
        if (!(file instanceof File)) return json({ error: "Choose a model file." }, 400);

        const ext = extension(file.name);
        if (!ALLOWED_TYPES.has(ext)) return json({ error: "Supported formats: .glb, .obj, and .stl." }, 400);
        const maxBytes = (Number(env.MAX_UPLOAD_MB) || 100) * 1024 * 1024;
        if (file.size <= 0 || file.size > maxBytes) {
          return json({ error: `File must be between 1 byte and ${Math.round(maxBytes / 1024 / 1024)} MB.` }, 400);
        }

        const safeBase = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 120);
        const key = `${crypto.randomUUID()}.${ext}`;
        await env.MODELS.put(key, file.stream(), {
          httpMetadata: { contentType: file.type || "application/octet-stream" },
          customMetadata: {
            originalName: safeBase,
            uploadedBy: email
          }
        });
        return json({ ok: true, key, name: safeBase }, 201);
      }

      if (path.startsWith("/api/")) return json({ error: "Not found." }, 404);
      return env.ASSETS.fetch(request);
    } catch (error) {
      return errorResponse(error);
    }
  }
};
