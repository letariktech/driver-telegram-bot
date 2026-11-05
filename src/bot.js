// የCabby አሽከርካሪዎች ምዝገባ ቦት — የTelegram መልዕክቶች እና አዝራሮች
// ሁኔታዎች፦ awaiting_docs → pending → (test | inspection) → orientation → active

import { Bot, InlineKeyboard, InputFile } from "grammy";
import * as C from "./constants.js";
import * as db from "./db.js";
import * as A from "./actions.js";
import { t, opt, STRINGS } from "./i18n.js";
import { signToken } from "./auth.js";
import { sendSms, limitWarning } from "./sms.js";
import { pickLang } from "./i18n.js";

const { esc, HTML, brand, driverCode, langOf, isAdmin, adminIds, adminChat, formButton } = A;

let cached = null;
export function getBot(env) {
  if (cached && cached.token === env.BOT_TOKEN) return cached.bot;
  const bot = new Bot(env.BOT_TOKEN, env.TELEGRAM_API_ROOT ? { client: { apiRoot: env.TELEGRAM_API_ROOT } } : {});
  register(bot, env);
  cached = { token: env.BOT_TOKEN, bot };
  return bot;
}

const sha = async (v) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const reasonText = (env, lang, r) => (C.REJECT_REASONS.includes(r) ? t(lang, `reasons.${r}`, { brand: brand(env) }) : r);

export async function loginLink(env, user) {
  const token = await signToken({ id: user.id, name: user.username ? `@${user.username}` : user.first_name }, env.WEBHOOK_SECRET, 15 * 60);
  return `${A.dashboardUrl(env)}/login?t=${encodeURIComponent(token)}`;
}

function register(bot, env) {
  const DB = env.DB;
  const admin = bot.filter((ctx) => isAdmin(env, ctx.from?.id));
  const priv = bot.chatType("private");
  const actor = (ctx) => (ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name);
  const T = (lang, key, vars = {}) => t(lang, key, { brand: brand(env), ...vars });

  async function userLang(ctx) {
    const d = await db.getDriver(DB, ctx.from.id);
    if (d?.lang) return d.lang;
    return (await db.getPrefs(DB, ctx.from.id))?.lang ?? null;
  }

  async function findDriver(q) {
    q = String(q ?? "").trim();
    const code = q.match(/^CB(\d+)$/i);
    if (code) return db.findByCode(DB, Number(code[1]));
    const phone = C.normalizePhone(q);
    if (phone) return db.findByPhone(DB, phone);
    if (/^\d{5,}$/.test(q)) return db.getDriver(DB, Number(q));
    return null;
  }

  async function refreshCard(ctx, id, note = "") {
    const d = await db.getDriver(DB, id);
    if (d) await ctx.editMessageText(A.reviewCard(d, note), { ...HTML, reply_markup: A.cardKeyboard(d) }).catch(() => {});
  }

  /** የጋራ ድርጊት ውጤትን በካርዱ ላይ ማሳየት */
  async function done(ctx, id, res, okText, note) {
    if (!res.ok) {
      await ctx.answerCallbackQuery({ text: String(res.error).slice(0, 195), show_alert: true });
      return refreshCard(ctx, id);
    }
    await ctx.answerCallbackQuery({ text: okText });
    await refreshCard(ctx, id, note ? `${note} — በ ${esc(actor(ctx))}` : "");
    if (res.warning) await ctx.reply(`⚠️ ${esc(res.warning)}`, HTML);
  }

  async function askSchedule(ctx, d) {
    const stage = { test: "የቃል እና የተግባር ፈተና", inspection: "የመኪና ፍተሻ", orientation: "ስልጠና" }[d.status];
    await ctx.api.sendMessage(
      ctx.chat.id,
      `📅 <b>${stage}</b> — ${esc(d.full_name)} (#A${d.tg_id})\n\nለዚህ መልዕክት <b>Reply</b> በማድረግ ቀን፣ ሰዓት እና ቦታ ይጻፉ።\nለምሳሌ፦ <i>ሐሙስ ኅዳር 4፣ ጠዋት 3:00 — ቦሌ፣ ከCabby ቢሮ ፊት ለፊት</i>\n\n💡 በዳሽቦርዱ ላይ ቀን እና ሰዓት መምረጥም ይቻላል — /dashboard`,
      { ...HTML, reply_markup: { force_reply: true, selective: true, input_field_placeholder: "ቀን፣ ሰዓት፣ ቦታ" } }
    );
  }

  // ===== የአስተዳዳሪ ትዕዛዞች =====

  const ADMIN_HELP =
    "🛠 <b>የአስተዳዳሪ ትዕዛዞች</b>\n\n" +
    "/dashboard — 📊 የአስተዳዳሪ ዳሽቦርድ\n/pending — ሰነዳቸው የሚገመገም\n/tests — ፈተና፣ ፍተሻ እና ስልጠና\n/stats — አጠቃላይ ቁጥሮች\n" +
    "/driver &lt;ስልክ፣ CB ኮድ ወይም ID&gt;\n/suspend &lt;ስልክ ወይም CB ኮድ&gt; &lt;ምክንያት&gt;\n/export — CSV (Excel)";

  admin.command(["admin", "help_admin"], (ctx) => ctx.reply(ADMIN_HELP, HTML));

  admin.command("dashboard", async (ctx) => {
    const link = await loginLink(env, ctx.from);
    const kb = new InlineKeyboard().url("🖥 በብሮውዘር ክፈት", link);
    if (ctx.chat.type === "private") kb.row().webApp("📱 እዚሁ በTelegram ክፈት", A.dashboardUrl(env));
    await ctx.reply("📊 <b>የአስተዳዳሪ ዳሽቦርድ</b>\n\nየብሮውዘር ሊንኩ ለ15 ደቂቃ ብቻ ይሰራል፣ ለሌላ ሰው አያጋሩት። ከገቡ በኋላ ለ7 ቀን አይጠይቅዎትም።", { ...HTML, reply_markup: kb });
  });

  admin.command("stats", async (ctx) => {
    const s = await db.stats(DB);
    const n = (k) => s.byStatus[k] ?? 0;
    const total = Object.values(s.byStatus).reduce((a, b) => a + b, 0);
    await ctx.reply(
      `📊 <b>የ${esc(brand(env))} አሽከርካሪዎች</b>\n\nጠቅላላ፦ <b>${total}</b> · ዛሬ፦ ${s.today} · በዚህ ሳምንት ለስራ ዝግጁ፦ ${s.activatedWeek} · ⚡ ${s.green}\n\n` +
        C.STATUSES.map((k) => `${t("am", `status.${k}`)}፦ <b>${n(k)}</b>`).join("\n"),
      HTML
    );
  });

  async function listCmd(ctx, statuses, empty, title) {
    const rows = await db.listByStatus(DB, statuses, 25);
    if (!rows.length) return ctx.reply(empty);
    const kb = new InlineKeyboard();
    rows.forEach((d) => kb.text(`${C.isGreen(d) ? "⚡ " : ""}${d.full_name} · ${t("am", `status.${d.status}`).replace(/^\S+\s/, "")}`.slice(0, 60), `view:${d.tg_id}`).row());
    await ctx.reply(`${title} <b>(${rows.length})</b>\nለማየት ይጫኑ፦`, { ...HTML, reply_markup: kb });
  }
  admin.command("pending", (ctx) => listCmd(ctx, "pending", "✨ የሚገመገም ማመልከቻ የለም።", "⏳ ሰነዳቸው የሚገመገም"));
  admin.command("tests", (ctx) => listCmd(ctx, C.APPOINTMENT_STAGES, "✨ ፈተና፣ ፍተሻ ወይም ስልጠና የሚጠብቅ የለም።", "📅 ፈተና · ፍተሻ · ስልጠና"));

  admin.command(["driver", "find"], async (ctx) => {
    if (!ctx.match.trim()) return ctx.reply("አጠቃቀም፦ /driver 0911234567 ወይም /driver CB1001");
    const d = await findDriver(ctx.match);
    if (!d) return ctx.reply("❔ አሽከርካሪው አልተገኘም።");
    await A.sendReview(ctx.api, ctx.chat.id, d, await db.getDocs(DB, d.tg_id));
  });

  admin.command("suspend", async (ctx) => {
    const [q, ...rest] = ctx.match.trim().split(/\s+/);
    const d = q && (await findDriver(q));
    if (!d) return ctx.reply("አጠቃቀም፦ /suspend 0911234567 ምክንያት\n💡 ሰነድ ለመጠየቅ ዳሽቦርዱን ይጠቀሙ — /dashboard");
    const res = await A.suspend(env, ctx.api, d.tg_id, actor(ctx), "other", { note: rest.join(" ") });
    await ctx.reply(res.ok ? `⛔ ${esc(d.full_name)} ታግዷል።` : `ማገድ የሚቻለው ለስራ ዝግጁ አሽከርካሪን ብቻ ነው (አሁን፦ ${t("am", `status.${d.status}`)})።`, HTML);
  });

  admin.command("export", async (ctx) => {
    const { toCsv } = await import("./admin.js");
    const csv = await toCsv(env);
    if (!csv) return ctx.reply("እስካሁን የተመዘገበ አሽከርካሪ የለም።");
    await ctx.replyWithDocument(new InputFile(new TextEncoder().encode(csv.text), csv.name), { caption: `📄 ${csv.count} አሽከርካሪዎች` });
  });

  admin.callbackQuery(/^view:(\d+)$/, async (ctx) => {
    const d = await db.getDriver(DB, Number(ctx.match[1]));
    await ctx.answerCallbackQuery();
    if (d) await A.sendReview(ctx.api, ctx.chat.id, d, await db.getDocs(DB, d.tg_id));
  });

  // ===== የካርድ ድርጊቶች =====

  admin.callbackQuery(/^ok:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const res = await A.approveDocs(env, ctx.api, id, actor(ctx));
    await done(ctx, id, res, "✅ ሰነዶቹ ጸድቀዋል", "🟢 ሰነዶቹ ጸድቀዋል");
    if (res.ok) await askSchedule(ctx, res.driver);
  });

  admin.callbackQuery(/^ts:(\d+)$/, async (ctx) => {
    const d = await db.getDriver(DB, Number(ctx.match[1]));
    if (!d || !C.APPOINTMENT_STAGES.includes(d.status)) return done(ctx, Number(ctx.match[1]), { ok: false, error: "ቀጠሮ አሁን አይቻልም።" });
    await ctx.answerCallbackQuery();
    await askSchedule(ctx, d);
  });

  // ቀጠሮ — ለ "#A<id>" መልዕክት የተሰጠ reply
  admin.on("message:text", async (ctx, next) => {
    const r = ctx.message.reply_to_message;
    const m = r?.from?.id === ctx.me.id && (r.text ?? "").match(/#A(\d+)/);
    if (!m) return next();
    const id = Number(m[1]);
    const res = await A.schedule(env, ctx.api, id, actor(ctx), { text: ctx.message.text });
    if (!res.ok) return ctx.reply(res.error);
    await ctx.reply(res.warning ? `⚠️ ${esc(res.warning)}` : `📅 ቀጠሮው ለ${esc(res.driver.full_name)} ተልኳል።`, HTML);
    await ctx.api.sendMessage(ctx.chat.id, A.reviewCard(res.driver), { ...HTML, reply_markup: A.cardKeyboard(res.driver) });
  });

  admin.callbackQuery(/^pass:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const before = await db.getDriver(DB, id);
    const res = await A.pass(env, ctx.api, id, actor(ctx));
    const label = { test: "🟢 ፈተናውን አልፏል → ስልጠና", inspection: "🟢 ፍተሻውን አልፏል → ስልጠና", orientation: "🟢 ለስራ ዝግጁ ሆኗል" }[before?.status];
    await done(ctx, id, res, "✅ ተመዝግቧል", label);
    if (res.ok && res.driver.status === "orientation") await askSchedule(ctx, res.driver);
  });

  admin.callbackQuery(/^fail:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const d = await db.getDriver(DB, id);
    if (d?.status === "test") {
      await ctx.answerCallbackQuery();
      return ctx.editMessageReplyMarkup({
        reply_markup: new InlineKeyboard().text("📝 የቃል ፈተና", `rr:${id}:test_oral`).text("🚗 የተግባር ፈተና", `rr:${id}:test_practical`).row().text("↩️ ተመለስ", `back:${id}`),
      });
    }
    await done(ctx, id, await A.fail(env, ctx.api, id, actor(ctx)), "❌ ተመዝግቧል", "🔴 አላለፈም");
  });

  admin.callbackQuery(/^ext:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    await done(ctx, id, await A.extendDocs(env, ctx.api, id, actor(ctx), 7), "✅ +7 ቀን ተራዝሟል", "⏳ የሰነድ ጊዜ በ7 ቀን ተራዝሟል");
  });

  admin.callbackQuery(/^act:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    await done(ctx, id, await A.activate(env, ctx.api, id, actor(ctx), "በቀጥታ"), "✅ ለስራ ዝግጁ ሆኗል", "🟢 በቀጥታ ለስራ ዝግጁ ሆኗል");
  });

  const reasonsKb = (id, prefix, codes = C.REJECT_REASONS.filter((r) => !r.startsWith("test_") && r !== "no_show" && r !== "inspection")) => {
    const kb = new InlineKeyboard();
    codes.forEach((c) => kb.text(reasonText(env, "am", c), `${prefix}:${id}:${c}`).row());
    return kb.text("↩️ ተመለስ", `back:${id}`);
  };

  admin.callbackQuery(/^rej:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: reasonsKb(Number(ctx.match[1]), "rr") });
  });
  admin.callbackQuery(/^sus:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: reasonsKb(Number(ctx.match[1]), "ss", C.SUSPEND_REASONS) });
  });
  admin.callbackQuery(/^back:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await refreshCard(ctx, Number(ctx.match[1]));
  });

  admin.callbackQuery(/^(rr|ss):(\d+):(\w+)$/, async (ctx) => {
    const [, kind, idStr, code] = ctx.match;
    const id = Number(idStr);
    if (kind === "ss") return done(ctx, id, await A.suspend(env, ctx.api, id, actor(ctx), code), "⛔ ታግዷል", "⛔ ታግዷል");
    await done(ctx, id, await A.reject(env, ctx.api, id, actor(ctx), code), "❌ ውድቅ ተደርጓል", `🔴 ውድቅ — ${esc(reasonText(env, "am", code))}`);
  });

  admin.callbackQuery(/^fixno:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    await done(ctx, id, await A.rejectFix(env, ctx.api, id, actor(ctx)), "↩️ ለአሽከርካሪው ተነግሯል", "↩️ ማስተካከያው በቂ አልሆነም");
  });

  admin.callbackQuery(/^uns:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    await done(ctx, id, await A.unsuspend(env, ctx.api, id, actor(ctx)), "♻️ እገዳው ተነስቷል", "♻️ እገዳው ተነስቷል");
  });

  admin.callbackQuery(/^rd:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const d = await db.getDriver(DB, id);
    if (d?.status !== "pending") return done(ctx, id, { ok: false, error: "ይህ ማመልከቻ ቀድሞ ተቀይሯል።" });
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard();
    C.requiredDocs(d).forEach((x, i) => { kb.text(t("am", `docs.${x.kind}`)[0], `rdk:${id}:${x.kind}`); if (i % 2) kb.row(); });
    await ctx.editMessageReplyMarkup({ reply_markup: kb.row().text("↩️ ተመለስ", `back:${id}`) });
  });

  admin.callbackQuery(/^rdk:(\d+):(\w+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const kind = ctx.match[2];
    await done(ctx, id, await A.requestDoc(env, ctx.api, id, actor(ctx), kind), "📎 ተጠይቋል", `📎 ${esc(t("am", `docs.${kind}`)[0])} እንደገና ተጠይቋል`);
  });

  bot.callbackQuery(/^(ok|ts|pass|fail|act|uns|sus|rej|back|rr|ss|rd|rdk|view|fixno):/, (ctx) =>
    ctx.answerCallbackQuery({ text: "ይህን ለማድረግ ፈቃድ የለዎትም።", show_alert: true })
  );

  // ===== ሴልሶች (sales agents) =====

  const staffOf = (ctx) => db.staffByTg(DB, ctx.from.id);
  const agentPanel = () => new InlineKeyboard().webApp("📱 የሴልስ ገጼን ክፈት", A.agentUrl(env));

  async function staffHome(ctx, st) {
    const role = st.role === "supervisor" ? "ቡድን መሪ" : "ሴልስ";
    await ctx.reply(
      `👋 <b>${esc(st.name)}</b> (${esc(st.code)} · ${role})\n\n` +
        "📱 <b>የሴልስ ገጽ</b> — የካምፔን QR ኮድዎ፣ የመዘገቧቸው አሽከርካሪዎች እና ኮሚሽንዎ\n" +
        "➕ Telegram የሌለውን አሽከርካሪ ከገጹ ይመዝግቡ፤ ሰነዶቹን እዚሁ ቻት ፎቶ አንስተው ይልካሉ\n\n" +
        "/panel — ገጹን ክፈት · /mydrivers — የመዘገብኳቸው",
      { ...HTML, reply_markup: agentPanel() }
    );
  }

  priv.command(["panel", "qr"], async (ctx, next) => {
    const st = await staffOf(ctx);
    if (!st) return next();
    await staffHome(ctx, st);
  });

  priv.command("mydrivers", async (ctx, next) => {
    const st = await staffOf(ctx);
    if (!st) return next();
    const rows = await db.agentDrivers(DB, st.id, 30);
    if (!rows.length) return ctx.reply("እስካሁን የመዘገቡት አሽከርካሪ የለም።", { reply_markup: agentPanel() });
    const kb = new InlineKeyboard();
    const lines = rows.slice(0, 30).map((d) => {
      const noTg = db.isNoTg(d.tg_id);
      if (noTg && d.status === "awaiting_docs") kb.text(`📎 ${d.full_name} — ሰነድ ቀጥል`.slice(0, 60), `agdoc:${d.tg_id}`).row();
      return `${noTg ? "📵" : "📱"} <b>${esc(d.full_name)}</b> · ${esc(d.phone)} — ${t("am", `status.${d.status}`)}`;
    });
    await ctx.reply(`👥 <b>የመዘገቧቸው (${rows.length})</b>\n\n${lines.join("\n")}`, { ...HTML, reply_markup: kb.inline_keyboard.length ? kb : agentPanel() });
  });

  priv.callbackQuery(/^agdoc:(-?\d+)$/, async (ctx) => {
    const st = await staffOf(ctx);
    const id = Number(ctx.match[1]);
    const d = st && (await db.getDriver(DB, id));
    if (!d || d.agent_id !== st.id) return ctx.answerCallbackQuery({ text: "ይህ አሽከርካሪ የእርስዎ አይደለም።", show_alert: true });
    await ctx.answerCallbackQuery();
    await A.askNextDocument(ctx.api, env, id);
  });

  priv.callbackQuery(/^agskip:(-?\d+):(\w+)$/, async (ctx) => {
    const st = await staffOf(ctx);
    const d = st ? await db.getDriver(DB, Number(ctx.match[1])) : null;
    if (!d || d.agent_id !== st.id || d.status !== "awaiting_docs") return ctx.answerCallbackQuery({ text: "አሁን አይቻልም።", show_alert: true });
    const res = await A.skipDoc(ctx.api, env, d.tg_id, ctx.match[2]);
    if (!res.ok) return ctx.answerCallbackQuery({ text: "ይህ ሰነድ ግዴታ ነው።", show_alert: true });
    await ctx.answerCallbackQuery({ text: "⏭ ተዘሏል" });
    await ctx.editMessageReplyMarkup().catch(() => {});
    await A.askNextDocument(ctx.api, env, d.tg_id);
  });

  // ሴልሱ ለመዘገበው (Telegram የሌለው) አሽከርካሪ ሰነድ ሲልክ
  priv.on(["message:photo", "message:document"], async (ctx, next) => {
    const st = await staffOf(ctx);
    if (!st?.collecting_for) return next();
    const d = await db.getDriver(DB, st.collecting_for);
    if (!d || d.agent_id !== st.id || d.status !== "awaiting_docs") {
      await DB.prepare("UPDATE staff SET collecting_for = NULL WHERE id = ?").bind(st.id).run();
      return next();
    }
    let fileId, fileType;
    if (ctx.message.photo) { fileId = ctx.message.photo.at(-1).file_id; fileType = "photo"; }
    else {
      const doc = ctx.message.document;
      if (!/^(image\/|application\/pdf)/.test(doc.mime_type ?? "")) return ctx.reply("⚠️ ፎቶ ወይም PDF ብቻ ይላኩ።");
      fileId = doc.file_id; fileType = /^image\//.test(doc.mime_type) ? "photo" : "document";
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const have = new Set((await db.getDocs(DB, d.tg_id)).map((x) => x.kind));
      const nextDoc = C.requiredDocs(d).find((x) => !have.has(x.kind));
      if (!nextDoc) return A.askNextDocument(ctx.api, env, d.tg_id);
      if (await db.insertDoc(DB, d.tg_id, nextDoc.kind, fileId, fileType)) {
        await ctx.reply(`✅ ${esc(d.full_name)} — ${t("am", `docs.${nextDoc.kind}`)[0]} ደርሷል።`, HTML);
        return A.askNextDocument(ctx.api, env, d.tg_id); // ሲጠናቀቅ የ"ቀርቧል" ቅጂ በtell() ለሴልሱ ይደርሳል
      }
    }
  });

  // ===== በሴልስ የተመዘገበ አሽከርካሪ Telegram ሲከፍት (ማገናኘት) =====

  async function linkTo(ctx, d, lang) {
    if (await db.getDriver(DB, ctx.from.id)) return ctx.reply(T(lang, "link_conflict"), { reply_markup: { remove_keyboard: true } });
    await db.linkTelegram(DB, d.tg_id, ctx.from.id, ctx.from.username);
    await db.setLang(DB, ctx.from.id, langOf(d));
    await db.logEvent(DB, ctx.from.id, "driver", "telegram_linked", d.phone);
    await ctx.reply(T(langOf(d), "link_done"), { ...HTML, reply_markup: { remove_keyboard: true } });
    if (d.agent_id) {
      const ag = await db.staffById(DB, d.agent_id);
      if (ag?.tg_id) await ctx.api.sendMessage(ag.tg_id, `🔗 <b>${esc(d.full_name)}</b> ምዝገባውን ከTelegram ጋር አገናኝቷል። ከአሁን በኋላ ማሳወቂያዎች በቀጥታ ይደርሱታል።`, HTML).catch(() => {});
    }
    await setUserCommands(ctx, langOf(d));
    await showStatus(ctx, langOf(d));
    if ((await db.getDriver(DB, ctx.from.id))?.status === "awaiting_docs") await A.askNextDocument(ctx.api, env, ctx.from.id);
  }

  priv.callbackQuery("link:start", async (ctx) => {
    const lang = (await userLang(ctx)) ?? pickLang(ctx.from.language_code);
    await ctx.answerCallbackQuery();
    await db.setPrefs(DB, ctx.from.id, { link_state: "await_phone" });
    await ctx.reply(T(lang, "link_ask"), { reply_markup: { keyboard: [[{ text: T(lang, "btn_share_phone"), request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
  });

  priv.on("message:contact", async (ctx, next) => {
    const lang = (await userLang(ctx)) ?? pickLang(ctx.from.language_code);
    const c = ctx.message.contact;
    const phone = C.normalizePhone(c.phone_number);
    if (!phone) return ctx.reply(T(lang, "link_not_found"), { reply_markup: { remove_keyboard: true } });
    const d = await db.findNoTgByPhone(DB, phone);
    if (!d) return ctx.reply(T(lang, "link_not_found"), { reply_markup: { remove_keyboard: true } });
    if (c.user_id === ctx.from.id) return linkTo(ctx, d, lang); // Telegram ያረጋገጠው የራሱ ቁጥር
    return startOtp(ctx, d, lang);
  });

  async function startOtp(ctx, d, lang) {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
    const res = await sendSms(env, { to: d.phone, text: t(langOf(d), "sms.otp", { brand: brand(env), code }), kind: "otp", tg_id: d.tg_id });
    if (!res.ok) return ctx.reply(T(lang, "link_no_sms"), { reply_markup: { remove_keyboard: true } });
    await db.setPrefs(DB, ctx.from.id, { link_state: "await_otp", otp_phone: d.phone, otp_hash: await sha(code + ctx.from.id), otp_expires: Date.now() + 10 * 60000, otp_tries: 0 });
    await ctx.reply(T(lang, "link_otp_sent", { phone: d.phone.replace(/^\+251(\d{2})\d{4}(\d{3})$/, "0$1****$2") }), { reply_markup: { remove_keyboard: true } });
  }

  // የስልክ ቁጥር ወይም OTP በጽሑፍ
  priv.on("message:text", async (ctx, next) => {
    const p = await db.getPrefs(DB, ctx.from.id);
    if (!p?.link_state || ctx.message.text.startsWith("/")) return next();
    const lang = (await userLang(ctx)) ?? pickLang(ctx.from.language_code);
    const txt = ctx.message.text.trim();
    if (p.link_state === "await_otp" && /^\d{4,8}$/.test(txt)) {
      if (Date.now() > p.otp_expires || p.otp_tries >= 5) {
        await db.setPrefs(DB, ctx.from.id, { link_state: "await_phone", otp_hash: null });
        return ctx.reply(T(lang, "link_otp_expired"));
      }
      if ((await sha(txt + ctx.from.id)) !== p.otp_hash) {
        await db.setPrefs(DB, ctx.from.id, { otp_tries: (p.otp_tries ?? 0) + 1 });
        return ctx.reply(T(lang, "link_otp_bad"));
      }
      const d = await db.findNoTgByPhone(DB, p.otp_phone);
      if (!d) return ctx.reply(T(lang, "link_not_found"));
      return linkTo(ctx, d, lang);
    }
    const phone = C.normalizePhone(txt);
    if (!phone) return next();
    const d = await db.findNoTgByPhone(DB, phone);
    if (!d) return ctx.reply(T(lang, "link_not_found"));
    return startOtp(ctx, d, lang);
  });

  // ===== ቋንቋ =====

  const langKeyboard = () => {
    const kb = new InlineKeyboard();
    C.LANGS.forEach((l, i) => { kb.text(STRINGS[l].lang_name, `lang:${l}`); if (i % 2) kb.row(); });
    return kb;
  };
  priv.command("language", (ctx) => ctx.reply(t("am", "choose_lang"), { reply_markup: langKeyboard() }));
  priv.callbackQuery(/^lang:(am|en|om|ti)$/, async (ctx) => {
    const lang = ctx.match[1];
    await db.setLang(DB, ctx.from.id, lang);
    await ctx.answerCallbackQuery({ text: T(lang, "lang_set") });
    await ctx.editMessageText(T(lang, "lang_set")).catch(() => {});
    await setUserCommands(ctx, lang);
    await showStatus(ctx, lang, true);
  });

  async function setUserCommands(ctx, lang) {
    // የተጠቃሚው ቋንቋ ትዕዛዞች (በግል ቻት)
    if (isAdmin(env, ctx.from.id)) return;
    await ctx.api.setMyCommands(driverCommands(lang), { scope: { type: "chat", chat_id: ctx.from.id } }).catch(() => {});
  }

  // ===== የአሽከርካሪ ፍሰት =====

  function timeline(d, lang) {
    const steps = [["tl_form", true], ["tl_docs", d.status !== "awaiting_docs"], ["tl_review", !["awaiting_docs", "pending"].includes(d.status)]];
    const extra = C.stageAfterDocs(d);
    if (extra !== "orientation") steps.push([`tl_${extra}`, ["orientation", "active", "suspended"].includes(d.status)]);
    steps.push(["tl_orientation", ["active", "suspended"].includes(d.status)], ["tl_active", d.status === "active"]);
    let cur = false;
    return steps.map(([k, ok]) => {
      if (ok) return `✅ ${T(lang, k)}`;
      if (!cur && d.status !== "rejected") return (cur = true), `⏳ <b>${T(lang, k)}</b>`;
      return `▫️ ${T(lang, k)}`;
    }).join("\n");
  }

  async function showStatus(ctx, lang, greet = false) {
    const d = await db.getDriver(DB, ctx.from.id);
    lang ||= langOf(d);
    if (!d) {
      return ctx.reply(
        `<b>${T(lang, "welcome_title")}</b>\n\n${T(lang, "welcome_body", { min_age: C.MIN_AGE, max_age: C.MAX_AGE, max_car: C.MAX_VEHICLE_AGE })}`,
        { ...HTML, reply_markup: formButton(env, lang, "btn_start").row().text(T(lang, "btn_agent_registered"), "link:start") }
      );
    }
    let text = `${T(lang, "status_title", { status: T(lang, `status.${d.status}`) })}\n\n${timeline(d, lang)}`;
    if (C.APPOINTMENT_STAGES.includes(d.status) && (d.appt_text || d.appt_at)) {
      text += `\n\n${T(lang, "status_appt", { title: T(lang, `appt_title_${d.status}`), when: esc(A.apptText(d, lang)) })}`;
    }
    if (d.status === "active") text += `\n\n${T(lang, "status_code", { code: driverCode(d) })}`;
    if (d.status === "awaiting_docs") {
      await ctx.reply(`${text}\n\n${T(lang, "status_need_docs")}`, { ...HTML, reply_markup: formButton(env, lang, "btn_edit") });
      return A.askNextDocument(ctx.api, env, ctx.from.id);
    }
    if (d.status === "rejected") return ctx.reply(`${text}\n\n${T(lang, "status_reason", { reason: esc(reasonText(env, lang, d.reject_reason)) })}`, { ...HTML, reply_markup: formButton(env, lang, "btn_reapply") });
    if (d.status === "suspended") {
      const n = A.suspendNotice(env, d);
      return ctx.reply(n.text, { ...HTML, reply_markup: n.kb });
    }
    if (d.status === "active") return ctx.reply(text, { ...HTML, reply_markup: A.appButtons(env, d, lang) });
    return ctx.reply(`${text}\n\n${T(lang, "status_wait")}`, HTML);
  }

  priv.command("start", async (ctx) => {
    const payload = ctx.match ?? "";
    // የሴልስ ግብዣ፦ staff_<token>
    const inv = payload.match(/^staff_([A-Za-z0-9_-]{8,})$/);
    if (inv) {
      const st = await db.staffByToken(DB, inv[1]);
      if (!st) return ctx.reply("⚠️ ይህ የግብዣ ሊንክ አይሰራም ወይም ቀድሞ ጥቅም ላይ ውሏል። አስተዳዳሪውን ይጠይቁ።");
      await DB.prepare("UPDATE staff SET tg_id = ?, username = ?, invite_token = NULL WHERE id = ?").bind(ctx.from.id, ctx.from.username ?? null, st.id).run();
      await db.logEvent(DB, null, st.name, "staff_linked", `${st.code} · ${st.role}`);
      await ctx.api.setMyCommands([
        { command: "panel", description: "📱 የሴልስ ገጽ (QR፣ አሽከርካሪዎች፣ ኮሚሽን)" },
        { command: "mydrivers", description: "የመዘገብኳቸው አሽከርካሪዎች" },
      ], { scope: { type: "chat", chat_id: ctx.from.id } }).catch(() => {});
      return staffHome(ctx, { ...st, tg_id: ctx.from.id });
    }
    // የሴልስ QR፦ a_<CODE>_<campaignId>
    const ag = payload.match(/^a_([A-Za-z0-9]+)_(\d+)$/);
    if (ag && !(await db.getDriver(DB, ctx.from.id))) {
      const st = await db.staffByCode(DB, ag[1]);
      if (st) await db.setPrefs(DB, ctx.from.id, { agent_code: st.code, campaign_id: Number(ag[2]) });
    }
    if (payload === "link") {
      const lang = (await userLang(ctx)) ?? pickLang(ctx.from.language_code);
      await db.setPrefs(DB, ctx.from.id, { link_state: "await_phone" });
      return ctx.reply(T(lang, "link_ask"), { reply_markup: { keyboard: [[{ text: T(lang, "btn_share_phone"), request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
    }
    const ref = payload.match(/^ref_(CB\d+)$/i);
    if (ref) await db.setRefCode(DB, ctx.from.id, ref[1].toUpperCase());
    const st = await staffOf(ctx);
    if (st && !payload) { await staffHome(ctx, st); if (!isAdmin(env, ctx.from.id)) return; }
    const lang = await userLang(ctx);
    if (!lang) return ctx.reply(t("am", "choose_lang"), { reply_markup: langKeyboard() });
    await showStatus(ctx, lang, true);
    if (isAdmin(env, ctx.from.id)) await ctx.reply(ADMIN_HELP, HTML);
  });
  priv.command("status", async (ctx) => showStatus(ctx, (await userLang(ctx)) ?? "am"));
  priv.command("register", async (ctx) => {
    const lang = (await userLang(ctx)) ?? "am";
    await ctx.reply(T(lang, "open_form"), { reply_markup: formButton(env, lang) });
  });
  priv.command("help", async (ctx) => {
    const lang = (await userLang(ctx)) ?? "am";
    const support = C.cfg(env, "SUPPORT_CONTACT") ? `\n\n${T(lang, "support", { contact: esc(C.cfg(env, "SUPPORT_CONTACT")) })}` : "";
    await ctx.reply(T(lang, "help") + support, HTML);
  });
  priv.command("referral", async (ctx) => {
    const d = await db.getDriver(DB, ctx.from.id);
    const lang = langOf(d);
    if (d?.status !== "active") return ctx.reply(T(lang, "referral_not_yet"));
    const kids = await db.referredBy(DB, d.tg_id);
    const link = `https://t.me/${ctx.me.username}?start=ref_${driverCode(d)}`;
    await ctx.reply(T(lang, "referral_info", { code: driverCode(d), link, count: kids.length, active: kids.filter((k) => k.status === "active").length }), HTML);
  });

  // ቀጠሮ ማረጋገጫ
  priv.callbackQuery(/^(ac|ar):(-?\d+)$/, async (ctx) => {
    const target = Number(ctx.match[2]);
    let d = await db.getDriver(DB, target);
    if (target !== ctx.from.id) {
      const st = await staffOf(ctx);
      if (!st || !d || d.agent_id !== st.id || !db.isNoTg(target)) return ctx.answerCallbackQuery();
    }
    const lang = langOf(d);
    if (!d || !C.APPOINTMENT_STAGES.includes(d.status) || !(d.appt_text || d.appt_at)) {
      return ctx.answerCallbackQuery({ text: T(lang, "appt_invalid"), show_alert: true });
    }
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    const when = A.apptText(d, "am");
    const viaAgent = target !== ctx.from.id;
    if (ctx.match[1] === "ac") {
      await db.confirmAppt(DB, d.tg_id);
      await db.logEvent(DB, d.tg_id, viaAgent ? `${ctx.from.first_name} (ሴልስ)` : "driver", "appt_confirmed", when);
      await ctx.reply(viaAgent ? `👍 ለ${esc(d.full_name)} ቀጠሮው ተረጋግጧል።` : T(lang, "appt_confirmed", { when: esc(A.apptText(d, lang)) }), HTML);
      await A.notifyAdmins(ctx.api, env, `✅ <b>${esc(d.full_name)}</b> (${esc(d.phone)}) ቀጠሮውን አረጋግጧል፦ ${esc(when)}`);
    } else {
      await db.logEvent(DB, d.tg_id, viaAgent ? `${ctx.from.first_name} (ሴልስ)` : "driver", "appt_reschedule", when);
      await ctx.reply(viaAgent ? "🔁 ለአስተዳዳሪዎች ተነግሯል።" : T(lang, "appt_resched_ack"));
      await A.notifyAdmins(ctx.api, env, `🔁 <b>${esc(d.full_name)}</b> (${esc(d.phone)}) ሌላ ቀን ጠይቋል (የአሁኑ፦ ${esc(when)})።`, {
        reply_markup: new InlineKeyboard().text("📅 አዲስ ቀጠሮ ስጥ", `ts:${d.tg_id}`),
      });
    }
  });

  // ===== የታገደ አሽከርካሪ ማስተካከያ =====
  priv.callbackQuery(/^fx:(docs|appeal)$/, async (ctx) => {
    const d = await db.getDriver(DB, ctx.from.id);
    const lang = langOf(d);
    if (d?.status !== "suspended" || d.fix_state === "submitted") return ctx.answerCallbackQuery({ text: T(lang, d?.fix_state === "submitted" ? "fix_submitted" : "not_now"), show_alert: true });
    await ctx.answerCallbackQuery();
    if (ctx.match[1] === "docs") return A.askFixDoc(ctx.api, env, d.tg_id);
    await db.setFix(DB, d.tg_id, { fix_state: "appeal_wait" });
    await ctx.reply(T(lang, "fix_appeal_prompt"), { reply_markup: { force_reply: true } });
  });

  priv.callbackQuery(/^skip:(\w+)$/, async (ctx) => {
    const d = await db.getDriver(DB, ctx.from.id);
    const lang = langOf(d);
    if (d?.status !== "awaiting_docs") return ctx.answerCallbackQuery({ text: T(lang, "not_now") });
    const res = await A.skipDoc(ctx.api, env, d.tg_id, ctx.match[1]);
    if (!res.ok) return ctx.answerCallbackQuery({ text: T(lang, "not_now"), show_alert: true });
    await ctx.answerCallbackQuery({ text: "⏭" });
    await ctx.editMessageReplyMarkup().catch(() => {});
    await A.askNextDocument(ctx.api, env, d.tg_id);
  });

  priv.callbackQuery("redo", async (ctx) => {
    const d = await db.getDriver(DB, ctx.from.id);
    const lang = langOf(d);
    if (d?.status !== "awaiting_docs") return ctx.answerCallbackQuery({ text: T(lang, "not_now") });
    await db.clearDocs(DB, ctx.from.id);
    await ctx.answerCallbackQuery({ text: T(lang, "docs_reset") });
    await A.askNextDocument(ctx.api, env, ctx.from.id);
  });

  priv.on(["message:photo", "message:document"], async (ctx) => {
    const d = await db.getDriver(DB, ctx.from.id);
    const lang = d ? langOf(d) : (await userLang(ctx)) ?? "am";
    if (!d) return ctx.reply(T(lang, "fill_form_first"), { reply_markup: formButton(env, lang) });
    const fixing = d.status === "suspended" && d.fix_docs && d.fix_state !== "submitted";
    const late = d.status !== "awaiting_docs" && !fixing && ["pending", "test", "inspection", "orientation", "active"].includes(d.status) ? await A.docInfo(env, d) : null;
    const lateNext = late && [...late.missingLater, ...late.missingOptional][0];
    if (d.status !== "awaiting_docs" && !fixing && !lateNext) return ctx.reply(T(lang, "docs_already", { status: T(lang, `status.${d.status}`) }));

    let fileId, fileType;
    if (ctx.message.photo) {
      fileId = ctx.message.photo.at(-1).file_id;
      fileType = "photo";
    } else {
      const doc = ctx.message.document;
      if (!/^(image\/|application\/pdf)/.test(doc.mime_type ?? "")) return ctx.reply(T(lang, "doc_only_photo"));
      fileId = doc.file_id;
      fileType = /^image\//.test(doc.mime_type) && (doc.file_size ?? 0) <= 10 * 1024 * 1024 ? "photo" : "document";
    }
    if (lateNext) {
      // ማመልከቻው ከተላከ በኋላ — የጎደለውን ሰነድ ይሞላል
      if (!(await db.insertDoc(DB, d.tg_id, lateNext, fileId, fileType))) return;
      await ctx.reply(T(lang, "doc_received", { label: t(lang, `docs.${lateNext}`)[0] }));
      const info = await A.docAdded(ctx.api, env, d.tg_id, lateNext);
      const rest = info ? [...info.missingLater, ...info.missingOptional] : [];
      if (rest.length) await ctx.reply(T(lang, "doc_step", { i: 1, n: rest.length, prompt: t(lang, `docs.${rest[0]}`)[1] }), HTML);
      return;
    }
    if (fixing) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const have = new Set((await db.getDocs(DB, d.tg_id)).map((x) => x.kind));
        const next = d.fix_docs.split(",").find((k) => !have.has(k));
        if (!next) return A.askFixDoc(ctx.api, env, d.tg_id);
        if (await db.insertDoc(DB, d.tg_id, next, fileId, fileType)) {
          await ctx.reply(T(lang, "doc_received", { label: t(lang, `docs.${next}`)[0] }));
          return A.askFixDoc(ctx.api, env, d.tg_id);
        }
      }
      return;
    }
    // በአንድ ጊዜ ብዙ ፎቶ ሲላክ እያንዳንዱ ወደ ቀጣዩ ባዶ ቦታ ይገባል
    for (let attempt = 0; attempt < 4; attempt++) {
      const have = new Set((await db.getDocs(DB, d.tg_id)).map((x) => x.kind));
      const next = C.requiredDocs(d).find((x) => !have.has(x.kind));
      if (!next) return A.askNextDocument(ctx.api, env, d.tg_id);
      if (await db.insertDoc(DB, d.tg_id, next.kind, fileId, fileType)) {
        await ctx.reply(T(lang, "doc_received", { label: t(lang, `docs.${next.kind}`)[0] }));
        return A.askNextDocument(ctx.api, env, d.tg_id);
      }
    }
  });

  priv.on("message", async (ctx) => {
    const d = await db.getDriver(DB, ctx.from.id);
    const lang = d ? langOf(d) : (await userLang(ctx)) ?? "am";
    if (d?.status === "awaiting_docs") return ctx.reply(T(lang, "send_doc_hint"));
    if (d?.status === "suspended" && d.fix_state === "appeal_wait" && ctx.message.text?.trim()) {
      return A.fixSubmitted(env, ctx.api, d.tg_id, "appeal", ctx.message.text.trim());
    }
    if (d) return showStatus(ctx, lang);
    return ctx.reply(T(lang, "unknown"));
  });

  bot.catch((err) => console.error("bot error", err.error ?? err));
}

const driverCommands = (lang) =>
  ["start", "status", "register", "referral", "language", "help"].map((c) => ({ command: c, description: t(lang, `cmd_${c}`) }));

// ---------- በየቀኑ (cron) ----------

export async function runDaily(env) {
  const api = getBot(env).api;
  const DB = env.DB;
  const sent = { docs: 0, license: 0, appt: 0, sms: 0 };
  const T = (lang, key, vars = {}) => t(lang, key, { brand: brand(env), ...vars });
  const sms = async (d, kind, vars) => {
    const r = await sendSms(env, { to: d.phone, text: T(langOf(d), `sms.${kind}`, vars), kind, tg_id: d.tg_id });
    if (r.ok) sent.sms++;
    await limitWarning(env, r, (m) => A.notifyAdmins(api, env, m));
    return r;
  };
  // ሰነድ ያልጨረሱ — Telegram ለሌላቸው ሴልሱ ይታወሳል
  for (const d of await db.staleAwaitingDocs(DB, 20)) {
    if (db.isNoTg(d.tg_id)) {
      const ag = d.agent_id ? await db.staffById(DB, d.agent_id) : null;
      if (ag?.tg_id) await api.sendMessage(ag.tg_id, `⏰ <b>${esc(d.full_name)}</b> (${esc(d.phone)}) ሰነዶቹን አልጨረሰም። /mydrivers ብለው "📎 ሰነድ ላክ"ን ይጫኑ።`, HTML).then(() => sent.docs++).catch(() => {});
    } else {
      await api.sendMessage(d.tg_id, T(langOf(d), "reminder_docs", { name: esc(d.full_name?.split(" ")[0]) }), HTML).then(() => sent.docs++).catch(() => {});
    }
    await db.markReminded(DB, d.tg_id);
  }
  for (const d of await db.expiringLicenses(DB, 15)) {
    if (db.isNoTg(d.tg_id)) await sms(d, "license_expiry", { date: d.license_expiry }).then((r) => r.ok && sent.license++);
    else await api.sendMessage(d.tg_id, T(langOf(d), "reminder_license", { date: esc(d.license_expiry) }), HTML).then(() => sent.license++).catch(() => {});
    await db.markReminded(DB, d.tg_id);
  }
  // የነገ ቀጠሮ ማስታወሻ — Telegram ላላቸው በTelegram፣ ለሁሉም በSMS
  const tomorrow = new Date(Date.now() + 3 * 3600e3 + 86400e3).toISOString().slice(0, 10);
  for (const d of await db.apptsTomorrow(DB, tomorrow, 25)) {
    const l = langOf(d);
    const vars = { title: T(l, `appt_title_${d.status}`).replace(/^\S+\s/, ""), when: A.apptText(d, l) };
    if (!db.isNoTg(d.tg_id)) await api.sendMessage(d.tg_id, `⏰ ${esc(T(l, "sms.appt_reminder", vars))}`, HTML).catch(() => {});
    else {
      const ag = d.agent_id ? await db.staffById(DB, d.agent_id) : null;
      if (ag?.tg_id) await api.sendMessage(ag.tg_id, `⏰ ነገ፦ <b>${esc(d.full_name)}</b> (${esc(d.phone)}) — ${esc(vars.title)} · ${esc(vars.when)}`, HTML).catch(() => {});
    }
    await sms(d, "appt_reminder", vars);
    await DB.prepare("UPDATE drivers SET appt_reminded_at = datetime('now') WHERE tg_id = ?").bind(d.tg_id).run();
    sent.appt++;
  }
  // በኋላ የሚሟሉ ሰነዶች — ማስታወሻ በ3፣ 7 እና 12ኛ ቀን፤ ጊዜው ሲያልፍ ማመልከቻው ይቆማል
  const MARKS = [3, 7, 12];
  const overdueList = [];
  for (const d of await db.docsDue(DB, 40)) {
    const info = await A.docInfo(env, d);
    if (!info.missingLater.length) { await DB.prepare("UPDATE drivers SET docs_due_at = NULL, docs_overdue_at = NULL WHERE tg_id = ?").bind(d.tg_id).run(); continue; }
    const left = A.daysLeft(d);
    const elapsed = Math.floor((Date.now() - Date.parse((d.docs_since ?? d.submitted_at ?? d.updated_at).replace(" ", "T") + "Z")) / 86400e3);
    const lang = langOf(d);
    const list = (l) => A.docLabels(l, info.missingLater);
    if (left <= 0) {
      if (d.docs_overdue_at) continue;
      await DB.prepare("UPDATE drivers SET docs_overdue_at = datetime('now') WHERE tg_id = ?").bind(d.tg_id).run();
      await db.logEvent(DB, d.tg_id, "system", "docs_overdue", list("am"));
      overdueList.push(d);
      await A.tell(env, api, d, { text: (l) => T(l, "docs_overdue", { list: esc(list(l)) }), extra: { reply_markup: A.formButton(env, lang, "btn_docs_open") },
        sms: ["docs_reminder", (l) => ({ n: info.missingLater.length, list: list(l), days: 0 })] });
      continue;
    }
    const due = MARKS.filter((m) => elapsed >= m).length;
    if (due > (d.docs_reminders ?? 0)) {
      await DB.prepare("UPDATE drivers SET docs_reminders = ? WHERE tg_id = ?").bind(due, d.tg_id).run();
      await A.tell(env, api, d, { text: (l) => T(l, "docs_reminder", { list: esc(list(l)), days: left }), extra: { reply_markup: A.formButton(env, lang, "btn_docs_open") },
        sms: ["docs_reminder", (l) => ({ n: info.missingLater.length, list: list(l), days: left })] });
      sent.docs++;
    }
  }
  if (overdueList.length) {
    await A.notifyAdmins(api, env, `⛔ <b>የሰነድ ማሟያ ጊዜ ያለፈባቸው (${overdueList.length})</b>\n\n` +
      overdueList.map((d) => `• ${esc(d.full_name)} ${A.driverCode(d) ? `(${A.driverCode(d)})` : ""} · ${esc(d.phone)}`).join("\n") + "\n\nበዳሽቦርዱ ጊዜውን ያራዝሙ ወይም ውድቅ ያድርጉ።",
      { reply_markup: new InlineKeyboard().url("📊 ዳሽቦርድ", A.dashboardUrl(env)) });
  }
  const s = await db.stats(DB);
  const n = (k) => s.byStatus[k] ?? 0;
  if (n("pending") + n("test") + n("inspection") + n("orientation") > 0) {
    await A.notifyAdmins(api, env,
      `☀️ <b>የዛሬ ማጠቃለያ</b>\n\n⏳ ሰነድ ግምገማ፦ <b>${n("pending")}</b>\n📝 ፈተና፦ <b>${n("test")}</b> · 🔧 ፍተሻ፦ <b>${n("inspection")}</b> · 🎓 ስልጠና፦ <b>${n("orientation")}</b>\n✅ ለስራ ዝግጁ፦ ${n("active")} (በሳምንቱ +${s.activatedWeek})${sent.appt ? `\n⏰ የነገ ቀጠሮ ማስታወሻ፦ ${sent.appt}` : ""}`,
      { reply_markup: new InlineKeyboard().url("📊 ዳሽቦርድ", A.dashboardUrl(env)) });
  }
  return sent;
}

// ---------- ማዋቀሪያ (/setup) ----------

export async function setup(env, origin) {
  const bot = getBot(env);
  const url = `${origin}/webhook`;
  await bot.api.setWebhook(url, { secret_token: env.WEBHOOK_SECRET, allowed_updates: ["message", "callback_query"] });
  await bot.api.setMyCommands(driverCommands("am"));
  for (const l of ["en", "om", "ti"]) await bot.api.setMyCommands(driverCommands(l), { language_code: l }).catch(() => {});
  const adminCommands = [
    { command: "dashboard", description: "📊 የአስተዳዳሪ ዳሽቦርድ" },
    { command: "pending", description: "ሰነዳቸው የሚገመገም" },
    { command: "tests", description: "ፈተና · ፍተሻ · ስልጠና" },
    { command: "stats", description: "አጠቃላይ ቁጥሮች" },
    { command: "driver", description: "አሽከርካሪ ፈልግ" },
    { command: "suspend", description: "አሽከርካሪ አግድ" },
    { command: "export", description: "CSV አውርድ" },
  ];
  const results = { webhook: url };
  for (const chat_id of new Set([...adminIds(env), adminChat(env)].filter(Boolean))) {
    await bot.api.setMyCommands(adminCommands, { scope: { type: "chat", chat_id } }).catch((e) => (results[`commands_${chat_id}`] = String(e.description ?? e.message)));
  }
  const chat = adminChat(env);
  if (chat) {
    try {
      await bot.api.sendMessage(chat, `✅ የ${brand(env)} አሽከርካሪዎች ማመልከቻዎች ወደዚህ ቻት ይደርሳሉ። ዳሽቦርድ፦ /dashboard`);
      results.admin_chat = `ok (${chat})`;
    } catch (e) {
      results.admin_chat = `FAILED (${chat}): ${e.description ?? e.message}`;
    }
  }
  await bot.api.setChatMenuButton({ menu_button: { type: "web_app", text: "Cabby", web_app: { url: `${origin}/` } } });
  results.ok = true;
  return results;
}
