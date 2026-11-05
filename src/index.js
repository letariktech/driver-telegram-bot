import { webhookCallback } from "grammy";
import { getBot, setOrigin, setup } from "./bot.js";
import { handleApi } from "./api.js";
import { ensureSchema } from "./db.js";
import { SUB_CITIES, LICENSE_GRADES, VEHICLE_TYPES, PLATE_REGIONS } from "./constants.js";
import FORM_HTML from "./webapp.html";

const OPTIONS = JSON.stringify({ SUB_CITIES, LICENSE_GRADES, VEHICLE_TYPES, PLATE_REGIONS });
const PAGE = FORM_HTML.replace("__OPTIONS__", OPTIONS.replace(/</g, "\\u003c"));

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8" } });

let handler = null;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    setOrigin(url.origin);

    const missing = ["BOT_TOKEN", "WEBHOOK_SECRET", "ADMIN_CHAT_ID"].filter((k) => !env[k]);
    if (!env.DB) missing.push("DB (D1 binding)");

    if (request.method === "GET") {
      if (path === "/") {
        return new Response(PAGE, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-cache",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
          },
        });
      }
      if (path === "/health") return json({ ok: missing.length === 0, missing });
      if (path === "/setup") {
        if (missing.length) return json({ ok: false, missing }, 500);
        if (url.searchParams.get("key") !== env.WEBHOOK_SECRET) return json({ ok: false, error: "Unauthorized" }, 401);
        try {
          return json(await setup(env, url.origin));
        } catch (e) {
          return json({ ok: false, error: String(e.description ?? e.message) }, 500);
        }
      }
      return new Response("Not found", { status: 404 });
    }

    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    if (missing.length) return json({ ok: false, missing }, 500);

    await ensureSchema(env.DB);

    if (path.startsWith("/api/")) {
      if (path !== "/api/me" && path !== "/api/register") return new Response("Not found", { status: 404 });
      return handleApi(request, env, path, getBot);
    }

    if (path === "/webhook" || path === "/") {
      if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
      handler ??= webhookCallback(getBot(env), "cloudflare-mod");
      return handler(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
