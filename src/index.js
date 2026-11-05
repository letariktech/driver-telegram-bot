import { webhookCallback } from "grammy";
import { getBot, setup, runDaily } from "./bot.js";
import { setOrigin } from "./actions.js";
import { handleApi } from "./api.js";
import { handleAdminApi, handleLogin, handleLogout } from "./admin.js";
import { ensureSchema } from "./db.js";
import { loadSettings } from "./settings.js";
import * as C from "./constants.js";
import { STRINGS } from "./i18n.js";
import FORM_HTML from "./webapp.html";
import ADMIN_HTML from "./admin.html";
import AGENT_HTML from "./agent.html";
import { handleAgentApi } from "./agent-api.js";
import { handleDocsApi } from "./docs-api.js";
import LOGO from "./assets/cabby.png";
import LOGO_WHITE from "./assets/cabby-white.png";
import MARK from "./assets/mark.png";
import FAVICON from "./assets/favicon.png";
import APPLE from "./assets/apple.png";
const ASSETS = { "cabby.png": LOGO, "cabby-white.png": LOGO_WHITE, "mark.png": MARK, "favicon.png": FAVICON, "apple.png": APPLE };

// የቅጹ ምርጫዎች — ደንቦቹ በዳሽቦርድ ስለሚቀየሩ በቅንብሮች ስሪት ይታደሳል
const pages = new Map();
function page(key, html, brand) {
  const k = `${key}:${brand}:${C.SETTINGS_VERSION}`;
  if (!pages.has(k)) {
    if (pages.size > 20) pages.clear();
    const OPTIONS = JSON.stringify({
      SUB_CITIES: C.SUB_CITIES, SPOKEN: C.SPOKEN, LICENSE_GRADES: C.LICENSE_GRADES, ACCEPTED_GRADES: C.ACCEPTED_GRADES, EXPERIENCE: C.EXPERIENCE,
      PREV_PLATFORMS: C.PREV_PLATFORMS, VEHICLE_MODES: C.VEHICLE_MODES, VEHICLE_TYPES: C.VEHICLE_TYPES, VEHICLE_MAKES: C.VEHICLE_MAKES,
      FUEL_TYPES: C.FUEL_TYPES, GREEN_FUELS: C.GREEN_FUELS, SEATS: C.SEATS, PLATE_REGIONS: C.PLATE_REGIONS, SERVICES: C.SERVICES,
      SHIFTS: C.SHIFTS, PHONE_TYPES: C.PHONE_TYPES, MIN_AGE: C.MIN_AGE, MAX_AGE: C.MAX_AGE, MAX_VEHICLE_AGE: C.MAX_VEHICLE_AGE,
      INSPECTION_AFTER_YEARS: C.INSPECTION_AFTER_YEARS, ALLOWED_PLATE_CODES: C.ALLOWED_PLATE_CODES, TEST_FOR_NO_CAR: C.TEST_FOR_NO_CAR,
      I18N: Object.fromEntries(Object.entries(STRINGS).map(([k, v]) => [k, { f: v.f, opt: v.opt, lang_name: v.lang_name, reasons: v.reasons, docs: v.docs }])),
    }).replace(/</g, "\\u003c");
    pages.set(k, html.replace("__OPTIONS__", OPTIONS).replaceAll("__BRAND__", brand.replace(/[<>&"]/g, "")));
  }
  return pages.get(k);
}

const SECURITY = { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-frame-options": "SAMEORIGIN" };
const html = (body, extra = {}) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", ...SECURITY, ...extra } });
const json = (data, status = 200) => new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8" } });

let handler = null;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    setOrigin(url.origin);
    const brand = env.BRAND_NAME || "Cabby";

    const missing = ["BOT_TOKEN", "WEBHOOK_SECRET", "ADMIN_CHAT_ID"].filter((k) => !env[k]);
    if (!env.DB) missing.push("DB (D1 binding)");

    if (request.method === "GET" && path === "/" && !missing.length) {
      await ensureSchema(env.DB);
      await loadSettings(env);
    }
    if ((request.method === "GET" || request.method === "HEAD") && (path.startsWith("/assets/") || path === "/favicon.ico")) {
      const a = ASSETS[path === "/favicon.ico" ? "favicon.png" : path.slice(8)];
      if (a) return new Response(request.method === "HEAD" ? null : a, { headers: { "content-type": "image/png", "cache-control": "public, max-age=604800" } });
    }
    if (request.method === "GET") {
      if (path === "/") return html(page("form", FORM_HTML, brand));
      if (path === "/health") return json({ ok: missing.length === 0, missing });
      if (path === "/admin") return html(page("admin", ADMIN_HTML, brand), { "x-frame-options": "DENY" });
      if (path === "/agent") return html(page("agent", AGENT_HTML, brand));
      if (path === "/admin/logout") return handleLogout();
    }
    if (missing.length) return json({ ok: false, missing }, 500);

    if (request.method === "GET" && path === "/setup") {
      await ensureSchema(env.DB);
      await loadSettings(env);
      if (url.searchParams.get("key") !== env.WEBHOOK_SECRET) return json({ ok: false, error: "Unauthorized" }, 401);
      try { return json(await setup(env, url.origin)); } catch (e) { return json({ ok: false, error: String(e.description ?? e.message) }, 500); }
    }

    await ensureSchema(env.DB);
    await loadSettings(env);

    if (path === "/admin/login" && request.method === "GET") return handleLogin(request, env);
    if (path.startsWith("/api/admin")) return handleAdminApi(request, env, path, getBot);

    if (request.method !== "POST") return new Response("Not found", { status: 404 });

    if (path === "/api/me" || path === "/api/register") return handleApi(request, env, path, getBot);
    if (path.startsWith("/api/agent/")) return handleAgentApi(request, env, path, getBot);
    if (path.startsWith("/api/docs/")) return handleDocsApi(request, env, path, getBot);

    if (path === "/webhook" || path === "/") {
      if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });
      handler ??= webhookCallback(getBot(env), "cloudflare-mod");
      return handler(request);
    }
    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    if (!env.DB || !env.BOT_TOKEN) return;
    await ensureSchema(env.DB);
    await loadSettings(env, true);
    ctx.waitUntil(runDaily(env).then((r) => console.log("daily", r)));
  },
};
