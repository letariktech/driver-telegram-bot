import { Bot, InlineKeyboard, webhookCallback } from "grammy";

export default {
  async fetch(request, env) {
    // 1. በብሮውዘር በኩል እንዲሁ ሲከፈት Error እንዳይጥል ማድረግ
    if (request.method === "GET") {
      return new Response("🚗 Driver Bot Worker is active and running successfully!", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    // 2. BOT_TOKEN መኖሩን ማረጋገጥ
    if (!env.BOT_TOKEN) {
      return new Response("Error: BOT_TOKEN is missing in Cloudflare Variables!", { status: 500 });
    }

    const bot = new Bot(env.BOT_TOKEN);

    // 3. /start ትእዛዝ ሲላክ
    bot.command("start", async (ctx) => {
      const miniAppUrl = env.MINI_APP_URL || "https://driver-registration.pages.dev";
      const keyboard = new InlineKeyboard().webApp("🚗 የምዝገባ ቅጽ ክፈት", miniAppUrl);

      await ctx.reply(
        "👋 እንኳን ደህና መጡ ወደ አሽከርካሪዎች መመዝገቢያ ፖርታል!\n\nምዝገባዎን በአንድ ገጽ ላይ ለማጠናቀቅ ከታች ያለውን አዝራር ይጫኑ፦",
        { reply_markup: keyboard }
      );
    });

    // 4. ከሚኒ አፑ ዳታ ሲመጣ
    bot.on("message:web_app_data", async (ctx) => {
      try {
        const data = JSON.parse(ctx.message.web_app_data.data);
        await ctx.reply(
          `🎉 **የምዝገባ መረጃዎ በተሳካ ሁኔታ ደርሶናል!**\n\n` +
          `👤 **ስም፦** ${data.fullName}\n` +
          `📞 **ስልክ፦** ${data.phoneNumber}\n` +
          `🚗 **ተሽከርካሪ፦** ${data.vehicleModel}\n` +
          `🔢 **ሰሌዳ፦** ${data.plateCode}-${data.plateNumber}\n\n` +
          `📌 **የመጨረሻ ደረጃ፦** እባክዎ አሁን እዚህ ቻት ላይ **የመንጃ ፈቃድዎን ፎቶ** ይላኩልን፦`
        );
      } catch (e) {
        await ctx.reply("የመረጃ ስህተት አጋጥሟል፤ እባክዎ እንደገና ይሞክሩ።");
      }
    });

    // 5. ፎቶ ሲላክ
    bot.on("message:photo", async (ctx) => {
      await ctx.reply("የላኩት ሰነድ ደርሶናል! መረጃዎ ተገምግሞ ምላሽ ይሰጥዎታል። እናመሰግናለን!");
    });

    // Webhook ጥያቄን ማስተናገድ
    const handleUpdate = webhookCallback(bot, "cloudflare-mod");
    return handleUpdate(request);
  },
};
