// SMS በAfroMessage — https://api.afromessage.com/api/send
// በዳሽቦርዱ "ቅንብሮች" → SMS ይበራል፤ የወር ገደብ እና እያንዳንዱ የSMS አይነት እዚያ ይወሰናሉ።

import * as db from "./db.js";
import { loadSettings } from "./settings.js";

const API_ROOT = "https://api.afromessage.com/api";

/** "+251911223344" → "0911223344"? AfroMessage ሁለቱንም ይቀበላል፤ +251 ቅርጹን እንጠቀማለን */
const toMsisdn = (phone) => String(phone ?? "").replace(/[^\d+]/g, "");

let warnedMonth = null;

/**
 * SMS ይልካል። { ok, skipped?, error? } ይመልሳል — አይወረውርም።
 * kind፦ C.SMS_KINDS ውስጥ ያለ (በቅንብሮች ሊጠፋ ይችላል)
 */
export async function sendSms(env, { to, text, kind, tg_id = null, force = false }) {
  const s = (await loadSettings(env)).sms;
  const phone = toMsisdn(to);
  if (!phone) return { ok: false, skipped: "no_phone" };
  if (!force && (!s.enabled || !s.token)) return { ok: false, skipped: "disabled" };
  if (!force && s.kinds?.[kind] === false) return { ok: false, skipped: "kind_off" };
  if (!s.token) return { ok: false, error: "AfroMessage API token አልተቀመጠም።" };

  const used = await db.smsMonthCount(env.DB);
  if (used >= s.monthly_limit) {
    await db.logSms(env.DB, { phone, tg_id, kind, text, status: "blocked", error: "monthly limit" });
    return { ok: false, error: `የወር የSMS ገደብ (${s.monthly_limit}) ደርሷል።`, limit: true, used };
  }

  const body = { to: phone, message: text };
  if (s.sender) body.sender = s.sender;
  if (s.identifier) body.from = s.identifier;
  let status = "failed", error = null;
  try {
    const res = await fetch(`${env.SMS_API_ROOT || API_ROOT}/send`, {
      method: "POST",
      headers: { authorization: `Bearer ${s.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.acknowledge === "success") status = "sent";
    else error = String(j.response?.errors?.join?.(", ") ?? j.response?.message ?? j.message ?? `HTTP ${res.status}`).slice(0, 300);
  } catch (e) {
    error = String(e.message ?? e).slice(0, 300);
  }
  await db.logSms(env.DB, { phone, tg_id, kind, text, status, error });
  return status === "sent" ? { ok: true, used: used + 1, limit_near: used + 1 >= s.monthly_limit * 0.9 } : { ok: false, error };
}

/** ገደቡ ሲቃረብ/ሲደርስ በወር አንድ ጊዜ ለአስተዳዳሪዎች */
export async function limitWarning(env, res, notify) {
  if (!(res?.limit || res?.limit_near)) return;
  const month = new Date().toISOString().slice(0, 7) + (res.limit ? ":full" : ":near");
  if (warnedMonth === month) return;
  const key = `sms_warn_${month}`;
  const done = await env.DB.prepare("SELECT value FROM meta WHERE key = ?").bind(key).first();
  if (done) return;
  await env.DB.prepare("INSERT INTO meta (key, value) VALUES (?, '1') ON CONFLICT(key) DO NOTHING").bind(key).run();
  warnedMonth = month;
  await notify(res.limit ? "⚠️ <b>የወር የSMS ገደብ ደርሷል</b> — SMS ቆሟል። በዳሽቦርድ → ቅንብሮች ገደቡን ማሳደግ ይቻላል።" : "⚠️ የወር የSMS ገደብ 90% ደርሷል።");
}
