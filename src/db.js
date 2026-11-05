// D1 ዳታቤዝ — ሰንጠረዦች፣ ማሻሻያ (migration) እና ጥያቄዎች

import { stageAfterDocs } from "./constants.js";

const SCHEMA_VERSION = 3;

const COLUMNS = {
  username: "TEXT", lang: "TEXT",
  full_name: "TEXT", phone: "TEXT", telebirr: "TEXT", dob: "TEXT", sub_city: "TEXT", languages: "TEXT", tin_no: "TEXT",
  emergency_name: "TEXT", emergency_phone: "TEXT",
  license_no: "TEXT", license_grade: "TEXT", license_expiry: "TEXT", experience: "TEXT", prev_platforms: "TEXT",
  vehicle_mode: "TEXT", has_vehicle: "INTEGER DEFAULT 0", vehicle_make: "TEXT", vehicle_type: "TEXT", vehicle_model: "TEXT",
  vehicle_year: "INTEGER", vehicle_color: "TEXT", fuel_type: "TEXT", vehicle_seats: "TEXT", vehicle_ac: "INTEGER",
  plate_region: "TEXT", plate_code: "TEXT", plate_number: "TEXT", owner_name: "TEXT", owner_phone: "TEXT",
  services: "TEXT", shift: "TEXT", phone_type: "TEXT", referral: "TEXT", referrer_id: "INTEGER",
  status: "TEXT NOT NULL DEFAULT 'awaiting_docs'", reject_reason: "TEXT", reviewed_by: "TEXT", reviewed_at: "TEXT", submitted_at: "TEXT",
  appt_text: "TEXT", appt_at: "TEXT", appt_confirmed: "INTEGER DEFAULT 0",
  driver_no: "INTEGER", activated_at: "TEXT",
  referral_rewarded_at: "TEXT", referral_paid_at: "TEXT",
  agreement_version: "INTEGER", agreement_accepted_at: "TEXT",
  fix_state: "TEXT", fix_docs: "TEXT", fix_note: "TEXT", fix_submitted_at: "TEXT", appeal_text: "TEXT",
  agent_id: "INTEGER", campaign_id: "INTEGER", commission_amount: "INTEGER", commission_paid_at: "TEXT",
  telegram_linked_at: "TEXT", appt_reminded_at: "TEXT",
  reminder_count: "INTEGER DEFAULT 0", last_reminded_at: "TEXT",
  // የቀድሞ ስሪት (v2) አምዶች — ለማሻሻያ ብቻ
  test_at: "TEXT", test_confirmed: "INTEGER DEFAULT 0",
  created_at: "TEXT NOT NULL DEFAULT (datetime('now'))", updated_at: "TEXT NOT NULL DEFAULT (datetime('now'))",
};

export const PROFILE_FIELDS = [
  "full_name", "phone", "telebirr", "dob", "sub_city", "languages", "tin_no", "emergency_name", "emergency_phone",
  "license_no", "license_grade", "license_expiry", "experience", "prev_platforms",
  "vehicle_mode", "has_vehicle", "vehicle_make", "vehicle_type", "vehicle_model", "vehicle_year", "vehicle_color", "fuel_type",
  "vehicle_seats", "vehicle_ac", "plate_region", "plate_code", "plate_number", "owner_name", "owner_phone",
  "services", "shift", "phone_type", "referral", "referrer_id",
];

let schemaReady = false;

export async function ensureSchema(db) {
  if (schemaReady) return;
  const cols = Object.entries(COLUMNS).map(([k, t]) => `${k} ${t}`).join(", ");
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS drivers (tg_id INTEGER PRIMARY KEY, ${cols})`),
    db.prepare(`CREATE TABLE IF NOT EXISTS documents (tg_id INTEGER NOT NULL, kind TEXT NOT NULL, file_id TEXT NOT NULL,
      file_type TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (tg_id, kind))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS prefs (tg_id INTEGER PRIMARY KEY, lang TEXT, ref_code TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id INTEGER, actor TEXT,
      type TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS staff (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, name TEXT NOT NULL, phone TEXT,
      telebirr TEXT, role TEXT NOT NULL DEFAULT 'agent', tg_id INTEGER, username TEXT, active INTEGER NOT NULL DEFAULT 1, invite_token TEXT,
      collecting_for INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, location TEXT,
      start_date TEXT, end_date TEXT, commission INTEGER, active INTEGER NOT NULL DEFAULT 1, created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS campaign_agents (campaign_id INTEGER NOT NULL, staff_id INTEGER NOT NULL, PRIMARY KEY (campaign_id, staff_id))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sms_log (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT, tg_id INTEGER, kind TEXT, text TEXT,
      status TEXT, error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`),
  ]);

  const { results } = await db.prepare("PRAGMA table_info(drivers)").all();
  const have = new Set(results.map((r) => r.name));
  const add = Object.entries(COLUMNS)
    .filter(([k]) => !have.has(k))
    .map(([k, t]) => db.prepare(`ALTER TABLE drivers ADD COLUMN ${k} ${t.replace(/ NOT NULL DEFAULT \(datetime\('now'\)\)/, "")}`));
  if (add.length) await db.batch(add);

  await db.batch([
    db.prepare("CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_drivers_phone ON drivers(phone)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_drivers_referrer ON drivers(referrer_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_events_tg ON events(tg_id, id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_drivers_agent ON drivers(agent_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_staff_tg ON staff(tg_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_sms_month ON sms_log(created_at)"),
  ]);

  const pr = new Set((await db.prepare("PRAGMA table_info(prefs)").all()).results.map((r) => r.name));
  const prefCols = { agent_code: "TEXT", campaign_id: "INTEGER", link_state: "TEXT", otp_phone: "TEXT", otp_hash: "TEXT", otp_expires: "INTEGER", otp_tries: "INTEGER DEFAULT 0" };
  const addPref = Object.entries(prefCols).filter(([k]) => !pr.has(k)).map(([k, t]) => db.prepare(`ALTER TABLE prefs ADD COLUMN ${k} ${t}`));
  if (addPref.length) await db.batch(addPref);

  const v = await db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").first();
  if (Number(v?.value ?? 0) < SCHEMA_VERSION) await migrateValues(db);
  schemaReady = true;
}

// የቀድሞ ስሪቶች የአማርኛ እሴቶች → codes፤ የቀድሞ ሁኔታዎች → አዲሶቹ
const OLD = {
  experience: { "ከ1 ዓመት በታች": "lt1", "1–2 ዓመት": "1_2", "3–5 ዓመት": "3_5", "6–10 ዓመት": "6_10", "ከ10 ዓመት በላይ": "10p" },
  vehicle_type: { "ሴዳን": "sedan", "ሀችባክ": "hatchback", "SUV": "suv", "ሚኒቫን": "minivan", "ሚኒባስ": "minibus", "ፒካፕ": "pickup", "ሌላ": "other" },
  shift: { "ቀን": "day", "ማታ": "night", "ሙሉ ቀን": "full", "እንደ ሁኔታው": "flex" },
  phone_type: { Android: "android", iPhone: "ios", "ስማርት ስልክ የለኝም": "none" },
  services: { "Cabby Share": "share", "Cabby Reserve": "reserve" },
  languages: { "አማርኛ": "am", "Afaan Oromoo": "om", English: "en", "ትግርኛ": "ti", "Af-Soomaali": "so", "ሌላ": "other" },
  prev_platforms: { "የለም": "none", "ሌላ": "other" },
};
const MULTI = ["services", "languages", "prev_platforms"];

async function migrateValues(db) {
  const { results } = await db.prepare("SELECT * FROM drivers").all();
  const stmts = [];
  for (const r of results) {
    const u = {};
    for (const [f, map] of Object.entries(OLD)) {
      if (r[f] == null) continue;
      const nv = MULTI.includes(f)
        ? r[f].split(/,\s*/).filter(Boolean).map((x) => map[x] ?? x).join(",")
        : map[r[f]] ?? r[f];
      if (nv !== r[f]) u[f] = nv;
    }
    if (!r.vehicle_mode) u.vehicle_mode = r.has_vehicle ? "own" : "none";
    if (r.test_at && !r.appt_text) u.appt_text = r.test_at;
    if (r.test_confirmed && !r.appt_confirmed) u.appt_confirmed = 1;
    if (r.status === "approved") Object.assign(u, { status: "active", activated_at: r.activated_at ?? r.reviewed_at });
    if (r.status === "docs_ok" || r.status === "test_scheduled") {
      const stage = stageAfterDocs({ ...r, ...u });
      u.status = stage;
      if (stage !== "test") Object.assign(u, { appt_text: null, appt_confirmed: 0 });
    }
    const keys = Object.keys(u);
    if (keys.length) {
      stmts.push(db.prepare(`UPDATE drivers SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE tg_id = ?`).bind(...keys.map((k) => u[k]), r.tg_id));
    }
  }
  stmts.push(db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(SCHEMA_VERSION)));
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
}

// ---------- አሽከርካሪዎች ----------

export const getDriver = (db, id) => db.prepare("SELECT * FROM drivers WHERE tg_id = ?").bind(id).first();
export const findByPhone = (db, phone) => db.prepare("SELECT * FROM drivers WHERE phone = ?").bind(phone).first();
export const findByCode = (db, no) => db.prepare("SELECT * FROM drivers WHERE driver_no = ?").bind(no).first();

/** የታገደ አሽከርካሪ መረጃውን ሲያስተካክል — ሁኔታው አይቀየርም */
export async function updateProfile(db, id, p) {
  const fields = PROFILE_FIELDS.filter((f) => f !== "referral" && f !== "referrer_id");
  await db.prepare(`UPDATE drivers SET ${fields.map((f) => `${f} = ?`).join(", ")}, updated_at = datetime('now') WHERE tg_id = ?`)
    .bind(...fields.map((f) => p[f] ?? null), id).run();
}

export const setAgreement = (db, id, version) =>
  db.prepare("UPDATE drivers SET agreement_version = ?, agreement_accepted_at = datetime('now') WHERE tg_id = ?").bind(version, id).run();

/** የእገዳ ማስተካከያ ሁኔታ */
export const setFix = (db, id, f) => {
  const keys = Object.keys(f);
  return db.prepare(`UPDATE drivers SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE tg_id = ?`).bind(...keys.map((k) => f[k]), id).run();
};
export const clearFix = (db, id) =>
  db.prepare("UPDATE drivers SET fix_state = NULL, fix_docs = NULL, fix_note = NULL, fix_submitted_at = NULL, appeal_text = NULL WHERE tg_id = ?").bind(id).run();
export async function submittedFixes(db) {
  const { results } = await db.prepare("SELECT * FROM drivers WHERE status = 'suspended' AND fix_state = 'submitted' ORDER BY fix_submitted_at ASC").all();
  return results;
}

export async function saveProfile(db, id, username, lang, p) {
  const cols = PROFILE_FIELDS.join(", ");
  const qs = PROFILE_FIELDS.map(() => "?").join(", ");
  const updates = PROFILE_FIELDS.map((f) => `${f} = excluded.${f}`).join(", ");
  await db
    .prepare(
      `INSERT INTO drivers (tg_id, username, lang, ${cols}, status) VALUES (?, ?, ?, ${qs}, 'awaiting_docs')
       ON CONFLICT(tg_id) DO UPDATE SET username = excluded.username, lang = excluded.lang, ${updates},
         status = 'awaiting_docs', reject_reason = NULL, appt_text = NULL, appt_at = NULL, appt_confirmed = 0,
         reminder_count = 0, updated_at = datetime('now')`
    )
    .bind(id, username, lang, ...PROFILE_FIELDS.map((f) => p[f] ?? null))
    .run();
}

/** ሁኔታውን ይቀይራል — `from` ከተሰጠ አሁን ያለው ሁኔታ ከዚያ ውስጥ ከሆነ ብቻ */
export async function transition(db, id, to, { from, by = null, reason = null, appt } = {}) {
  const sets = ["status = ?", "updated_at = datetime('now')"];
  const vals = [to];
  if (by !== null) sets.push("reviewed_by = ?", "reviewed_at = datetime('now')"), vals.push(by);
  if (to === "rejected" || to === "suspended") sets.push("reject_reason = ?"), vals.push(reason);
  if (to === "pending") sets.push("submitted_at = datetime('now')");
  if (to === "awaiting_docs") sets.push("reminder_count = 0");
  if (appt !== undefined) sets.push("appt_text = ?", "appt_at = ?", "appt_confirmed = 0", "appt_reminded_at = NULL"), vals.push(appt?.text ?? null, appt?.at ?? null);
  if (to === "active") {
    sets.push("activated_at = COALESCE(activated_at, datetime('now'))",
      "driver_no = COALESCE(driver_no, (SELECT COALESCE(MAX(driver_no), 1000) + 1 FROM drivers))");
  }
  let where = "tg_id = ?";
  vals.push(id);
  if (from) {
    const list = [].concat(from);
    where += ` AND status IN (${list.map(() => "?").join(", ")})`;
    vals.push(...list);
  }
  const r = await db.prepare(`UPDATE drivers SET ${sets.join(", ")} WHERE ${where}`).bind(...vals).run();
  return r.meta.changes > 0;
}

export const confirmAppt = (db, id) =>
  db.prepare("UPDATE drivers SET appt_confirmed = 1 WHERE tg_id = ? AND appt_text IS NOT NULL").bind(id).run();

export const setLang = (db, id, lang) =>
  db.batch([
    db.prepare(`INSERT INTO prefs (tg_id, lang) VALUES (?, ?) ON CONFLICT(tg_id) DO UPDATE SET lang = excluded.lang, updated_at = datetime('now')`).bind(id, lang),
    db.prepare("UPDATE drivers SET lang = ? WHERE tg_id = ?").bind(lang, id),
  ]);
export const setRefCode = (db, id, code) =>
  db.prepare(`INSERT INTO prefs (tg_id, ref_code) VALUES (?, ?) ON CONFLICT(tg_id) DO UPDATE SET ref_code = excluded.ref_code`).bind(id, code).run();
export const getPrefs = (db, id) => db.prepare("SELECT * FROM prefs WHERE tg_id = ?").bind(id).first();

// ---------- ሰነዶች ----------

export async function insertDoc(db, id, kind, fileId, fileType) {
  const r = await db.prepare("INSERT OR IGNORE INTO documents (tg_id, kind, file_id, file_type) VALUES (?, ?, ?, ?)").bind(id, kind, fileId, fileType).run();
  return r.meta.changes > 0;
}
export async function getDocs(db, id) {
  const { results } = await db.prepare("SELECT * FROM documents WHERE tg_id = ?").bind(id).all();
  return results;
}
export const clearDocs = (db, id) => db.prepare("DELETE FROM documents WHERE tg_id = ?").bind(id).run();
export const deleteDoc = (db, id, kind) => db.prepare("DELETE FROM documents WHERE tg_id = ? AND kind = ?").bind(id, kind).run();
export const docByFileId = (db, fileId) => db.prepare("SELECT * FROM documents WHERE file_id = ?").bind(fileId).first();

// ---------- እንቅስቃሴ (events) ----------

export const logEvent = (db, tgId, actor, type, detail = null) =>
  db.prepare("INSERT INTO events (tg_id, actor, type, detail) VALUES (?, ?, ?, ?)").bind(tgId, actor, type, detail == null ? null : String(detail).slice(0, 500)).run();

export async function eventsFor(db, id, limit = 50) {
  const { results } = await db.prepare("SELECT * FROM events WHERE tg_id = ? ORDER BY id DESC LIMIT ?").bind(id, limit).all();
  return results;
}
export async function recentEvents(db, limit = 60, before = null) {
  const { results } = await db
    .prepare(`SELECT e.*, d.full_name, d.phone, d.driver_no FROM events e LEFT JOIN drivers d ON d.tg_id = e.tg_id
              ${before ? "WHERE e.id < ?" : ""} ORDER BY e.id DESC LIMIT ?`)
    .bind(...(before ? [before, limit] : [limit]))
    .all();
  return results;
}

// ---------- ዝርዝሮች እና ቁጥሮች ----------

export async function listByStatus(db, statuses, limit = 20) {
  const list = [].concat(statuses);
  const { results } = await db
    .prepare(`SELECT * FROM drivers WHERE status IN (${list.map(() => "?").join(", ")})
              ORDER BY CASE WHEN fuel_type IN ('electric','hybrid') THEN 0 ELSE 1 END, COALESCE(submitted_at, updated_at) ASC LIMIT ?`)
    .bind(...list, limit)
    .all();
  return results;
}

export async function searchDrivers(db, { q, status, service, mode, fuel, agent, campaign, sort = "recent", limit = 50, offset = 0 } = {}) {
  const where = [], vals = [];
  if (q) {
    const like = `%${q.trim()}%`;
    const code = q.trim().match(/^CB(\d+)$/i);
    where.push(`(full_name LIKE ? OR phone LIKE ? OR plate_number LIKE ? OR license_no LIKE ?${code ? " OR driver_no = ?" : ""})`);
    vals.push(like, like.replace(/^%0/, "%"), like.toUpperCase(), like.toUpperCase(), ...(code ? [Number(code[1])] : []));
  }
  if (status) where.push(`status IN (${status.split(",").map(() => "?").join(",")})`), vals.push(...status.split(","));
  if (service) where.push("(',' || services || ',') LIKE ?"), vals.push(`%,${service},%`);
  if (mode) where.push("vehicle_mode = ?"), vals.push(mode);
  if (agent) where.push("agent_id = ?"), vals.push(Number(agent));
  if (campaign) where.push("campaign_id = ?"), vals.push(Number(campaign));
  if (fuel === "green") where.push("fuel_type IN ('electric','hybrid')");
  else if (fuel) where.push("fuel_type = ?"), vals.push(fuel);
  const order = { recent: "updated_at DESC", oldest: "COALESCE(submitted_at, created_at) ASC", name: "full_name COLLATE NOCASE ASC", code: "driver_no DESC" }[sort] ?? "updated_at DESC";
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [{ results }, total] = await Promise.all([
    db.prepare(`SELECT * FROM drivers ${w} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...vals, limit, offset).all(),
    db.prepare(`SELECT COUNT(*) AS n FROM drivers ${w}`).bind(...vals).first(),
  ]);
  return { rows: results, total: total?.n ?? 0 };
}

export async function stats(db) {
  const [byStatus, today, week, green] = await Promise.all([
    db.prepare("SELECT status, COUNT(*) AS n FROM drivers GROUP BY status").all(),
    db.prepare("SELECT COUNT(*) AS n FROM drivers WHERE date(created_at) = date('now')").first(),
    db.prepare("SELECT COUNT(*) AS n FROM drivers WHERE status = 'active' AND activated_at >= datetime('now', '-7 days')").first(),
    db.prepare("SELECT COUNT(*) AS n FROM drivers WHERE fuel_type IN ('electric','hybrid')").first(),
  ]);
  return {
    byStatus: Object.fromEntries(byStatus.results.map((r) => [r.status, r.n])),
    today: today?.n ?? 0, activatedWeek: week?.n ?? 0, green: green?.n ?? 0,
  };
}

export async function analytics(db, days = 30) {
  const q = (sql, ...b) => db.prepare(sql).bind(...b).all().then((r) => r.results);
  const [signups, activations, services, fuel, mode, subcity, avgDays, sources] = await Promise.all([
    q(`SELECT date(created_at, '+3 hours') AS d, COUNT(*) AS n FROM drivers WHERE created_at >= datetime('now', ?) GROUP BY d ORDER BY d`, `-${days} days`),
    q(`SELECT date(activated_at, '+3 hours') AS d, COUNT(*) AS n FROM drivers WHERE activated_at >= datetime('now', ?) GROUP BY d ORDER BY d`, `-${days} days`),
    q(`SELECT services AS k, COUNT(*) AS n FROM drivers WHERE services IS NOT NULL GROUP BY services`),
    q(`SELECT COALESCE(fuel_type, 'none') AS k, COUNT(*) AS n FROM drivers GROUP BY k ORDER BY n DESC`),
    q(`SELECT vehicle_mode AS k, COUNT(*) AS n FROM drivers WHERE vehicle_mode IS NOT NULL GROUP BY k ORDER BY n DESC`),
    q(`SELECT sub_city AS k, COUNT(*) AS n FROM drivers WHERE sub_city IS NOT NULL GROUP BY k ORDER BY n DESC LIMIT 12`),
    q(`SELECT AVG(julianday(activated_at) - julianday(created_at)) AS v FROM drivers WHERE activated_at IS NOT NULL AND activated_at >= datetime('now', '-90 days')`),
    q(`SELECT CASE WHEN referrer_id IS NOT NULL THEN 'referral' ELSE 'direct' END AS k, COUNT(*) AS n FROM drivers GROUP BY k`),
  ]);
  return { signups, activations, services, fuel, mode, subcity, avgDaysToActive: avgDays[0]?.v ?? null, sources };
}

export async function appointments(db) {
  const { results } = await db
    .prepare(`SELECT * FROM drivers WHERE status IN ('test','inspection','orientation')
              ORDER BY CASE WHEN appt_at IS NULL THEN 1 ELSE 0 END, appt_at ASC, updated_at ASC`)
    .all();
  return results;
}

export async function referralBoard(db) {
  const { results } = await db
    .prepare(`SELECT r.tg_id, r.full_name, r.phone, r.driver_no,
                COUNT(d.tg_id) AS referred,
                SUM(CASE WHEN d.status = 'active' THEN 1 ELSE 0 END) AS activated,
                SUM(CASE WHEN d.status = 'active' AND d.referral_paid_at IS NULL THEN 1 ELSE 0 END) AS unpaid
              FROM drivers d JOIN drivers r ON r.tg_id = d.referrer_id
              GROUP BY r.tg_id ORDER BY activated DESC, referred DESC LIMIT 100`)
    .all();
  return results;
}
export async function referredBy(db, id) {
  const { results } = await db.prepare("SELECT * FROM drivers WHERE referrer_id = ? ORDER BY created_at DESC").bind(id).all();
  return results;
}
export const markReferralPaid = (db, referredId) =>
  db.prepare("UPDATE drivers SET referral_paid_at = datetime('now') WHERE tg_id = ? AND referral_paid_at IS NULL AND status = 'active'").bind(referredId).run();
export const markReferralRewarded = (db, referredId) =>
  db.prepare("UPDATE drivers SET referral_rewarded_at = datetime('now') WHERE tg_id = ? AND referral_rewarded_at IS NULL").bind(referredId).run();

export async function allDrivers(db) {
  const { results } = await db.prepare("SELECT * FROM drivers ORDER BY created_at ASC").all();
  return results;
}

// ---------- ማስታወሻዎች (cron) ----------

export async function staleAwaitingDocs(db, limit) {
  const { results } = await db
    .prepare(`SELECT * FROM drivers WHERE status = 'awaiting_docs' AND reminder_count < 3 AND updated_at < datetime('now', '-1 day')
              AND (last_reminded_at IS NULL OR last_reminded_at < datetime('now', '-2 days')) LIMIT ?`)
    .bind(limit).all();
  return results;
}
export async function expiringLicenses(db, limit) {
  const { results } = await db
    .prepare(`SELECT * FROM drivers WHERE status = 'active' AND license_expiry IS NOT NULL AND license_expiry <= date('now', '+30 days')
              AND (last_reminded_at IS NULL OR last_reminded_at < datetime('now', '-7 days')) LIMIT ?`)
    .bind(limit).all();
  return results;
}
export const markReminded = (db, id) =>
  db.prepare("UPDATE drivers SET reminder_count = reminder_count + 1, last_reminded_at = datetime('now') WHERE tg_id = ?").bind(id).run();

// ---------- አሽከርካሪዎች ያለ Telegram (ሴልሱ የመዘገባቸው) ----------
// ቋሚ ያልሆነ ID፦ ከ -900000000000000 በታች (የTelegram IDዎች አይደርሱበትም)

export const NO_TG_BASE = -900000000000000;
export const isNoTg = (id) => Number(id) <= NO_TG_BASE;

export async function nextNoTgId(db) {
  const r = await db.prepare("SELECT MIN(tg_id) AS m FROM drivers WHERE tg_id <= ?").bind(NO_TG_BASE).first();
  return (r?.m ?? NO_TG_BASE) - 1;
}

export const setDriverFields = (db, id, f) => {
  const keys = Object.keys(f);
  return db.prepare(`UPDATE drivers SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE tg_id = ?`).bind(...keys.map((k) => f[k]), id).run();
};

export const findNoTgByPhone = (db, phone) =>
  db.prepare("SELECT * FROM drivers WHERE phone = ? AND tg_id <= ?").bind(phone, NO_TG_BASE).first();

/** ሴልሱ የመዘገበው አሽከርካሪ Telegram ሲከፍት ሁሉንም መረጃ ወደ እውነተኛው ID ማዛወር */
export async function linkTelegram(db, fromId, toId, username) {
  await db.batch([
    db.prepare("UPDATE drivers SET tg_id = ?, username = ?, telegram_linked_at = datetime('now') WHERE tg_id = ?").bind(toId, username ?? null, fromId),
    db.prepare("UPDATE documents SET tg_id = ? WHERE tg_id = ?").bind(toId, fromId),
    db.prepare("UPDATE events SET tg_id = ? WHERE tg_id = ?").bind(toId, fromId),
    db.prepare("UPDATE drivers SET referrer_id = ? WHERE referrer_id = ?").bind(toId, fromId),
    db.prepare("UPDATE staff SET collecting_for = NULL WHERE collecting_for = ?").bind(fromId),
    db.prepare("UPDATE prefs SET link_state = NULL, otp_hash = NULL, otp_phone = NULL, otp_tries = 0 WHERE tg_id = ?").bind(toId),
  ]);
}

export const setPrefs = (db, id, f) => {
  const keys = Object.keys(f);
  return db.prepare(`INSERT INTO prefs (tg_id, ${keys.join(", ")}) VALUES (?, ${keys.map(() => "?").join(", ")})
    ON CONFLICT(tg_id) DO UPDATE SET ${keys.map((k) => `${k} = excluded.${k}`).join(", ")}, updated_at = datetime('now')`).bind(id, ...keys.map((k) => f[k])).run();
};

// ---------- ሴልሶች እና ካምፔኖች ----------

export const staffById = (db, id) => db.prepare("SELECT * FROM staff WHERE id = ?").bind(id).first();
export const staffByTg = (db, tg) => db.prepare("SELECT * FROM staff WHERE tg_id = ? AND active = 1").bind(tg).first();
export const staffByCode = (db, code) => db.prepare("SELECT * FROM staff WHERE code = ? AND active = 1").bind(String(code).toUpperCase()).first();
export const staffByToken = (db, token) => db.prepare("SELECT * FROM staff WHERE invite_token = ? AND active = 1").bind(token).first();
export const campaignById = (db, id) => db.prepare("SELECT * FROM campaigns WHERE id = ?").bind(id).first();

export async function staffList(db) {
  const { results } = await db.prepare(`SELECT s.*,
      (SELECT COUNT(*) FROM drivers d WHERE d.agent_id = s.id) AS started,
      (SELECT COUNT(*) FROM drivers d WHERE d.agent_id = s.id AND d.status NOT IN ('awaiting_docs')) AS submitted,
      (SELECT COUNT(*) FROM drivers d WHERE d.agent_id = s.id AND d.status IN ('active','suspended')) AS activated,
      (SELECT COUNT(*) FROM drivers d WHERE d.agent_id = s.id AND d.tg_id <= ${NO_TG_BASE}) AS no_tg,
      (SELECT COALESCE(SUM(commission_amount), 0) FROM drivers d WHERE d.agent_id = s.id AND d.commission_amount IS NOT NULL) AS earned,
      (SELECT COALESCE(SUM(commission_amount), 0) FROM drivers d WHERE d.agent_id = s.id AND d.commission_amount IS NOT NULL AND d.commission_paid_at IS NULL) AS unpaid
    FROM staff s ORDER BY s.active DESC, activated DESC, s.id ASC`).all();
  return results;
}

export async function campaignList(db, { onlyActive = false, staffId = null } = {}) {
  const where = [];
  const vals = [];
  if (onlyActive) where.push("c.active = 1");
  if (staffId) where.push("c.id IN (SELECT campaign_id FROM campaign_agents WHERE staff_id = ?)"), vals.push(staffId);
  const { results } = await db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM drivers d WHERE d.campaign_id = c.id) AS started,
      (SELECT COUNT(*) FROM drivers d WHERE d.campaign_id = c.id AND d.status NOT IN ('awaiting_docs')) AS submitted,
      (SELECT COUNT(*) FROM drivers d WHERE d.campaign_id = c.id AND d.status IN ('active','suspended')) AS activated,
      (SELECT COALESCE(SUM(commission_amount), 0) FROM drivers d WHERE d.campaign_id = c.id) AS commission_total,
      (SELECT GROUP_CONCAT(staff_id) FROM campaign_agents ca WHERE ca.campaign_id = c.id) AS agent_ids
    FROM campaigns c ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY c.active DESC, COALESCE(c.start_date, c.created_at) DESC`).bind(...vals).all();
  return results.map((c) => ({ ...c, agent_ids: c.agent_ids ? c.agent_ids.split(",").map(Number) : [] }));
}

export async function saveCampaign(db, c, by) {
  let id = c.id;
  if (id) {
    await db.prepare("UPDATE campaigns SET name = ?, location = ?, start_date = ?, end_date = ?, commission = ?, active = ? WHERE id = ?")
      .bind(c.name, c.location, c.start_date, c.end_date, c.commission, c.active ? 1 : 0, id).run();
  } else {
    const r = await db.prepare("INSERT INTO campaigns (name, location, start_date, end_date, commission, active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id")
      .bind(c.name, c.location, c.start_date, c.end_date, c.commission, c.active === false ? 0 : 1, by).first();
    id = r.id;
  }
  if (Array.isArray(c.agent_ids)) {
    const stmts = [db.prepare("DELETE FROM campaign_agents WHERE campaign_id = ?").bind(id)];
    for (const sid of [...new Set(c.agent_ids.map(Number).filter(Boolean))]) stmts.push(db.prepare("INSERT INTO campaign_agents (campaign_id, staff_id) VALUES (?, ?)").bind(id, sid));
    await db.batch(stmts);
  }
  return id;
}

export async function agentDrivers(db, staffId, limit = 200) {
  const { results } = await db.prepare(`SELECT * FROM drivers WHERE ${staffId ? "agent_id = ?" : "agent_id IS NOT NULL"} ORDER BY updated_at DESC LIMIT ?`)
    .bind(...(staffId ? [staffId, limit] : [limit])).all();
  return results;
}

export async function commissions(db, { unpaidOnly = false } = {}) {
  const { results } = await db.prepare(`SELECT d.tg_id, d.full_name, d.phone, d.driver_no, d.activated_at, d.commission_amount, d.commission_paid_at,
      d.agent_id, s.name AS agent_name, s.code AS agent_code, s.telebirr AS agent_telebirr, s.phone AS agent_phone, c.name AS campaign_name
    FROM drivers d JOIN staff s ON s.id = d.agent_id LEFT JOIN campaigns c ON c.id = d.campaign_id
    WHERE d.commission_amount IS NOT NULL ${unpaidOnly ? "AND d.commission_paid_at IS NULL" : ""}
    ORDER BY d.commission_paid_at IS NOT NULL, d.activated_at DESC LIMIT 500`).all();
  return results;
}

// ---------- SMS ----------

export const smsMonthCount = (db) =>
  db.prepare("SELECT COUNT(*) AS n FROM sms_log WHERE status = 'sent' AND created_at >= date('now', 'start of month')").first().then((r) => r?.n ?? 0);
export const logSms = (db, row) =>
  db.prepare("INSERT INTO sms_log (phone, tg_id, kind, text, status, error) VALUES (?, ?, ?, ?, ?, ?)").bind(row.phone, row.tg_id ?? null, row.kind, row.text, row.status, row.error ?? null).run();
export async function smsLog(db, limit = 100) {
  const { results } = await db.prepare("SELECT l.*, d.full_name FROM sms_log l LEFT JOIN drivers d ON d.tg_id = l.tg_id ORDER BY l.id DESC LIMIT ?").bind(limit).all();
  return results;
}

export async function apptsTomorrow(db, tomorrow, limit) {
  const { results } = await db.prepare(`SELECT * FROM drivers WHERE status IN ('test','inspection','orientation') AND appt_at IS NOT NULL
      AND substr(appt_at, 1, 10) = ? AND appt_reminded_at IS NULL LIMIT ?`).bind(tomorrow, limit).all();
  return results;
}
