// የጋራ ድርጊቶች — ቦቱም ዳሽቦርዱም የሚጠቀሙባቸው። እያንዳንዱ ድርጊት፦ ሁኔታ ይቀይራል፣ እንቅስቃሴ ይመዘግባል፣ ለአሽከርካሪው ያሳውቃል።

import { InlineKeyboard } from "grammy";
import * as C from "./constants.js";
import * as db from "./db.js";
import { t, opt } from "./i18n.js";
import { sendSms, limitWarning } from "./sms.js";

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
export const agentUrl = (env) => `${(env.PUBLIC_URL || origin).replace(/\/$/, "")}/agent`;

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

const STAGE_AM = { test: "የቃል እና የተግባር ፈተና", inspection: "የመኪና ፍተሻ", orientation: "ስልጠና", active: "ለስራ ዝግጁ" };

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
  if (d.docs_due_at && d.status !== "rejected") {
    const left = daysLeft(d);
    extra.push(d.docs_overdue_at ? `⛔ <b>የሰነድ ጊዜ አልፏል</b> — ያራዝሙ ወይም ውድቅ ያድርጉ` : `📎 <b>በኋላ የሚያሟላ ሰነድ አለ</b> · ${left} ቀን ቀርቷል`);
  }
  if (d.reviewed_by) extra.push(`👮 <b>የመጨረሻ ውሳኔ፦</b> ${esc(d.reviewed_by)}`);
  if (d.agreement_version) extra.push(`📄 ውል v${d.agreement_version} ተቀብሏል`);
  return (
    `🚖 <b>${code ? `${code} · ` : ""}የአሽከርካሪ ማመልከቻ</b>${C.isGreen(d) ? " ⚡" : ""}\n\n${summary(d, true)}\n\n` +
    (db.isNoTg(d.tg_id) ? `📵 <b>Telegram የለውም</b> — በሴልስ የተመዘገበ (SMS)\n` : `🆔 <code>${d.tg_id}</code>${d.username ? ` · @${esc(d.username)}` : ""}\n`) +
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
      .text("⏭ በቀጥታ ለስራ ዝግጁ አድርግ", `act:${id}`);
  } else if (d.status === "test" || d.status === "inspection") {
    kb.text(d.appt_text || d.appt_at ? "📅 ቀጠሮ ቀይር" : "📅 ቀጠሮ ስጥ", `ts:${id}`).row()
      .text(d.status === "test" ? "✅ ፈተና አለፈ" : "✅ ፍተሻ አለፈ", `pass:${id}`).text("❌ አላለፈም", `fail:${id}`).row()
      .text("⏭ በቀጥታ ለስራ ዝግጁ አድርግ", `act:${id}`);
  } else if (d.status === "orientation") {
    kb.text(d.appt_text || d.appt_at ? "📅 ቀጠሮ ቀይር" : "📅 የስልጠና ቀጠሮ ስጥ", `ts:${id}`).row()
      .text("✅ ስልጠና ወስዷል — ለስራ ዝግጁ አድርግ", `pass:${id}`).text("🚫 አልመጣም", `fail:${id}`);
  } else if (d.status === "active") {
    kb.text("⛔ አግድ", `sus:${id}`);
    if (d.docs_overdue_at) kb.row().text("⏳ የሰነድ ጊዜ +7 ቀን", `ext:${id}`);
  } else if (d.status === "suspended") {
    kb.text("♻️ እገዳ አንሳ", `uns:${id}`);
    if (d.fix_state === "submitted") kb.text("↩️ አልበቃም", `fixno:${id}`);
  } else return undefined;
  if (d.docs_overdue_at && d.status !== "active") kb.row().text("⏳ የሰነድ ጊዜ +7 ቀን", `ext:${id}`);
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

export async function docInfo(env, d) {
  const have = new Set((await db.getDocs(env.DB, d.tg_id)).map((x) => x.kind));
  return { have, ...C.docState(d, have) };
}
const docLabels = (lang, kinds) => kinds.map((k) => t(lang, `docs.${k}`)?.[0] ?? k).join("፣ ");
const daysLeft = (d) => (d.docs_due_at ? Math.ceil((Date.parse(d.docs_due_at.replace(" ", "T") + "Z") - Date.now()) / 86400e3) : null);
export { daysLeft, docLabels };

export async function askNextDocument(api, env, id, intro = false) {
  const d = await db.getDriver(env.DB, id);
  if (!d || d.status !== "awaiting_docs") return;
  const lang = langOf(d);
  const info = await docInfo(env, d);
  const needed = info.list;
  const next = info.next;
  if (!next) return submitForReview(api, env, d);
  const skippable = C.docPolicy(next.kind) !== "required";
  if (db.isNoTg(id)) {
    // ሰነዶቹን ሴልሱ በራሱ ቻት ይልካል
    const agent = d.agent_id ? await db.staffById(env.DB, d.agent_id) : null;
    if (!agent?.tg_id) return;
    await env.DB.prepare("UPDATE staff SET collecting_for = ? WHERE id = ?").bind(id, agent.id).run();
    await api.sendMessage(agent.tg_id,
      `👤 <b>${esc(d.full_name)}</b> · ${esc(d.phone)}\n📎 <b>ሰነድ ${needed.indexOf(next) + 1}/${needed.length}፦</b> ${t("am", `docs.${next.kind}`)[1]}\n\n<i>የአሽከርካሪውን ሰነድ ፎቶ አንስተው እዚሁ ይላኩ።</i>`,
      { ...HTML, reply_markup: skippable ? new InlineKeyboard().text(C.docPolicy(next.kind) === "optional" ? "⏭ የለውም" : "⏭ አሁን የለውም — በኋላ ያሟላል", `agskip:${id}:${next.kind}`) : undefined });
    return;
  }
  const head = intro ? `${T(env, lang, "form_received", { n: needed.length })}\n\n` : "";
  const kb = new InlineKeyboard();
  if (skippable) kb.text(T(env, lang, C.docPolicy(next.kind) === "optional" ? "btn_skip_optional" : "btn_skip_later"), `skip:${next.kind}`).row();
  kb.text(T(env, lang, "btn_redo"), "redo");
  await api.sendMessage(id, head + T(env, lang, "doc_step", { i: needed.indexOf(next) + 1, n: needed.length, prompt: t(lang, `docs.${next.kind}`)[1] }) +
    (skippable ? `\n\n<i>${T(env, lang, C.docPolicy(next.kind) === "optional" ? "doc_optional_note" : "doc_later_note", { days: C.DOC_DEADLINE_DAYS })}</i>` : ""), { ...HTML, reply_markup: kb });
}

/** "የለኝም" — ሰነዱን ዘሎ ቀጣዩን ይጠይቃል (ግዴታ ሰነድ አይዘለልም) */
export async function skipDoc(api, env, id, kind, on = true) {
  const d = await db.getDriver(env.DB, id);
  if (!d) return { ok: false, error: "not found" };
  if (C.docPolicy(kind) === "required" || !C.requiredDocs(d).some((x) => x.kind === kind)) return { ok: false, error: "required" };
  await db.setSkipped(env.DB, id, kind, on);
  return { ok: true };
}

/** ማመልከቻው ከተላከ በኋላ ሰነድ ሲጨመር — ሁሉም ከተሟላ የጊዜ ገደቡ ይነሳል */
export async function docAdded(api, env, id, kind, by = "driver") {
  const d = await db.getDriver(env.DB, id);
  if (!d || d.status === "awaiting_docs") return;
  await db.setSkipped(env.DB, id, kind, false);
  await db.logEvent(env.DB, id, by, "doc_added", kind);
  const info = await docInfo(env, await db.getDriver(env.DB, id));
  if (d.docs_due_at && !info.missingLater.length) {
    await env.DB.prepare("UPDATE drivers SET docs_due_at = NULL, docs_overdue_at = NULL WHERE tg_id = ?").bind(id).run();
    await db.logEvent(env.DB, id, "system", "docs_completed");
    await tell(env, api, d, { text: (l) => T(env, l, "docs_complete") });
    await notifyAdmins(api, env, `📎 <b>${esc(d.full_name)}</b> ${driverCode(d) ? `(${driverCode(d)}) ` : ""}የቀሩትን ሰነዶች አሟልቷል።`,
      { reply_markup: new InlineKeyboard().url("📊 ዳሽቦርድ", `${dashboardUrl(env)}#drivers/${id}`) });
  }
  return info;
}

/** የጊዜ ገደቡ ያለፈበት ማመልከቻ ይቆማል */
const overdue = (d) => (d?.docs_overdue_at ? { ok: false, code: "overdue", error: "የሰነድ ማሟያ ጊዜው አልፏል — መጀመሪያ ጊዜውን ያራዝሙ ወይም ውድቅ ያድርጉ።" } : null);

export async function extendDocs(env, api, id, actor, days = 7) {
  days = Math.max(1, Math.min(60, parseInt(days, 10) || 7));
  const d = await db.getDriver(env.DB, id);
  if (!d?.docs_due_at) return { ok: false, error: "ይህ አሽከርካሪ የሚያሟላው ሰነድ የለም።" };
  const base = Math.max(Date.now(), Date.parse(d.docs_due_at.replace(" ", "T") + "Z"));
  const due = new Date(base + days * 86400e3).toISOString().slice(0, 19).replace("T", " ");
  await env.DB.prepare("UPDATE drivers SET docs_due_at = ?, docs_overdue_at = NULL WHERE tg_id = ?").bind(due, id).run();
  await db.logEvent(env.DB, id, actor, "docs_extended", `+${days} ቀን`);
  const fresh = await db.getDriver(env.DB, id);
  const info = await docInfo(env, fresh);
  await tell(env, api, fresh, {
    text: (l) => T(env, l, "docs_extended", { days: daysLeft(fresh), list: esc(docLabels(l, info.missingLater)) }),
    sms: ["docs_reminder", (l) => ({ n: info.missingLater.length, list: docLabels(l, info.missingLater), days: daysLeft(fresh) })],
  });
  return { ok: true, driver: fresh };
}

async function submitForReview(api, env, d) {
  if (!(await db.transition(env.DB, d.tg_id, "pending", { from: "awaiting_docs" }))) return;
  const info = await docInfo(env, d);
  if (info.missingLater.length) {
    const due = new Date(Date.now() + C.DOC_DEADLINE_DAYS * 86400e3).toISOString().slice(0, 19).replace("T", " ");
    await env.DB.prepare("UPDATE drivers SET docs_since = datetime('now'), docs_due_at = ?, docs_reminders = 0, docs_overdue_at = NULL WHERE tg_id = ?").bind(due, d.tg_id).run();
  }
  await db.logEvent(env.DB, d.tg_id, "driver", "submitted", info.missingLater.length ? `በኋላ የሚያሟላ፦ ${docLabels("am", info.missingLater)}` : null);
  const fresh = await db.getDriver(env.DB, d.tg_id);
  if (db.isNoTg(d.tg_id) && d.agent_id) await env.DB.prepare("UPDATE staff SET collecting_for = NULL WHERE id = ? AND collecting_for = ?").bind(d.agent_id, d.tg_id).run();
  const msg = (lang) => T(env, lang, "submitted") + (C.isGreen(d) ? `\n\n${T(env, lang, "green_note", { fuel: opt(lang, "fuel", d.fuel_type) })}` : "") +
    (info.missingLater.length ? `\n\n${T(env, lang, "submitted_missing", { list: esc(docLabels(lang, info.missingLater)), days: C.DOC_DEADLINE_DAYS })}` : "");
  await tell(env, api, d, { text: msg, sms: ["submitted"] });
  await deliverApplication(api, env, fresh, await db.getDocs(env.DB, d.tg_id));
}

// ---------- የአስተዳዳሪ ድርጊቶች ----------
// ሁሉም፦ (env, api, id, actor, ...) → { ok, driver?, error? }

const stale = { ok: false, error: "ይህ ማመልከቻ ቀድሞ ተቀይሯል — እባክዎ ያድሱ።" };
const send = (api, id, text, extra = {}) => api.sendMessage(id, text, { ...HTML, ...extra }).catch((e) => console.error("notify driver failed", id, e.description ?? e.message));

/**
 * ለአሽከርካሪው ማሳወቅ። Telegram ያለው → Telegram። በሴልስ የተመዘገበ (Telegram የሌለው) → SMS + ቅጂ ለሴልሱ በአማርኛ።
 * text፦ (lang) => string · sms፦ [kind, (lang) => vars]
 */
export async function tell(env, api, d, { text, extra = {}, sms = null, agentExtra = {} }) {
  if (!db.isNoTg(d.tg_id)) return send(api, d.tg_id, text(langOf(d)), extra);
  const lang = langOf(d);
  if (sms) {
    const [kind, vars] = sms;
    const res = await sendSms(env, { to: d.phone, text: t(lang, `sms.${kind}`, { brand: brand(env), ...(vars ? vars(lang) : {}) }), kind, tg_id: d.tg_id });
    await limitWarning(env, res, (m) => notifyAdmins(api, env, m));
  }
  const agent = d.agent_id ? await db.staffById(env.DB, d.agent_id) : null;
  if (agent?.tg_id) await send(api, agent.tg_id, `👤 <b>${esc(d.full_name)}</b> · ${esc(d.phone)} · 📵 Telegram የለውም\n\n${text("am")}`, agentExtra);
}
const stageName = (env, lang, s) => t(lang, `tl_${s}`);

export async function approveDocs(env, api, id, actor) {
  const d = await db.getDriver(env.DB, id);
  if (d?.status !== "pending") return stale;
  if (overdue(d)) return overdue(d);
  const stage = C.stageAfterDocs(d, year());
  if (stage === "active") return activate(env, api, id, actor, "ሰነዶች ጸድቀዋል");
  if (!(await db.transition(env.DB, id, stage, { from: "pending", by: actor, appt: null }))) return stale;
  await db.logEvent(env.DB, id, actor, "docs_approved", stage);
  await tell(env, api, d, { text: (l) => T(env, l, "docs_approved", { stage: stageName(env, l, stage) }), sms: ["docs_approved", (l) => ({ stage: stageName(env, l, stage) })] });
  return { ok: true, driver: await db.getDriver(env.DB, id), stage };
}

export async function requestDoc(env, api, id, actor, kind) {
  if (!C.DOCUMENTS.some((x) => x.kind === kind)) return { ok: false, error: "unknown document" };
  if (!(await db.transition(env.DB, id, "awaiting_docs", { from: "pending", by: actor }))) return stale;
  await db.deleteDoc(env.DB, id, kind);
  await db.logEvent(env.DB, id, actor, "doc_requested", kind);
  const d = await db.getDriver(env.DB, id);
  await tell(env, api, d, { text: (l) => T(env, l, "doc_rerequest", { label: t(l, `docs.${kind}`)[0] }), sms: ["doc_rerequest", (l) => ({ label: t(l, `docs.${kind}`)[0] })] });
  await askNextDocument(api, env, id);
  return { ok: true, driver: await db.getDriver(env.DB, id) };
}

export async function reject(env, api, id, actor, reason) {
  if (!C.REJECT_REASONS.includes(reason)) reason = "other";
  if (!(await db.transition(env.DB, id, "rejected", { from: ["pending", "test", "inspection", "orientation"], by: actor, reason }))) return stale;
  await db.logEvent(env.DB, id, actor, "rejected", reason);
  const d = await db.getDriver(env.DB, id);
  await tell(env, api, d, {
    text: (l) => T(env, l, "rejected", { reason: T(env, l, `reasons.${reason}`) }),
    extra: { reply_markup: formButton(env, langOf(d), "btn_reapply") },
    sms: ["rejected", (l) => ({ reason: T(env, l, `reasons.${reason}`) })],
  });
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
  const buttons = (l) => new InlineKeyboard().text(T(env, l, "btn_appt_yes"), `ac:${id}`).text(T(env, l, "btn_appt_no"), `ar:${id}`);
  const apptMsg = (l) => `<b>${T(env, l, `appt_title_${d.status}`)}</b>\n\n📅 ${esc(apptText(fresh, l))}\n\n${T(env, l, `appt_bring_${d.status}`)}\n${T(env, l, "appt_confirm_q")}`;
  let res = null;
  if (db.isNoTg(id)) {
    await tell(env, api, fresh, { text: apptMsg, sms: ["appt", (l) => ({ title: T(env, l, `appt_title_${d.status}`).replace(/^\S+\s/, ""), when: apptText(fresh, l) })], agentExtra: { reply_markup: buttons("am") } });
  } else {
    res = await api.sendMessage(id, apptMsg(lang), { ...HTML, reply_markup: buttons(lang) }).then(() => null).catch((e) => e.description ?? e.message);
  }
  return { ok: true, driver: fresh, warning: res ? `ለአሽከርካሪው መላክ አልተቻለም፦ ${res}` : null };
}

export async function pass(env, api, id, actor) {
  const d = await db.getDriver(env.DB, id);
  if (!d || !C.APPOINTMENT_STAGES.includes(d.status)) return stale;
  if (overdue(d)) return overdue(d);
  if (d.status === "orientation" || C.stageAfterPass() === "active") return activate(env, api, id, actor, d.status === "orientation" ? "ስልጠና ወስዷል" : `${d.status} አለፈ`);
  if (!(await db.transition(env.DB, id, "orientation", { from: d.status, by: actor, appt: null }))) return stale;
  await db.logEvent(env.DB, id, actor, "passed", d.status);
  await tell(env, api, d, { text: (l) => T(env, l, d.status === "test" ? "passed_test" : "passed_inspection"), sms: ["passed", (l) => ({ stage: stageName(env, l, d.status) })] });
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

export async function activate(env, api, id, actor, how = "", { force = false, reason = "" } = {}) {
  const before = await db.getDriver(env.DB, id);
  if (!before) return stale;
  const info = await docInfo(env, before);
  if (info.missingRequired.length && ["pending", "test", "inspection", "orientation"].includes(before.status)) {
    return { ok: false, code: "missing_required", error: `ግዴታ ሰነድ ይጎድላል፦ ${docLabels("am", info.missingRequired)}` };
  }
  if (info.missingLater.length && !force) {
    return { ok: false, code: "missing_docs", missing: info.missingLater, error: `ሰነድ ይጎድላል፦ ${docLabels("am", info.missingLater)}። ሳይሟላ ለስራ ዝግጁ ማድረግ የሚቻለው በዳሽቦርድ በልዩ ሁኔታ (ምክንያት በመጻፍ) ብቻ ነው።` };
  }
  if (force && info.missingLater.length) {
    reason = String(reason ?? "").trim().slice(0, 300);
    if (reason.length < 3) return { ok: false, code: "reason", error: "በልዩ ሁኔታ ለማድረግ ምክንያት ይጻፉ።" };
  }
  if (!(await db.transition(env.DB, id, "active", { from: ["pending", "test", "inspection", "orientation"], by: actor, appt: null }))) return stale;
  let d = await db.getDriver(env.DB, id);
  // የሴልስ ኮሚሽን — የካምፔኑ መጠን፣ ከሌለ የመነሻው። ለስራ ዝግጁ በሆነበት ቀን ያለው መጠን ይመዘገባል።
  if (d.agent_id && d.commission_amount == null) {
    const camp = d.campaign_id ? await db.campaignById(env.DB, d.campaign_id) : null;
    const amount = camp?.commission ?? C.AGENT_COMMISSION;
    await db.setDriverFields(env.DB, id, { commission_amount: amount });
    d = await db.getDriver(env.DB, id);
  }
  await db.logEvent(env.DB, id, actor, "activated", how || (before.status === "pending" ? "በቀጥታ" : before.status));
  if (force && info.missingLater.length) await db.logEvent(env.DB, id, actor, "activated_override", `${docLabels("am", info.missingLater)} — ${reason}`);
  const lang = langOf(d);
  const code = driverCode(d);
  const firstApp = appButtons(env, d, lang)?.inline_keyboard.flat().find((b) => b.url)?.url;
  await tell(env, api, d, {
    text: (l) => T(env, l, "activated", { name: esc(d.full_name.split(" ")[0]), code }),
    extra: { reply_markup: appButtons(env, d, lang) },
    sms: ["activated", () => ({ code, link: firstApp ? ` ${firstApp}` : "" })],
  });
  const reward = C.cfg(env, "REFERRAL_REWARD");
  if (!db.isNoTg(id)) {
    const link = await referralLink(api, env, d);
    if (link) await send(api, id, T(env, lang, "referral_share", { link, reward: reward ? ` (${esc(reward)})` : "" }));
  }
  if (d.agent_id && d.commission_amount) {
    const agent = await db.staffById(env.DB, d.agent_id);
    if (agent?.tg_id) await send(api, agent.tg_id, `🎉 የመዘገቡት <b>${esc(d.full_name)}</b> (${code}) ለስራ ዝግጁ ሆኗል! ኮሚሽን፦ <b>${d.commission_amount} ብር</b>`);
  }

  // የጠቆመው ሰው ሽልማት ማሳወቂያ — በሴልስ የመጣ ከሆነ አይከፈልም
  if (d.referrer_id && !d.referral_rewarded_at && !d.agent_id) {
    const ref = await db.getDriver(env.DB, d.referrer_id);
    if (ref?.status === "active") {
      const rl = langOf(ref);
      if (!db.isNoTg(ref.tg_id)) await send(api, ref.tg_id, T(env, rl, "referral_reward", { name: esc(d.full_name), reward: reward ? T(env, rl, "reward_suffix", { reward: esc(reward) }) : "" }));
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
  const rText = (l) => (C.REJECT_REASONS.includes(reason) ? T(env, l, `reasons.${reason}`) : reason);
  await tell(env, api, d, { text: () => n.text, extra: { reply_markup: n.kb }, sms: ["suspended", (l) => ({ reason: rText(l), support: C.cfg(env, "SUPPORT_CONTACT") || brand(env) })] });
  return { ok: true, driver: d };
}

export async function unsuspend(env, api, id, actor) {
  if (!(await db.transition(env.DB, id, "active", { from: "suspended", by: actor }))) return stale;
  await db.clearFix(env.DB, id);
  await db.logEvent(env.DB, id, actor, "unsuspended");
  const d = await db.getDriver(env.DB, id);
  await tell(env, api, d, { text: (l) => T(env, l, "unsuspended"), extra: { reply_markup: appButtons(env, d, langOf(d)) }, sms: ["unsuspended"] });
  return { ok: true, driver: d };
}

/** የታገደው አሽከርካሪ የተጠየቀውን ሰነድ እንዲልክ */
export async function askFixDoc(api, env, id) {
  const d = await db.getDriver(env.DB, id);
  if (d?.status !== "suspended" || !d.fix_docs || db.isNoTg(id)) return null;
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
  await tell(env, api, d, { text: (l) => T(env, l, "fix_submitted") });
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
  await tell(env, api, d, { text: (l) => `${T(env, l, "fix_rejected")}\n\n${n.text}`, extra: { reply_markup: n.kb } });
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
  if (!r.meta.changes) return { ok: false, error: "ቀድሞ ተከፍሏል ወይም ለስራ ዝግጁ አይደለም።" };
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
