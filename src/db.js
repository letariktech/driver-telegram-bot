// D1 ዳታቤዝ — ሰንጠረዦቹ እና አዳዲስ አምዶች በመጀመሪያ ጥያቄ ላይ በራሳቸው ይፈጠራሉ

const COLUMNS = {
  username: "TEXT",
  full_name: "TEXT",
  phone: "TEXT",
  telebirr: "TEXT",
  dob: "TEXT",
  sub_city: "TEXT",
  languages: "TEXT",
  emergency_name: "TEXT",
  emergency_phone: "TEXT",
  license_no: "TEXT",
  license_grade: "TEXT",
  license_expiry: "TEXT",
  experience: "TEXT",
  prev_platforms: "TEXT",
  vehicle_mode: "TEXT",
  has_vehicle: "INTEGER DEFAULT 0",
  vehicle_type: "TEXT",
  vehicle_model: "TEXT",
  vehicle_year: "INTEGER",
  vehicle_color: "TEXT",
  vehicle_seats: "TEXT",
  vehicle_ac: "INTEGER",
  plate_region: "TEXT",
  plate_code: "TEXT",
  plate_number: "TEXT",
  owner_name: "TEXT",
  owner_phone: "TEXT",
  services: "TEXT",
  shift: "TEXT",
  phone_type: "TEXT",
  referral: "TEXT",
  status: "TEXT NOT NULL DEFAULT 'awaiting_docs'",
  reject_reason: "TEXT",
  reviewed_by: "TEXT",
  reviewed_at: "TEXT",
  submitted_at: "TEXT",
  test_at: "TEXT",
  test_confirmed: "INTEGER DEFAULT 0",
  driver_no: "INTEGER",
  activated_at: "TEXT",
  reminder_count: "INTEGER DEFAULT 0",
  last_reminded_at: "TEXT",
  created_at: "TEXT NOT NULL DEFAULT (datetime('now'))",
  updated_at: "TEXT NOT NULL DEFAULT (datetime('now'))",
};

let schemaReady = false;

export async function ensureSchema(db) {
  if (schemaReady) return;
  const cols = Object.entries(COLUMNS).map(([k, t]) => `${k} ${t}`).join(",\n      ");
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS drivers (tg_id INTEGER PRIMARY KEY, ${cols})`),
    db.prepare(`CREATE TABLE IF NOT EXISTS documents (
      tg_id INTEGER NOT NULL, kind TEXT NOT NULL, file_id TEXT NOT NULL, file_type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (tg_id, kind))`),
  ]);

  // የቀድሞ ስሪት ዳታቤዝ ካለ የጎደሉ አምዶችን መጨመር
  const { results } = await db.prepare("PRAGMA table_info(drivers)").all();
  const have = new Set(results.map((r) => r.name));
  const add = Object.entries(COLUMNS)
    .filter(([k]) => !have.has(k))
    // ALTER TABLE ቋሚ ያልሆነ DEFAULT አይቀበልም
    .map(([k, t]) => db.prepare(`ALTER TABLE drivers ADD COLUMN ${k} ${t.replace(/ NOT NULL DEFAULT \(datetime\('now'\)\)/, "")}`));
  if (add.length) await db.batch(add);

  await db.batch([
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_drivers_phone ON drivers(phone)`),
    // የቀድሞው ስሪት "approved" → "active"
    db.prepare(`UPDATE drivers SET status = 'active', activated_at = COALESCE(activated_at, reviewed_at) WHERE status = 'approved'`),
    db.prepare(`UPDATE drivers SET vehicle_mode = CASE WHEN has_vehicle = 1 THEN 'own' ELSE 'none' END WHERE vehicle_mode IS NULL`),
  ]);
  schemaReady = true;
}

export const PROFILE_FIELDS = [
  "full_name", "phone", "telebirr", "dob", "sub_city", "languages", "emergency_name", "emergency_phone",
  "license_no", "license_grade", "license_expiry", "experience", "prev_platforms",
  "vehicle_mode", "has_vehicle", "vehicle_type", "vehicle_model", "vehicle_year", "vehicle_color",
  "vehicle_seats", "vehicle_ac", "plate_region", "plate_code", "plate_number", "owner_name", "owner_phone",
  "services", "shift", "phone_type", "referral",
];

export const getDriver = (db, id) => db.prepare("SELECT * FROM drivers WHERE tg_id = ?").bind(id).first();
export const findByPhone = (db, phone) => db.prepare("SELECT * FROM drivers WHERE phone = ?").bind(phone).first();
export const findByCode = (db, no) => db.prepare("SELECT * FROM drivers WHERE driver_no = ?").bind(no).first();

export async function saveProfile(db, id, username, p) {
  const cols = PROFILE_FIELDS.join(", ");
  const qs = PROFILE_FIELDS.map(() => "?").join(", ");
  const updates = PROFILE_FIELDS.map((f) => `${f} = excluded.${f}`).join(", ");
  await db
    .prepare(
      `INSERT INTO drivers (tg_id, username, ${cols}, status) VALUES (?, ?, ${qs}, 'awaiting_docs')
       ON CONFLICT(tg_id) DO UPDATE SET username = excluded.username, ${updates},
         status = 'awaiting_docs', reject_reason = NULL, test_at = NULL, test_confirmed = 0,
         reminder_count = 0, updated_at = datetime('now')`
    )
    .bind(id, username, ...PROFILE_FIELDS.map((f) => p[f] ?? null))
    .run();
}

/** ሁኔታውን ይቀይራል — `from` ከተሰጠ አሁን ያለው ሁኔታ ከዚያ ውስጥ ከሆነ ብቻ (ሁለት አስተዳዳሪዎች በአንድ ጊዜ ቢጫኑ) */
export async function transition(db, id, to, { from, by = null, reason = null, testAt } = {}) {
  const sets = ["status = ?", "updated_at = datetime('now')"];
  const vals = [to];
  if (by !== null) sets.push("reviewed_by = ?", "reviewed_at = datetime('now')"), vals.push(by);
  if (to === "rejected" || to === "suspended") sets.push("reject_reason = ?"), vals.push(reason);
  if (to === "pending") sets.push("submitted_at = datetime('now')");
  if (to === "awaiting_docs") sets.push("reminder_count = 0");
  if (testAt !== undefined) sets.push("test_at = ?", "test_confirmed = 0"), vals.push(testAt);
  if (to === "active") {
    sets.push("activated_at = datetime('now')",
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

export const confirmTest = (db, id) =>
  db.prepare("UPDATE drivers SET test_confirmed = 1 WHERE tg_id = ? AND status = 'test_scheduled'").bind(id).run();

/** ሰነዱ ገና ካልተቀመጠ ብቻ ያስቀምጣል፤ በአንድ ጊዜ ብዙ ፎቶ ሲላክ እንዳይደራረብ */
export async function insertDoc(db, id, kind, fileId, fileType) {
  const r = await db
    .prepare("INSERT OR IGNORE INTO documents (tg_id, kind, file_id, file_type) VALUES (?, ?, ?, ?)")
    .bind(id, kind, fileId, fileType)
    .run();
  return r.meta.changes > 0;
}

export async function getDocs(db, id) {
  const { results } = await db.prepare("SELECT * FROM documents WHERE tg_id = ?").bind(id).all();
  return results;
}

export const clearDocs = (db, id) => db.prepare("DELETE FROM documents WHERE tg_id = ?").bind(id).run();
export const deleteDoc = (db, id, kind) =>
  db.prepare("DELETE FROM documents WHERE tg_id = ? AND kind = ?").bind(id, kind).run();

export async function listByStatus(db, statuses, limit = 20) {
  const list = [].concat(statuses);
  const { results } = await db
    .prepare(`SELECT * FROM drivers WHERE status IN (${list.map(() => "?").join(", ")})
              ORDER BY COALESCE(submitted_at, updated_at) ASC LIMIT ?`)
    .bind(...list, limit)
    .all();
  return results;
}

export async function stats(db) {
  const { results } = await db.prepare("SELECT status, COUNT(*) AS n FROM drivers GROUP BY status").all();
  const today = await db.prepare("SELECT COUNT(*) AS n FROM drivers WHERE date(created_at) = date('now')").first();
  const week = await db
    .prepare("SELECT COUNT(*) AS n FROM drivers WHERE status = 'active' AND activated_at >= datetime('now', '-7 days')")
    .first();
  return { byStatus: Object.fromEntries(results.map((r) => [r.status, r.n])), today: today?.n ?? 0, activatedWeek: week?.n ?? 0 };
}

export async function allDrivers(db) {
  const { results } = await db.prepare("SELECT * FROM drivers ORDER BY created_at ASC").all();
  return results;
}

// ---- ለማስታወሻዎች (cron) ----

export async function staleAwaitingDocs(db, limit) {
  const { results } = await db
    .prepare(`SELECT * FROM drivers WHERE status = 'awaiting_docs' AND reminder_count < 3
              AND updated_at < datetime('now', '-1 day')
              AND (last_reminded_at IS NULL OR last_reminded_at < datetime('now', '-2 days'))
              LIMIT ?`)
    .bind(limit)
    .all();
  return results;
}

export async function expiringLicenses(db, limit) {
  const { results } = await db
    .prepare(`SELECT * FROM drivers WHERE status = 'active' AND license_expiry IS NOT NULL
              AND license_expiry <= date('now', '+30 days')
              AND (last_reminded_at IS NULL OR last_reminded_at < datetime('now', '-7 days'))
              LIMIT ?`)
    .bind(limit)
    .all();
  return results;
}

export const markReminded = (db, id) =>
  db.prepare("UPDATE drivers SET reminder_count = reminder_count + 1, last_reminded_at = datetime('now') WHERE tg_id = ?").bind(id).run();
