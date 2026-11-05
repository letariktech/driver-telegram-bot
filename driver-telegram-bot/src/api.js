// ሚኒ አፑ የሚጠቀማቸው API-ዎች፦ POST /api/me እና POST /api/register

import { verifyInitData } from "./auth.js";
import { SUB_CITIES, LICENSE_GRADES, VEHICLE_TYPES, PLATE_REGIONS, normalizePhone } from "./constants.js";
import { getDriver, findByPhone, saveProfile, clearDocs } from "./db.js";
import { askNextDocument } from "./bot.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export const addisToday = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);


/** የቅጹን መረጃ ያረጋግጣል፤ { profile } ወይም { error } ይመልሳል */
export function validateProfile(input) {
  const s = (k, max = 80) => String(input?.[k] ?? "").trim().slice(0, max);
  const p = {
    full_name: s("full_name"),
    phone: normalizePhone(input?.phone),
    sub_city: s("sub_city"),
    license_no: s("license_no", 30).toUpperCase(),
    license_grade: s("license_grade"),
    license_expiry: s("license_expiry", 10),
    has_vehicle: input?.has_vehicle === true || input?.has_vehicle === "yes" ? 1 : 0,
  };

  if (p.full_name.split(/\s+/).filter(Boolean).length < 2) return { error: "እባክዎ ሙሉ ስምዎን (ስም እና የአባት ስም) ያስገቡ።" };
  if (!p.phone) return { error: "ትክክለኛ የኢትዮጵያ ስልክ ቁጥር ያስገቡ (ለምሳሌ 0911234567)።" };
  if (!SUB_CITIES.includes(p.sub_city)) return { error: "ክፍለ ከተማ ይምረጡ።" };
  if (!/^[A-Z0-9\-\/]{4,30}$/.test(p.license_no)) return { error: "ትክክለኛ የመንጃ ፈቃድ ቁጥር ያስገቡ።" };
  if (!LICENSE_GRADES.includes(p.license_grade)) return { error: "የመንጃ ፈቃድ ደረጃ ይምረጡ።" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.license_expiry)) return { error: "የመንጃ ፈቃድ ማብቂያ ቀን ያስገቡ።" };
  if (p.license_expiry < addisToday()) return { error: "መንጃ ፈቃድዎ ጊዜው አልፎበታል። እባክዎ አድሰው ይመዝገቡ።" };

  if (p.has_vehicle) {
    Object.assign(p, {
      vehicle_type: s("vehicle_type"),
      vehicle_model: s("vehicle_model", 60),
      vehicle_year: parseInt(input?.vehicle_year, 10),
      vehicle_color: s("vehicle_color", 30),
      plate_region: s("plate_region"),
      plate_code: s("plate_code", 3),
      plate_number: s("plate_number", 10).toUpperCase().replace(/\s/g, ""),
    });
    const maxYear = new Date().getFullYear() + 1;
    if (!VEHICLE_TYPES.includes(p.vehicle_type)) return { error: "የተሽከርካሪ ዓይነት ይምረጡ።" };
    if (p.vehicle_model.length < 2) return { error: "የተሽከርካሪውን ሞዴል ያስገቡ (ለምሳሌ Toyota Vitz)።" };
    if (!(p.vehicle_year >= 1970 && p.vehicle_year <= maxYear)) return { error: "ትክክለኛ የተመረተበት ዓመት (እ.ኤ.አ.) ያስገቡ።" };
    if (p.vehicle_color.length < 2) return { error: "የተሽከርካሪውን ቀለም ያስገቡ።" };
    if (!PLATE_REGIONS.includes(p.plate_region)) return { error: "የሰሌዳ ክልል ይምረጡ።" };
    if (!/^\d{1,2}$/.test(p.plate_code)) return { error: "የሰሌዳ ኮድ ቁጥር ያስገቡ (ለምሳሌ 2)።" };
    if (!/^[A-Z]{0,2}\d{3,6}$/.test(p.plate_number)) return { error: "ትክክለኛ የሰሌዳ ቁጥር ያስገቡ (ለምሳሌ A12345)።" };
  }
  return { profile: p };
}

const publicDriver = (d) =>
  d && {
    status: d.status,
    reject_reason: d.reject_reason,
    full_name: d.full_name, phone: d.phone, sub_city: d.sub_city,
    license_no: d.license_no, license_grade: d.license_grade, license_expiry: d.license_expiry,
    has_vehicle: !!d.has_vehicle, vehicle_type: d.vehicle_type, vehicle_model: d.vehicle_model,
    vehicle_year: d.vehicle_year, vehicle_color: d.vehicle_color,
    plate_region: d.plate_region, plate_code: d.plate_code, plate_number: d.plate_number,
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
    return json({
      user: { first_name: user.first_name, last_name: user.last_name },
      driver: publicDriver(existing),
    });
  }

  // /api/register
  if (existing?.status === "pending") return json({ error: "ምዝገባዎ በግምገማ ላይ ነው። እባክዎ ውሳኔውን ይጠብቁ።" }, 409);
  if (existing?.status === "approved") return json({ error: "ምዝገባዎ ቀድሞ ጸድቋል።" }, 409);

  const { profile, error } = validateProfile(body?.profile);
  if (error) return json({ error }, 422);

  const owner = await findByPhone(env.DB, profile.phone);
  if (owner && owner.tg_id !== user.id) {
    return json({ error: "ይህ ስልክ ቁጥር በሌላ የTelegram አካውንት ተመዝግቧል።" }, 409);
  }

  // ውድቅ ከተደረገ በኋላ እንደገና ሲመዘገቡ ሰነዶችም እንደገና ይጠየቃሉ
  if (existing?.status === "rejected") await clearDocs(env.DB, user.id);
  await saveProfile(env.DB, user.id, user.username ?? null, profile);

  try {
    await askNextDocument(getBot(env).api, env, user.id, true);
  } catch (e) {
    console.error("askNextDocument failed", e);
  }
  return json({ ok: true });
}
