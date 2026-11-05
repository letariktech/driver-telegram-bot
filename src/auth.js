// የTelegram Mini App initData ማረጋገጫ
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

const enc = new TextEncoder();

async function hmac(key, data) {
  const k = await crypto.subtle.importKey(
    "raw", typeof key === "string" ? enc.encode(key) : key,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

const toHex = (buf) => [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** ትክክል ከሆነ የTelegram ተጠቃሚውን ይመልሳል፣ ካልሆነ null */
export async function verifyInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || typeof initData !== "string") return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = await hmac("WebAppData", botToken);
  const expected = toHex(await hmac(secret, dataCheckString));
  if (!safeEqual(expected, hash)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return null;

  try {
    const user = JSON.parse(params.get("user"));
    return user && Number.isInteger(user.id) ? user : null;
  } catch {
    return null;
  }
}

// ---------- የዳሽቦርድ መግቢያ (የተፈረሙ tokens) ----------

const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** { ...payload, exp } → "payload.signature" */
export async function signToken(payload, secret, ttlSeconds) {
  const body = b64u(enc.encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })));
  const sig = b64u(await hmac(`dash:${secret}`, body));
  return `${body}.${sig}`;
}

export async function verifyToken(token, secret) {
  const [body, sig] = String(token ?? "").split(".");
  if (!body || !sig) return null;
  const expected = b64u(await hmac(`dash:${secret}`, body));
  if (!safeEqual(expected, sig)) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64u(body)));
    return p.exp > Date.now() / 1000 ? p : null;
  } catch {
    return null;
  }
}
