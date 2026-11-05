// የጋራ ድርጊቶች — ቦቱም ዳሽቦርዱም የሚጠቀሙባቸው። እያንዳንዱ ድርጊት፦ ሁኔታ ይቀይራል፣ እንቅስቃሴ ይመዘግባል፣ ለአሽከርካሪው ያሳውቃል።

import { InlineKeyboard } from "grammy";
import * as C from "./constants.js";
import * as db from "./db.js";
import { t, opt } from "./i18n.js";

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const HTML = { parse_mode: "HTML" };
export const brand = (env) => env.BRAND_NAME || "Cabby";
export const driverCode = (d) => (d?.driver_no ? `CB${d.driver_no}` : null);
export const langOf = (d) => d?.lang || "am";
const T = (env, lang, key, vars = {}) => t(lang, key, { brand: brand(env), ...vars });

let origin = "";
export const setOrigin = (o) => (origin = o);
export const formUrl = (env) => `${(env.PUBLIC_URL || origin).replace(/\/$/, "")}/`;
export const dashboardUrl = (env) => `${(env.PUBLIC_URL || origin).replace(/\/$/, "")}/admin`;

export const adminIds = (env) => {
  const ids = String(env.ADMIN_IDS ?? "").split(",").map((s) => parseInt(s.trim(), 10)).filter(Boolean);
  const chat = parseInt(env.ADMIN_CHAT_ID, 10);
  if (!ids.length && chat > 0) ids.push(chat);
  return ids;
};
export const isAdmin = (env, id) => adminIds(env).includes(Number(id));
export const adminChat = (env) => (env.ADMIN_CHAT_ID ? parseInt(env.ADMIN_CHAT_ID, 10) : null);

export const formButton = (env, lang, key = "btn_form") => new InlineKeyboard().webApp(T(env, lang, key), formUrl(env));
const year = () => Number(C.addisToday().slice(0, 4));

// ---------- የቀጠሮ ቀን አጻጻፍ ----------

const WEEKDAYS = {
  am: ["እሑድ", "ሰኞ", "ማክሰኞ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  om: ["Dilbata", "Wiixata", "Qibxata", "Roobii", "Kamiisa", "Jimaata", "Sanbata"],
  ti: ["ሰንበት", "ሰኑይ", "ሰሉስ", "ረቡዕ", "ሓሙስ", "ዓርቢ", "ቀዳም"],
};
/** "2026-11-12T09:00" (የአዲስ አበባ ሰዓት) → "ሐሙስ 12/11/2026 · ጠዋት 3:00 (09:00)" */
export function formatAppt(at, lang = "am") {
  const m = String(at ?? "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return at ?? "";
  const [, y, mo, d, hh, mm] = m;
  const h = Number(hh);
  const wd = (WEEKDAYS[lang] ?? WEEKDAYS.am)[new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay()];
  let time = `${hh}:${mm}`;
  if (lang === "am" || lang === "ti") {
    const eth = (h - 6 + 12) % 12 || 12;
    const part = lang === "am"
      ? (h >= 6 && h < 12 ? "ጠዋት" : h >= 12 && h < 18 ? "ከሰዓት" : h >= 18 ? "ማታ" : "ሌሊት")
      : (h >= 6 && h < 12 ? "ንግሆ" : h >= 12 && h < 18 ? "ድሕሪ ቐትሪ" : h >= 18 ? "ምሸት" : "ለይቲ");
    time = `${part} ${eth}:${mm} (${hh}:${mm})`;
  }
  return `${wd} ${d}/${mo}/${y} · ${time}`;
}
export const apptText = (d, lang) => {
  if (!d.appt_text && !d.appt_at) return "";
  if (d.appt_at) return [formatAppt(d.appt_at, lang), d.appt_text].filter(Boolean).join(" — ");
  return d.appt_text;
};

// ---------- የአስተዳዳሪ ካርድ ----------

const A = (group, v) => opt("am", group, v);
const list = (group, v) => (v ? v.split(",").map((x) => A(group, x)).join("፣ ") : "—");

export function summary(d, full = false) {
  const age = d.dob ? ` (${C.ageOn(d.dob, C.addisToday())} ዓመት)` : "";
  const green = C.isGreen(d) ? " ⚡ <b>ቅድሚያ</b>" : "";
  const vAge = C.vehicleAge(d, year());
  const lines = [
    `👤 <b>ስም፦</b> ${esc(d.full_name)}${age}`,
    `📞 <b>ስልክ፦</b> ${esc(d.phone)}${d.telebirr && d.telebirr !== d.phone ? ` · Telebirr ${esc(d.telebirr)}` : " · Telebirr ተመሳሳይ"}`,
    `📍 <b>ክፍለ ከተማ፦</b> ${esc(d.sub_city)}${d.tin_no ? ` · TIN ${esc(d.tin_no)}` : ""}`,
    `🪪 <b>መንጃ ፈቃድ፦</b> ${esc(d.license_no)} · ${esc(d.license_grade)} · እስከ ${esc(d.license_expiry)}`,
    `🧭 <b>ልምድ፦</b> ${esc(A("experience", d.experience) ?? "—")} · ቀድሞ፦ ${esc(list("prev", d.prev_platforms))}`,
  ];
  if (d.has_vehicle) {
    lines.push(
      `🚗 <b>መኪና፦</b> ${esc(d.vehicle_make && d.vehicle_make !== "other" ? d.vehicle_make + " " : "")}${esc(d.vehicle_model)} · ${esc(d.vehicle_year)}${vAge != null ? ` (${vAge} ዓመት)` : ""} · ${esc(d.vehicle_color)}`,
      `   ${esc(A("vtype", d.vehicle_type))} · ${esc(A("fuel", d.fuel_type) ?? "—")}${green} · ${esc(d.vehicle_seats ?? "—")} መቀመጫ · ${d.vehicle_ac ? "AC አለው" : "AC የለውም"}`,
      `🔢 <b>ሰሌዳ፦</b> ${esc(d.plate_region)} · ኮድ ${esc(d.plate_code)} · ${esc(d.plate_number)}`
    );
    if (d.vehicle_mode === "other") lines.push(`🔑 <b>ባለቤት፦</b> ${esc(d.owner_name)} · ${esc(d.owner_phone)}`);
  } else {
    lines.push(`🚗 <b>መኪና፦</b> የለውም → የቃል እና የተግባር ፈተና`);
  }
  lines.push(`🛎 <b>አገልግሎት፦</b> ${esc(list("services", d.services))} · ${esc(A("shift", d.shift) ?? "—")} · ${esc(A("phone", d.phone_type) ?? "—")}`);
  if (full) {
    lines.push(`🗣 <b>ቋንቋ፦</b> ${esc(list("spoken", d.languages))} · ቦት፦ ${esc(d.lang ?? "am")}`);
    lines.push(`🆘 <b>የአደጋ ጊዜ ተጠሪ፦</b> ${esc(d.emergency_name ?? "—")} · ${esc(d.emergency_phone ?? "")}`);
    if (d.referral) lines.push(`🤝 <b>የጠቆመው፦</b> ${esc(d.referral)}${d.referrer_id ? " ✓" : " (አልተገኘም)"}`);
  }
  return lines.join("\n");
}

const STAGE_AM = { test: "የቃል እና የተግባር ፈተና", inspection: "የመኪና ፍተሻ", orientation: "ስልጠና", active: "ገቢር" };

export function reviewCard(d, note = "") {
  const code = driverCode(d);
  const extra = [];
  if (C.APPOINTMENT_STAGES.includes(d.status)) {
    extra.push(d.appt_text || d.appt_at
      ? `📅 <b>${STAGE_AM[d.status]}፦</b> ${esc(apptText(d, "am"))}${d.appt_confirmed ? " ✅ አረጋግጧል" : ""}`
      : `📅 <b>${STAGE_AM[d.status]}፦</b> ቀጠሮ አልተያዘም`);
  }
  if (d.reject_reason && (d.status === "rejected" || d.status === "suspended")) {
    extra.push(`📝 <b>ምክንያት፦</b> ${esc(C.REJECT_REASONS.includes(d.reject_reason) ? t("am", `reasons.${d.reject_reason}`, { brand: "Cabby" }) : d.reject_reason)}`);
  }
  if (d.status === "suspended" && d.fix_state) {
    const st = { open: "አሽከርካሪው እያስተካከለ ነው", appeal_wait: "ማብራሪያ እየጻፈ ነው", submitted: "✅ ማስተካከያ አቅርቧል — ይገምግሙ" }[d.fix_state] ?? d.fix_state;
    extra.push(`🛠 <b>ማስተካከያ፦</b> ${st}`);
    if (d.fix_docs) extra.push(`   የተጠየቁ ሰነዶች፦ ${esc(d.fix_docs.split(",").map((k) => t("am", `docs.${k}`)?.[0] ?? k).join("፣ "))}`);
    if (d.fix_note) extra.push(`   ማስታወሻ፦ ${esc(d.fix_note)}`);
    if (d.appeal_text) extra.push(`   ✍️ የአሽከርካሪው ማብራሪያ፦ <i>${esc(d.appeal_text)}</i>`);
  }
  if (d.reviewed_by) extra.push(`👮 <b>የመጨረሻ ውሳኔ፦</b> ${esc(d.reviewed_by)}`);
  if (d.agreement_version) extra.push(`📄 ውል v${d.agreement_version} ተቀብሏል`);
  return (
    `🚖 <b>${code ? `${code} · ` : ""}የአሽከርካሪ ማመልከቻ</b>${C.isGreen(d) ? " ⚡" : ""}\n\n${summary(d, true)}\n\n` +
    `🆔 <code>${d.tg_id}</code>${d.username ? ` · @${esc(d.username)}` : ""}\n` +
    `📌 <b>ሁኔታ፦</b> ${t("am", `status.${d.status}`)}` +
    (extra.length ? `\n${extra.join("\n")}` : "") + (note ? `\n\n${note}` : "")
  );
}

export function cardKeyboard(d) {
  const id = d.tg_id;
  const kb = new InlineKeyboard();
  const next = STAGE_AM[C.stageAfterDocs(d, year())];
  if (d.status === "pending") {
    kb.text(`✅ ሰነዶች ትክክል → ${next}`, `ok:${id}`).row()
      .text("📎 ሰነድ እንደገና ጠይቅ", `rd:${id}`).text("❌ ውድቅ", `rej:${id}`).row()
      .text("⏭ በቀጥታ አግብር", `act:${id}`);
  } else if (d.status === "test" || d.status === "inspection") {
    kb.text(d.appt_text || d.appt_at ? "📅 ቀጠሮ ቀይር" : "📅 ቀጠሮ ስጥ", `ts:${id}`).row()
      .text(d.status === "test" ? "✅ ፈተና አለፈ" : "✅ ፍተሻ አለፈ", `pass:${id}`).text("❌ አላለፈም", `fail:${id}`).row()
      .text("⏭ በቀጥታ አግብር", `act:${id}`);
  } else if (d.status === "orientation") {
    kb.text(d.appt_text || d.appt_at ? "📅 ቀጠሮ ቀይር" : "📅 የስልጠና ቀጠሮ ስጥ", `ts:${id}`).row()
      .text("✅ ስልጠና ወስዷል — አግብር", `pass:${id}`).text("🚫 አልመጣም", `fail:${id}`);
  } else if (d.status === "active") {
    kb.text("⛔ አግድ", `sus:${id}`);
  } else if (d.status === "suspended") {
    kb.text("♻️ እገዳ አንሳ", `uns:${id}`);
    if (d.fix_state === "submitted") kb.text("↩️ አልበቃም", `fixno:${id}`);
  } else return undefined;
  return kb;
}

/** ሰነዶቹን (በአልበም) እና የግምገማ ካርዱን ይልካል */
export async function sendReview(api, chatId, d, docs) {
  const order = (k) => C.DOCUMENTS.findIndex((x) => x.kind === k);
  docs = [...docs].sort((a, b) => order(a.kind) - order(b.kind));
  const label = (k) => t("am", `docs.${k}`)?.[0] ?? k;
  const photos = docs.filter((x) => x.file_type === "photo");
  const files = docs.filter((x) => x.file_type !== "photo");
  const cap = (x) => `${label(x.kind)} — ${d.full_name}`;
  for (let i = 0; i < photos.length; i += 10) {
    const chunk = photos.slice(i, i + 10);
    if (chunk.length >= 2) await api.sendMediaGroup(chatId, chunk.map((x) => ({ type: "photo", media: x.file_id, caption: cap(x) })));
    else await api.sendPhoto(chatId, chunk[0].file_id, { caption: cap(chunk[0]) });
  }
  for (const f of files) await api.sendDocument(chatId, f.file_id, { caption: cap(f) });
  await api.sendMessage(chatId, reviewCard(d), { ...HTML, reply_markup: cardKeyboard(d) });
}

export async function notifyAdmins(api, env, text, extra = {}) {
  const targets = adminChat(env) ? [adminChat(env)] : adminIds(env);
  for (const id of targets) {
    try { await api.sendMessage(id, text, { ...HTML, ...extra }); } catch (e) { console.error("admin message failed", id, e.description ?? e.message); }
  }
}

async function deliverApplication(api, env, d, docs, header = null) {
  const chat = adminChat(env);
  let reason = "ADMIN_CHAT_ID አልተቀመጠም";
  if (chat) {
    try { if (header) await api.sendMessage(chat, header, HTML); return await sendReview(api, chat, d, docs); } catch (e) { reason = e.description ?? e.message; console.error("admin notify failed", chat, reason); }
  }
  for (const id of adminIds(env).filter((x) => x !== chat)) {
    try {
      await api.sendMessage(id, `⚠️ ማመልከቻውን ወደ ADMIN_CHAT_ID (<code>${esc(chat)}</code>) መላክ አልተቻለም፦\n<code>${esc(reason)}</code>`, HTML);
      await sendReview(api, id, d, docs);
    } catch (e) { console.error("fallback notify failed", id, e.description ?? e.message); }
  }
}

// ---------- የሰነድ አሰባሰብ ----------

export async function askNextDocument(api, env, id, intro = false) {
  const d = await db.getDriver(env.DB, id);
  if (!d || d.status !== "awaiting_docs") return;
  const lang = langOf(d);
  const have = new Set((await db.getDocs(env.DB, id)).map((x) => x.kind));
  const needed = C.requiredDocs(d);
  const next = needed.find((x) => !have.has(x.kind));
  if (!next) return submitForReview(api, env, d);
  const head = intro ? `${T(env, lang, "form_received", { n: needed.length })}\n\n` : "";
  await api.sendMessage(id, head + T(env, lang, "doc_step", { i: needed.indexOf(next) + 1, n: needed.length, prompt: t(lang, `docs.${next.kind}`)[1] }), {
    ...HTML, reply_markup: new InlineKeyboard().text(T(env, lang, "btn_redo"), "redo"),
  });
}

async function submitForReview(api, env, d) {
  if (!(await db.transition(env.DB, d.tg_id, "pending", { from: "awaiting_docs" }))) return;
  await db.logEvent(env.DB, d.tg_id, "driver", "submitted");
  const fresh = await db.getDriver(env.DB, d.tg_id);
  const lang = langOf(d);
  let text = T(env, lang, "submitted");
  if (C.isGreen(d)) text += `\n\n${T(env, lang, "green_note", { fuel: opt(lang, "fuel", d.fuel_type) })}`;
  await api.sendMessage(d.tg_id, text, HTML);
  await deliverApplication(api, env, fresh, await db.getDocs(env.DB, d.tg_id));
}

// ---------- የአስተዳዳሪ ድርጊቶች ----------
// ሁሉም፦ (env, api, id, actor, ...) → { ok, driver?, error? }

const stale = { ok: false, error: "ይህ ማመልከቻ ቀድሞ ተቀይሯል — እባክዎ ያድሱ።" };
const send = (api, id, text, extra = {}) => api.sendMessage(id, text, { ...HTML, ...extra }).catch((e) => console.error("notify driver failed", id, e.description ?? e.message));
const stageName = (env, lang, s) => t(lang, `tl_${s}`);

export async function approveDocs(env, api, id, actor) {
  const d = await db.getDriver(env.DB, id);
  if (d?.status !== "pending") return stale;
  const stage = C.stageAfterDocs(d, year());
  if (stage === "active") return activate(env, api, id, actor, "ሰነዶች ጸድቀዋል");
  if (!(await db.transition(env.DB, id, stage, { from: "pending", by: actor, appt: null }))) return stale;
  await db.logEvent(env.DB, id, actor, "docs_approved", stage);
  const lang = langOf(d);
  await send(api, id, T(env, lang, "docs_approved", { stage: stageName(env, lang, stage) }));
  return { ok: true, driver: await db.getDriver(env.DB, id), stage };
}

export async function requestDoc(env, api, id, actor, kind) {
  if (!C.DOCUMENTS.some((x) => x.kind === kind)) return { ok: false, error: "unknown document" };
  if (!(await db.transition(env.DB, id, "awaiting_docs", { from: "pending", by: actor }))) return stale;
  await db.deleteDoc(env.DB, id, kind);
  await db.logEvent(env.DB, id, actor, "doc_requested", kind);
  const d = await db.getDriver(env.DB, id);
  const lang = langOf(d);
  await send(api, id, T(env, lang, "doc_rerequest", { label: t(lang, `docs.${kind}`)[0] }));
  await askNextDocument(api, env, id);
  return { ok: true, driver: await db.getDriver(env.DB, id) };
}

export async function reject(env, api, id, actor, reason) {
  if (!C.REJECT_REASONS.includes(reason)) reason = "other";
  if (!(await db.transition(env.DB, id, "rejected", { from: ["pending", "test", "inspection", "orientation"], by: actor, reason }))) return stale;
  await db.logEvent(env.DB, id, actor, "rejected", reason);
  const d = await db.getDriver(env.DB, id);
  const lang = langOf(d);
  await send(api, id, T(env, lang, "rejected", { reason: T(env, lang, `reasons.${reason}`) }), { reply_markup: formButton(env, lang, "btn_reapply") });
  return { ok: true, driver: d };
}

/** ቀጠሮ — { at: "2026-11-12T09:00", text: "ቦሌ ቢሮ" } ወይም { text: "ሐሙስ 3 ሰዓት ቦሌ" } */
export async function schedule(env, api, id, actor, { at = null, text = null } = {}) {
  const d = await db.getDriver(env.DB, id);
  if (!d || !C.APPOINTMENT_STAGES.includes(d.status)) return { ok: false, error: "ይህ አሽከርካሪ አሁን ለቀጠሮ ዝግጁ አይደለም።" };
  at = at && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at) ? at.slice(0, 16) : null;
  text = text ? String(text).trim().slice(0, 200) : null;
  if (!at && !text) return { ok: false, error: "ቀን ወይም ጽሑፍ ያስገቡ።" };
  if (!(await db.transition(env.DB, id, d.status, { from: d.status, by: actor, appt: { at, text } }))) return stale;
  const fresh = await db.getDriver(env.DB, id);
  const lang = langOf(d);
  await db.logEvent(env.DB, id, actor, "scheduled", `${d.status}: ${apptText(fresh, "am")}`);
  const res = await api
    .sendMessage(id,
      `<b>${T(env, lang, `appt_title_${d.status}`)}</b>\n\n📅 ${esc(apptText(fresh, lang))}\n\n${T(env, lang, `appt_bring_${d.status}`)}\n${T(env, lang, "appt_confirm_q")}`,
      { ...HTML, reply_markup: new InlineKeyboard().text(T(env, lang, "btn_appt_yes"), `ac:${id}`).text(T(env, lang, "btn_appt_no"), `ar:${id}`) })
    .then(() => null)
    .catch((e) => e.description ?? e.message);
  return { ok: true, driver: fresh, warning: res ? `ለአሽከርካሪው መላክ አልተቻለም፦ ${res}` : null };
}

export async function pass(env, api, id, actor) {
  const d = await db.getDriver(env.DB, id);
  if (!d || !C.APPOINTMENT_STAGES.includes(d.status)) return stale;
  if (d.status === "orientation" || C.stageAfterPass() === "active") return activate(env, api, id, actor, d.status === "orientation" ? "ስልጠና ወስዷል" : `${d.status} አለፈ`);
  if (!(await db.transition(env.DB, id, "orientation", { from: d.status, by: actor, appt: null }))) return stale;
  await db.logEvent(env.DB, id, actor, "passed", d.status);
  await send(api, id, T(env, langOf(d), d.status === "test" ? "passed_test" : "passed_inspection"));
  return { ok: true, driver: await db.getDriver(env.DB, id) };
}

export async function fail(env, api, id, actor, reason) {
  const d = await db.getDriver(env.DB, id);
  if (!d || !C.APPOINTMENT_STAGES.includes(d.status)) return stale;
  reason ||= d.status === "inspection" ? "inspection" : d.status === "orientation" ? "no_show" : "test_practical";
  return reject(env, api, id, actor, reason);
}

let botUsername = null;
async function referralLink(api, env, d) {
  botUsername ||= env.BOT_USERNAME || (await api.getMe().then((m) => m.username).catch(() => null));
  return botUsername ? `https://t.me/${botUsername}?start=ref_${driverCode(d)}` : null;
}

export function appButtons(env, d, lang) {
  const kb = new InlineKeyboard();
  const services = (d.services ?? "share").split(",");
  const os = d.phone_type === "android" ? ["android"] : d.phone_type === "ios" ? ["ios"] : ["android", "ios"];
  for (const s of ["share", "reserve"]) {
    if (!services.includes(s)) continue;
    for (const o of os) {
      const url = C.cfg(env, `${s.toUpperCase()}_${o === "ios" ? "IOS" : "ANDROID"}_URL`);
      if (url) kb.url(T(env, lang, `btn_app_${s}_${o}`), url).row();
    }
  }
  if (C.cfg(env, "DRIVER_GROUP_LINK")) kb.url(T(env, lang, "btn_group"), C.cfg(env, "DRIVER_GROUP_LINK"));
  return kb.inline_keyboard.flat().length ? kb : undefined;
}

export async function activate(env, api, id, actor, how = "") {
  const before = await db.getDriver(env.DB, id);
  if (!(await db.transition(env.DB, id, "active", { from: ["pending", "test", "inspection", "orientation"], by: actor, appt: null }))) return stale;
  const d = await db.getDriver(env.DB, id);
  await db.logEvent(env.DB, id, actor, "activated", how || (before.status === "pending" ? "በቀጥታ" : before.status));
  const lang = langOf(d);
  const code = driverCode(d);
  await send(api, id, T(env, lang, "activated", { name: esc(d.full_name.split(" ")[0]), code }), { reply_markup: appButtons(env, d, lang) });
  const link = await referralLink(api, env, d);
  const reward = C.cfg(env, "REFERRAL_REWARD");
  if (link) await send(api, id, T(env, lang, "referral_share", { link, reward: reward ? ` (${esc(reward)})` : "" }));

  // የጠቆመው ሰው ሽልማት ማሳወቂያ
  if (d.referrer_id && !d.referral_rewarded_at) {
    const ref = await db.getDriver(env.DB, d.referrer_id);
    if (ref?.status === "active") {
      const rl = langOf(ref);
      await send(api, ref.tg_id, T(env, rl, "referral_reward", { name: esc(d.full_name), reward: reward ? T(env, rl, "reward_suffix", { reward: esc(reward) }) : "" }));
      await db.markReferralRewarded(env.DB, id);
      await db.logEvent(env.DB, ref.tg_id, "system", "referral_reward", `${d.full_name} (${code})`);
    }
  }
  return { ok: true, driver: d };
}

/** የእገዳ መልዕክት ከማስተካከያ አዝራሮች ጋር */
export function suspendNotice(env, d) {
  const lang = langOf(d);
  const reason = C.REJECT_REASONS.includes(d.reject_reason) ? T(env, lang, `reasons.${d.reject_reason}`) : d.reject_reason;
  let text = T(env, lang, "suspended", { reason: esc(reason) });
  if (d.fix_note) text += `\n${T(env, lang, "fix_note", { note: esc(d.fix_note) })}`;
  if (d.fix_state === "submitted") return { text: `${text}\n\n${T(env, lang, "fix_submitted")}`, kb: undefined };
  const docs = (d.fix_docs ?? "").split(",").filter(Boolean);
  if (docs.length) text += `\n\n${T(env, lang, "fix_docs_needed", { list: docs.map((k) => t(lang, `docs.${k}`)[0]).join(", ") })}`;
  text += `\n\n${T(env, lang, "fix_how")}`;
  const kb = new InlineKeyboard();
  if (docs.length) kb.text(T(env, lang, "btn_fix_docs"), "fx:docs").row();
  kb.webApp(T(env, lang, "btn_fix_form"), formUrl(env)).row().text(T(env, lang, "btn_fix_appeal"), "fx:appeal");
  return { text, kb };
}

export async function suspend(env, api, id, actor, reason = "other", { docs = [], note = "" } = {}) {
  docs = (Array.isArray(docs) ? docs : []).filter((k) => C.DOCUMENTS.some((x) => x.kind === k));
  note = String(note ?? "").trim().slice(0, 500);
  if (!(await db.transition(env.DB, id, "suspended", { from: "active", by: actor, reason }))) return stale;
  for (const k of docs) await db.deleteDoc(env.DB, id, k);
  await db.setFix(env.DB, id, { fix_state: "open", fix_docs: docs.join(",") || null, fix_note: note || null, fix_submitted_at: null, appeal_text: null });
  const reasonAm = C.REJECT_REASONS.includes(reason) ? t("am", `reasons.${reason}`, { brand: brand(env) }) : reason;
  await db.logEvent(env.DB, id, actor, "suspended", [reasonAm, docs.length ? `ሰነዶች፦ ${docs.map((k) => t("am", `docs.${k}`)[0]).join("፣ ")}` : "", note].filter(Boolean).join(" · "));
  const d = await db.getDriver(env.DB, id);
  const n = suspendNotice(env, d);
  await send(api, id, n.text, { reply_markup: n.kb });
  return { ok: true, driver: d };
}

export async function unsuspend(env, api, id, actor) {
  if (!(await db.transition(env.DB, id, "active", { from: "suspended", by: actor }))) return stale;
  await db.clearFix(env.DB, id);
  await db.logEvent(env.DB, id, actor, "unsuspended");
  const d = await db.getDriver(env.DB, id);
  await send(api, id, T(env, langOf(d), "unsuspended"), { reply_markup: appButtons(env, d, langOf(d)) });
  return { ok: true, driver: d };
}

/** የታገደው አሽከርካሪ የተጠየቀውን ሰነድ እንዲልክ */
export async function askFixDoc(api, env, id) {
  const d = await db.getDriver(env.DB, id);
  if (d?.status !== "suspended" || !d.fix_docs) return null;
  const lang = langOf(d);
  const need = d.fix_docs.split(",");
  const have = new Set((await db.getDocs(env.DB, id)).map((x) => x.kind));
  const next = need.find((k) => !have.has(k));
  if (!next) return fixSubmitted(env, api, id, "docs");
  await api.sendMessage(id, T(env, lang, "doc_step", { i: need.indexOf(next) + 1, n: need.length, prompt: t(lang, `docs.${next}`)[1] }), HTML);
  return next;
}

/** አሽከርካሪው ማስተካከያ አቀረበ (ሰነድ፣ ቅጽ ወይም ማብራሪያ) → ለአስተዳዳሪዎች */
export async function fixSubmitted(env, api, id, how, detail = null) {
  const d0 = await db.getDriver(env.DB, id);
  if (d0?.status !== "suspended") return null;
  await db.setFix(env.DB, id, { fix_state: "submitted", fix_submitted_at: new Date().toISOString().replace("T", " ").slice(0, 19), ...(how === "appeal" ? { appeal_text: String(detail ?? "").slice(0, 2000) } : {}) });
  await db.logEvent(env.DB, id, "driver", "fix_submitted", { docs: "ሰነዶች ላከ", form: "መረጃውን አስተካከለ", appeal: `ማብራሪያ፦ ${detail ?? ""}` }[how] ?? how);
  const d = await db.getDriver(env.DB, id);
  await send(api, id, T(env, langOf(d), "fix_submitted"));
  const docs = how === "docs" ? (await db.getDocs(env.DB, id)).filter((x) => (d.fix_docs ?? "").split(",").includes(x.kind)) : [];
  await deliverApplication(api, env, d, docs, `♻️ <b>${esc(d.full_name)}</b> (${esc(driverCode(d))}) እገዳውን ለማንሳት ማስተካከያ አቅርቧል።`);
  return d;
}

export async function rejectFix(env, api, id, actor, note = "") {
  const d0 = await db.getDriver(env.DB, id);
  if (d0?.status !== "suspended" || d0.fix_state !== "submitted") return stale;
  note = String(note ?? "").trim().slice(0, 500);
  await db.setFix(env.DB, id, { fix_state: "open", fix_submitted_at: null, ...(note ? { fix_note: note } : {}) });
  await db.logEvent(env.DB, id, actor, "fix_rejected", note || null);
  const d = await db.getDriver(env.DB, id);
  const n = suspendNotice(env, d);
  await send(api, id, `${T(env, langOf(d), "fix_rejected")}\n\n${n.text}`, { reply_markup: n.kb });
  return { ok: true, driver: d };
}

export async function addNote(env, id, actor, text) {
  text = String(text ?? "").trim();
  if (!text) return { ok: false, error: "ማስታወሻ ባዶ ነው።" };
  await db.logEvent(env.DB, id, actor, "note", text);
  return { ok: true };
}

export async function markPaid(env, referredId, actor) {
  const r = await db.markReferralPaid(env.DB, referredId);
  if (!r.meta.changes) return { ok: false, error: "ቀድሞ ተከፍሏል ወይም ገቢር አይደለም።" };
  const d = await db.getDriver(env.DB, referredId);
  if (d?.referrer_id) await db.logEvent(env.DB, d.referrer_id, actor, "referral_paid", `${d.full_name} (${driverCode(d)})`);
  return { ok: true };
}

/** ስም/ስልክ ወይም CB ኮድ → የጠቆመው አሽከርካሪ */
export async function resolveReferrer(env, raw, selfId) {
  if (!raw) return null;
  const code = String(raw).trim().match(/^CB(\d+)$/i);
  const ref = code ? await db.findByCode(env.DB, Number(code[1])) : (C.normalizePhone(raw) ? await db.findByPhone(env.DB, C.normalizePhone(raw)) : null);
  return ref && ref.tg_id !== selfId ? ref : null;
}
