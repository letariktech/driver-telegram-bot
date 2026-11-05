// በሚኒ አፑ ውስጥ ሰነድ መቀበል፦ /api/docs/*
// ፋይሉ ወደ Telegram ይላካል፤ የምናስቀምጠው file_id ብቻ ነው (ማከማቻ ነፃ)።
// ማከማቻ ቻት፦ DOCS_CHAT_ID ካለ እዚያ ይቀመጣል፤ ከሌለ ወደ ላኪው ቻት ተልኮ ወዲያውኑ ይሰረዛል (file_id አይጠፋም)።
import { InputFile } from "grammy";
import * as C from "./constants.js";
import * as db from "./db.js";
import * as A from "./actions.js";
import { verifyInitData } from "./auth.js";
import { t } from "./i18n.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const MAX_BYTES = 10 * 1024 * 1024;
const IN_PROGRESS = ["pending", "test", "inspection", "orientation", "active"];

/** ጠያቂው አሽከርካሪው ራሱ ወይም Telegram የሌለውን አሽከርካሪ የመዘገበው ሴልስ */
async function resolve(env, initData, driverId) {
  const user = await verifyInitData(initData, env.BOT_TOKEN);
  if (!user) return { error: json({ error: "ገጹን ከTelegram ቦቱ ውስጥ ይክፈቱ።", code: "auth" }, 401) };
  if (driverId) {
    const st = await db.staffByTg(env.DB, user.id);
    const d = st ? await db.getDriver(env.DB, Number(driverId)) : null;
    if (!d || d.agent_id !== st.id || !db.isNoTg(d.tg_id)) return { error: json({ error: "ይህ አሽከርካሪ የእርስዎ አይደለም።" }, 403) };
    return { user, d, agent: st, actor: `${st.name} (ሴልስ)` };
  }
  const d = await db.getDriver(env.DB, user.id);
  if (!d) return { error: json({ error: "መጀመሪያ ቅጹን ይሙሉ።", code: "no_driver" }, 404) };
  return { user, d, agent: null, actor: "driver" };
}

async function state(env, d) {
  const info = await A.docInfo(env, d);
  const docs = await db.getDocs(env.DB, d.tg_id);
  const byKind = Object.fromEntries(docs.map((x) => [x.kind, x]));
  const mode = d.status === "awaiting_docs" ? "collect" : IN_PROGRESS.includes(d.status) && (info.missingLater.length || info.missingOptional.length) ? "complete" : "locked";
  return {
    mode, status: d.status, name: d.full_name, no_tg: db.isNoTg(d.tg_id), lang: A.langOf(d),
    days_left: A.daysLeft(d), overdue: !!d.docs_overdue_at, deadline_days: C.DOC_DEADLINE_DAYS,
    docs: info.list.map((x) => ({
      kind: x.kind, policy: C.docPolicy(x.kind), have: !!byKind[x.kind], type: byKind[x.kind]?.file_type ?? null,
      skipped: info.skipped.has(x.kind) && !byKind[x.kind],
    })),
  };
}

export async function handleDocsApi(request, env, path, getBot) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const action = path.replace(/^\/api\/docs\/?/, "");
  const api = getBot(env).api;

  // ---- ፋይል መላክ (multipart) ----
  if (action === "upload") {
    let form;
    try { form = await request.formData(); } catch { return json({ error: "Invalid form" }, 400); }
    const r = await resolve(env, form.get("initData"), form.get("driver_id"));
    if (r.error) return r.error;
    const { d } = r;
    const lang = A.langOf(d);
    const kind = String(form.get("kind") ?? "");
    const file = form.get("file");
    const info = await A.docInfo(env, d);
    if (!info.list.some((x) => x.kind === kind)) return json({ error: "unknown document" }, 422);
    if (!file || typeof file === "string") return json({ error: t(lang, "f.e_file_type") }, 422);
    if (file.size > MAX_BYTES) return json({ error: t(lang, "f.e_file_big") }, 413);
    const isPdf = file.type === "application/pdf";
    if (!isPdf && !/^image\//.test(file.type)) return json({ error: t(lang, "f.e_file_type") }, 422);
    const collecting = d.status === "awaiting_docs";
    if (!collecting && !(IN_PROGRESS.includes(d.status) && !info.have.has(kind))) return json({ error: t(lang, "f.locked_stage"), code: "locked" }, 409);

    const chat = env.DOCS_CHAT_ID || r.user.id;
    const label = t("am", `docs.${kind}`)?.[0] ?? kind;
    const caption = `${label} — ${d.full_name ?? ""}`.slice(0, 200);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let msg;
    try {
      msg = isPdf
        ? await api.sendDocument(chat, new InputFile(bytes, `${kind}.pdf`), { caption, disable_notification: true })
        : await api.sendPhoto(chat, new InputFile(bytes, `${kind}.jpg`), { caption, disable_notification: true });
    } catch (e) {
      console.error("doc upload failed", e.description ?? e.message);
      return json({ error: t(lang, "f.doc_fail") }, 502);
    }
    const fileId = isPdf ? msg.document?.file_id : msg.photo?.at(-1)?.file_id;
    if (!fileId) return json({ error: t(lang, "f.doc_fail") }, 502);
    if (!env.DOCS_CHAT_ID) await api.deleteMessage(chat, msg.message_id).catch(() => {});
    await db.replaceDoc(env.DB, d.tg_id, kind, fileId, isPdf ? "document" : "photo");
    await db.setSkipped(env.DB, d.tg_id, kind, false);
    if (!collecting) await A.docAdded(api, env, d.tg_id, kind, r.actor);
    return json({ ok: true, state: await state(env, await db.getDriver(env.DB, d.tg_id)) });
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const r = await resolve(env, body?.initData, body?.driver_id);
  if (r.error) return r.error;
  const { d } = r;
  const lang = A.langOf(d);

  if (action === "state") return json(await state(env, d));

  if (action === "skip") {
    if (!["awaiting_docs", ...IN_PROGRESS].includes(d.status)) return json({ error: t(lang, "f.locked_stage") }, 409);
    const res = await A.skipDoc(api, env, d.tg_id, String(body.kind ?? ""), body.on !== false);
    if (!res.ok) return json({ error: res.error }, 422);
    return json({ ok: true, state: await state(env, await db.getDriver(env.DB, d.tg_id)) });
  }

  if (action === "submit") {
    if (d.status !== "awaiting_docs") return json({ ok: true, state: await state(env, d) });
    const info = await A.docInfo(env, d);
    if (info.missingRequired.length) {
      return json({ error: t(lang, "f.docs_missing_req", { list: A.docLabels(lang, info.missingRequired) }), code: "missing_required", missing: info.missingRequired }, 422);
    }
    // ያልተመለሱ "በኋላ/አማራጭ" ሰነዶች እንደ "የለኝም" ይቆጠራሉ
    for (const k of [...info.missingLater, ...info.missingOptional]) await db.setSkipped(env.DB, d.tg_id, k, true);
    await A.askNextDocument(api, env, d.tg_id);
    const fresh = await db.getDriver(env.DB, d.tg_id);
    return json({ ok: fresh.status !== "awaiting_docs", state: await state(env, fresh) });
  }

  if (action === "chat") {
    // በቻት መላክ የመረጠ — ቦቱ አንድ በአንድ ይጠይቃል
    await A.askNextDocument(api, env, d.tg_id, true);
    return json({ ok: true });
  }

  if (action === "file") {
    const doc = (await db.getDocs(env.DB, d.tg_id)).find((x) => x.kind === body.kind);
    if (!doc) return json({ error: "not found" }, 404);
    const root = env.TELEGRAM_API_ROOT || "https://api.telegram.org";
    const info = await fetch(`${root}/bot${env.BOT_TOKEN}/getFile?file_id=${encodeURIComponent(doc.file_id)}`).then((x) => x.json()).catch(() => null);
    if (!info?.ok) return new Response("File unavailable", { status: 502 });
    const file = await fetch(`${root}/file/bot${env.BOT_TOKEN}/${info.result.file_path}`);
    if (!file.ok) return new Response("File unavailable", { status: 502 });
    return new Response(file.body, { headers: { "content-type": file.headers.get("content-type") || "image/jpeg", "cache-control": "private, max-age=3600" } });
  }

  return json({ error: "not found" }, 404);
}
