// ሚኒ አፑ የሚጠቀማቸው API-ዎች፦ POST /api/me እና POST /api/register

import { verifyInitData } from "./auth.js";
import * as C from "./constants.js";
import { getDriver, findByPhone, saveProfile, clearDocs, PROFILE_FIELDS } from "./db.js";
import { askNextDocument } from "./bot.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export const addisToday = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);

/** የቅጹን መረጃ ያረጋግጣል፤ { profile } ወይም { error } ይመልሳል */
export function validateProfile(input, today = addisToday()) {
  const s = (k, max = 80) => String(input?.[k] ?? "").trim().slice(0, max);
  const list = (k, allowed) => {
    const v = Array.isArray(input?.[k]) ? input[k] : String(input?.[k] ?? "").split(",");
    return [...new Set(v.map((x) => String(x).trim()).filter((x) => allowed.includes(x)))];
  };
  const dateOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));

  // 1. የግል መረጃ
  const p = {
    full_name: s("full_name"),
    phone: C.normalizePhone(input?.phone),
    telebirr: C.normalizePhone(input?.telebirr || input?.phone),
    dob: s("dob", 10),
    sub_city: s("sub_city"),
    languages: list("languages", C.LANGUAGES).join(", "),
    emergency_name: s("emergency_name", 60),
    emergency_phone: C.normalizePhone(input?.emergency_phone),
  };
  if (p.full_name.split(/\s+/).filter(Boolean).length < 2) return { error: "እባክዎ ሙሉ ስምዎን (ስም እና የአባት ስም) ያስገቡ።" };
  if (!p.phone) return { error: "ትክክለኛ የኢትዮጵያ ስልክ ቁጥር ያስገቡ (ለምሳሌ 0911234567)።" };
  if (!p.telebirr) return { error: "ትክክለኛ የTelebirr ቁጥር ያስገቡ።" };
  if (!dateOk(p.dob)) return { error: "የትውልድ ቀንዎን ያስገቡ።" };
  const age = C.ageOn(p.dob, today);
  if (age < C.MIN_AGE) return { error: `ለCabby አሽከርካሪነት ዕድሜዎ ቢያንስ ${C.MIN_AGE} ዓመት መሆን አለበት።` };
  if (age > C.MAX_AGE) return { error: "እባክዎ ትክክለኛ የትውልድ ቀን ያስገቡ።" };
  if (!C.SUB_CITIES.includes(p.sub_city)) return { error: "ክፍለ ከተማ ይምረጡ።" };
  if (!p.languages) return { error: "ቢያንስ አንድ የሚናገሩት ቋንቋ ይምረጡ።" };
  if (p.emergency_name.length < 2 || !p.emergency_phone) return { error: "የአደጋ ጊዜ ተጠሪ ስም እና ስልክ ያስገቡ።" };
  if (p.emergency_phone === p.phone) return { error: "የአደጋ ጊዜ ተጠሪ ስልክ ከራስዎ ስልክ የተለየ መሆን አለበት።" };

  // 2. መንጃ ፈቃድ እና ልምድ
  Object.assign(p, {
    license_no: s("license_no", 30).toUpperCase(),
    license_grade: s("license_grade"),
    license_expiry: s("license_expiry", 10),
    experience: s("experience"),
    prev_platforms: list("prev_platforms", C.PREV_PLATFORMS).join(", "),
  });
  if (!/^[A-Z0-9\-\/]{4,30}$/.test(p.license_no)) return { error: "ትክክለኛ የመንጃ ፈቃድ ቁጥር ያስገቡ።" };
  if (!C.LICENSE_GRADES.includes(p.license_grade)) return { error: "የመንጃ ፈቃድ ደረጃ ይምረጡ።" };
  if (!dateOk(p.license_expiry)) return { error: "የመንጃ ፈቃድ ማብቂያ ቀን ያስገቡ።" };
  if (p.license_expiry < today) return { error: "መንጃ ፈቃድዎ ጊዜው አልፎበታል። እባክዎ አድሰው ይመዝገቡ።" };
  if (!C.EXPERIENCE.includes(p.experience)) return { error: "የማሽከርከር ልምድዎን ይምረጡ።" };
  if (!p.prev_platforms) return { error: "ከዚህ በፊት የሰሩበትን ride-hailing ይምረጡ (ካልሰሩ \"የለም\")።" };

  // 3. ተሽከርካሪ
  p.vehicle_mode = s("vehicle_mode");
  if (!C.VEHICLE_MODES[p.vehicle_mode]) return { error: "የመኪና ሁኔታዎን ይምረጡ።" };
  p.has_vehicle = p.vehicle_mode === "none" ? 0 : 1;
  if (p.has_vehicle) {
    Object.assign(p, {
      vehicle_type: s("vehicle_type"),
      vehicle_model: s("vehicle_model", 60),
      vehicle_year: parseInt(input?.vehicle_year, 10),
      vehicle_color: s("vehicle_color", 30),
      vehicle_seats: s("vehicle_seats", 3),
      vehicle_ac: input?.vehicle_ac === true || input?.vehicle_ac === "yes" ? 1 : 0,
      plate_region: s("plate_region"),
      plate_code: s("plate_code", 3),
      plate_number: s("plate_number", 10).toUpperCase().replace(/\s/g, ""),
    });
    const maxYear = Number(today.slice(0, 4)) + 1;
    if (!C.VEHICLE_TYPES.includes(p.vehicle_type)) return { error: "የመኪና ዓይነት ይምረጡ።" };
    if (p.vehicle_model.length < 2) return { error: "የመኪናውን ሞዴል ያስገቡ (ለምሳሌ Toyota Vitz)።" };
    if (!(p.vehicle_year >= C.MIN_VEHICLE_YEAR && p.vehicle_year <= maxYear)) {
      return { error: `የመኪናው የተመረተበት ዓመት (እ.ኤ.አ.) ከ${C.MIN_VEHICLE_YEAR} በኋላ መሆን አለበት።` };
    }
    if (p.vehicle_color.length < 2) return { error: "የመኪናውን ቀለም ያስገቡ።" };
    if (!C.SEATS.includes(p.vehicle_seats)) return { error: "የተሳፋሪ መቀመጫ ብዛት ይምረጡ።" };
    if (!C.PLATE_REGIONS.includes(p.plate_region)) return { error: "የሰሌዳ ክልል ይምረጡ።" };
    if (!/^\d{1,2}$/.test(p.plate_code)) return { error: "የሰሌዳ ኮድ ቁጥር ያስገቡ (ለምሳሌ 2)።" };
    if (!/^[A-Z]{0,2}\d{3,6}$/.test(p.plate_number)) return { error: "ትክክለኛ የሰሌዳ ቁጥር ያስገቡ (ለምሳሌ A12345)።" };
    if (p.vehicle_mode === "other") {
      p.owner_name = s("owner_name", 60);
      p.owner_phone = C.normalizePhone(input?.owner_phone);
      if (p.owner_name.length < 2 || !p.owner_phone) return { error: "የመኪናውን ባለቤት ስም እና ስልክ ያስገቡ።" };
    }
  }

  // 4. አገልግሎት
  Object.assign(p, {
    services: list("services", C.SERVICES).join(", "),
    shift: s("shift"),
    phone_type: s("phone_type"),
    referral: s("referral", 40),
  });
  if (!p.services) return { error: "ቢያንስ አንድ የCabby አገልግሎት ይምረጡ።" };
  if (!C.SHIFTS.includes(p.shift)) return { error: "የሚመርጡትን የስራ ሰዓት ይምረጡ።" };
  if (!C.PHONE_TYPES.includes(p.phone_type)) return { error: "የስልክዎን ዓይነት ይምረጡ።" };
  if (p.referral) p.referral = C.normalizePhone(p.referral) ?? p.referral.toUpperCase();

  return { profile: p };
}

const publicDriver = (d) => {
  if (!d) return null;
  const out = { status: d.status, reject_reason: d.reject_reason };
  for (const f of PROFILE_FIELDS) out[f] = d[f];
  out.languages = d.languages ? d.languages.split(", ") : [];
  out.prev_platforms = d.prev_platforms ? d.prev_platforms.split(", ") : [];
  out.services = d.services ? d.services.split(", ") : [];
  out.vehicle_ac = d.vehicle_ac == null ? null : !!d.vehicle_ac;
  return out;
};

export async function handleApi(request, env, path, getBot) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const user = await verifyInitData(body?.initData, env.BOT_TOKEN);
  if (!user) return json({ error: "እባክዎ ቅጹን ከTelegram ቦቱ ውስጥ ይክፈቱ።" }, 401);

  const existing = await getDriver(env.DB, user.id);

  if (path === "/api/me") {
    return json({ user: { first_name: user.first_name, last_name: user.last_name }, driver: publicDriver(existing) });
  }

  // /api/register
  const locked = { pending: "ማመልከቻዎ በግምገማ ላይ ነው። እባክዎ ውሳኔውን ይጠብቁ።",
    docs_ok: "ሰነዶችዎ ጸድቀዋል — የፈተና ቀጠሮ በቅርቡ ይደርስዎታል።",
    test_scheduled: "የተግባር ፈተና ቀጠሮ ተይዞልዎታል። ለለውጥ /help ይጠቀሙ።",
    active: "እርስዎ ቀድሞ ገቢር የCabby አሽከርካሪ ነዎት።",
    suspended: "አካውንትዎ ታግዷል። ለበለጠ መረጃ ያግኙን።" };
  if (locked[existing?.status]) return json({ error: locked[existing.status] }, 409);

  const { profile, error } = validateProfile(body?.profile);
  if (error) return json({ error }, 422);

  const owner = await findByPhone(env.DB, profile.phone);
  if (owner && owner.tg_id !== user.id) {
    return json({ error: "ይህ ስልክ ቁጥር በሌላ የTelegram አካውንት ተመዝግቧል።" }, 409);
  }

  // ውድቅ ከተደረገ በኋላ ወይም የመኪና ሁኔታ ሲቀየር ሰነዶች እንደገና ይጠየቃሉ
  if (existing?.status === "rejected" || (existing && existing.vehicle_mode !== profile.vehicle_mode)) {
    await clearDocs(env.DB, user.id);
  }
  await saveProfile(env.DB, user.id, user.username ?? null, profile);

  try {
    await askNextDocument(getBot(env).api, env, user.id, true);
  } catch (e) {
    console.error("askNextDocument failed", e);
  }
  return json({ ok: true });
}
