// የአስተዳዳሪ ዳሽቦርድ — መግቢያ፣ API፣ የሰነድ ማሳያ፣ CSV

import * as C from "./constants.js";
import * as db from "./db.js";
import * as A from "./actions.js";
import { STRINGS, t } from "./i18n.js";
import { signToken, verifyToken, verifyInitData } from "./auth.js";
import { loadSettings, saveSettings, DEFAULT_AGREEMENT, publicSms } from "./settings.js";
import { botName, qrSvg, campaignInput } from "./agent-api.js";
import { sendSms } from "./sms.js";

const COOKIE = "cabby_admin";
const SESSION_DAYS = 7;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

const cookieOf = (req, name) => (req.headers.get("cookie") ?? "").split(/;\s*/).map((c) => c.split("=")).find(([k]) => k === name)?.[1];

/** ኩኪ ወይም Telegram Mini App initData → { id, name } */
async function authenticate(request, env) {
  const init = request.headers.get("x-telegram-init-data");
  if (init) {
    const user = await verifyInitData(init, env.BOT_TOKEN);
    if (user && A.isAdmin(env, user.id)) return { id: user.id, name: user.username ? `@${user.username}` : user.first_name };
    return null;
  }
  const session = await verifyToken(decodeURIComponent(cookieOf(request, COOKIE) ?? ""), env.WEBHOOK_SECRET);
  if (session?.s && A.isAdmin(env, session.id)) return { id: session.id, name: session.name };
  return null;
}

export async function handleLogin(request, env) {
  const url = new URL(request.url);
  const p = await verifyToken(url.searchParams.get("t"), env.WEBHOOK_SECRET);
  if (!p || p.s || !A.isAdmin(env, p.id)) {
    return new Response(loginErrorPage(), { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const session = await signToken({ id: p.id, name: p.name, s: 1 }, env.WEBHOOK_SECRET, SESSION_DAYS * 86400);
  await db.logEvent(env.DB, null, p.name, "admin_login", "dashboard");
  return new Response(null, {
    status: 302,
    headers: {
      location: "/admin",
      "set-cookie": `${COOKIE}=${encodeURIComponent(session)}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

export const handleLogout = () =>
  new Response(null, { status: 302, headers: { location: "/admin", "set-cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });

const loginErrorPage = () => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cabby</title><body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#f4f6f9;color:#14213d">
<div style="max-width:340px;text-align:center"><div style="font-size:44px">🔒</div><h2>ሊንኩ አይሰራም</h2>
<p style="color:#5b6577">ሊንኩ ጊዜው አልፏል ወይም ቀድሞ ጥቅም ላይ ውሏል። በቦቱ ውስጥ <b>/dashboard</b> ብለው አዲስ ሊንክ ይውሰዱ።</p></div>`;

// ---------- የአሽከርካሪ መረጃ ለዳሽቦርድ ----------

function view(d) {
  if (!d) return null;
  const year = Number(C.addisToday().slice(0, 4));
  return {
    ...d,
    code: A.driverCode(d),
    age: d.dob ? C.ageOn(d.dob, C.addisToday()) : null,
    vehicle_age: C.vehicleAge(d, year),
    green: C.isGreen(d),
    next_stage: d.status === "pending" ? C.stageAfterDocs(d, year) : null,
    appt_label: A.apptText(d, "am") || null,
    waiting_days: Math.max(0, Math.floor((Date.now() - Date.parse(`${d.updated_at}Z`)) / 86400000)),
    required_docs: C.requiredDocs(d).map((x) => x.kind),
    no_tg: db.isNoTg(d.tg_id),
  };
}

const card = (d) => {
  const v = view(d);
  return {
    tg_id: v.tg_id, code: v.code, full_name: v.full_name, phone: v.phone, status: v.status, green: v.green,
    vehicle_mode: v.vehicle_mode, vehicle: v.has_vehicle ? [v.vehicle_make !== "other" ? v.vehicle_make : "", v.vehicle_model, v.vehicle_year].filter(Boolean).join(" ") : null,
    services: v.services, appt_label: v.appt_label, appt_at: v.appt_at, appt_confirmed: v.appt_confirmed, waiting_days: v.waiting_days,
    updated_at: v.updated_at, next_stage: v.next_stage, sub_city: v.sub_city, no_tg: v.no_tg, agent_id: v.agent_id,
  };
};

// ---------- CSV ----------

export async function toCsv(env) {
  const rows = await db.allDrivers(env.DB);
  if (!rows.length) return null;
  const skip = new Set(["test_at", "test_confirmed"]);
  const cols = ["driver_no", ...Object.keys(rows[0]).filter((c) => c !== "driver_no" && !skip.has(c))];
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const text = "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(c === "driver_no" && r[c] ? `CB${r[c]}` : r[c])).join(","))].join("\r\n");
  return { text, name: `cabby-drivers-${C.addisToday()}.csv`, count: rows.length };
}

// ---------- የTelegram ፋይሎች (ሰነዶች) ----------

async function proxyFile(env, fileId) {
  const doc = await db.docByFileId(env.DB, fileId);
  if (!doc) return new Response("Not found", { status: 404 });
  const root = env.TELEGRAM_API_ROOT || "https://api.telegram.org";
  const info = await fetch(`${root}/bot${env.BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`).then((r) => r.json()).catch(() => null);
  if (!info?.ok) return new Response("File unavailable", { status: 502 });
  const file = await fetch(`${root}/file/bot${env.BOT_TOKEN}/${info.result.file_path}`);
  if (!file.ok) return new Response("File unavailable", { status: 502 });
  const type = file.headers.get("content-type") || (info.result.file_path.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
  return new Response(file.body, { headers: { "content-type": type, "cache-control": "private, max-age=86400" } });
}

// ---------- API ----------

const ACTIONS = {
  approve: (env, api, id, who) => A.approveDocs(env, api, id, who),
  request_doc: (env, api, id, who, b) => A.requestDoc(env, api, id, who, b.kind),
  reject: (env, api, id, who, b) => A.reject(env, api, id, who, b.reason),
  schedule: (env, api, id, who, b) => A.schedule(env, api, id, who, { at: b.at, text: b.text }),
  pass: (env, api, id, who) => A.pass(env, api, id, who),
  fail: (env, api, id, who, b) => A.fail(env, api, id, who, b.reason),
  activate: (env, api, id, who) => A.activate(env, api, id, who, "በዳሽቦርድ"),
  suspend: (env, api, id, who, b) => A.suspend(env, api, id, who, b.reason, { docs: b.docs, note: b.note }),
  reject_fix: (env, api, id, who, b) => A.rejectFix(env, api, id, who, b.note),
  unsuspend: (env, api, id, who) => A.unsuspend(env, api, id, who),
  note: (env, api, id, who, b) => A.addNote(env, id, who, b.text),
  message: async (env, api, id, who, b) => {
    const text = String(b.text ?? "").trim().slice(0, 2000);
    if (!text) return { ok: false, error: "መልዕክቱ ባዶ ነው።" };
    if (db.isNoTg(id)) {
      const d = await db.getDriver(env.DB, id);
      const r = await sendSms(env, { to: d.phone, text: `${A.brand(env)}: ${text}`.slice(0, 480), kind: "message", tg_id: id });
      if (!r.ok) return { ok: false, error: r.skipped === "disabled" ? "SMS አልበራም — በቅንብሮች ያብሩት።" : `SMS አልተላከም፦ ${r.error ?? r.skipped}` };
      await db.logEvent(env.DB, id, who, "message", `SMS፦ ${text}`);
      return { ok: true };
    }
    const err = await api.sendMessage(id, `💬 <b>${A.esc(A.brand(env))}፦</b>\n${A.esc(text)}`, A.HTML).then(() => null).catch((e) => e.description ?? e.message);
    if (err) return { ok: false, error: `መላክ አልተቻለም፦ ${err}` };
    await db.logEvent(env.DB, id, who, "message", text);
    return { ok: true };
  },
};

export async function handleAdminApi(request, env, path, getBot) {
  const who = await authenticate(request, env);
  if (!who) return json({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const q = (k) => url.searchParams.get(k) || undefined;
  const DB = env.DB;
  const seg = path.replace(/^\/api\/admin\/?/, "").split("/");

  if (request.method === "GET") {
    switch (seg[0]) {
      case "me":
        return json({
          admin: who, brand: A.brand(env),
          labels: { status: STRINGS.am.status, docs: Object.fromEntries(Object.entries(STRINGS.am.docs).map(([k, v]) => [k, v[0]])), reasons: Object.fromEntries(C.REJECT_REASONS.map((r) => [r, t("am", `reasons.${r}`, { brand: A.brand(env) })])), opt: STRINGS.am.opt },
          rules: { min_age: C.MIN_AGE, max_age: C.MAX_AGE, max_vehicle_age: C.MAX_VEHICLE_AGE, inspection_after: C.INSPECTION_AFTER_YEARS, test_for_no_car: C.TEST_FOR_NO_CAR, require_orientation: C.REQUIRE_ORIENTATION },
          statuses: C.STATUSES, suspend_reasons: C.SUSPEND_REASONS,
        });
      case "overview": {
        const [s, pipeline, appts, events, fixes] = await Promise.all([
          db.stats(DB),
          Promise.all(["awaiting_docs", "pending", "test", "inspection", "orientation"].map((st) => db.listByStatus(DB, st, 60))),
          db.appointments(DB),
          db.recentEvents(DB, 15),
          db.submittedFixes(DB),
        ]);
        const recentActive = (await db.searchDrivers(DB, { status: "active", sort: "code", limit: 12 })).rows;
        return json({
          stats: s,
          pipeline: Object.fromEntries(["awaiting_docs", "pending", "test", "inspection", "orientation"].map((st, i) => [st, pipeline[i].map(card)])),
          active: recentActive.map(card),
          appointments: appts.map(card),
          fixes: fixes.map((d) => ({ ...card(d), fix_submitted_at: d.fix_submitted_at, reject_reason: d.reject_reason })),
          events,
        });
      }
      case "drivers": {
        const r = await db.searchDrivers(DB, { q: q("q"), status: q("status"), service: q("service"), mode: q("mode"), fuel: q("fuel"), agent: q("agent"), campaign: q("campaign"), sort: q("sort"), limit: Math.min(Number(q("limit") ?? 50), 200), offset: Number(q("offset") ?? 0) });
        return json({ total: r.total, rows: r.rows.map(card) });
      }
      case "driver": {
        const id = Number(seg[1]);
        const d = await db.getDriver(DB, id);
        if (!d) return json({ error: "not found" }, 404);
        const [docs, events, referred, referrer] = await Promise.all([
          db.getDocs(DB, id), db.eventsFor(DB, id, 80), db.referredBy(DB, id), d.referrer_id ? db.getDriver(DB, d.referrer_id) : null,
        ]);
        const [agent, campaign] = await Promise.all([d.agent_id ? db.staffById(DB, d.agent_id) : null, d.campaign_id ? db.campaignById(DB, d.campaign_id) : null]);
        return json({ driver: view(d), docs, events, referred: referred.map(card), referrer: referrer ? card(referrer) : null,
          agent: agent && { id: agent.id, name: agent.name, code: agent.code, phone: agent.phone }, campaign: campaign && { id: campaign.id, name: campaign.name } });
      }
      case "file":
        return proxyFile(env, decodeURIComponent(seg.slice(1).join("/")));
      case "events":
        return json({ events: await db.recentEvents(DB, 80, q("before") ? Number(q("before")) : null) });
      case "analytics":
        return json(await db.analytics(DB, Number(q("days") ?? 30)));
      case "referrals": {
        const board = await db.referralBoard(DB);
        const { results: unpaid } = await DB.prepare(
          `SELECT d.*, r.full_name AS referrer_name, r.driver_no AS referrer_no, r.telebirr AS referrer_telebirr FROM drivers d JOIN drivers r ON r.tg_id = d.referrer_id
           WHERE d.status = 'active' ORDER BY d.referral_paid_at IS NOT NULL, d.activated_at DESC LIMIT 200`).all();
        return json({ board, payouts: unpaid.map((d) => ({ ...card(d), referrer_name: d.referrer_name, referrer_code: d.referrer_no ? `CB${d.referrer_no}` : null, referrer_telebirr: d.referrer_telebirr, paid_at: d.referral_paid_at, activated_at: d.activated_at })), reward: env.REFERRAL_REWARD || null });
      }
      case "settings": {
        const st = await loadSettings(env, true);
        return json({
          ...st,
          sms: publicSms(st.sms), sms_kinds: C.SMS_KINDS, sms_used: await db.smsMonthCount(DB),
          defaults: { rules: C.RULE_DEFAULTS, agreement: DEFAULT_AGREEMENT },
          env_links: Object.fromEntries(C.LINK_KEYS.map((k) => [k, env[k] || ""])),
          options: {
            grades: C.LICENSE_GRADES, fuels: C.FUEL_TYPES, langs: C.LANGS,
            docs: C.DOCUMENTS.map((d) => ({ kind: d.kind, label: t("am", `docs.${d.kind}`)[0], core: C.CORE_DOCS.includes(d.kind), when: d.when ? (d.kind === "authorization" ? "other" : "car") : "all" })),
          },
        });
      }
      case "staff": {
        const [list, bot] = await Promise.all([db.staffList(DB), botName(env, getBot)]);
        return json({ staff: list.map((x) => ({ ...x, invite_link: x.invite_token ? `https://t.me/${bot}?start=staff_${x.invite_token}` : null, invite_token: undefined })) });
      }
      case "campaigns": {
        const [list, staff] = await Promise.all([db.campaignList(DB), db.staffList(DB)]);
        return json({ campaigns: list, staff: staff.filter((x) => x.active).map((x) => ({ id: x.id, name: x.name, code: x.code, role: x.role })), default_commission: C.AGENT_COMMISSION });
      }
      case "campaign-qr": {
        const c = await db.campaignById(DB, Number(seg[1]));
        if (!c) return json({ error: "not found" }, 404);
        const bot = await botName(env, getBot);
        const agents = (await db.staffList(DB)).filter((x) => x.active);
        const assigned = (await db.campaignList(DB)).find((x) => x.id === c.id)?.agent_ids ?? [];
        return json({ campaign: c, cards: agents.filter((x) => assigned.includes(x.id)).map((x) => {
          const link = `https://t.me/${bot}?start=a_${x.code}_${c.id}`;
          return { name: x.name, code: x.code, link, qr: qrSvg(link) };
        }) });
      }
      case "commissions": {
        const rows = await db.commissions(DB);
        const byAgent = {};
        for (const r of rows) {
          const a = (byAgent[r.agent_id] ??= { agent_id: r.agent_id, name: r.agent_name, code: r.agent_code, telebirr: r.agent_telebirr || r.agent_phone, total: 0, unpaid: 0, count: 0, unpaid_count: 0 });
          a.total += r.commission_amount; a.count++;
          if (!r.commission_paid_at) { a.unpaid += r.commission_amount; a.unpaid_count++; }
        }
        return json({ rows, agents: Object.values(byAgent).sort((a, b) => b.unpaid - a.unpaid) });
      }
      case "sms": {
        const [log, used, st] = await Promise.all([db.smsLog(DB, 100), db.smsMonthCount(DB), loadSettings(env)]);
        return json({ log, used, limit: st.sms.monthly_limit, enabled: st.sms.enabled });
      }
      case "export.csv": {
        const csv = await toCsv(env);
        return new Response(csv?.text ?? "﻿", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${csv?.name ?? "cabby-drivers.csv"}"` } });
      }
    }
    return json({ error: "not found" }, 404);
  }

  if (request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch {}
    if (seg[0] === "driver" && ACTIONS[seg[2]]) {
      const id = Number(seg[1]);
      const res = await ACTIONS[seg[2]](env, getBot(env).api, id, `${who.name} (ዳሽቦርድ)`, body);
      const d = await db.getDriver(DB, id);
      return json({ ...res, driver: view(d) }, res.ok ? 200 : 409);
    }
    if (seg[0] === "staff") {
      if (seg[2] === "invite") {
        const token = crypto.randomUUID().replace(/-/g, "");
        await DB.prepare("UPDATE staff SET invite_token = ?, tg_id = NULL, username = NULL WHERE id = ?").bind(token, Number(seg[1])).run();
        return json({ ok: true, invite_link: `https://t.me/${await botName(env, getBot)}?start=staff_${token}` });
      }
      const name = String(body.name ?? "").trim().slice(0, 80);
      const phone = C.normalizePhone(body.phone);
      const telebirr = body.telebirr ? C.normalizePhone(body.telebirr) : phone;
      const role = body.role === "supervisor" ? "supervisor" : "agent";
      if (name.length < 2) return json({ error: "ስም ያስገቡ።" }, 422);
      if (!phone) return json({ error: "ትክክለኛ ስልክ ቁጥር ያስገቡ።" }, 422);
      if (body.telebirr && !telebirr) return json({ error: "ትክክለኛ የTelebirr ቁጥር ያስገቡ።" }, 422);
      if (body.id) {
        await DB.prepare("UPDATE staff SET name = ?, phone = ?, telebirr = ?, role = ?, active = ? WHERE id = ?").bind(name, phone, telebirr, role, body.active === false ? 0 : 1, Number(body.id)).run();
        await db.logEvent(DB, null, who.name, "staff_saved", `${name} (ተቀይሯል)`);
        return json({ ok: true });
      }
      const token = crypto.randomUUID().replace(/-/g, "");
      const r = await DB.prepare("INSERT INTO staff (name, phone, telebirr, role, invite_token) VALUES (?, ?, ?, ?, ?) RETURNING id").bind(name, phone, telebirr, role, token).first();
      const code = `S${String(r.id).padStart(2, "0")}`;
      await DB.prepare("UPDATE staff SET code = ? WHERE id = ?").bind(code, r.id).run();
      await db.logEvent(DB, null, who.name, "staff_saved", `${name} (${code}, አዲስ)`);
      return json({ ok: true, id: r.id, code, invite_link: `https://t.me/${await botName(env, getBot)}?start=staff_${token}` });
    }
    if (seg[0] === "campaigns") {
      const v = await campaignInput(env, body);
      if (v.error) return json({ error: v.error }, 422);
      const id = await db.saveCampaign(DB, v.value, who.name);
      await db.logEvent(DB, null, who.name, "campaign_saved", `${v.value.name}${v.value.id ? " (ተቀይሯል)" : " (አዲስ)"}`);
      return json({ ok: true, id });
    }
    if (seg[0] === "commission" && seg[2] === "paid") {
      const r = await DB.prepare("UPDATE drivers SET commission_paid_at = datetime('now') WHERE tg_id = ? AND commission_amount IS NOT NULL AND commission_paid_at IS NULL").bind(Number(seg[1])).run();
      if (!r.meta.changes) return json({ ok: false, error: "ቀድሞ ተከፍሏል።" }, 409);
      await db.logEvent(DB, Number(seg[1]), who.name, "commission_paid");
      return json({ ok: true });
    }
    if (seg[0] === "commissions" && seg[1] === "agent" && seg[3] === "paid") {
      const sid = Number(seg[2]);
      const sum = await DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(commission_amount), 0) AS s FROM drivers WHERE agent_id = ? AND commission_amount IS NOT NULL AND commission_paid_at IS NULL").bind(sid).first();
      if (!sum.n) return json({ ok: false, error: "የሚከፈል የለም።" }, 409);
      await DB.prepare("UPDATE drivers SET commission_paid_at = datetime('now') WHERE agent_id = ? AND commission_amount IS NOT NULL AND commission_paid_at IS NULL").bind(sid).run();
      const st = await db.staffById(DB, sid);
      await db.logEvent(DB, null, who.name, "commission_paid", `${st?.name ?? sid}፦ ${sum.n} አሽከርካሪዎች · ${sum.s} ብር`);
      if (st?.tg_id) await getBot(env).api.sendMessage(st.tg_id, `💰 የ<b>${sum.s} ብር</b> ኮሚሽን (${sum.n} አሽከርካሪዎች) ተከፍሎዎታል። እናመሰግናለን!`, A.HTML).catch(() => {});
      return json({ ok: true, count: sum.n, total: sum.s });
    }
    if (seg[0] === "sms" && seg[1] === "test") {
      const to = C.normalizePhone(body.to);
      if (!to) return json({ ok: false, error: "ትክክለኛ ስልክ ቁጥር ያስገቡ።" }, 422);
      const r = await sendSms(env, { to, text: `${A.brand(env)}: የሙከራ SMS ✓`, kind: "test", force: true });
      return json(r.ok ? { ok: true } : { ok: false, error: r.error ?? r.skipped }, r.ok ? 200 : 502);
    }
    if (seg[0] === "settings") {
      const res = await saveSettings(env, body, who.name);
      return json(res, res.ok ? 200 : 422);
    }
    if (seg[0] === "referral" && seg[2] === "paid") return json(await A.markPaid(env, Number(seg[1]), `${who.name} (ዳሽቦርድ)`));
  }
  return json({ error: "not found" }, 404);
}
