// በዳሽቦርዱ የሚቀየሩ ቅንብሮች — ደንቦች፣ ሊንኮች እና የአሽከርካሪ ውል። በD1 `settings` ሰንጠረዥ ይቀመጣሉ።

import * as C from "./constants.js";

// ⚠️ ይህ መነሻ ረቂቅ ብቻ ነው — ከመጠቀምዎ በፊት በሕግ ባለሙያ ያስገምግሙት፣ በዳሽቦርዱ "ቅንብሮች" ያስተካክሉት።
export const DEFAULT_AGREEMENT = {
  am: `የCabby አሽከርካሪ ስምምነት

ይህ ስምምነት በካቢ ቴክኖሎጂ ኃ/የተ/የግ/ድርጅት ("Cabby") እና በCabby Share እና/ወይም Cabby Reserve መተግበሪያዎች አገልግሎት ለመስጠት በተመዘገበው አሽከርካሪ ("አሽከርካሪው") መካከል የተደረገ ነው።

1. ሰነዶች እና መረጃ
አሽከርካሪው ያቀረበው መረጃ እና ሰነዶች (መንጃ ፈቃድ፣ መታወቂያ፣ የፖሊስ ክሊራንስ፣ TIN፣ የመኪና ሰነዶች) ትክክለኛ እና የሚሰሩ መሆናቸውን ያረጋግጣል። ማንኛውም ሰነድ ሲያበቃ ወይም መረጃ ሲቀየር በ7 ቀን ውስጥ ለCabby ያሳውቃል።

2. ደህንነት እና የትራፊክ ሕግ
አሽከርካሪው የኢትዮጵያን የትራፊክ ሕግ ያከብራል፤ አልኮል ወይም አደንዛዥ ዕፅ ወስዶ አያሽከረክርም፤ በሚያሽከረክርበት ጊዜ ስልክ በእጅ አይጠቀምም፤ የተሳፋሪዎችን ደህንነት ያስቀድማል።

3. የመኪና ሁኔታ
አገልግሎት የሚሰጥበት መኪና ንጹህ፣ በቴክኒክ ብቁ፣ የሚሰራ መድን እና ቦሎ ያለው መሆን አለበት። Cabby በማንኛውም ጊዜ መኪናውን የማስመርመር መብት አለው።

4. የደንበኛ አያያዝ
አሽከርካሪው ተሳፋሪዎችን በአክብሮት ያስተናግዳል፤ ማንኛውንም አይነት አድልዎ፣ ትንኮሳ ወይም ማስፈራራት አይፈጽምም፤ በመተግበሪያው ከተወሰነው ዋጋ ውጪ ክፍያ አይጠይቅም።

5. ክፍያ
ክፍያዎች Cabby በሚያሳውቀው የዋጋ እና የኮሚሽን ተመን መሰረት ይፈጸማሉ፤ ገቢ በአሽከርካሪው Telebirr አካውንት ይተላለፋል። አሽከርካሪው የራሱን የግብር ግዴታ ይወጣል።

6. የመረጃ ጥበቃ
አሽከርካሪው የተሳፋሪዎችን የግል መረጃ (ስልክ፣ አድራሻ) ከጉዞው ዓላማ ውጪ አይጠቀምም፣ ለሌላ አያጋራም።

7. አደጋ እና ቅሬታ
ማንኛውም አደጋ፣ ጉዳት ወይም የደህንነት ችግር ወዲያውኑ ለCabby ድጋፍ ቡድን ሪፖርት ይደረጋል።

8. እገዳ እና ማቋረጥ
ይህን ስምምነት ወይም የCabby ደንቦችን መጣስ፣ ተደጋጋሚ የደንበኛ ቅሬታ፣ ወይም ጊዜው ያለፈበት ሰነድ ጊዜያዊ እገዳ ወይም ውል መቋረጥ ሊያስከትል ይችላል። አሽከርካሪው ችግሩን የማስተካከል እና ማብራሪያ የመስጠት እድል ይሰጠዋል። አሽከርካሪው በማንኛውም ጊዜ በማሳወቅ አገልግሎቱን ማቆም ይችላል።

9. ማሻሻያ
Cabby ይህን ስምምነት ሊያሻሽል ይችላል፤ ማሻሻያው በቦቱ ወይም በመተግበሪያው ይነገራል።

10. ተፈጻሚ ሕግ
ይህ ስምምነት በኢትዮጵያ ፌዴራላዊ ዲሞክራሲያዊ ሪፐብሊክ ሕጎች ይመራል።`,
  en: `Cabby Driver Agreement

This agreement is between Cabby Technology PLC ("Cabby") and the driver registering to provide services through the Cabby Share and/or Cabby Reserve apps ("the Driver").

1. Documents and information
The Driver confirms that the information and documents provided (driving licence, ID, police clearance, TIN, vehicle documents) are true and valid, and will notify Cabby within 7 days when any document expires or information changes.

2. Safety and traffic law
The Driver will obey Ethiopian traffic law, never drive under the influence of alcohol or drugs, not use a handheld phone while driving, and put passenger safety first.

3. Vehicle condition
The vehicle must be clean, roadworthy, and have valid insurance and bolo. Cabby may inspect the vehicle at any time.

4. Treating riders
The Driver will treat riders with respect, never discriminate, harass or threaten, and never charge more than the fare set in the app.

5. Payment
Payments follow the fare and commission rates published by Cabby; earnings are paid to the Driver's Telebirr account. The Driver is responsible for their own taxes.

6. Data protection
The Driver will not use riders' personal information (phone, address) beyond the trip, nor share it with anyone.

7. Incidents and complaints
Any accident, damage or safety problem must be reported to Cabby support immediately.

8. Suspension and termination
Breaching this agreement or Cabby's rules, repeated rider complaints, or expired documents may lead to temporary suspension or termination. The Driver will be given a chance to fix the problem and explain. The Driver may stop providing services at any time by giving notice.

9. Changes
Cabby may update this agreement; changes will be announced through the bot or the app.

10. Governing law
This agreement is governed by the laws of the Federal Democratic Republic of Ethiopia.`,
};

let cache = null;
let cachedAt = 0;
const TTL = 30_000;

async function readAll(db) {
  const { results } = await db.prepare("SELECT key, value FROM settings").all();
  const out = {};
  for (const r of results) { try { out[r.key] = JSON.parse(r.value); } catch {} }
  return out;
}

/** በየጥያቄው መጀመሪያ — ደንቦቹን ከዳታቤዝ ጭኖ ወደ constants ያስገባል (30 ሰከንድ cache) */
export async function loadSettings(env, force = false) {
  if (!force && cache && Date.now() - cachedAt < TTL) return cache;
  const all = await readAll(env.DB);
  cache = {
    rules: { ...C.RULE_DEFAULTS, ...(all.rules ?? {}) },
    links: all.links ?? {},
    agreement: all.agreement ?? { version: 1, text: DEFAULT_AGREEMENT, updated_at: null, by: null },
    sms: { ...C.SMS_DEFAULTS, ...(all.sms ?? {}), kinds: { ...C.SMS_DEFAULTS.kinds, ...(all.sms?.kinds ?? {}) } },
    version: Number(all.version ?? 0),
  };
  C.applySettings(cache);
  cachedAt = Date.now();
  return cache;
}

export const agreementText = (s, lang) => {
  const t = s.agreement.text ?? {};
  return (t[lang] || "").trim() || (t.am || "").trim() || DEFAULT_AGREEMENT.am;
};

// ---------- ማረጋገጥ እና ማስቀመጥ ----------

const int = (v, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
const subset = (v, allowed) => (Array.isArray(v) ? [...new Set(v.filter((x) => allowed.includes(x)))] : null);

export function validateSettings(input) {
  const errors = [];
  const out = {};
  if (input.rules) {
    const r = input.rules, o = {};
    o.min_age = int(r.min_age, 16, 30); if (o.min_age == null) errors.push("ዝቅተኛ ዕድሜ ከ16 እስከ 30 መሆን አለበት።");
    o.max_age = int(r.max_age, 40, 90); if (o.max_age == null) errors.push("ከፍተኛ ዕድሜ ከ40 እስከ 90 መሆን አለበት።");
    o.max_vehicle_age = int(r.max_vehicle_age, 1, 40); if (o.max_vehicle_age == null) errors.push("የመኪና ዕድሜ ገደብ ከ1 እስከ 40 ዓመት።");
    o.inspection_after_years = int(r.inspection_after_years, 0, 40); if (o.inspection_after_years == null) errors.push("የፍተሻ ዓመት ከ0 እስከ 40።");
    o.accepted_grades = subset(r.accepted_grades, C.LICENSE_GRADES); if (!o.accepted_grades?.length) errors.push("ቢያንስ አንድ የመንጃ ፈቃድ ደረጃ ይምረጡ።");
    o.allowed_plate_codes = (Array.isArray(r.allowed_plate_codes) ? r.allowed_plate_codes : []).map(String).filter((x) => /^\d{1,2}$/.test(x));
    o.green_fuels = subset(r.green_fuels, C.FUEL_TYPES) ?? [];
    o.disabled_docs = (subset(r.disabled_docs, C.DOCUMENTS.map((d) => d.kind)) ?? []).filter((k) => !C.CORE_DOCS.includes(k));
    o.test_for_no_car = r.test_for_no_car !== false;
    o.require_orientation = r.require_orientation !== false;
    o.agent_commission = int(r.agent_commission ?? 0, 0, 1000000); if (o.agent_commission == null) errors.push("የሴልስ ኮሚሽን ትክክለኛ ቁጥር (ብር) መሆን አለበት።");
    if (o.min_age != null && o.max_age != null && o.min_age >= o.max_age) errors.push("ዝቅተኛ ዕድሜ ከከፍተኛው ያነሰ መሆን አለበት።");
    out.rules = o;
  }
  if (input.links) {
    const o = {};
    for (const k of C.LINK_KEYS) {
      const v = String(input.links[k] ?? "").trim().slice(0, 300);
      if (v && /_URL$|_LINK$/.test(k) && !/^https:\/\//.test(v)) errors.push(`${k}፦ ሊንኩ በ https:// መጀመር አለበት።`);
      o[k] = v;
    }
    out.links = o;
  }
  if (input.sms) {
    const m = input.sms;
    out.sms = {
      enabled: m.enabled === true,
      token: String(m.token ?? "").trim().slice(0, 2000),
      sender: String(m.sender ?? "").trim().slice(0, 30),
      identifier: String(m.identifier ?? "").trim().slice(0, 100),
      monthly_limit: int(m.monthly_limit, 0, 1000000),
      kinds: Object.fromEntries(C.SMS_KINDS.map((k) => [k, m.kinds?.[k] !== false])),
    };
    if (out.sms.monthly_limit == null) errors.push("የወር የSMS ገደብ ትክክለኛ ቁጥር መሆን አለበት።");
  }
  if (input.agreement) {
    const text = {};
    for (const l of C.LANGS) text[l] = String(input.agreement.text?.[l] ?? "").slice(0, 20000);
    if (!text.am.trim()) errors.push("የአማርኛው ውል ባዶ መሆን አይችልም።");
    out.agreement = { text };
  }
  return { errors, value: out };
}

export async function saveSettings(env, input, by) {
  const { errors, value } = validateSettings(input);
  if (errors.length) return { ok: false, error: errors.join(" ") };
  const cur = await loadSettings(env, true);
  const stmts = [];
  const put = (k, v) => stmts.push(env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, JSON.stringify(v)));
  const changed = [];
  if (value.rules && JSON.stringify(value.rules) !== JSON.stringify(cur.rules)) { put("rules", value.rules); changed.push("ደንቦች"); }
  if (value.links && JSON.stringify(value.links) !== JSON.stringify(cur.links)) { put("links", value.links); changed.push("ሊንኮች"); }
  if (value.sms) {
    // ቶክኑ ባዶ ከተላከ የነበረው ይቆያል
    if (!value.sms.token || /^•+$/.test(value.sms.token)) value.sms.token = cur.sms.token;
    if (value.sms.enabled && !value.sms.token) return { ok: false, error: "SMS ለማብራት የAfroMessage API token ያስገቡ።" };
    if (JSON.stringify(value.sms) !== JSON.stringify(cur.sms)) { put("sms", value.sms); changed.push("SMS"); }
  }
  if (value.agreement && JSON.stringify(value.agreement.text) !== JSON.stringify(cur.agreement.text)) {
    put("agreement", { version: (cur.agreement.version ?? 1) + 1, text: value.agreement.text, updated_at: new Date().toISOString(), by });
    changed.push(`ውል v${(cur.agreement.version ?? 1) + 1}`);
  }
  if (!stmts.length) return { ok: true, changed: [] };
  put("version", cur.version + 1);
  await env.DB.batch(stmts);
  await env.DB.prepare("INSERT INTO events (tg_id, actor, type, detail) VALUES (NULL, ?, 'settings_changed', ?)").bind(by, changed.join("፣ ")).run();
  return { ok: true, changed, settings: await loadSettings(env, true) };
}

/** ለዳሽቦርድ — ቶክኑ አይታይም */
export const publicSms = (sms) => ({ ...sms, token: sms.token ? "••••••••" : "", token_set: !!sms.token });
