// የቦቱ ሁሉም ትዕዛዞች እና የአሽከርካሪ / የአስተዳዳሪ ፍሰቶች

import { Bot, InlineKeyboard, InputFile } from "grammy";
import { REJECT_REASONS, STATUS_LABELS, requiredDocs, normalizePhone } from "./constants.js";
import * as db from "./db.js";

export const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const HTML = { parse_mode: "HTML" };

let requestOrigin = "";
export const setOrigin = (o) => (requestOrigin = o);
const formUrl = (env) => `${(env.PUBLIC_URL || requestOrigin).replace(/\/$/, "")}/`;

const adminIds = (env) => {
  const ids = String(env.ADMIN_IDS ?? "").split(",").map((s) => parseInt(s.trim(), 10)).filter(Boolean);
  const chat = parseInt(env.ADMIN_CHAT_ID, 10);
  if (!ids.length && chat > 0) ids.push(chat); // የግል ቻት ከሆነ እሱ ራሱ አስተዳዳሪ ነው
  return ids;
};
export const isAdmin = (env, id) => adminIds(env).includes(id);
const adminChat = (env) => (env.ADMIN_CHAT_ID ? parseInt(env.ADMIN_CHAT_ID, 10) : null);

const formButton = (env, text = "📝 የምዝገባ ቅጽ ክፈት") => new InlineKeyboard().webApp(text, formUrl(env));

// ---------- የአሽከርካሪ መረጃ ማጠቃለያ ----------

export function summary(d) {
  const lines = [
    `👤 <b>ስም፦</b> ${esc(d.full_name)}`,
    `📞 <b>ስልክ፦</b> ${esc(d.phone)}`,
    `📍 <b>ክፍለ ከተማ፦</b> ${esc(d.sub_city)}`,
    `🪪 <b>መንጃ ፈቃድ፦</b> ${esc(d.license_no)} · ${esc(d.license_grade)} · እስከ ${esc(d.license_expiry)}`,
  ];
  if (d.has_vehicle) {
    lines.push(
      `🚗 <b>ተሽከርካሪ፦</b> ${esc(d.vehicle_model)} (${esc(d.vehicle_type)}, ${esc(d.vehicle_year)}, ${esc(d.vehicle_color)})`,
      `🔢 <b>ሰሌዳ፦</b> ${esc(d.plate_region)} · ኮድ ${esc(d.plate_code)} · ${esc(d.plate_number)}`
    );
  } else {
    lines.push("🚗 <b>ተሽከርካሪ፦</b> የለውም (ለድርጅቱ መኪና ሹፌር)");
  }
  return lines.join("\n");
}

function reviewCard(d, decision = "") {
  const who = d.username ? `@${esc(d.username)}` : "—";
  return (
    `🚨 <b>አዲስ የአሽከርካሪ ማመልከቻ</b>\n\n${summary(d)}\n\n` +
    `🆔 <b>Telegram፦</b> <code>${d.tg_id}</code> · ${who}\n` +
    `🕒 <b>የቀረበው፦</b> ${esc(d.submitted_at ?? d.updated_at)} UTC\n` +
    `📌 <b>ሁኔታ፦</b> ${STATUS_LABELS[d.status] ?? esc(d.status)}` +
    (decision ? `\n\n${decision}` : "")
  );
}

const reviewKeyboard = (id) =>
  new InlineKeyboard().text("✅ አጽድቅ", `apr:${id}`).text("❌ ውድቅ አድርግ", `rej:${id}`);

function reasonsKeyboard(id) {
  const kb = new InlineKeyboard();
  for (const [code, text] of Object.entries(REJECT_REASONS)) kb.text(text, `rr:${id}:${code}`).row();
  return kb.text("↩️ ተመለስ", `back:${id}`);
}

/** ሰነዶቹን እና የግምገማ ካርዱን ወደ chatId ይልካል */
export async function sendReview(api, chatId, d, docs, withButtons = true) {
  const all = requiredDocs({ has_vehicle: 1 });
  const labels = Object.fromEntries(all.map((x) => [x.kind, x.label]));
  const order = (k) => all.findIndex((x) => x.kind === k);
  docs = [...docs].sort((a, b) => order(a.kind) - order(b.kind));
  const photos = docs.filter((x) => x.file_type === "photo");
  const files = docs.filter((x) => x.file_type !== "photo");
  const cap = (x) => `${labels[x.kind] ?? x.kind} — ${d.full_name}`;

  if (photos.length >= 2) {
    await api.sendMediaGroup(chatId, photos.map((x) => ({ type: "photo", media: x.file_id, caption: cap(x) })));
  } else if (photos.length === 1) {
    await api.sendPhoto(chatId, photos[0].file_id, { caption: cap(photos[0]) });
  }
  for (const f of files) await api.sendDocument(chatId, f.file_id, { caption: cap(f) });

  await api.sendMessage(chatId, reviewCard(d), {
    ...HTML,
    ...(withButtons && d.status === "pending" ? { reply_markup: reviewKeyboard(d.tg_id) } : {}),
  });
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
    ? `✅ <b>የቅጹ መረጃ ተቀብለናል!</b>\n\n${summary(d)}\n\nአሁን ${needed.length} ሰነዶችን አንድ በአንድ እዚሁ ቻት ላይ ይላኩ።\n\n`
    : "";
  await api.sendMessage(id, `${head}📎 <b>ሰነድ ${step}/${needed.length}፦</b> ${next.prompt}`, {
    ...HTML,
    reply_markup: new InlineKeyboard().text("🔄 ሰነዶቹን ከመጀመሪያ ጀምር", "redo"),
  });
}

async function submitForReview(api, env, d) {
  await db.setStatus(env.DB, d.tg_id, "pending");
  const fresh = await db.getDriver(env.DB, d.tg_id);
  await api.sendMessage(
    d.tg_id,
    "🎉 <b>ማመልከቻዎ ሙሉ በሙሉ ቀርቧል!</b>\n\nቡድናችን መረጃዎን ገምግሞ ውሳኔውን እዚሁ ያሳውቅዎታል። ሁኔታውን በማንኛውም ጊዜ በ /status ማየት ይችላሉ።",
    HTML
  );
  const chat = adminChat(env);
  if (chat) {
    try {
      await sendReview(api, chat, fresh, await db.getDocs(env.DB, d.tg_id));
    } catch (e) {
      console.error("admin notify failed", e);
    }
  }
}

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

  // ===== የአስተዳዳሪ ትዕዛዞች =====

  const ADMIN_HELP =
    "🛠 <b>የአስተዳዳሪ ትዕዛዞች</b>\n\n" +
    "/pending — በግምገማ ላይ ያሉ ማመልከቻዎች\n" +
    "/stats — አጠቃላይ ቁጥሮች\n" +
    "/driver &lt;ስልክ ወይም ID&gt; — የአንድ አሽከርካሪ መረጃ\n" +
    "/export — ሁሉንም አሽከርካሪዎች በCSV (Excel)\n" +
    "/admin — ይህን ዝርዝር ማሳያ";

  admin.command(["admin", "help_admin"], (ctx) => ctx.reply(ADMIN_HELP, HTML));

  admin.command("stats", async (ctx) => {
    const s = await db.stats(DB);
    const n = (k) => s.byStatus[k] ?? 0;
    const total = Object.values(s.byStatus).reduce((a, b) => a + b, 0);
    await ctx.reply(
      `📊 <b>የምዝገባ ሁኔታ</b>\n\n` +
        `ጠቅላላ፦ <b>${total}</b> (ዛሬ የጀመሩ፦ ${s.today})\n` +
        `${STATUS_LABELS.pending}፦ <b>${n("pending")}</b>\n` +
        `${STATUS_LABELS.approved}፦ <b>${n("approved")}</b>\n` +
        `${STATUS_LABELS.rejected}፦ <b>${n("rejected")}</b>\n` +
        `${STATUS_LABELS.awaiting_docs}፦ <b>${n("awaiting_docs")}</b>`,
      HTML
    );
  });

  admin.command("pending", async (ctx) => {
    const list = await db.listByStatus(DB, "pending", 20);
    if (!list.length) return ctx.reply("✨ በግምገማ ላይ ያለ ማመልከቻ የለም።");
    const kb = new InlineKeyboard();
    list.forEach((d) => kb.text(`${d.full_name} · ${d.phone}`, `view:${d.tg_id}`).row());
    await ctx.reply(`⏳ <b>በግምገማ ላይ ያሉ፦ ${list.length}</b>\nለማየት ይጫኑ፦`, { ...HTML, reply_markup: kb });
  });

  admin.command("driver", async (ctx) => {
    const q = ctx.match.trim();
    if (!q) return ctx.reply("አጠቃቀም፦ /driver 0911234567 ወይም /driver 123456789");
    const phone = normalizePhone(q);
    const d = phone ? await db.findByPhone(DB, phone) : /^\d+$/.test(q) ? await db.getDriver(DB, Number(q)) : null;
    if (!d) return ctx.reply("❔ አሽከርካሪው አልተገኘም።");
    await sendReview(ctx.api, ctx.chat.id, d, await db.getDocs(DB, d.tg_id));
  });

  admin.command("export", async (ctx) => {
    const rows = await db.allDrivers(DB);
    if (!rows.length) return ctx.reply("እስካሁን የተመዘገበ አሽከርካሪ የለም።");
    const cols = Object.keys(rows[0]);
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
    await ctx.replyWithDocument(new InputFile(new TextEncoder().encode(csv), `drivers-${new Date().toISOString().slice(0, 10)}.csv`), {
      caption: `📄 ${rows.length} አሽከርካሪዎች`,
    });
  });

  admin.callbackQuery(/^view:(\d+)$/, async (ctx) => {
    const d = await db.getDriver(DB, Number(ctx.match[1]));
    await ctx.answerCallbackQuery();
    if (d) await sendReview(ctx.api, ctx.chat.id, d, await db.getDocs(DB, d.tg_id));
  });

  // ===== የግምገማ ውሳኔ =====

  const reviewer = (ctx) => esc(ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name);

  async function loadPending(ctx, id) {
    const d = await db.getDriver(DB, id);
    if (!d || d.status !== "pending") {
      await ctx.answerCallbackQuery({ text: "ይህ ማመልከቻ ቀድሞ ተወስኗል።", show_alert: true });
      if (d) await ctx.editMessageText(reviewCard(d, d.reviewed_by ? `👮 በ ${esc(d.reviewed_by)}` : ""), HTML).catch(() => {});
      return null;
    }
    return d;
  }

  admin.callbackQuery(/^apr:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    if (!(await loadPending(ctx, id))) return;
    if (!(await db.decide(DB, id, "approved", { by: reviewer(ctx) }))) return loadPending(ctx, id);
    await ctx.answerCallbackQuery({ text: "✅ ጸድቋል" });
    const d = await db.getDriver(DB, id);
    await ctx.editMessageText(reviewCard(d, `🟢 <b>ጸድቋል</b> — በ ${reviewer(ctx)}`), HTML);

    const kb = env.DRIVER_GROUP_LINK ? new InlineKeyboard().url("👥 የአሽከርካሪዎች ግሩፕ ተቀላቀል", env.DRIVER_GROUP_LINK) : undefined;
    await ctx.api
      .sendMessage(id, `🎉 <b>እንኳን ደስ አለዎት፣ ${esc(d.full_name.split(" ")[0])}!</b>\n\nየአሽከርካሪነት ምዝገባዎ ጸድቋል። ቀጣይ መመሪያዎችን በቅርቡ እናደርስዎታለን።`, { ...HTML, reply_markup: kb })
      .catch((e) => console.error("notify driver failed", e));
  });

  admin.callbackQuery(/^rej:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    if (!(await loadPending(ctx, id))) return;
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: reasonsKeyboard(id) });
  });

  admin.callbackQuery(/^back:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: reviewKeyboard(Number(ctx.match[1])) });
  });

  admin.callbackQuery(/^rr:(\d+):(\w+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const reason = REJECT_REASONS[ctx.match[2]] ?? REJECT_REASONS.other;
    if (!(await loadPending(ctx, id))) return;
    if (!(await db.decide(DB, id, "rejected", { by: reviewer(ctx), reason }))) return loadPending(ctx, id);
    await ctx.answerCallbackQuery({ text: "❌ ውድቅ ተደርጓል" });
    const d = await db.getDriver(DB, id);
    await ctx.editMessageText(reviewCard(d, `🔴 <b>ውድቅ ተደርጓል</b> — ${esc(reason)}\n👮 በ ${reviewer(ctx)}`), HTML);

    await ctx.api
      .sendMessage(
        id,
        `😔 <b>ይቅርታ፣ ማመልከቻዎ ተቀባይነት አላገኘም።</b>\n\n<b>ምክንያት፦</b> ${esc(reason)}\n\nመረጃዎን አስተካክለው እንደገና ማመልከት ይችላሉ፦`,
        { ...HTML, reply_markup: formButton(env, "📝 እንደገና አመልክት") }
      )
      .catch((e) => console.error("notify driver failed", e));
  });

  // ቁልፎቹ በሌላ ሰው ሲጫኑ
  bot.callbackQuery(/^(apr|rej|rr|back|view):/, (ctx) =>
    ctx.answerCallbackQuery({ text: "ይህን ለማድረግ ፈቃድ የለዎትም።", show_alert: true })
  );

  // ===== የአሽከርካሪ ፍሰት =====

  async function showStatus(ctx, greet = false) {
    const d = await db.getDriver(DB, ctx.from.id);
    const name = esc(ctx.from.first_name ?? "");
    if (!d) {
      return ctx.reply(
        `👋 <b>${greet ? `ሰላም ${name}! ` : ""}እንኳን ወደ አሽከርካሪዎች መመዝገቢያ በደህና መጡ።</b>\n\n` +
          "ምዝገባው 3 ደረጃዎች አሉት፦\n1️⃣ ቅጹን መሙላት (2 ደቂቃ)\n2️⃣ ሰነዶችን መላክ (መንጃ ፈቃድ፣ መታወቂያ፣ ፎቶ፣ ሊብሬ)\n3️⃣ የቡድናችንን ውሳኔ መጠበቅ\n\nለመጀመር ከታች ያለውን ይጫኑ፦",
        { ...HTML, reply_markup: formButton(env, "📝 ምዝገባ ጀምር") }
      );
    }
    const base = `📋 <b>የምዝገባዎ ሁኔታ፦</b> ${STATUS_LABELS[d.status] ?? esc(d.status)}\n\n${summary(d)}`;
    if (d.status === "awaiting_docs") {
      await ctx.reply(`${base}\n\nምዝገባዎን ለማጠናቀቅ የቀሩትን ሰነዶች ይላኩ።`, { ...HTML, reply_markup: formButton(env, "✏️ መረጃ አስተካክል") });
      return askNextDocument(ctx.api, env, ctx.from.id);
    }
    if (d.status === "rejected") {
      return ctx.reply(`${base}\n\n<b>ምክንያት፦</b> ${esc(d.reject_reason)}`, { ...HTML, reply_markup: formButton(env, "📝 እንደገና አመልክት") });
    }
    if (d.status === "pending") return ctx.reply(`${base}\n\nቡድናችን እየገመገመ ነው። ውሳኔው እንደደረሰ እናሳውቅዎታለን። 🙏`, HTML);
    return ctx.reply(base, HTML);
  }

  priv.command("start", async (ctx) => {
    await showStatus(ctx, true);
    if (isAdmin(env, ctx.from.id)) await ctx.reply(ADMIN_HELP, HTML);
  });
  priv.command("status", (ctx) => showStatus(ctx));
  priv.command("register", (ctx) => ctx.reply("ቅጹን ለመክፈት ይጫኑ፦", { reply_markup: formButton(env) }));
  priv.command("help", (ctx) => {
    const support = env.SUPPORT_CONTACT ? `\n\n📞 ለእርዳታ፦ ${esc(env.SUPPORT_CONTACT)}` : "";
    return ctx.reply(
      "ℹ️ <b>እርዳታ</b>\n\n/start — ምዝገባ ጀምር\n/status — የምዝገባዬ ሁኔታ\n/register — ቅጹን ክፈት\n/help — ይህ መልዕክት" + support,
      HTML
    );
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
    if (d.status !== "awaiting_docs") {
      return ctx.reply(`ሰነዶችዎ ቀድሞ ደርሰውናል። ሁኔታ፦ ${STATUS_LABELS[d.status] ?? d.status}`);
    }

    let fileId, fileType;
    if (ctx.message.photo) {
      fileId = ctx.message.photo.at(-1).file_id;
      fileType = "photo";
    } else {
      const doc = ctx.message.document;
      if (!/^(image\/|application\/pdf)/.test(doc.mime_type ?? "")) {
        return ctx.reply("⚠️ እባክዎ ፎቶ ወይም PDF ፋይል ብቻ ይላኩ።");
      }
      fileId = doc.file_id;
      fileType = "document";
    }

    const have = new Set((await db.getDocs(DB, d.tg_id)).map((x) => x.kind));
    const next = requiredDocs(d).find((x) => !have.has(x.kind));
    if (!next) return askNextDocument(ctx.api, env, d.tg_id);

    await db.saveDoc(DB, d.tg_id, next.kind, fileId, fileType);
    await ctx.reply(`✅ ${next.label} ደርሷል።`);
    await askNextDocument(ctx.api, env, d.tg_id);
  });

  // ሌላ ማንኛውም የግል መልዕክት
  priv.on("message", async (ctx) => {
    const d = await db.getDriver(DB, ctx.from.id);
    if (d?.status === "awaiting_docs") return ctx.reply("📎 እባክዎ የተጠየቀውን ሰነድ በፎቶ መልክ ይላኩ። ሁኔታውን ለማየት /status");
    return ctx.reply("ለመጀመር /start ይጫኑ፣ ለእርዳታ /help።");
  });

  bot.catch((err) => console.error("bot error", err.error ?? err));
}

// ---------- አንድ ጊዜ የሚሠራ ማዋቀሪያ (/setup) ----------

export async function setup(env, origin) {
  const bot = getBot(env);
  const url = `${origin}/webhook`;
  await bot.api.setWebhook(url, {
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
  });
  await bot.api.setMyCommands([
    { command: "start", description: "ምዝገባ ጀምር" },
    { command: "status", description: "የምዝገባዬ ሁኔታ" },
    { command: "register", description: "የምዝገባ ቅጹን ክፈት" },
    { command: "help", description: "እርዳታ" },
  ]);
  const adminCommands = [
    { command: "pending", description: "በግምገማ ላይ ያሉ" },
    { command: "stats", description: "አጠቃላይ ቁጥሮች" },
    { command: "driver", description: "አሽከርካሪ ፈልግ" },
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
  await bot.api.setChatMenuButton({
    menu_button: { type: "web_app", text: "ምዝገባ", web_app: { url: `${origin}/` } },
  });
  results.ok = true;
  return results;
}
