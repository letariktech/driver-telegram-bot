import { Bot, InlineKeyboard, webhookCallback } from "grammy";

export default {
  async fetch(request, env) {
    // ቦቱን በCloudflare Environment Variable በተቀመጠው ቶከን ማስነሳት
    const bot = new Bot(env.BOT_TOKEN);

    // 1. /start ሲባል ሚኒ አፑን መክፈት
    bot.command("start", async (ctx) => {
      const keyboard = new InlineKeyboard().webApp(
        "🚗 የምዝገባ ቅጽ ክፈት",
        env.MINI_APP_URL
      );

      await ctx.reply(
        "👋 እንኳን ደህና መጡ ወደ አሽከርካሪዎች መመዝገቢያ ፖርታል!\n\nምዝገባዎን በአንድ ገጽ ላይ ለማጠናቀቅ ከታች ያለውን አዝራር ይጫኑ፦",
        { reply_markup: keyboard }
      );
    });

    // 2. ከሚኒ አፑ የተላከውን መረጃ መቀበል
    bot.on("message:web_app_data", async (ctx) => {
      const data = JSON.parse(ctx.message.web_app_data.data);

      await ctx.reply(
        `🎉 **የምዝገባ መረጃዎ በተሳካ ሁኔታ ደርሶናል!**\n\n` +
        `👤 **ስም፦** ${data.fullName}\n` +
        `📞 **ስልክ፦** ${data.phoneNumber}\n` +
        `🚗 **ተሽከርካሪ፦** ${data.vehicleModel}\n` +
        `🔢 **ሰሌዳ፦** ${data.plateCode}-${data.plateNumber}\n\n` +
        `📌 **የመጨረሻ ደረጃ፦** እባክዎ አሁን እዚህ ቻት ላይ **የመንጃ ፈቃድዎን ፎቶ** ይላኩልን፦`
      );
    });

    // 3. ፎቶ ሲላክ ማስተናገድ
    bot.on("message:photo", async (ctx) => {
      await ctx.reply("የላኩት ሰነድ ደርሶናል! መረጃዎ ተገምግሞ ምላሽ ይሰጥዎታል። እናመሰግናለን!");
    });

    // ቴሌግራም የሚልከውን ጥያቄ (Webhook) ማስተናገድ
    return webhookCallback(bot, "cloudflare-mod")(request);
  },
};
