// የCabby ምዝገባ ደንቦች እና ምርጫዎች
// ደንቦቹ (ዕድሜ፣ የመኪና ዓመት፣ ደረጃዎች፣ ሰሌዳ፣ ሰነዶች…) በዳሽቦርዱ "ቅንብሮች" ገጽ ይቀየራሉ፤ እዚህ ያሉት መነሻ እሴቶች ናቸው።
// እሴቶቹ (codes) በዳታቤዝ ይቀመጣሉ፤ የሚታዩት ስሞች በ i18n.js ውስጥ በ4 ቋንቋ ናቸው።

export const RULE_DEFAULTS = {
  min_age: 18,
  max_age: 70,
  max_vehicle_age: 10,          // ከተመረተ ከ10 ዓመት ያልበለጠ
  inspection_after_years: 8,    // ከ8 ዓመት በላይ የሆነ መኪና ፍተሻ ያስፈልገዋል
  accepted_grades: ["ሕዝብ 1", "ሕዝብ 2", "ሕዝብ 3", "ደረቅ 1", "ደረቅ 2", "ደረቅ 3", "ፈሳሽ 1", "ፈሳሽ 2"],
  allowed_plate_codes: [],      // ባዶ = ሁሉም ይቀበላሉ፤ ለምሳሌ ["1", "3"]
  green_fuels: ["hybrid", "electric"],
  disabled_docs: [],            // የማይጠየቁ ሰነዶች
  test_for_no_car: true,        // መኪና የሌላቸው የቃል እና የተግባር ፈተና
  require_orientation: true,    // ለስራ ዝግጁ ከማድረግ በፊት ስልጠና
  agent_commission: 0,          // ለሴልስ የመነሻ ኮሚሽን (ብር) — ካምፔኑ የራሱ ከሌለው
};
export const SMS_KINDS = ["submitted", "docs_approved", "doc_rerequest", "appt", "passed", "activated", "rejected", "suspended", "unsuspended", "license_expiry", "appt_reminder", "otp"];
export const SMS_DEFAULTS = { enabled: false, token: "", sender: "", identifier: "", monthly_limit: 2000, kinds: Object.fromEntries(SMS_KINDS.map((k) => [k, true])) };
export const LINK_KEYS = ["SHARE_ANDROID_URL", "SHARE_IOS_URL", "RESERVE_ANDROID_URL", "RESERVE_IOS_URL", "DRIVER_GROUP_LINK", "SUPPORT_CONTACT", "REFERRAL_REWARD"];

// በእያንዳንዱ ጥያቄ ከዳታቤዝ ይሞላሉ (applySettings)
export let MIN_AGE = RULE_DEFAULTS.min_age;
export let MAX_AGE = RULE_DEFAULTS.max_age;
export let MAX_VEHICLE_AGE = RULE_DEFAULTS.max_vehicle_age;
export let INSPECTION_AFTER_YEARS = RULE_DEFAULTS.inspection_after_years;
export let ACCEPTED_GRADES = RULE_DEFAULTS.accepted_grades;
export let ALLOWED_PLATE_CODES = null;
export let GREEN_FUELS = RULE_DEFAULTS.green_fuels;
export let DISABLED_DOCS = [];
export let TEST_FOR_NO_CAR = true;
export let REQUIRE_ORIENTATION = true;
export let LINKS = {};
export let AGENT_COMMISSION = 0;
export let SETTINGS_VERSION = 0;

export function applySettings({ rules = {}, links = {}, version = 0 } = {}) {
  const r = { ...RULE_DEFAULTS, ...rules };
  MIN_AGE = r.min_age; MAX_AGE = r.max_age; MAX_VEHICLE_AGE = r.max_vehicle_age; INSPECTION_AFTER_YEARS = r.inspection_after_years;
  ACCEPTED_GRADES = r.accepted_grades; ALLOWED_PLATE_CODES = r.allowed_plate_codes?.length ? r.allowed_plate_codes : null;
  GREEN_FUELS = r.green_fuels; DISABLED_DOCS = r.disabled_docs ?? []; TEST_FOR_NO_CAR = r.test_for_no_car !== false; REQUIRE_ORIENTATION = r.require_orientation !== false;
  LINKS = links ?? {};
  AGENT_COMMISSION = Number(r.agent_commission) || 0;
  SETTINGS_VERSION = version;
}
/** ቅንብሮች ውስጥ ያለ ሊንክ፣ ከሌለ የwrangler.toml እሴት */
export const cfg = (env, key) => (LINKS[key] ?? "").trim() || env?.[key] || "";

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

export const EXPERIENCE = ["lt1", "1_2", "3_5", "6_10", "10p"];
export const PREV_PLATFORMS = ["none", "Ride", "Feres", "ZayRide", "Yango", "other"];
export const VEHICLE_MODES = ["own", "other", "none"];
export const VEHICLE_TYPES = ["sedan", "hatchback", "suv", "minivan", "minibus", "pickup", "other"];
export const VEHICLE_MAKES = [
  "Toyota", "Hyundai", "Suzuki", "Nissan", "Honda", "Kia", "Volkswagen", "Lifan", "BYD",
  "Geely", "Chery", "Mercedes-Benz", "Mitsubishi", "Ford", "Peugeot", "Daihatsu", "other",
];
export const FUEL_TYPES = ["petrol", "diesel", "hybrid", "electric"];
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
export const CORE_DOCS = ["license", "id", "selfie"]; // ሁልጊዜ የሚጠየቁ
export const requiredDocs = (d) => DOCUMENTS.filter((x) => (!x.when || x.when(d)) && !DISABLED_DOCS.includes(x.kind));

export const REJECT_REASONS = ["blurry", "expired", "mismatch", "vehicle", "experience", "test_oral", "test_practical", "inspection", "no_show", "complaint", "conduct", "other"];

// ሁኔታዎች (statuses)
export const STATUSES = ["awaiting_docs", "pending", "test", "inspection", "orientation", "active", "rejected", "suspended"];
export const SUSPEND_REASONS = ["expired", "mismatch", "vehicle", "complaint", "conduct", "other"];
export const APPOINTMENT_STAGES = ["test", "inspection", "orientation"];

export const vehicleAge = (d, year) => (d.vehicle_year ? year - d.vehicle_year : null);
export const isGreen = (d) => GREEN_FUELS.includes(d.fuel_type);

/** ሰነዶቹ ከጸደቁ በኋላ የሚቀጥለው ደረጃ */
export function stageAfterDocs(d, year = new Date().getFullYear()) {
  if (d.vehicle_mode === "none" && TEST_FOR_NO_CAR) return "test";        // መኪና የሌለው → የቃል እና የተግባር ፈተና
  if (d.vehicle_mode !== "none" && vehicleAge(d, year) > INSPECTION_AFTER_YEARS) return "inspection"; // ከ8 ዓመት በላይ → ፍተሻ
  return REQUIRE_ORIENTATION ? "orientation" : "active";
}
/** ፈተና/ፍተሻ ካለፈ በኋላ */
export const stageAfterPass = () => (REQUIRE_ORIENTATION ? "orientation" : "active");

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
