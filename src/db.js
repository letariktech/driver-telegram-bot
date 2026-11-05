// D1 ዳታቤዝ — ሰንጠረዦቹ በመጀመሪያ ጥያቄ ላይ በራሳቸው ይፈጠራሉ

let schemaReady = false;

export async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS drivers (
      tg_id INTEGER PRIMARY KEY,
      username TEXT,
      full_name TEXT,
      phone TEXT,
      sub_city TEXT,
      license_no TEXT,
      license_grade TEXT,
      license_expiry TEXT,
      has_vehicle INTEGER DEFAULT 0,
      vehicle_type TEXT,
      vehicle_model TEXT,
      vehicle_year INTEGER,
      vehicle_color TEXT,
      plate_region TEXT,
      plate_code TEXT,
      plate_number TEXT,
      status TEXT NOT NULL DEFAULT 'awaiting_docs',
      reject_reason TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      submitted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_drivers_phone ON drivers(phone)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS documents (
      tg_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      file_id TEXT NOT NULL,
      file_type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tg_id, kind)
    )`),
  ]);
  schemaReady = true;
}

const PROFILE_FIELDS = [
  "full_name", "phone", "sub_city", "license_no", "license_grade", "license_expiry",
  "has_vehicle", "vehicle_type", "vehicle_model", "vehicle_year", "vehicle_color",
  "plate_region", "plate_code", "plate_number",
];

export const getDriver = (db, id) =>
  db.prepare("SELECT * FROM drivers WHERE tg_id = ?").bind(id).first();

export const findByPhone = (db, phone) =>
  db.prepare("SELECT * FROM drivers WHERE phone = ?").bind(phone).first();

export async function saveProfile(db, id, username, p) {
  const cols = PROFILE_FIELDS.join(", ");
  const qs = PROFILE_FIELDS.map(() => "?").join(", ");
  const updates = PROFILE_FIELDS.map((f) => `${f} = excluded.${f}`).join(", ");
  await db
    .prepare(
      `INSERT INTO drivers (tg_id, username, ${cols}, status) VALUES (?, ?, ${qs}, 'awaiting_docs')
       ON CONFLICT(tg_id) DO UPDATE SET username = excluded.username, ${updates},
         status = 'awaiting_docs', reject_reason = NULL, updated_at = datetime('now')`
    )
    .bind(id, username, ...PROFILE_FIELDS.map((f) => p[f] ?? null))
    .run();
}

export const setStatus = (db, id, status, extra = {}) =>
  db
    .prepare(
      `UPDATE drivers SET status = ?, reject_reason = ?, reviewed_by = ?,
         reviewed_at = CASE WHEN ? IN ('approved','rejected') THEN datetime('now') ELSE reviewed_at END,
         submitted_at = CASE WHEN ? = 'pending' THEN datetime('now') ELSE submitted_at END,
         updated_at = datetime('now')
       WHERE tg_id = ?`
    )
    .bind(status, extra.reason ?? null, extra.by ?? null, status, status, id)
    .run();

/** ማመልከቻው አሁንም በግምገማ ላይ ከሆነ ብቻ ውሳኔ ያስቀምጣል (ሁለት አስተዳዳሪዎች በአንድ ጊዜ ቢጫኑ) */
export async function decide(db, id, status, { by, reason = null }) {
  const r = await db
    .prepare(
      `UPDATE drivers SET status = ?, reject_reason = ?, reviewed_by = ?, reviewed_at = datetime('now'),
         updated_at = datetime('now') WHERE tg_id = ? AND status = 'pending'`
    )
    .bind(status, reason, by, id)
    .run();
  return r.meta.changes > 0;
}

export const saveDoc = (db, id, kind, fileId, fileType) =>
  db
    .prepare(
      `INSERT INTO documents (tg_id, kind, file_id, file_type) VALUES (?, ?, ?, ?)
       ON CONFLICT(tg_id, kind) DO UPDATE SET file_id = excluded.file_id,
         file_type = excluded.file_type, created_at = datetime('now')`
    )
    .bind(id, kind, fileId, fileType)
    .run();

export async function getDocs(db, id) {
  const { results } = await db.prepare("SELECT * FROM documents WHERE tg_id = ?").bind(id).all();
  return results;
}

export const clearDocs = (db, id) =>
  db.prepare("DELETE FROM documents WHERE tg_id = ?").bind(id).run();

export async function listByStatus(db, status, limit = 20) {
  const { results } = await db
    .prepare("SELECT * FROM drivers WHERE status = ? ORDER BY submitted_at ASC LIMIT ?")
    .bind(status, limit)
    .all();
  return results;
}

export async function stats(db) {
  const { results } = await db
    .prepare("SELECT status, COUNT(*) AS n FROM drivers GROUP BY status")
    .all();
  const today = await db
    .prepare("SELECT COUNT(*) AS n FROM drivers WHERE date(created_at) = date('now')")
    .first();
  return { byStatus: Object.fromEntries(results.map((r) => [r.status, r.n])), today: today?.n ?? 0 };
}

export async function allDrivers(db) {
  const { results } = await db.prepare("SELECT * FROM drivers ORDER BY created_at ASC").all();
  return results;
}
