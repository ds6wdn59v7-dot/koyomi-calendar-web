// Koyomiカレンダー用 Googleトークン交換プロキシ (Cloudflare Workers)
// 役割: クライアントシークレットを使ったトークン交換・更新のみを行うステートレスな中継役。
// refresh_token / access_token はクライアント(localStorage)側で保持する。

const ALLOWED_ORIGIN = "https://nakamochiya.com";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function cors(resp) {
  resp.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  resp.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  resp.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return resp;
}

async function tokenRequest(env, params) {
  const body = new URLSearchParams({
    client_id: env.CLIENT_ID,
    client_secret: env.CLIENT_SECRET,
    ...params,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    return new Response(JSON.stringify({ error: data.error || "token_error", error_description: data.error_description }), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }
    if (request.method !== "POST") {
      return cors(new Response("Method Not Allowed", { status: 405 }));
    }

    const url = new URL(request.url);
    let body;
    try {
      body = await request.json();
    } catch {
      return cors(new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers: { "Content-Type": "application/json" } }));
    }

    if (url.pathname === "/exchange") {
      if (!body.code || !body.redirect_uri) {
        return cors(new Response(JSON.stringify({ error: "missing_params" }), { status: 400, headers: { "Content-Type": "application/json" } }));
      }
      return cors(await tokenRequest(env, {
        code: body.code,
        redirect_uri: body.redirect_uri,
        grant_type: "authorization_code",
      }));
    }

    if (url.pathname === "/refresh") {
      if (!body.refresh_token) {
        return cors(new Response(JSON.stringify({ error: "missing_params" }), { status: 400, headers: { "Content-Type": "application/json" } }));
      }
      return cors(await tokenRequest(env, {
        refresh_token: body.refresh_token,
        grant_type: "refresh_token",
      }));
    }

    return cors(new Response("Not Found", { status: 404 }));
  },
};
