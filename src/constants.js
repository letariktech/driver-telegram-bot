// የCabby ምዝገባ ደንቦች እና ምርጫዎች — እዚህ በማስተካከል ቦቱን ማበጀት ይቻላል
// እሴቶቹ (codes) በዳታቤዝ ይቀመጣሉ፤ የሚታዩት ስሞች በ i18n.js ውስጥ በ4 ቋንቋ ናቸው።

export const MIN_AGE = 18;
export const MAX_AGE = 70;
export const MAX_VEHICLE_AGE = 10;       // ከተመረተ ከ10 ዓመት ያልበለጠ
export const INSPECTION_AFTER_YEARS = 8; // ከ8 ዓመት በላይ የሆነ መኪና ፍተሻ ያስፈልገዋል
export const ALLOWED_PLATE_CODES = null; // ለምሳሌ ["1", "3"] — null ማለት ሁሉም ይቀበላሉ

export const LANGS = ["am", "en", "om", "ti"];

export const SERVICES = ["share", "reserve"];

export const SUB_CITIES = [
  "አዲስ ከተማ", "አቃቂ ቃሊቲ", "አራዳ", "ቦሌ", "ጉለሌ", "ቂርቆስ",
  "ኮልፌ ቀራኒዮ", "ልደታ", "ንፋስ ስልክ ላፍቶ", "የካ", "ለሚ ኩራ", "ከአዲስ አበባ ውጪ",
];

export const SPOKEN = ["am", "om", "en", "ti", "so", "other"];

export const LICENSE_GRADES = [
  "ሕዝብ 1", "ሕዝብ 2", "ሕዝብ 3", "ደረቅ 1", "ደረቅ 2", "ደረቅ 3", "ፈሳሽ 1", "ፈሳሽ 2", "አውቶሞቢል", "ሞተር ሳይክል",
];
// ሕዝብ 1 እና ከዚያ በላይ ብቻ
export const ACCEPTED_GRADES = ["ሕዝብ 1", "ሕዝብ 2", "ሕዝብ 3", "ደረቅ 1", "ደረቅ 2", "ደረቅ 3", "ፈሳሽ 1", "ፈሳሽ 2"];

export const EXPERIENCE = ["lt1", "1_2", "3_5", "6_10", "10p"];
export const PREV_PLATFORMS = ["none", "Ride", "Feres", "ZayRide", "Yango", "other"];
export const VEHICLE_MODES = ["own", "other", "none"];
export const VEHICLE_TYPES = ["sedan", "hatchback", "suv", "minivan", "minibus", "pickup", "other"];
export const VEHICLE_MAKES = [
  "Toyota", "Hyundai", "Suzuki", "Nissan", "Honda", "Kia", "Volkswagen", "Lifan", "BYD",
  "Geely", "Chery", "Mercedes-Benz", "Mitsubishi", "Ford", "Peugeot", "Daihatsu", "other",
];
export const FUEL_TYPES = ["petrol", "diesel", "hybrid", "electric"];
export const GREEN_FUELS = ["hybrid", "electric"]; // ቅድሚያ እና ልዩ ጥቅም
export const SEATS = ["4", "5", "6", "7+"];
export const PLATE_REGIONS = [
  "አዲስ አበባ", "ኢትዮጵያ (ፌዴራል)", "ኦሮሚያ", "አማራ", "ትግራይ", "ድሬዳዋ", "ሐረሪ",
  "ሶማሌ", "አፋር", "ቤንሻንጉል ጉሙዝ", "ጋምቤላ", "ሲዳማ", "ደቡብ ምዕራብ ኢትዮጵያ", "ማዕከላዊ ኢትዮጵያ", "ደቡብ ኢትዮጵያ",
];
export const SHIFTS = ["day", "night", "full", "flex"];
export const PHONE_TYPES = ["android", "ios", "none"];

const hasCar = (d) => d.vehicle_mode === "own" || d.vehicle_mode === "other";

// የሚጠየቁ ሰነዶች በቅደም ተከተል (ስሞቹ በ i18n.js)
export const DOCUMENTS = [
  { kind: "license" },
  { kind: "license_back" },
  { kind: "id" },
  { kind: "selfie" },
  { kind: "police" },
  { kind: "tin" },
  { kind: "libre", when: hasCar },
  { kind: "insurance", when: hasCar },
  { kind: "bolo", when: hasCar },
  { kind: "car_front", when: hasCar },
  { kind: "car_interior", when: hasCar },
  { kind: "authorization", when: (d) => d.vehicle_mode === "other" },
];
export const requiredDocs = (d) => DOCUMENTS.filter((x) => !x.when || x.when(d));

export const REJECT_REASONS = ["blurry", "expired", "mismatch", "vehicle", "experience", "test_oral", "test_practical", "inspection", "no_show", "other"];

// ሁኔታዎች (statuses)
export const STATUSES = ["awaiting_docs", "pending", "test", "inspection", "orientation", "active", "rejected", "suspended"];
export const APPOINTMENT_STAGES = ["test", "inspection", "orientation"];

export const vehicleAge = (d, year) => (d.vehicle_year ? year - d.vehicle_year : null);
export const isGreen = (d) => GREEN_FUELS.includes(d.fuel_type);

/** ሰነዶቹ ከጸደቁ በኋላ የሚቀጥለው ደረጃ */
export function stageAfterDocs(d, year = new Date().getFullYear()) {
  if (d.vehicle_mode === "none") return "test";                     // መኪና የሌለው → የቃል እና የተግባር ፈተና
  if (vehicleAge(d, year) > INSPECTION_AFTER_YEARS) return "inspection"; // ከ8 ዓመት በላይ → ፍተሻ
  return "orientation";
}

export function normalizePhone(raw) {
  const m = String(raw ?? "").replace(/[\s\-()]/g, "").match(/^(?:\+?251|0)?([79]\d{8})$/);
  return m ? `+251${m[1]}` : null;
}

export function ageOn(dob, today) {
  const [y, m, d] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

export const addisToday = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
