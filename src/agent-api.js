// የሴልሶች እና የቡድን መሪዎች ሚኒ አፕ API፦ /api/agent/*
// ሴልሶች፦ የራሳቸው QR፣ አሽከርካሪዎች፣ ኮሚሽን፣ Telegram የሌለውን መመዝገብ። ቡድን መሪ፦ + ቡድን፣ ካምፔኖች።

import qrcode from "qrcode-generator";
import * as C from "./constants.js";
import * as db from "./db.js";
import * as A from "./actions.js";
import { verifyInitData } from "./auth.js";
import { validateProfile } from "./api.js";
import { loadSettings, agreementText } from "./settings.js";
import { t } from "./i18n.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

let botUsername = null;
export async function botName(env, getBot) {
  botUsername ||= env.BOT_USERNAME || (await getBot(env).api.getMe().then((m) => m.username).catch(() => null));
  return botUsername;
}

export function qrSvg(text) {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}

const NEXT_STEP = {
  awaiting_docs: "ሰነዶቹን ማስጨረስ ያስፈልጋል",
  pending: "ቡድናችን እየገመገመ ነው",
  test: "የቃል እና የተግባር ፈተና",
  inspection: "የመኪና ፍተሻ",
  orientation: "ስልጠና",
  active: "ለስራ ዝግጁ ✓",
  rejected: "ውድቅ — ምክንያቱን አስረድተው እንደገና እንዲያመለክት ያግዙ",
  suspended: "ታግዷል",
};

const driverRow = (d) => ({
  tg_id: d.tg_id, full_name: d.full_name, phone: d.phone, status: d.status, status_label: t("am", `status.${d.status}`),
  next: NEXT_STEP[d.status] ?? "", no_tg: db.isNoTg(d.tg_id), code: A.driverCode(d), campaign_id: d.campaign_id,
  appt: A.apptText(d, "am") || null, reason: d.reject_reason ? (C.REJECT_REASONS.includes(d.reject_reason) ? t("am", `reasons.${d.reject_reason}`, { brand: A.brand({}) }) : d.reject_reason) : null,
  docs_due: !!d.docs_due_at, docs_left: A.daysLeft(d), docs_overdue: !!d.docs_overdue_at,
  commission: d.commission_amount, commission_paid: !!d.commission_paid_at, updated_at: d.updated_at, created_at: d.created_at,
});

const today = () => C.addisToday();
const campaignOpen = (c) => c.active && (!c.start_date || c.start_date <= today()) && (!c.end_date || c.end_date >= today());

async function createNoTgDriver(env) {
  for (let i = 0; i < 5; i++) {
    const id = (await db.nextNoTgId(env.DB)) - i;
    try {
      await env.DB.prepare("INSERT INTO drivers (tg_id, status) VALUES (?, 'awaiting_docs')").bind(id).run();
      return id;
    } catch {}
  }
  throw new Error("could not allocate id");
}

export async function handleAgentApi(request, env, path, getBot) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const user = await verifyInitData(body?.initData, env.BOT_TOKEN);
  if (!user) return json({ error: "ገጹን ከTelegram ቦቱ ውስጥ ይክፈቱ።" }, 401);
  const st = await db.staffByTg(env.DB, user.id);
  if (!st) return json({ error: "ይህ ገጽ ለCabby ሴልሶች ብቻ ነው። አስተዳዳሪው የላከልዎትን የግብዣ ሊንክ መጀመሪያ ይክፈቱ።" }, 403);
  const sup = st.role === "supervisor";
  const action = path.replace(/^\/api\/agent\/?/, "");
  const actor = `${st.name} (${sup ? "ቡድን መሪ" : "ሴልስ"})`;

  if (action === "me") {
    const [all, mine, bot, settings] = await Promise.all([
      db.campaignList(env.DB, { onlyActive: true, staffId: sup ? null : st.id }),
      db.agentDrivers(env.DB, st.id, 500),
      botName(env, getBot),
      loadSettings(env),
    ]);
    const camps = all.filter(campaignOpen);
    const link = (cid) => `https://t.me/${bot}?start=a_${st.code}_${cid}`;
    const stats = (rows) => ({
      started: rows.length,
      submitted: rows.filter((d) => d.status !== "awaiting_docs").length,
      activated: rows.filter((d) => ["active", "suspended"].includes(d.status)).length,
      earned: rows.reduce((a, d) => a + (d.commission_amount ?? 0), 0),
      unpaid: rows.filter((d) => d.commission_amount && !d.commission_paid_at).reduce((a, d) => a + d.commission_amount, 0),
    });
    return json({
      staff: { id: st.id, code: st.code, name: st.name, role: st.role },
      brand: A.brand(env),
      default_commission: C.AGENT_COMMISSION,
      campaigns: camps.map((c) => ({ id: c.id, name: c.name, location: c.location, start_date: c.start_date, end_date: c.end_date,
        commission: c.commission ?? C.AGENT_COMMISSION, link: link(c.id), qr: qrSvg(link(c.id)), mine: stats(mine.filter((d) => d.campaign_id === c.id)) })),
      general: { link: link(0), qr: qrSvg(link(0)) },
      stats: stats(mine),
      drivers: mine.map(driverRow),
      agreement: { version: settings.agreement.version ?? 1, text: agreementText(settings, "am") },
    });
  }

  if (action === "collect") {
    const d = await db.getDriver(env.DB, Number(body.id));
    if (!d || d.agent_id !== st.id || !db.isNoTg(d.tg_id)) return json({ error: "ይህ አሽከርካሪ የእርስዎ አይደለም።" }, 403);
    if (d.status !== "awaiting_docs") return json({ error: "ሰነዶቹ ቀድሞ ቀርበዋል።" }, 409);
    await A.askNextDocument(getBot(env).api, env, d.tg_id);
    return json({ ok: true });
  }

  if (action === "register") {
    const lang = C.LANGS.includes(body.lang) ? body.lang : "am";
    const { profile, error, vars } = validateProfile(body.profile);
    if (error) return json({ error: t("am", `f.${error}`, { brand: A.brand(env), ...vars }), code: error }, 422);
    const settings = await loadSettings(env);
    if (Number(body.agree) !== (settings.agreement.version ?? 1)) return json({ error: t("am", "f.e_agree", { brand: A.brand(env) }) }, 422);
    const owner = await db.findByPhone(env.DB, profile.phone);
    if (owner) return json({ error: `ይህ ስልክ ቁጥር ቀድሞ ተመዝግቧል (${t("am", `status.${owner.status}`)})።` }, 409);
    let campaignId = Number(body.campaign_id) || null;
    if (campaignId) {
      const ok = (await db.campaignList(env.DB, { onlyActive: true, staffId: sup ? null : st.id })).some((c) => c.id === campaignId && campaignOpen(c));
      if (!ok) campaignId = null;
    }
    const id = await createNoTgDriver(env);
    await db.saveProfile(env.DB, id, null, lang, { ...profile, referral: null, referrer_id: null });
    await db.setDriverFields(env.DB, id, { agent_id: st.id, campaign_id: campaignId });
    await db.setAgreement(env.DB, id, settings.agreement.version ?? 1);
    await db.logEvent(env.DB, id, actor, "registered", "በሴልስ — Telegram የለውም");
    if (!body.inapp) await A.askNextDocument(getBot(env).api, env, id, true);
    return json({ ok: true, id });
  }

  // ---- ቡድን መሪ ብቻ ----
  if (!sup) return json({ error: "ለቡድን መሪ ብቻ" }, 403);

  if (action === "team") {
    const [team, camps, drivers] = await Promise.all([db.staffList(env.DB), db.campaignList(env.DB), db.agentDrivers(env.DB, null, 500)]);
    return json({
      team: team.map((s) => ({ id: s.id, code: s.code, name: s.name, role: s.role, active: !!s.active, linked: !!s.tg_id, phone: s.phone,
        started: s.started, submitted: s.submitted, activated: s.activated, no_tg: s.no_tg, earned: s.earned, unpaid: s.unpaid })),
      campaigns: camps,
      drivers: drivers.map((d) => ({ ...driverRow(d), agent_id: d.agent_id })),
      default_commission: C.AGENT_COMMISSION,
    });
  }

  if (action === "campaign") {
    const v = await campaignInput(env, body.campaign);
    if (v.error) return json({ error: v.error }, 422);
    const id = await db.saveCampaign(env.DB, v.value, actor);
    await db.logEvent(env.DB, null, actor, "campaign_saved", `${v.value.name}${v.value.id ? " (ተቀይሯል)" : " (አዲስ)"}`);
    return json({ ok: true, id });
  }

  return json({ error: "not found" }, 404);
}

/** የካምፔን መረጃ ማረጋገጫ — ለዳሽቦርድም ለቡድን መሪም */
export async function campaignInput(env, c = {}) {
  const name = String(c.name ?? "").trim().slice(0, 80);
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? v : null);
  if (name.length < 2) return { error: "የካምፔኑን ስም ያስገቡ።" };
  const commission = c.commission === "" || c.commission == null ? null : parseInt(c.commission, 10);
  if (commission != null && !(commission >= 0 && commission <= 1000000)) return { error: "ኮሚሽኑ ትክክለኛ ቁጥር (ብር) መሆን አለበት።" };
  const start = date(c.start_date), end = date(c.end_date);
  if (start && end && end < start) return { error: "የማብቂያ ቀን ከመጀመሪያው በኋላ መሆን አለበት።" };
  const staffIds = new Set((await db.staffList(env.DB)).filter((s) => s.active).map((s) => s.id));
  return { value: {
    id: Number(c.id) || null, name, location: String(c.location ?? "").trim().slice(0, 120) || null,
    start_date: start, end_date: end, commission, active: c.active !== false,
    agent_ids: (c.agent_ids ?? []).map(Number).filter((x) => staffIds.has(x)),
  } };
}
