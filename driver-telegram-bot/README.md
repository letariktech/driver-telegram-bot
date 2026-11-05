# 🚗 Driver Registration Bot

የአሽከርካሪዎች ምዝገባ Telegram ቦት — በCloudflare Workers + D1 ላይ የሚሰራ።

## ምን ይሰራል

**ለአሽከርካሪዎች**
- 4 ደረጃ ያለው የምዝገባ ቅጽ (Telegram Mini App)፦ የግል መረጃ → መንጃ ፈቃድ → ተሽከርካሪ → ማረጋገጫ
- ሰነዶችን አንድ በአንድ በቻት መላክ፦ መንጃ ፈቃድ፣ መታወቂያ፣ የራስ ፎቶ፣ ሊብሬ (ተሽከርካሪ ላላቸው ብቻ)
- `/status` — የምዝገባ ሁኔታ፤ ውድቅ ከሆነ ምክንያቱን አይቶ እንደገና ማመልከት

**ለአስተዳዳሪዎች**
- ሙሉ ማመልከቻ ሲቀርብ ሰነዶቹ (በአልበም) እና መረጃው ከ ✅ አጽድቅ / ❌ ውድቅ አዝራሮች ጋር ይደርሳሉ
- ውድቅ ሲደረግ ምክንያት ይመረጣል፤ አሽከርካሪው ምክንያቱን ይቀበላል
- `/pending` `/stats` `/driver <ስልክ>` `/export` (CSV ለExcel) `/admin`
- ሁለት አስተዳዳሪዎች በአንድ ጊዜ ቢወስኑ አንዱ ብቻ ተቀባይነት ያገኛል

**ደህንነት**፦ የሚኒ አፑ መረጃ በTelegram ፊርማ (initData) ይረጋገጣል፤ webhook በሚስጥር ቁልፍ ይጠበቃል፤ ስልክ ቁጥር አንድ አካውንት ብቻ፤ ማረጋገጫዎቹ በሰርቨሩ ላይም ይደገማሉ።

## ማዋቀር (አንድ ጊዜ)

### 1. ኮዱን ወደ GitHub ይጫኑ
እነዚህን ፋይሎች በrepo ውስጥ ይተኩ እና ወደ `main` commit ያድርጉ። Workerዉ ከGitHub ጋር ከተገናኘ Cloudflare በራሱ build አድርጎ deploy ያደርጋል፣ **D1 ዳታቤዙንም በራሱ ይፈጥራል**።

ከኮምፒውተር deploy ለማድረግ፦ `npm install && npx wrangler deploy`

### 2. ሚስጥሮችን ያስቀምጡ
Cloudflare dashboard → Workers → `driver-telegram-bot` → **Settings → Variables and Secrets**፦

| ስም | ምንድን ነው |
|---|---|
| `BOT_TOKEN` | ከ @BotFather የተገኘው token |
| `WEBHOOK_SECRET` | ማንኛውም ረጅም የዘፈቀደ ጽሑፍ (ፊደል፣ ቁጥር፣ `_` `-` ብቻ) |
| `ADMIN_CHAT_ID` | ማመልከቻዎች የሚደርሱበት ቻት — የእርስዎ ID ወይም የግሩፕ ID (`-100...`) |
| `ADMIN_IDS` | (አማራጭ) ማጽደቅ የሚችሉ ሰዎች ID በኮማ፦ `111,222`። ባዶ ከሆነ `ADMIN_CHAT_ID` ብቻ |

አማራጭ (በ `wrangler.toml` ውስጥ `[vars]`)፦ `SUPPORT_CONTACT` (ለምሳሌ `0911000000`)፣ `DRIVER_GROUP_LINK` (ሲጸድቁ የሚላክ የግሩፕ ሊንክ)።

> የራስዎን Telegram ID ለማወቅ ለ @userinfobot መልዕክት ይላኩ። ግሩፕ ከተጠቀሙ ቦቱን ወደ ግሩፑ ያስገቡ።

### 3. ቦቱን ያገናኙ
በብሮውዘር ይክፈቱ (በ `WEBHOOK_SECRET` ይተኩ)፦

```
https://driver-telegram-bot.letarik.workers.dev/setup?key=WEBHOOK_SECRET
```

ይህ webhook፣ የትዕዛዝ ዝርዝሮች እና የ"ምዝገባ" menu አዝራሩን ያዘጋጃል። `"ok": true` ካየ ተጠናቋል። ቦቱን `/start` በማለት ይሞክሩ።

`/health` ገጹ የጎደለ ቅንብር ካለ ያሳያል።

## ማበጀት
- ክፍለ ከተሞች፣ የመንጃ ፈቃድ ደረጃዎች፣ የተሽከርካሪ ዓይነቶች፣ የሚጠየቁ ሰነዶች እና የውድቅ ምክንያቶች፦ `src/constants.js`
- የቅጹ ገጽታ፦ `src/webapp.html`

## የፋይሎች አወቃቀር
```
src/index.js      — router (/, /health, /setup, /api/*, /webhook)
src/bot.js        — የቦቱ ትዕዛዞች እና ፍሰቶች
src/api.js        — የቅጹ API እና ማረጋገጫ
src/auth.js       — የTelegram initData ፊርማ ማረጋገጫ
src/db.js         — D1 (ሰንጠረዦቹ በራሳቸው ይፈጠራሉ)
src/constants.js  — ምርጫዎች እና ጽሑፎች
src/webapp.html   — የምዝገባ ቅጹ
```
