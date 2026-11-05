// የቅጹ ምርጫዎች፣ ሰነዶች፣ ሁኔታዎች እና የውድቅ ምክንያቶች — እዚህ በማስተካከል ቦቱን ማበጀት ይቻላል

export const MIN_AGE = 21;            // ዝቅተኛ የአሽከርካሪ ዕድሜ
export const MAX_AGE = 70;
export const MIN_VEHICLE_YEAR = 1990; // ከዚህ በፊት የተመረቱ መኪኖች አይቀበሉም

export const SERVICES = ["Cabby Share", "Cabby Reserve"];

export const SUB_CITIES = [
  "አዲስ ከተማ", "አቃቂ ቃሊቲ", "አራዳ", "ቦሌ", "ጉለሌ", "ቂርቆስ",
  "ኮልፌ ቀራኒዮ", "ልደታ", "ንፋስ ስልክ ላፍቶ", "የካ", "ለሚ ኩራ", "ከአዲስ አበባ ውጪ",
];

export const LANGUAGES = ["አማርኛ", "Afaan Oromoo", "English", "ትግርኛ", "Af-Soomaali", "ሌላ"];

export const LICENSE_GRADES = [
  "አውቶሞቢል", "ሕዝብ 1", "ሕዝብ 2", "ሕዝብ 3",
  "ደረቅ 1", "ደረቅ 2", "ደረቅ 3", "ፈሳሽ 1", "ፈሳሽ 2", "ሌላ",
];

export const EXPERIENCE = ["ከ1 ዓመት በታች", "1–2 ዓመት", "3–5 ዓመት", "6–10 ዓመት", "ከ10 ዓመት በላይ"];

export const PREV_PLATFORMS = ["የለም", "Ride", "Feres", "ZayRide", "Yango", "ሌላ"];

export const VEHICLE_MODES = {
  own: "የራሴ መኪና አለኝ",
  other: "የሌላ ሰው መኪና እነዳለሁ",
  none: "መኪና የለኝም",
};

export const VEHICLE_TYPES = ["ሴዳን", "ሀችባክ", "SUV", "ሚኒቫን", "ሚኒባስ", "ሌላ"];
export const SEATS = ["4", "5", "6", "7+"];

export const PLATE_REGIONS = [
  "አዲስ አበባ", "ኢትዮጵያ (ፌዴራል)", "ኦሮሚያ", "አማራ", "ትግራይ", "ድሬዳዋ", "ሐረሪ",
  "ሶማሌ", "አፋር", "ቤንሻንጉል ጉሙዝ", "ጋምቤላ", "ሲዳማ", "ደቡብ ምዕራብ ኢትዮጵያ",
  "ማዕከላዊ ኢትዮጵያ", "ደቡብ ኢትዮጵያ",
];

export const SHIFTS = ["ቀን", "ማታ", "ሙሉ ቀን", "እንደ ሁኔታው"];
export const PHONE_TYPES = ["Android", "iPhone", "ስማርት ስልክ የለኝም"];

const hasCar = (d) => d.vehicle_mode === "own" || d.vehicle_mode === "other" || (!d.vehicle_mode && d.has_vehicle);

// የሚጠየቁ ሰነዶች በቅደም ተከተል
export const DOCUMENTS = [
  { kind: "license", label: "መንጃ ፈቃድ", prompt: "የ<b>መንጃ ፈቃድዎን</b> ፊት ለፊት ፎቶ ይላኩ። ጽሑፉ በግልጽ መነበብ አለበት።" },
  { kind: "id", label: "መታወቂያ", prompt: "የ<b>ፋይዳ ወይም የቀበሌ መታወቂያዎን</b> ፎቶ ይላኩ።" },
  { kind: "selfie", label: "የራስ ፎቶ", prompt: "ፊትዎ በግልጽ የሚታይ <b>የራስዎን ፎቶ</b> (selfie) ይላኩ። መነጽር ወይም ኮፍያ አያድርጉ።" },
  { kind: "libre", label: "ሊብሬ", prompt: "የመኪናውን <b>ሊብሬ</b> ፎቶ ይላኩ።", when: hasCar },
  { kind: "insurance", label: "መድን", prompt: "የመኪናውን <b>የመድን ዋስትና ሰርተፊኬት</b> ፎቶ ይላኩ።", when: hasCar },
  { kind: "bolo", label: "ቦሎ", prompt: "የመኪናውን <b>የዓመታዊ ምርመራ (ቦሎ)</b> ማረጋገጫ ፎቶ ይላኩ።", when: hasCar },
  { kind: "car_front", label: "የመኪና ፊት", prompt: "<b>የመኪናውን ፊት ለፊት</b> ፎቶ ይላኩ — ሰሌዳው በግልጽ መታየት አለበት።", when: hasCar },
  { kind: "car_interior", label: "የመኪና ውስጥ", prompt: "<b>የመኪናውን ውስጥ (የተሳፋሪ መቀመጫዎች)</b> ፎቶ ይላኩ።", when: hasCar },
  { kind: "authorization", label: "የባለቤት ውክልና", prompt: "መኪናውን ለመንዳት የሚያስችልዎ <b>የባለቤቱ የውክልና/የፈቃድ ደብዳቤ</b> ፎቶ ይላኩ።", when: (d) => d.vehicle_mode === "other" },
];

export const requiredDocs = (driver) => DOCUMENTS.filter((d) => !d.when || d.when(driver));

export const REJECT_REASONS = {
  blurry: "የላኳቸው ሰነዶች በግልጽ አይነበቡም",
  expired: "መንጃ ፈቃድዎ ወይም የመኪናው ሰነዶች ጊዜያቸው አልፏል",
  mismatch: "ያስገቡት መረጃ ከሰነዶቹ ጋር አይጣጣምም",
  vehicle: "መኪናው የCabby መስፈርትን አያሟላም",
  experience: "የማሽከርከር ልምድዎ በቂ አይደለም",
  test: "በተግባር የማሽከርከር ፈተና አላለፉም",
  other: "ማመልከቻዎ መስፈርቱን አላሟላም",
};

export const STATUS_LABELS = {
  awaiting_docs: "📎 ሰነድ በመጠበቅ ላይ",
  pending: "⏳ ሰነዶች በግምገማ ላይ",
  docs_ok: "📅 የፈተና ቀጠሮ በመጠበቅ ላይ",
  test_scheduled: "🚗 የተግባር ፈተና ተቀጥሯል",
  active: "✅ ገቢር (Active)",
  rejected: "❌ ውድቅ ተደርጓል",
  suspended: "⛔ ታግዷል",
};

export function normalizePhone(raw) {
  const m = String(raw ?? "").replace(/[\s\-()]/g, "").match(/^(?:\+?251|0)?([79]\d{8})$/);
  return m ? `+251${m[1]}` : null;
}

export function ageOn(dob, today) {
  const [y, m, d] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}
