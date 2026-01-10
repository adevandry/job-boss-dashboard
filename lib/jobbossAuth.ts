let cachedToken: string | null = null;
let tokenExpiresAtMs = 0;

export async function getJobbossAccessToken() {
  const tokenUrl = (process.env.JOBBOSS_TOKEN_URL || "").trim();
  const clientId = (process.env.JOBBOSS_CLIENT_ID || "").trim();
  const clientSecret = (process.env.JOBBOSS_CLIENT_SECRET || "").trim();

  if (!tokenUrl) throw new Error("Missing JOBBOSS_TOKEN_URL in .env.local");
  if (!clientId) throw new Error("Missing JOBBOSS_CLIENT_ID in .env.local");
  if (!clientSecret) throw new Error("Missing JOBBOSS_CLIENT_SECRET in .env.local");

  // Reuse token if still valid (60 second safety buffer)
  if (cachedToken && Date.now() < tokenExpiresAtMs - 60_000) {
    return cachedToken;
  }

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Token request failed (${res.status}): ${text}`);

  const json = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error(`Token response missing access_token: ${text}`);

  cachedToken = json.access_token;
  tokenExpiresAtMs = Date.now() + Number(json.expires_in || 3600) * 1000;

  return cachedToken;
}
