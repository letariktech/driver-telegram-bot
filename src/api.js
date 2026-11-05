// የአሽከርካሪ ቅጽ API፦ POST /api/me እና POST /api/register

import { verifyInitData } from "./auth.js";
import * as C from "./constants.js";
import * as db from "./db.js";
import { t, pickLang } from "./i18n.js";
import { askNextDocument, resolveReferrer, brand } from "./actions.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

/** የቅጹን መረጃ ያረጋግጣል፤ { profile } ወይም { error: key, vars } ይመልሳል */
export function validateProfile(input, today = C.addisToday()) {
  const s = (k, max = 80) => String(input?.[k] ?? "").trim().slice(0, max);
  const many = (k, allowed) => {
    const v = Array.isArray(input?.[k]) ? input[k] : String(input?.[k] ?? "").split(",");
    return [...new Set(v.map((x) => String(x).trim()).filter((x) => allowed.includes(x)))].join(",");
  };
  const one = (k, allowed) => (allowed.includes(s(k)) ? s(k) : "");
  const dateOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
  const E = (key, vars) => ({ error: key, vars });
  const thisYear = Number(today.slice(0, 4));

  const p = {
    full_name: s("full_name"),
    phone: C.normalizePhone(input?.phone),
    telebirr: C.normalizePhone(input?.telebirr || input?.phone),
    dob: s("dob", 10),
    sub_city: one("sub_city", C.SUB_CITIES),
    languages: many("languages", C.SPOKEN),
    tin_no: s("tin_no", 12).replace(/\D/g, ""),
    emergency_name: s("emergency_name", 60),
    emergency_phone: C.normalizePhone(input?.emergency_phone),
  };
  if (p.full_name.split(/\s+/).filter(Boolean).length < 2) return E("e_name");
  if (!p.phone) return E("e_phone");
  if (!p.telebirr) return E("e_telebirr");
  if (!dateOk(p.dob)) return E("e_age", { min: C.MIN_AGE, max: C.MAX_AGE });
  const age = C.ageOn(p.dob, today);
  if (age < C.MIN_AGE || age > C.MAX_AGE) return E("e_age", { min: C.MIN_AGE, max: C.MAX_AGE });
  if (!p.sub_city) return E("e_select");
  if (!p.languages) return E("e_spoken");
  if (!/^\d{10}$/.test(p.tin_no)) return E("e_tin");
  if (p.emergency_name.length < 2 || !p.emergency_phone || p.emergency_phone === p.phone) return E("e_em");

  Object.assign(p, {
    license_no: s("license_no", 30).toUpperCase(),
    license_grade: one("license_grade", C.LICENSE_GRADES),
    license_expiry: s("license_expiry", 10),
    experience: one("experience", C.EXPERIENCE),
    prev_platforms: many("prev_platforms", C.PREV_PLATFORMS),
  });
  if (!/^[A-Z0-9\-\/]{4,30}$/.test(p.license_no)) return E("e_license");
  if (!C.ACCEPTED_GRADES.includes(p.license_grade)) return E("e_grade");
  if (!dateOk(p.license_expiry) || p.license_expiry < today) return E("e_expiry");
  if (!p.experience || !p.prev_platforms) return E("e_select");
  if (p.prev_platforms.split(",").includes("none")) p.prev_platforms = "none";

  p.vehicle_mode = one("vehicle_mode", C.VEHICLE_MODES);
  if (!p.vehicle_mode) return E("e_mode");
  p.has_vehicle = p.vehicle_mode === "none" ? 0 : 1;
  if (p.has_vehicle) {
    Object.assign(p, {
      vehicle_make: one("vehicle_make", C.VEHICLE_MAKES),
      vehicle_type: one("vehicle_type", C.VEHICLE_TYPES),
      vehicle_model: s("vehicle_model", 60),
      vehicle_year: parseInt(input?.vehicle_year, 10),
      vehicle_color: s("vehicle_color", 30),
      fuel_type: one("fuel_type", C.FUEL_TYPES),
      vehicle_seats: one("vehicle_seats", C.SEATS),
      vehicle_ac: input?.vehicle_ac === true || input?.vehicle_ac === "yes" ? 1 : 0,
      plate_region: one("plate_region", C.PLATE_REGIONS),
      plate_code: s("plate_code", 3),
      plate_number: s("plate_number", 10).toUpperCase().replace(/\s/g, ""),
    });
    const minYear = thisYear - C.MAX_VEHICLE_AGE;
    if (!p.vehicle_make || !p.vehicle_type || !p.fuel_type || !p.vehicle_seats || !p.plate_region) return E("e_select");
    if (p.vehicle_model.length < 2 || p.vehicle_color.length < 2) return E("e_text");
    if (!(p.vehicle_year >= minYear && p.vehicle_year <= thisYear + 1)) return E("e_year", { n: C.MAX_VEHICLE_AGE, y: minYear });
    if (!/^\d{1,2}$/.test(p.plate_code) || !/^[A-Z]{0,2}\d{3,6}$/.test(p.plate_number)) return E("e_plate");
    if (C.ALLOWED_PLATE_CODES && !C.ALLOWED_PLATE_CODES.includes(p.plate_code)) return E("e_plate_code");
    if (p.vehicle_mode === "other") {
      p.owner_name = s("owner_name", 60);
      p.owner_phone = C.normalizePhone(input?.owner_phone);
      if (p.owner_name.length < 2 || !p.owner_phone) return E("e_owner");
    }
  }

  Object.assign(p, {
    services: many("services", C.SERVICES),
    shift: one("shift", C.SHIFTS),
    phone_type: one("phone_type", C.PHONE_TYPES),
    referral: s("referral", 40),
  });
  if (!p.services) return E("e_services");
  if (!p.shift || !p.phone_type) return E("e_select");
  if (p.referral) p.referral = C.normalizePhone(p.referral) ?? p.referral.toUpperCase();
  return { profile: p };
}

const SPLIT = ["languages", "prev_platforms", "services"];
const publicDriver = (d) => {
  if (!d) return null;
  const out = { status: d.status, reject_reason: d.reject_reason, lang: d.lang };
  for (const f of db.PROFILE_FIELDS) out[f] = d[f];
  for (const f of SPLIT) out[f] = d[f] ? d[f].split(",") : [];
  out.vehicle_ac = d.vehicle_ac == null ? null : !!d.vehicle_ac;
  return out;
};

export async function handleApi(request, env, path, getBot) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const user = await verifyInitData(body?.initData, env.BOT_TOKEN);
  if (!user) return json({ error: t("am", "f.open_tg_text", { brand: brand(env) }), code: "auth" }, 401);

  const [existing, prefs] = await Promise.all([db.getDriver(env.DB, user.id), db.getPrefs(env.DB, user.id)]);
  const formLang = C.LANGS.includes(body?.lang) ? body.lang : null;
  const lang = (path === "/api/register" && formLang) || existing?.lang || prefs?.lang || pickLang(user.language_code);

  if (path === "/api/me") {
    return json({ lang: existing?.lang || prefs?.lang || null, ref_code: prefs?.ref_code ?? null, user: { first_name: user.first_name, last_name: user.last_name }, driver: publicDriver(existing) });
  }

  // /api/register
  if (existing && !["awaiting_docs", "rejected"].includes(existing.status)) {
    return json({ error: t(lang, existing.status === "active" ? "f.locked_active" : "f.locked_stage"), code: "locked" }, 409);
  }
  const { profile, error, vars } = validateProfile(body?.profile);
  if (error) return json({ error: t(lang, `f.${error}`, { brand: brand(env), ...vars }), code: error }, 422);

  const owner = await db.findByPhone(env.DB, profile.phone);
  if (owner && owner.tg_id !== user.id) return json({ error: t(lang, "f.e_phone_taken"), code: "phone_taken" }, 409);

  const ref = await resolveReferrer(env, profile.referral || prefs?.ref_code, user.id);
  profile.referrer_id = ref?.tg_id ?? existing?.referrer_id ?? null;
  if (!profile.referral && prefs?.ref_code) profile.referral = prefs.ref_code;

  if (existing && (existing.status === "rejected" || existing.vehicle_mode !== profile.vehicle_mode)) await db.clearDocs(env.DB, user.id);
  await db.saveProfile(env.DB, user.id, user.username ?? null, lang, profile);
  if (formLang && formLang !== prefs?.lang) await db.setLang(env.DB, user.id, formLang);
  await db.logEvent(env.DB, user.id, "driver", existing ? "form_updated" : "registered", existing?.status === "rejected" ? "ዳግም ማመልከቻ" : null);

  try { await askNextDocument(getBot(env).api, env, user.id, true); } catch (e) { console.error("askNextDocument failed", e); }
  return json({ ok: true });
}
