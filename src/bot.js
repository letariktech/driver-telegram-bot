// የCabby አሽከርካሪዎች ምዝገባ ቦት — ሁሉም ትዕዛዞች እና ፍሰቶች
//
// ሁኔታዎች፦ awaiting_docs → pending (ሰነድ ግምገማ) → docs_ok → test_scheduled → active
//          (ከየትኛውም ደረጃ → rejected፤ active → suspended)

import { Bot, InlineKeyboard, InputFile } from "grammy";
import { REJECT_REASONS, STATUS_LABELS, VEHICLE_MODES, DOCUMENTS, requiredDocs, normalizePhone, ageOn } from "./constants.js";
import * as db from "./db.js";

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const HTML = { parse_mode: "HTML" };
const today = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);

let requestOrigin = "";
export const setOrigin = (o) => (requestOrigin = o);
const formUrl = (env) => `${(env.PUBLIC_URL || requestOrigin).replace(/\/$/, "")}/`;
const brand = (env) => env.BRAND_NAME || "Cabby";

const adminIds = (env) => {
  const ids = String(env.ADMIN_IDS ?? "").split(",").map((s) => parseInt(s.trim(), 10)).filter(Boolean);
  const chat = parseInt(env.ADMIN_CHAT_ID, 10);
  if (!ids.length && chat > 0) ids.push(chat);
  return ids;
};
export const isAdmin = (env, id) => adminIds(env).includes(id);
const adminChat = (env) => (env.ADMIN_CHAT_ID ? parseInt(env.ADMIN_CHAT_ID, 10) : null);

const formButton = (env, text = "📝 የምዝገባ ቅጽ ክፈት") => new InlineKeyboard().webApp(text, formUrl(env));
const driverCode = (d) => (d.driver_no ? `CB${d.driver_no}` : null);
const docLabel = Object.fromEntries(DOCUMENTS.map((x) => [x.kind, x.label]));

// ---------- ማጠቃለያዎች ----------

export function summary(d, full = false) {
  const age = d.dob ? ` (${ageOn(d.dob, today())} ዓመት)` : "";
  const lines = [
    `👤 <b>ስም፦</b> ${esc(d.full_name)}${age}`,
    `📞 <b>ስልክ፦</b> ${esc(d.phone)}${d.telebirr && d.telebirr !== d.phone ? ` · Telebirr ${esc(d.telebirr)}` : " · Telebirr ተመሳሳይ"}`,
    `📍 <b>ክፍለ ከተማ፦</b> ${esc(d.sub_city)}`,
    `🪪 <b>መንጃ ፈቃድ፦</b> ${esc(d.license_no)} · ${esc(d.license_grade)} · እስከ ${esc(d.license_expiry)}`,
    `🧭 <b>ልምድ፦</b> ${esc(d.experience ?? "—")} · ቀድሞ የሰራበት፦ ${esc(d.prev_platforms ?? "—")}`,
  ];
  if (d.has_vehicle) {
    lines.push(
      `🚗 <b>መኪና፦</b> ${esc(d.vehicle_model)} (${esc(d.vehicle_type)}, ${esc(d.vehicle_year)}, ${esc(d.vehicle_color)})` +
        (d.vehicle_seats ? ` · ${esc(d.vehicle_seats)} መቀመጫ` : "") + (d.vehicle_ac == null ? "" : d.vehicle_ac ? " · AC አለው" : " · AC የለውም"),
      `🔢 <b>ሰሌዳ፦</b> ${esc(d.plate_region)} · ኮድ ${esc(d.plate_code)} · ${esc(d.plate_number)}`
    );
    if (d.vehicle_mode === "other") lines.push(`🔑 <b>የመኪናው ባለቤት፦</b> ${esc(d.owner_name)} · ${esc(d.owner_phone)}`);
  } else {
    lines.push(`🚗 <b>መኪና፦</b> ${VEHICLE_MODES.none}`);
  }
  lines.push(`🛎 <b>አገልግሎት፦</b> ${esc(d.services ?? "—")} · ${esc(d.shift ?? "—")} · ${esc(d.phone_type ?? "—")}`);
  if (full) {
    lines.push(`🗣 <b>ቋንቋ፦</b> ${esc(d.languages ?? "—")}`);
    lines.push(`🆘 <b>የአደጋ ጊዜ ተጠሪ፦</b> ${esc(d.emergency_name ?? "—")} · ${esc(d.emergency_phone ?? "")}`);
    if (d.referral) lines.push(`🤝 <b>የጠቆመው፦</b> ${esc(d.referral)}`);
  }
  return lines.join("\n");
}

function reviewCard(d, note = "") {
  const who = d.username ? `@${esc(d.username)}` : "—";
  const code = driverCode(d);
  const extra = [];
  if (d.test_at) extra.push(`📅 <b>የፈተና ቀጠሮ፦</b> ${esc(d.test_at)}${d.test_confirmed ? " ✅ አረጋግጧል" : ""}`);
  if (d.reject_reason && (d.status === "rejected" || d.status === "suspended")) extra.push(`📝 <b>ምክንያት፦</b> ${esc(d.reject_reason)}`);
  if (d.reviewed_by) extra.push(`👮 <b>የመጨረሻ ውሳኔ፦</b> ${esc(d.reviewed_by)}`);
  return (
    `🚖 <b>${esc(code ? `${code} — ` : "")}የአሽከርካሪ ማመልከቻ</b>\n\n${summary(d, true)}\n\n` +
    `🆔 <code>${d.tg_id}</code> · ${who}\n` +
    `📌 <b>ሁኔታ፦</b> ${STATUS_LABELS[d.status] ?? esc(d.status)}` +
    (extra.length ? `\n${extra.join("\n")}` : "") +
    (note ? `\n\n${note}` : "")
  );
}

function cardKeyboard(d) {
  const id = d.tg_id;
  const kb = new InlineKeyboard();
  if (d.status === "pending") {
    kb.text("✅ ሰነዶች ትክክል → ፈተና", `ok:${id}`).row()
      .text("📎 ሰነድ እንደገና ጠይቅ", `rd:${id}`).text("❌ ውድቅ", `rej:${id}`).row()
      .text("⏭ ያለ ፈተና አግብር", `act:${id}`);
  } else if (d.status === "docs_ok") {
    kb.text("📅 የፈተና ቀጠሮ ስጥ", `ts:${id}`).row().text("⏭ ያለ ፈተና አግብር", `act:${id}`).text("❌ ውድቅ", `rej:${id}`);
  } else if (d.status === "test_scheduled") {
    kb.text("✅ አለፈ — አግብር", `act:${id}`).text("❌ አላለፈም", `tf:${id}`).row().text("📅 ቀጠሮ ቀይር", `ts:${id}`);
  } else if (d.status === "active") {
    kb.text("⛔ አግድ", `sus:${id}`);
  } else if (d.status === "suspended") {
    kb.text("♻️ እገዳ አንሳ", `uns:${id}`);
  } else {
    return undefined;
  }
  return kb;
}

function reasonsKeyboard(id, prefix = "rr") {
  const kb = new InlineKeyboard();
  for (const [code, text] of Object.entries(REJECT_REASONS)) kb.text(text, `${prefix}:${id}:${code}`).row();
  return kb.text("↩️ ተመለስ", `back:${id}`);
}

/** ሰነዶቹን (በአልበም) እና የግምገማ ካርዱን ይልካል */
export async function sendReview(api, chatId, d, docs) {
  const order = (k) => DOCUMENTS.findIndex((x) => x.kind === k);
  docs = [...docs].sort((a, b) => order(a.kind) - order(b.kind));
  const photos = docs.filter((x) => x.file_type === "photo");
  const files = docs.filter((x) => x.file_type !== "photo");
  const cap = (x) => `${docLabel[x.kind] ?? x.kind} — ${d.full_name}`;

  if (photos.length >= 2) {
    await api.sendMediaGroup(chatId, photos.slice(0, 10).map((x) => ({ type: "photo", media: x.file_id, caption: cap(x) })));
  } else if (photos.length === 1) {
    await api.sendPhoto(chatId, photos[0].file_id, { caption: cap(photos[0]) });
  }
  for (const f of files) await api.sendDocument(chatId, f.file_id, { caption: cap(f) });
  await api.sendMessage(chatId, reviewCard(d), { ...HTML, reply_markup: cardKeyboard(d) });
}

async function notifyAdmins(api, env, text, extra = {}) {
  const targets = adminChat(env) ? [adminChat(env)] : adminIds(env);
  for (const t of targets) {
    try {
      await api.sendMessage(t, text, { ...HTML, ...extra });
    } catch (e) {
      console.error("admin message failed", t, e.description ?? e.message);
    }
  }
}

/** ማመልከቻውን ለአስተዳዳሪዎች ይልካል፤ ADMIN_CHAT_ID ካልሰራ በግል ለእያንዳንዱ አስተዳዳሪ */
async function deliverApplication(api, env, d, docs) {
  const chat = adminChat(env);
  let reason = "ADMIN_CHAT_ID አልተቀመጠም";
  if (chat) {
    try {
      return await sendReview(api, chat, d, docs);
    } catch (e) {
      reason = e.description ?? e.message;
      console.error("admin notify failed", chat, reason);
    }
  }
  for (const id of adminIds(env).filter((x) => x !== chat)) {
    try {
      await api.sendMessage(id, `⚠️ ማመልከቻውን ወደ ADMIN_CHAT_ID (<code>${esc(chat)}</code>) መላክ አልተቻለም፦\n<code>${esc(reason)}</code>`, HTML);
      await sendReview(api, id, d, docs);
    } catch (e) {
      console.error("fallback notify failed", id, e.description ?? e.message);
    }
  }
}

// ---------- የሰነድ አሰባሰብ ----------

export async function askNextDocument(api, env, id, intro = false) {
  const d = await db.getDriver(env.DB, id);
  if (!d || d.status !== "awaiting_docs") return;
  const have = new Set((await db.getDocs(env.DB, id)).map((x) => x.kind));
  const needed = requiredDocs(d);
  const next = needed.find((x) => !have.has(x.kind));
  if (!next) return submitForReview(api, env, d);

  const step = needed.indexOf(next) + 1;
  const head = intro
    ? `✅ <b>የቅጹን መረጃ ተቀብለናል!</b>\n\n${summary(d)}\n\nአሁን ${needed.length} ሰነዶችን <b>አንድ በአንድ</b> እዚሁ ቻት ላይ ይላኩ። ፎቶዎቹ ብሩህ እና ጽሑፉ የሚነበብ መሆን አለበት።\n\n`
    : "";
  await api.sendMessage(id, `${head}📎 <b>ሰነድ ${step}/${needed.length}፦</b> ${next.prompt}`, {
    ...HTML,
    reply_markup: new InlineKeyboard().text("🔄 ሰነዶቹን ከመጀመሪያ ጀምር", "redo"),
  });
}

async function submitForReview(api, env, d) {
  if (!(await db.transition(env.DB, d.tg_id, "pending", { from: "awaiting_docs" }))) return;
  const fresh = await db.getDriver(env.DB, d.tg_id);
  await api.sendMessage(
    d.tg_id,
    `🎉 <b>ማመልከቻዎ ሙሉ በሙሉ ቀርቧል!</b>\n\nየ${esc(brand(env))} ቡድን ሰነዶችዎን ገምግሞ ለ<b>ተግባር የማሽከርከር ፈተና</b> ቀጠሮ ያሳውቅዎታል። ሁኔታውን በማንኛውም ጊዜ በ /status ማየት ይችላሉ።`,
    HTML
  );
  await deliverApplication(api, env, fresh, await db.getDocs(env.DB, d.tg_id));
}

// ---------- የአሽከርካሪ ሁኔታ ማሳያ ----------

function timeline(d) {
  const steps = [
    ["ቅጽ ተሞልቷል", true],
    ["ሰነዶች ቀርበዋል", d.status !== "awaiting_docs"],
    ["ሰነዶች ጸድቀዋል", ["docs_ok", "test_scheduled", "active", "suspended"].includes(d.status)],
    ["የተግባር ፈተና", ["active", "suspended"].includes(d.status)],
    ["ገቢር አሽከርካሪ", d.status === "active"],
  ];
  let current = false;
  return steps.map(([label, done]) => {
    if (done) return `✅ ${label}`;
    if (!current && d.status !== "rejected") return (current = true), `⏳ <b>${label}</b>`;
    return `▫️ ${label}`;
  }).join("\n");
}

const activationKeyboard = (env) => {
  const kb = new InlineKeyboard();
  if (env.DRIVER_APP_LINK) kb.url(`📲 የ${brand(env)} Driver መተግበሪያ አውርድ`, env.DRIVER_APP_LINK).row();
  if (env.DRIVER_GROUP_LINK) kb.url("👥 የአሽከርካሪዎች ግሩፕ ተቀላቀል", env.DRIVER_GROUP_LINK);
  return kb.inline_keyboard.flat().length ? kb : undefined;
};

// ---------- ቦቱ ----------

let cached = null;

export function getBot(env) {
  if (cached && cached.token === env.BOT_TOKEN) return cached.bot;
  const bot = new Bot(env.BOT_TOKEN, env.TELEGRAM_API_ROOT ? { client: { apiRoot: env.TELEGRAM_API_ROOT } } : {});
  register(bot, env);
  cached = { token: env.BOT_TOKEN, bot };
  return bot;
}

function register(bot, env) {
  const DB = env.DB;
  const admin = bot.filter((ctx) => isAdmin(env, ctx.from?.id));
  const priv = bot.chatType("private");
  const reviewer = (ctx) => (ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name);

  async function findDriver(q) {
    q = String(q ?? "").trim();
    const code = q.match(/^CB(\d+)$/i);
    if (code) return db.findByCode(DB, Number(code[1]));
    const phone = normalizePhone(q);
    if (phone) return db.findByPhone(DB, phone);
    if (/^\d{5,}$/.test(q)) return db.getDriver(DB, Number(q));
    return null;
  }

  /** ካርዱን በአዲሱ ሁኔታ ያድሳል */
  async function refreshCard(ctx, id, note = "") {
    const d = await db.getDriver(DB, id);
    if (!d) return;
    await ctx.editMessageText(reviewCard(d, note), { ...HTML, reply_markup: cardKeyboard(d) }).catch(() => {});
  }

  /** ሁኔታው ቀድሞ ከተቀየረ ማሳወቅ */
  async function stale(ctx, id) {
    await ctx.answerCallbackQuery({ text: "ይህ ማመልከቻ ቀድሞ ተቀይሯል — ካርዱ ታድሷል።", show_alert: true });
    await refreshCard(ctx, id);
  }

  async function askTestSchedule(ctx, d) {
    await ctx.api.sendMessage(
      ctx.chat.id,
      `📅 <b>${esc(d.full_name)}</b> (#T${d.tg_id})\n\nለዚህ መልዕክት <b>Reply</b> በማድረግ የፈተናውን ቀን፣ ሰዓት እና ቦታ ይጻፉ።\nለምሳሌ፦ <i>ሐሙስ ኅዳር 4፣ 3:00 ጠዋት — ቦሌ ብራስ፣ ከCabby ቢሮ ፊት ለፊት</i>`,
      { ...HTML, reply_markup: { force_reply: true, selective: true, input_field_placeholder: "ቀን፣ ሰዓት፣ ቦታ" } }
    );
  }

  async function activate(ctx, id, note) {
    const d = await db.getDriver(DB, id);
    const code = driverCode(d);
    await ctx.api
      .sendMessage(
        id,
        `🎉 <b>እንኳን ወደ ${esc(brand(env))} ቤተሰብ በደህና መጡ፣ ${esc(d.full_name.split(" ")[0])}!</b>\n\n` +
          `ምዝገባዎ ተጠናቋል፤ አሁን ገቢር የ${esc(brand(env))} አሽከርካሪ ነዎት።\n\n🆔 <b>የአሽከርካሪ ኮድዎ፦</b> <code>${code}</code>\n` +
          `ይህን ኮድ ለድጋፍ ቡድናችን ሲደውሉ ይጠቀሙ። ሌሎች አሽከርካሪዎችን ሲጠቁሙ ኮድዎን እንዲያስገቡ ይንገሯቸው።`,
        { ...HTML, reply_markup: activationKeyboard(env) }
      )
      .catch((e) => console.error("notify driver failed", e));
    await refreshCard(ctx, id, note);
  }

  // ===== የአስተዳዳሪ ትዕዛዞች =====

  const ADMIN_HELP =
    "🛠 <b>የአስተዳዳሪ ትዕዛዞች</b>\n\n" +
    "/pending — ሰነዳቸው የሚገመገም\n" +
    "/tests — ለፈተና የሚጠብቁ እና የተቀጠሩ\n" +
    "/stats — አጠቃላይ ቁጥሮች\n" +
    "/driver &lt;ስልክ፣ CB ኮድ ወይም ID&gt; — የአሽከርካሪ መረጃ\n" +
    "/suspend &lt;ስልክ ወይም CB ኮድ&gt; &lt;ምክንያት&gt; — ማገድ\n" +
    "/export — ሁሉም አሽከርካሪዎች በCSV (Excel)";

  admin.command(["admin", "help_admin"], (ctx) => ctx.reply(ADMIN_HELP, HTML));

  admin.command("stats", async (ctx) => {
    const s = await db.stats(DB);
    const n = (k) => s.byStatus[k] ?? 0;
    const total = Object.values(s.byStatus).reduce((a, b) => a + b, 0);
    const row = (k) => `${STATUS_LABELS[k]}፦ <b>${n(k)}</b>`;
    await ctx.reply(
      `📊 <b>የ${esc(brand(env))} አሽከርካሪዎች ምዝገባ</b>\n\nጠቅላላ፦ <b>${total}</b> · ዛሬ የጀመሩ፦ ${s.today} · በዚህ ሳምንት የገቡ፦ ${s.activatedWeek}\n\n` +
        ["awaiting_docs", "pending", "docs_ok", "test_scheduled", "active", "rejected", "suspended"].map(row).join("\n"),
      HTML
    );
  });

  async function listCmd(ctx, statuses, empty, title) {
    const list = await db.listByStatus(DB, statuses, 25);
    if (!list.length) return ctx.reply(empty);
    const kb = new InlineKeyboard();
    list.forEach((d) => kb.text(`${d.full_name} · ${d.phone}${d.test_at ? ` · ${d.test_at}` : ""}`.slice(0, 60), `view:${d.tg_id}`).row());
    await ctx.reply(`${title} <b>(${list.length})</b>\nለማየት ይጫኑ፦`, { ...HTML, reply_markup: kb });
  }
  admin.command("pending", (ctx) => listCmd(ctx, "pending", "✨ የሚገመገም ማመልከቻ የለም።", "⏳ ሰነዳቸው የሚገመገም"));
  admin.command("tests", (ctx) => listCmd(ctx, ["docs_ok", "test_scheduled"], "✨ ለፈተና የሚጠብቅ አሽከርካሪ የለም።", "🚗 የተግባር ፈተና"));

  admin.command(["driver", "find"], async (ctx) => {
    if (!ctx.match.trim()) return ctx.reply("አጠቃቀም፦ /driver 0911234567 ወይም /driver CB1001");
    const d = await findDriver(ctx.match);
    if (!d) return ctx.reply("❔ አሽከርካሪው አልተገኘም።");
    await sendReview(ctx.api, ctx.chat.id, d, await db.getDocs(DB, d.tg_id));
  });

  admin.command("suspend", async (ctx) => {
    const [q, ...rest] = ctx.match.trim().split(/\s+/);
    const reason = rest.join(" ") || "የአገልግሎት ደንብ መጣስ";
    const d = q && (await findDriver(q));
    if (!d) return ctx.reply("አጠቃቀም፦ /suspend 0911234567 ምክንያት");
    if (!(await db.transition(DB, d.tg_id, "suspended", { from: "active", by: reviewer(ctx), reason }))) {
      return ctx.reply(`ማገድ የሚቻለው ገቢር አሽከርካሪን ብቻ ነው (አሁን፦ ${STATUS_LABELS[d.status]})።`);
    }
    await ctx.api.sendMessage(d.tg_id, `⛔ <b>የ${esc(brand(env))} አካውንትዎ ታግዷል።</b>\n<b>ምክንያት፦</b> ${esc(reason)}`, HTML).catch(() => {});
    await ctx.reply(`⛔ ${esc(d.full_name)} ታግዷል።`, HTML);
  });

  admin.command("export", async (ctx) => {
    const rows = await db.allDrivers(DB);
    if (!rows.length) return ctx.reply("እስካሁን የተመዘገበ አሽከርካሪ የለም።");
    const cols = ["driver_no", ...Object.keys(rows[0]).filter((c) => c !== "driver_no")];
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(c === "driver_no" && r[c] ? `CB${r[c]}` : r[c])).join(","))].join("\r\n");
    await ctx.replyWithDocument(new InputFile(new TextEncoder().encode(csv), `cabby-drivers-${today()}.csv`), {
      caption: `📄 ${rows.length} አሽከርካሪዎች`,
    });
  });

  admin.callbackQuery(/^view:(\d+)$/, async (ctx) => {
    const d = await db.getDriver(DB, Number(ctx.match[1]));
    await ctx.answerCallbackQuery();
    if (d) await sendReview(ctx.api, ctx.chat.id, d, await db.getDocs(DB, d.tg_id));
  });

  // ===== የግምገማ ውሳኔዎች =====

  // ሰነዶች ትክክል → የፈተና ቀጠሮ
  admin.callbackQuery(/^ok:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    if (!(await db.transition(DB, id, "docs_ok", { from: "pending", by: reviewer(ctx) }))) return stale(ctx, id);
    await ctx.answerCallbackQuery({ text: "✅ ሰነዶቹ ጸድቀዋል" });
    const d = await db.getDriver(DB, id);
    await refreshCard(ctx, id, `🟢 ሰነዶቹ ጸድቀዋል — በ ${esc(reviewer(ctx))}`);
    await ctx.api.sendMessage(id, "✅ <b>ሰነዶችዎ ጸድቀዋል!</b>\n\nቀጣዩ ደረጃ የ<b>ተግባር የማሽከርከር ፈተና</b> ነው። የፈተናውን ቀን፣ ሰዓት እና ቦታ በቅርቡ እዚሁ እናሳውቅዎታለን።", HTML).catch(() => {});
    await askTestSchedule(ctx, d);
  });

  admin.callbackQuery(/^ts:(\d+)$/, async (ctx) => {
    const d = await db.getDriver(DB, Number(ctx.match[1]));
    if (!d || !["docs_ok", "test_scheduled"].includes(d.status)) return stale(ctx, Number(ctx.match[1]));
    await ctx.answerCallbackQuery();
    await askTestSchedule(ctx, d);
  });

  // የፈተና ቀጠሮ (ለ "#T<id>" መልዕክት የተሰጠ reply)
  admin.on("message:text", async (ctx, next) => {
    const r = ctx.message.reply_to_message;
    const m = r?.from?.id === ctx.me.id && (r.text ?? "").match(/#T(\d+)/);
    if (!m) return next();
    const id = Number(m[1]);
    const when = ctx.message.text.trim().slice(0, 200);
    if (!(await db.transition(DB, id, "test_scheduled", { from: ["docs_ok", "test_scheduled"], by: reviewer(ctx), testAt: when }))) {
      return ctx.reply("ይህ አሽከርካሪ አሁን ለፈተና ቀጠሮ ዝግጁ አይደለም።");
    }
    const d = await db.getDriver(DB, id);
    await ctx.api
      .sendMessage(
        id,
        `🚗 <b>የተግባር የማሽከርከር ፈተና ቀጠሮ</b>\n\n📅 ${esc(when)}\n\n` +
          "ይዘው ይምጡ፦ ዋናውን መንጃ ፈቃድ እና መታወቂያ" + (d.has_vehicle ? "፣ መኪናውን እና ሊብሬውን" : "") + "።\nእባክዎ ቀጠሮውን ያረጋግጡ፦",
        { ...HTML, reply_markup: new InlineKeyboard().text("✅ እመጣለሁ", `tc:${id}`).text("🔁 ሌላ ቀን ይሻለኛል", `tr:${id}`) }
      )
      .then(() => ctx.reply(`📅 ቀጠሮው ለ${esc(d.full_name)} ተልኳል።`, HTML))
      .catch((e) => ctx.reply(`⚠️ ለአሽከርካሪው መላክ አልተቻለም፦ ${esc(e.description ?? e.message)}`, HTML));
    await ctx.api.sendMessage(ctx.chat.id, reviewCard(d), { ...HTML, reply_markup: cardKeyboard(d) });
  });

  admin.callbackQuery(/^act:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const was = (await db.getDriver(DB, id))?.status;
    if (!(await db.transition(DB, id, "active", { from: ["pending", "docs_ok", "test_scheduled", "suspended"], by: reviewer(ctx) }))) {
      return stale(ctx, id);
    }
    await ctx.answerCallbackQuery({ text: "✅ አሽከርካሪው ገቢር ሆኗል" });
    const how = was === "test_scheduled" ? "ፈተናውን አልፏል" : "ያለ ፈተና";
    await activate(ctx, id, `🟢 <b>ገቢር ሆኗል</b> (${how}) — በ ${esc(reviewer(ctx))}`);
  });

  admin.callbackQuery(/^uns:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    if (!(await db.transition(DB, id, "active", { from: "suspended", by: reviewer(ctx) }))) return stale(ctx, id);
    await ctx.answerCallbackQuery({ text: "♻️ እገዳው ተነስቷል" });
    await ctx.api.sendMessage(id, `♻️ <b>የ${esc(brand(env))} አካውንትዎ እገዳ ተነስቷል።</b> ስራ መቀጠል ይችላሉ።`, HTML).catch(() => {});
    await refreshCard(ctx, id, `♻️ እገዳው ተነስቷል — በ ${esc(reviewer(ctx))}`);
  });

  admin.callbackQuery(/^sus:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: reasonsKeyboard(Number(ctx.match[1]), "ss") });
  });

  admin.callbackQuery(/^tf:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const reason = REJECT_REASONS.test;
    if (!(await db.transition(DB, id, "rejected", { from: "test_scheduled", by: reviewer(ctx), reason }))) return stale(ctx, id);
    await ctx.answerCallbackQuery({ text: "❌ ፈተናውን አላለፈም" });
    await rejectNotice(ctx, id, reason);
  });

  admin.callbackQuery(/^rej:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: reasonsKeyboard(Number(ctx.match[1])) });
  });

  admin.callbackQuery(/^back:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await refreshCard(ctx, Number(ctx.match[1]));
  });

  async function rejectNotice(ctx, id, reason) {
    await refreshCard(ctx, id, `🔴 <b>ውድቅ ተደርጓል</b> — በ ${esc(reviewer(ctx))}`);
    await ctx.api
      .sendMessage(id, `😔 <b>ይቅርታ፣ ማመልከቻዎ በዚህ ጊዜ ተቀባይነት አላገኘም።</b>\n\n<b>ምክንያት፦</b> ${esc(reason)}\n\nችግሩን አስተካክለው እንደገና ማመልከት ይችላሉ፦`, {
        ...HTML,
        reply_markup: formButton(env, "📝 እንደገና አመልክት"),
      })
      .catch((e) => console.error("notify driver failed", e));
  }

  admin.callbackQuery(/^(rr|ss):(\d+):(\w+)$/, async (ctx) => {
    const [, kind, idStr, code] = ctx.match;
    const id = Number(idStr);
    const reason = REJECT_REASONS[code] ?? REJECT_REASONS.other;
    if (kind === "ss") {
      if (!(await db.transition(DB, id, "suspended", { from: "active", by: reviewer(ctx), reason }))) return stale(ctx, id);
      await ctx.answerCallbackQuery({ text: "⛔ ታግዷል" });
      await ctx.api.sendMessage(id, `⛔ <b>የ${esc(brand(env))} አካውንትዎ ታግዷል።</b>\n<b>ምክንያት፦</b> ${esc(reason)}`, HTML).catch(() => {});
      return refreshCard(ctx, id, `⛔ ታግዷል — በ ${esc(reviewer(ctx))}`);
    }
    if (!(await db.transition(DB, id, "rejected", { from: ["pending", "docs_ok", "test_scheduled"], by: reviewer(ctx), reason }))) {
      return stale(ctx, id);
    }
    await ctx.answerCallbackQuery({ text: "❌ ውድቅ ተደርጓል" });
    await rejectNotice(ctx, id, reason);
  });

  // አንድን ሰነድ ብቻ እንደገና መጠየቅ
  admin.callbackQuery(/^rd:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const d = await db.getDriver(DB, id);
    if (d?.status !== "pending") return stale(ctx, id);
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard();
    requiredDocs(d).forEach((x, i) => {
      kb.text(x.label, `rdk:${id}:${x.kind}`);
      if (i % 2 === 1) kb.row();
    });
    await ctx.editMessageReplyMarkup({ reply_markup: kb.row().text("↩️ ተመለስ", `back:${id}`) });
  });

  admin.callbackQuery(/^rdk:(\d+):(\w+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const kind = ctx.match[2];
    if (!(await db.transition(DB, id, "awaiting_docs", { from: "pending", by: reviewer(ctx) }))) return stale(ctx, id);
    await db.deleteDoc(DB, id, kind);
    await ctx.answerCallbackQuery({ text: `📎 ${docLabel[kind]} ተጠይቋል` });
    await refreshCard(ctx, id, `📎 <b>${esc(docLabel[kind])}</b> እንደገና ተጠይቋል — በ ${esc(reviewer(ctx))}`);
    await ctx.api.sendMessage(id, `📎 <b>የ${esc(docLabel[kind])} ፎቶዎ በግልጽ አይታይም።</b> እባክዎ በብርሃን ቦታ ሆነው እንደገና ይላኩ።`, HTML).catch(() => {});
    await askNextDocument(ctx.api, env, id);
  });

  // ቁልፎቹ በሌላ ሰው ሲጫኑ
  bot.callbackQuery(/^(ok|ts|act|uns|sus|tf|rej|back|rr|ss|rd|rdk|view):/, (ctx) =>
    ctx.answerCallbackQuery({ text: "ይህን ለማድረግ ፈቃድ የለዎትም።", show_alert: true })
  );

  // ===== የአሽከርካሪ ፍሰት =====

  async function showStatus(ctx, greet = false) {
    const d = await db.getDriver(DB, ctx.from.id);
    const name = esc(ctx.from.first_name ?? "");
    const B = esc(brand(env));
    if (!d) {
      return ctx.reply(
        `👋 <b>${greet ? `ሰላም ${name}! ` : ""}እንኳን ወደ ${B} አሽከርካሪዎች ምዝገባ በደህና መጡ።</b>\n\n` +
          `ከ${B} ጋር በመስራት በራስዎ ሰዓት ገቢ ያግኙ። 🚖\n\n<b>ምዝገባው እንዴት ነው?</b>\n` +
          "1️⃣ ቅጹን መሙላት (3 ደቂቃ ገደማ)\n2️⃣ ሰነዶችን በፎቶ መላክ\n3️⃣ የሰነድ ግምገማ\n4️⃣ የተግባር የማሽከርከር ፈተና\n5️⃣ ገቢር ሆኖ ስራ መጀመር\n\n" +
          `<b>መስፈርቶች፦</b> ዕድሜ 21+፣ የሚሰራ መንጃ ፈቃድ፣ መታወቂያ፣ ስማርት ስልክ። መኪና ካለዎት ሊብሬ፣ መድን እና ቦሎ።\n\nለመጀመር ከታች ያለውን ይጫኑ፦`,
        { ...HTML, reply_markup: formButton(env, "📝 ምዝገባ ጀምር") }
      );
    }
    let text = `📋 <b>የምዝገባዎ ሁኔታ፦</b> ${STATUS_LABELS[d.status] ?? esc(d.status)}\n\n${timeline(d)}`;
    if (d.test_at && d.status === "test_scheduled") text += `\n\n📅 <b>የፈተና ቀጠሮ፦</b> ${esc(d.test_at)}`;
    if (d.status === "active") text += `\n\n🆔 <b>የአሽከርካሪ ኮድ፦</b> <code>${driverCode(d)}</code>`;

    if (d.status === "awaiting_docs") {
      await ctx.reply(text, { ...HTML, reply_markup: formButton(env, "✏️ መረጃ አስተካክል") });
      return askNextDocument(ctx.api, env, ctx.from.id);
    }
    if (d.status === "rejected") {
      return ctx.reply(`${text}\n\n<b>ምክንያት፦</b> ${esc(d.reject_reason)}`, { ...HTML, reply_markup: formButton(env, "📝 እንደገና አመልክት") });
    }
    if (d.status === "suspended") return ctx.reply(`${text}\n\n<b>ምክንያት፦</b> ${esc(d.reject_reason)}`, HTML);
    if (d.status === "active") return ctx.reply(text, { ...HTML, reply_markup: activationKeyboard(env) });
    return ctx.reply(text, HTML);
  }

  priv.command("start", async (ctx) => {
    await showStatus(ctx, true);
    if (isAdmin(env, ctx.from.id)) await ctx.reply(ADMIN_HELP, HTML);
  });
  priv.command("status", (ctx) => showStatus(ctx));
  priv.command("register", (ctx) => ctx.reply("ቅጹን ለመክፈት ይጫኑ፦", { reply_markup: formButton(env) }));
  priv.command("help", (ctx) => {
    const support = env.SUPPORT_CONTACT ? `\n\n📞 <b>ድጋፍ፦</b> ${esc(env.SUPPORT_CONTACT)}` : "";
    return ctx.reply(
      "ℹ️ <b>እርዳታ</b>\n\n/start — ምዝገባ ጀምር\n/status — የምዝገባዬ ሁኔታ\n/register — ቅጹን ክፈት / መረጃ አስተካክል\n/help — ይህ መልዕክት" + support,
      HTML
    );
  });

  // የፈተና ቀጠሮ ማረጋገጫ
  priv.callbackQuery(/^tc:(\d+)$/, async (ctx) => {
    if (Number(ctx.match[1]) !== ctx.from.id) return ctx.answerCallbackQuery();
    const d = await db.getDriver(DB, ctx.from.id);
    if (d?.status !== "test_scheduled") return ctx.answerCallbackQuery({ text: "ይህ ቀጠሮ ከአሁን በኋላ አይሰራም።", show_alert: true });
    await db.confirmTest(DB, ctx.from.id);
    await ctx.answerCallbackQuery({ text: "✅ ተረጋግጧል" });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    await ctx.reply(`👍 እናመሰግናለን! በቀጠሮው እንጠብቅዎታለን፦\n📅 ${esc(d.test_at)}`, HTML);
    await notifyAdmins(ctx.api, env, `✅ <b>${esc(d.full_name)}</b> (${esc(d.phone)}) የፈተና ቀጠሮውን አረጋግጧል፦ ${esc(d.test_at)}`);
  });

  priv.callbackQuery(/^tr:(\d+)$/, async (ctx) => {
    if (Number(ctx.match[1]) !== ctx.from.id) return ctx.answerCallbackQuery();
    const d = await db.getDriver(DB, ctx.from.id);
    if (d?.status !== "test_scheduled") return ctx.answerCallbackQuery({ text: "ይህ ቀጠሮ ከአሁን በኋላ አይሰራም።", show_alert: true });
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    await ctx.reply("🔁 ጥያቄዎ ደርሷል። ቡድናችን አዲስ ቀጠሮ ይልክልዎታል።");
    await notifyAdmins(ctx.api, env, `🔁 <b>${esc(d.full_name)}</b> (${esc(d.phone)}) ሌላ የፈተና ቀን ጠይቋል (የአሁኑ፦ ${esc(d.test_at)})።`, {
      reply_markup: new InlineKeyboard().text("📅 አዲስ ቀጠሮ ስጥ", `ts:${d.tg_id}`),
    });
  });

  priv.callbackQuery("redo", async (ctx) => {
    const d = await db.getDriver(DB, ctx.from.id);
    if (d?.status !== "awaiting_docs") return ctx.answerCallbackQuery({ text: "ይህ አሁን አይቻልም።" });
    await db.clearDocs(DB, ctx.from.id);
    await ctx.answerCallbackQuery({ text: "ሰነዶቹ ተሰርዘዋል" });
    await askNextDocument(ctx.api, env, ctx.from.id);
  });

  // ሰነዶች (ፎቶ ወይም ፋይል)
  priv.on(["message:photo", "message:document"], async (ctx) => {
    const d = await db.getDriver(DB, ctx.from.id);
    if (!d) return ctx.reply("እባክዎ መጀመሪያ የምዝገባ ቅጹን ይሙሉ።", { reply_markup: formButton(env) });
    if (d.status !== "awaiting_docs") return ctx.reply(`ሰነዶችዎ ቀድሞ ደርሰውናል። ሁኔታ፦ ${STATUS_LABELS[d.status] ?? d.status}`);

    let fileId, fileType;
    if (ctx.message.photo) {
      fileId = ctx.message.photo.at(-1).file_id;
      fileType = "photo";
    } else {
      const doc = ctx.message.document;
      if (!/^(image\/|application\/pdf)/.test(doc.mime_type ?? "")) return ctx.reply("⚠️ እባክዎ ፎቶ ወይም PDF ፋይል ብቻ ይላኩ።");
      fileId = doc.file_id;
      fileType = /^image\//.test(doc.mime_type) ? "photo" : "document";
      if (fileType === "photo" && doc.file_size > 10 * 1024 * 1024) fileType = "document";
    }

    // በአንድ ጊዜ ብዙ ፎቶ (album) ሲላክ እያንዳንዱ ወደ ቀጣዩ ባዶ ቦታ ይገባል
    for (let attempt = 0; attempt < 3; attempt++) {
      const have = new Set((await db.getDocs(DB, d.tg_id)).map((x) => x.kind));
      const next = requiredDocs(d).find((x) => !have.has(x.kind));
      if (!next) return askNextDocument(ctx.api, env, d.tg_id);
      if (await db.insertDoc(DB, d.tg_id, next.kind, fileId, fileType)) {
        await ctx.reply(`✅ ${next.label} ደርሷል።`);
        return askNextDocument(ctx.api, env, d.tg_id);
      }
    }
  });

  priv.on("message", async (ctx) => {
    const d = await db.getDriver(DB, ctx.from.id);
    if (d?.status === "awaiting_docs") return ctx.reply("📎 እባክዎ የተጠየቀውን ሰነድ በፎቶ መልክ ይላኩ። ሁኔታውን ለማየት /status");
    if (d) return showStatus(ctx);
    return ctx.reply("ለመጀመር /start ይጫኑ፣ ለእርዳታ /help።");
  });

  bot.catch((err) => console.error("bot error", err.error ?? err));
}

// ---------- በየቀኑ የሚሰሩ ማስታወሻዎች (cron) ----------

export async function runDaily(env) {
  const api = getBot(env).api;
  const DB = env.DB;
  const sent = { docs: 0, license: 0 };
  // የWorkers ገደብ (በአንድ ሩጫ 50 ጥያቄ በነጻ plan) ውስጥ ለመቆየት
  for (const d of await db.staleAwaitingDocs(DB, 20)) {
    try {
      await api.sendMessage(d.tg_id, `👋 ሰላም ${esc(d.full_name?.split(" ")[0])}፣ የ${esc(brand(env))} ምዝገባዎ ገና አልተጠናቀቀም። የቀሩትን ሰነዶች ይላኩልን፤ ካልተቸገሩ ዛሬውኑ ያጠናቅቁ። 🚖`, HTML);
      await db.markReminded(DB, d.tg_id);
      sent.docs++;
    } catch (e) {
      await db.markReminded(DB, d.tg_id);
    }
  }
  for (const d of await db.expiringLicenses(DB, 15)) {
    try {
      await api.sendMessage(d.tg_id, `⚠️ <b>መንጃ ፈቃድዎ በ${esc(d.license_expiry)} ያበቃል።</b> ስራዎ እንዳይቋረጥ እባክዎ አስቀድመው ያድሱ፣ አዲሱን ፎቶም ለድጋፍ ቡድናችን ይላኩ።`, HTML);
      sent.license++;
    } catch {}
    await db.markReminded(DB, d.tg_id);
  }
  const s = await db.stats(DB);
  const n = (k) => s.byStatus[k] ?? 0;
  if (n("pending") + n("docs_ok") + n("test_scheduled") > 0) {
    await notifyAdmins(
      api, env,
      `☀️ <b>የዛሬ ማጠቃለያ</b>\n\n⏳ ሰነድ ግምገማ፦ <b>${n("pending")}</b> → /pending\n📅 ቀጠሮ የሚጠብቁ፦ <b>${n("docs_ok")}</b> · 🚗 የተቀጠሩ፦ <b>${n("test_scheduled")}</b> → /tests\n✅ ገቢር፦ ${n("active")} (በሳምንቱ +${s.activatedWeek})`
    );
  }
  return sent;
}

// ---------- አንድ ጊዜ የሚሠራ ማዋቀሪያ (/setup) ----------

export async function setup(env, origin) {
  const bot = getBot(env);
  const url = `${origin}/webhook`;
  await bot.api.setWebhook(url, { secret_token: env.WEBHOOK_SECRET, allowed_updates: ["message", "callback_query"] });
  await bot.api.setMyCommands([
    { command: "start", description: "ምዝገባ ጀምር" },
    { command: "status", description: "የምዝገባዬ ሁኔታ" },
    { command: "register", description: "ቅጹን ክፈት / መረጃ አስተካክል" },
    { command: "help", description: "እርዳታ" },
  ]);
  const adminCommands = [
    { command: "pending", description: "ሰነዳቸው የሚገመገም" },
    { command: "tests", description: "የተግባር ፈተና" },
    { command: "stats", description: "አጠቃላይ ቁጥሮች" },
    { command: "driver", description: "አሽከርካሪ ፈልግ" },
    { command: "suspend", description: "አሽከርካሪ አግድ" },
    { command: "export", description: "CSV አውርድ" },
    { command: "admin", description: "የአስተዳዳሪ ትዕዛዞች" },
  ];
  const results = { webhook: url };
  const chats = new Set([...adminIds(env), adminChat(env)].filter(Boolean));
  for (const chat_id of chats) {
    try {
      await bot.api.setMyCommands(adminCommands, { scope: { type: "chat", chat_id } });
    } catch (e) {
      results[`commands_${chat_id}`] = String(e.description ?? e.message);
    }
  }
  const chat = adminChat(env);
  if (chat) {
    try {
      await bot.api.sendMessage(chat, `✅ የ${brand(env)} አሽከርካሪዎች ማመልከቻዎች ወደዚህ ቻት ይደርሳሉ።`);
      results.admin_chat = `ok (${chat})`;
    } catch (e) {
      results.admin_chat = `FAILED (${chat}): ${e.description ?? e.message}`;
    }
  }
  await bot.api.setChatMenuButton({ menu_button: { type: "web_app", text: "ምዝገባ", web_app: { url: `${origin}/` } } });
  results.ok = true;
  return results;
}
