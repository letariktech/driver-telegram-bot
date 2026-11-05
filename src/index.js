import { Bot, InlineKeyboard, webhookCallback } from "grammy";

export default {
  async fetch(request, env) {
    // 1. በብሮውዘር ሲከፈት ጤናማ መሆኑን ማሳየት
    if (request.method === "GET") {
      return new Response("🚗 Driver Bot Worker is active and running successfully!", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (!env.BOT_TOKEN) {
      return new Response("Error: BOT_TOKEN is missing!", { status: 500 });
    }

    const bot = new Bot(env.BOT_TOKEN);
    const adminId = env.ADMIN_CHAT_ID ? parseInt(env.ADMIN_CHAT_ID, 10) : null;

    // 2. /start ትዕዛዝ
    bot.command("start", async (ctx) => {
      const miniAppUrl = env.MINI_APP_URL || "https://driver-telegram-bot.letarik.workers.dev";
      const keyboard = new InlineKeyboard().webApp("🚗 የምዝገባ ቅጽ ክፈት", miniAppUrl);

      await ctx.reply(
        "👋 እንኳን ደህና መጡ ወደ አሽከርካሪዎች መመዝገቢያ ፖርታል!\n\nምዝገባዎን በአንድ ገጽ ላይ ለማጠናቀቅ ከታች ያለውን አዝራር ይጫኑ፦",
        { reply_markup: keyboard }
      );
    });

    // 3. ከሚኒ አፑ መረጃ ሲደርስ
    bot.on("message:web_app_data", async (ctx) => {
      try {
        const data = JSON.parse(ctx.message.web_app_data.data);
        const userId = ctx.from.id;

        // ለአሽከርካሪው የሚላክ ማረጋገጫ
        await ctx.reply(
          `🎉 **የምዝገባ መረጃዎ በተሳካ ሁኔታ ደርሶናል!**\n\n` +
          `👤 **ስም፦** ${data.fullName}\n` +
          `📞 **ስልክ፦** ${data.phoneNumber}\n` +
          `🚗 **ተሽከርካሪ፦** ${data.vehicleModel}\n` +
          `🔢 **ሰሌዳ፦** ${data.plateCode}-${data.plateNumber}\n\n` +
          `📌 **የመጨረሻ ደረጃ፦** እባክዎ አሁን እዚህ ቻት ላይ **የመንጃ ፈቃድዎን ፎቶ** ይላኩልን፦`
        );

        // ለአስተዳዳሪ (Admin) የሚላክ የመጀመሪያ ማሳወቂያ
        if (adminId) {
          await ctx.api.sendMessage(
            adminId,
            `🚨 **አዲስ የአሽከርካሪ ምዝገባ ተሞልቷል!**\n\n` +
            `👤 **ስም፦** ${data.fullName}\n` +
            `📞 **ስልክ፦** ${data.phoneNumber}\n` +
            `🚗 **ተሽከርካሪ፦** ${data.vehicleModel}\n` +
            `🔢 **ሰሌዳ፦** ${data.plateCode}-${data.plateNumber}\n` +
            `🆔 **Telegram ID፦** \`${userId}\`\n\n` +
            `⏳ የመንጃ ፈቃድ ፎቶ በመጠበቅ ላይ...`
          );
        }
      } catch (e) {
        await ctx.reply("የመረጃ ስህተት አጋጥሟል፤ እባክዎ እንደገና ይሞክሩ።");
      }
    });

    // 4. አሽከርካሪው የመንጃ ፈቃድ ፎቶ ሲልክ
    bot.on("message:photo", async (ctx) => {
      const userId = ctx.from.id;
      const userName = ctx.from.first_name || "አሽከርካሪ";
      const photos = ctx.message.photo;
      const fileId = photos[photos.length - 1].file_id;

      await ctx.reply("የመንጃ ፈቃድ ሰነድዎ ደርሶናል! ✅\nመረጃዎ ተገምግሞ ውሳኔው በቅርቡ ይደርስዎታል።");

      // ለአስተዳዳሪው ፎቶውን ከነማጽደቂያ አዝራሮቹ መላክ
      if (adminId) {
        const adminKeyboard = new InlineKeyboard()
          .text("✅ አጽድቅ (Approve)", `approve_${userId}`)
          .text("❌ ውድቅ አድርግ (Reject)", `reject_${userId}`);

        await ctx.api.sendPhoto(adminId, fileId, {
          caption: `📄 **የመንጃ ፈቃድ ሰነድ**\n👤 ከአሽከርካሪ፦ ${userName} (\`${userId}\`)`,
          reply_markup: adminKeyboard,
        });
      }
    });

    // 5. የአስተዳዳሪ ውሳኔ (Approve / Reject)
    bot.callbackQuery(/^(approve|reject)_(\d+)$/, async (ctx) => {
      const action = ctx.match[1];
      const driverId = parseInt(ctx.match[2], 10);

      if (action === "approve") {
        await ctx.answerCallbackQuery({ text: "አሽከርካሪው ጸድቋል!" });
        await ctx.editMessageCaption({
          caption: `${ctx.msg?.caption}\n\n🟢 **ውሳኔ፦ ጸድቋል (Approved)**`,
        });

        // ለአሽከርካሪው መልዕክት መላክ
        await ctx.api.sendMessage(
          driverId,
          "🎉 እንኳን ደስ አለዎት! የአሽከርካሪነት ምዝገባዎ ጸድቋል። ስራ መጀመር ይችላሉ።"
        );
      } else {
        await ctx.answerCallbackQuery({ text: "ምዝገባው ውድቅ ተደርጓል!" });
        await ctx.editMessageCaption({
          caption: `${ctx.msg?.caption}\n\n🔴 **ውሳኔ፦ ውድቅ ተደርጓል (Rejected)**`,
        });

        await ctx.api.sendMessage(
          driverId,
          "ይቅርታ፣ ያስገቡት መረጃ ወይም ሰነድ ባለመሟላቱ ምዝገባዎ ውድቅ ተደርጓል። እባክዎ እንደገና ይመዝገቡ።"
        );
      }
    });

    const handleUpdate = webhookCallback(bot, "cloudflare-mod");
    return handleUpdate(request);
  },
};
