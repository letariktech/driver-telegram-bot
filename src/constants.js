// የቅጹ ምርጫዎች፣ የሰነድ ዓይነቶች እና የውድቅ ምክንያቶች — እዚህ በማስተካከል ቦቱን ማበጀት ይቻላል

export const SUB_CITIES = [
  "አዲስ ከተማ", "አቃቂ ቃሊቲ", "አራዳ", "ቦሌ", "ጉለሌ", "ቂርቆስ",
  "ኮልፌ ቀራኒዮ", "ልደታ", "ንፋስ ስልክ ላፍቶ", "የካ", "ለሚ ኩራ", "ከአዲስ አበባ ውጪ",
];

export const LICENSE_GRADES = [
  "አውቶሞቢል", "ሕዝብ 1", "ሕዝብ 2", "ሕዝብ 3",
  "ደረቅ 1", "ደረቅ 2", "ደረቅ 3", "ፈሳሽ 1", "ፈሳሽ 2", "ሞተር ሳይክል", "ሌላ",
];

export const VEHICLE_TYPES = [
  "ሴዳን", "ሀችባክ", "SUV", "ሚኒቫን", "ሚኒባስ", "ፒካፕ", "ሌላ",
];

export const PLATE_REGIONS = [
  "አዲስ አበባ", "ኢትዮጵያ (ፌዴራል)", "ኦሮሚያ", "አማራ", "ትግራይ", "ድሬዳዋ", "ሐረሪ",
  "ሶማሌ", "አፋር", "ቤንሻንጉል ጉሙዝ", "ጋምቤላ", "ሲዳማ", "ደቡብ ምዕራብ ኢትዮጵያ",
  "ማዕከላዊ ኢትዮጵያ", "ደቡብ ኢትዮጵያ",
];

// የሚጠየቁ ሰነዶች በቅደም ተከተል (vehicleOnly = ተሽከርካሪ ላላቸው ብቻ)
export const DOCUMENTS = [
  { kind: "license", label: "መንጃ ፈቃድ", prompt: "የ<b>መንጃ ፈቃድዎን</b> ፊት ለፊት ፎቶ ይላኩ። ጽሑፉ በግልጽ መነበብ አለበት።" },
  { kind: "id", label: "መታወቂያ", prompt: "የ<b>ቀበሌ/ፋይዳ መታወቂያዎን</b> ፎቶ ይላኩ።" },
  { kind: "selfie", label: "የራስ ፎቶ", prompt: "ፊትዎ በግልጽ የሚታይ <b>የራስዎን ፎቶ</b> (selfie) ይላኩ።" },
  { kind: "libre", label: "ሊብሬ", prompt: "የተሽከርካሪውን <b>ሊብሬ</b> (የባለቤትነት ማረጋገጫ) ፎቶ ይላኩ።", vehicleOnly: true },
];

export const REJECT_REASONS = {
  blurry: "የላኳቸው ሰነዶች በግልጽ አይነበቡም",
  expired: "መንጃ ፈቃድዎ ጊዜው አልፎበታል",
  mismatch: "ያስገቡት መረጃ ከሰነዶቹ ጋር አይጣጣምም",
  incomplete: "ሰነዶቹ ያልተሟሉ ናቸው",
  vehicle: "ተሽከርካሪው መስፈርቱን አያሟላም",
  other: "መረጃዎ መስፈርቱን አላሟላም",
};

export const STATUS_LABELS = {
  awaiting_docs: "📎 ሰነድ በመጠበቅ ላይ",
  pending: "⏳ በግምገማ ላይ",
  approved: "✅ ጸድቋል",
  rejected: "❌ ውድቅ ተደርጓል",
};

export const requiredDocs = (driver) =>
  DOCUMENTS.filter((d) => !d.vehicleOnly || driver.has_vehicle);

export function normalizePhone(raw) {
  const m = String(raw ?? "").replace(/[\s\-()]/g, "").match(/^(?:\+?251|0)?([79]\d{8})$/);
  return m ? `+251${m[1]}` : null;
}
