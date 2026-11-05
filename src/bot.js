// የCabby አሽከርካሪዎች ምዝገባ ቦት — የTelegram መልዕክቶች እና አዝራሮች
// ሁኔታዎች፦ awaiting_docs → pending → (test | inspection) → orientation → active

import { Bot, InlineKeyboard, InputFile } from "grammy";
import * as C from "./constants.js";
import * as db from "./db.js";
import * as A from "./actions.js";
import { t, opt, STRINGS } from "./i18n.js";
import { signToken } from "./auth.js";

const { esc, HTML, brand, driverCode, langOf, isAdmin, adminIds, adminChat, formButton } = A;

let cached = null;
export function getBot(env) {
  if (cached && cached.token === env.BOT_TOKEN) return cached.bot;
  const bot = new Bot(env.BOT_TOKEN, env.TELEGRAM_API_ROOT ? { client: { apiRoot: env.TELEGRAM_API_ROOT } } : {});
  register(bot, env);
  cached = { token: env.BOT_TOKEN, bot };
  return bot;
}

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
      await ctx.answerCallbackQuery({ text: res.error, show_alert: true });
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
      `📊 <b>የ${esc(brand(env))} አሽከርካሪዎች</b>\n\nጠቅላላ፦ <b>${total}</b> · ዛሬ፦ ${s.today} · በዚህ ሳምንት ገቢር፦ ${s.activatedWeek} · ⚡ ${s.green}\n\n` +
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
    if (!d) return ctx.reply("አጠቃቀም፦ /suspend 0911234567 ምክንያት");
    const res = await A.suspend(env, ctx.api, d.tg_id, actor(ctx), rest.join(" ") || "other");
    await ctx.reply(res.ok ? `⛔ ${esc(d.full_name)} ታግዷል።` : `ማገድ የሚቻለው ገቢር አሽከርካሪን ብቻ ነው (አሁን፦ ${t("am", `status.${d.status}`)})።`, HTML);
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
    const label = { test: "🟢 ፈተናውን አልፏል → ስልጠና", inspection: "🟢 ፍተሻውን አልፏል → ስልጠና", orientation: "🟢 ገቢር ሆኗል" }[before?.status];
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

  admin.callbackQuery(/^act:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    await done(ctx, id, await A.activate(env, ctx.api, id, actor(ctx), "በቀጥታ"), "✅ ገቢር ሆኗል", "🟢 በቀጥታ ገቢር ሆኗል");
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
    await ctx.editMessageReplyMarkup({ reply_markup: reasonsKb(Number(ctx.match[1]), "ss", ["mismatch", "expired", "vehicle", "other"]) });
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

  bot.callbackQuery(/^(ok|ts|pass|fail|act|uns|sus|rej|back|rr|ss|rd|rdk|view):/, (ctx) =>
    ctx.answerCallbackQuery({ text: "ይህን ለማድረግ ፈቃድ የለዎትም።", show_alert: true })
  );

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
        { ...HTML, reply_markup: formButton(env, lang, "btn_start") }
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
    if (d.status === "suspended") return ctx.reply(`${text}\n\n${T(lang, "status_reason", { reason: esc(reasonText(env, lang, d.reject_reason)) })}`, HTML);
    if (d.status === "active") return ctx.reply(text, { ...HTML, reply_markup: A.appButtons(env, d, lang) });
    return ctx.reply(`${text}\n\n${T(lang, "status_wait")}`, HTML);
  }

  priv.command("start", async (ctx) => {
    const ref = ctx.match?.match(/^ref_(CB\d+)$/i);
    if (ref) await db.setRefCode(DB, ctx.from.id, ref[1].toUpperCase());
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
    const support = env.SUPPORT_CONTACT ? `\n\n${T(lang, "support", { contact: esc(env.SUPPORT_CONTACT) })}` : "";
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
  priv.callbackQuery(/^(ac|ar):(\d+)$/, async (ctx) => {
    if (Number(ctx.match[2]) !== ctx.from.id) return ctx.answerCallbackQuery();
    const d = await db.getDriver(DB, ctx.from.id);
    const lang = langOf(d);
    if (!d || !C.APPOINTMENT_STAGES.includes(d.status) || !(d.appt_text || d.appt_at)) {
      return ctx.answerCallbackQuery({ text: T(lang, "appt_invalid"), show_alert: true });
    }
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    const when = A.apptText(d, "am");
    if (ctx.match[1] === "ac") {
      await db.confirmAppt(DB, d.tg_id);
      await db.logEvent(DB, d.tg_id, "driver", "appt_confirmed", when);
      await ctx.reply(T(lang, "appt_confirmed", { when: esc(A.apptText(d, lang)) }), HTML);
      await A.notifyAdmins(ctx.api, env, `✅ <b>${esc(d.full_name)}</b> (${esc(d.phone)}) ቀጠሮውን አረጋግጧል፦ ${esc(when)}`);
    } else {
      await db.logEvent(DB, d.tg_id, "driver", "appt_reschedule", when);
      await ctx.reply(T(lang, "appt_resched_ack"));
      await A.notifyAdmins(ctx.api, env, `🔁 <b>${esc(d.full_name)}</b> (${esc(d.phone)}) ሌላ ቀን ጠይቋል (የአሁኑ፦ ${esc(when)})።`, {
        reply_markup: new InlineKeyboard().text("📅 አዲስ ቀጠሮ ስጥ", `ts:${d.tg_id}`),
      });
    }
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
    if (d.status !== "awaiting_docs") return ctx.reply(T(lang, "docs_already", { status: T(lang, `status.${d.status}`) }));

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
  const sent = { docs: 0, license: 0 };
  const T = (lang, key, vars = {}) => t(lang, key, { brand: brand(env), ...vars });
  for (const d of await db.staleAwaitingDocs(DB, 20)) {
    await api.sendMessage(d.tg_id, T(langOf(d), "reminder_docs", { name: esc(d.full_name?.split(" ")[0]) }), HTML).then(() => sent.docs++).catch(() => {});
    await db.markReminded(DB, d.tg_id);
  }
  for (const d of await db.expiringLicenses(DB, 15)) {
    await api.sendMessage(d.tg_id, T(langOf(d), "reminder_license", { date: esc(d.license_expiry) }), HTML).then(() => sent.license++).catch(() => {});
    await db.markReminded(DB, d.tg_id);
  }
  const s = await db.stats(DB);
  const n = (k) => s.byStatus[k] ?? 0;
  if (n("pending") + n("test") + n("inspection") + n("orientation") > 0) {
    await A.notifyAdmins(api, env,
      `☀️ <b>የዛሬ ማጠቃለያ</b>\n\n⏳ ሰነድ ግምገማ፦ <b>${n("pending")}</b>\n📝 ፈተና፦ <b>${n("test")}</b> · 🔧 ፍተሻ፦ <b>${n("inspection")}</b> · 🎓 ስልጠና፦ <b>${n("orientation")}</b>\n✅ ገቢር፦ ${n("active")} (በሳምንቱ +${s.activatedWeek})`,
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
