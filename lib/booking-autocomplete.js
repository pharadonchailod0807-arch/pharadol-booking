import { supabase } from "@/lib/supabase";

export const AUTOCOMPLETE_FIELDS = [
  "customerName",
  "phone",
  "service",
  "location",
];

const THAI_PROVINCES = [
  "กรุงเทพมหานคร",
  "กระบี่",
  "กาญจนบุรี",
  "กาฬสินธุ์",
  "กำแพงเพชร",
  "ขอนแก่น",
  "จันทบุรี",
  "ฉะเชิงเทรา",
  "ชลบุรี",
  "ชัยนาท",
  "ชัยภูมิ",
  "ชุมพร",
  "เชียงราย",
  "เชียงใหม่",
  "ตรัง",
  "ตราด",
  "ตาก",
  "นครนายก",
  "นครปฐม",
  "นครพนม",
  "นครราชสีมา",
  "นครศรีธรรมราช",
  "นครสวรรค์",
  "นนทบุรี",
  "นราธิวาส",
  "น่าน",
  "บึงกาฬ",
  "บุรีรัมย์",
  "ปทุมธานี",
  "ประจวบคีรีขันธ์",
  "ปราจีนบุรี",
  "ปัตตานี",
  "พระนครศรีอยุธยา",
  "พะเยา",
  "พังงา",
  "พัทลุง",
  "พิจิตร",
  "พิษณุโลก",
  "เพชรบุรี",
  "เพชรบูรณ์",
  "แพร่",
  "ภูเก็ต",
  "มหาสารคาม",
  "มุกดาหาร",
  "แม่ฮ่องสอน",
  "ยโสธร",
  "ยะลา",
  "ร้อยเอ็ด",
  "ระนอง",
  "ระยอง",
  "ราชบุรี",
  "ลพบุรี",
  "ลำปาง",
  "ลำพูน",
  "เลย",
  "ศรีสะเกษ",
  "สกลนคร",
  "สงขลา",
  "สตูล",
  "สมุทรปราการ",
  "สมุทรสงคราม",
  "สมุทรสาคร",
  "สระแก้ว",
  "สระบุรี",
  "สิงห์บุรี",
  "สุโขทัย",
  "สุพรรณบุรี",
  "สุราษฎร์ธานี",
  "สุรินทร์",
  "หนองคาย",
  "หนองบัวลำภู",
  "อ่างทอง",
  "อำนาจเจริญ",
  "อุดรธานี",
  "อุตรดิตถ์",
  "อุทัยธานี",
  "อุบลราชธานี",
];

const DEFAULT_OPTIONS = {
  customerName: [],
  phone: [],
  service: [
    "งานแต่งงาน",
    "งานหมั้น",
    "งานรับปริญญา",
    "งานบวช",
    "งานอีเวนต์",
    "งานประชุม",
    "ช่างภาพหลัก",
    "ช่างภาพแคนดิด",
    "ช่างภาพวิดีโอ",
    "ผู้ช่วยช่างภาพ",
    "QR Code",
    "Video Guestbook",
    "Photo Booth",
    "โดรน",
    "ค่าเดินทาง/ที่พัก",
    "แพ็กเกจภาพนิ่ง 1",
    "แพ็กเกจภาพนิ่ง 2",
    "แพ็กเกจภาพนิ่ง 3",
    "แพ็กเกจภาพนิ่ง 1 Plus",
    "แพ็กเกจภาพนิ่ง 2 Plus",
    "แพ็กเกจภาพนิ่ง 3 Plus",
    "แพ็กเกจวิดีโอ 1",
    "แพ็กเกจวิดีโอ 2",
    "แพ็กเกจวิดีโอ 3",
    "แพ็กเกจวิดีโอ 1 Plus",
    "แพ็กเกจวิดีโอ 2 Plus",
    "แพ็กเกจวิดีโอ 3 Plus",
  ],
  location: [
    ...THAI_PROVINCES,
    "โรงแรมแคนทารี โคราช",
    "โรงแรมเซ็นทารา โคราช",
    "โรงแรมสีมาธานี",
    "โรงแรมฟอร์จูน โคราช",
    "เดอะมอลล์ โคราช",
    "Terminal 21 Korat",
    "เขาใหญ่",
    "ปากช่อง",
  ],
};

const FIELD_TO_BOOKING_KEY = {
  customerName: "customerName",
  phone: "phone",
  service: "service",
  location: "location",
};

const normalizeAutocompleteValue = (value) =>
  String(value || "").replace(/\s+/g, " ").trim();

export const isMissingAutocompleteTableError = (error) =>
  error?.code === "PGRST205" ||
  String(error?.message || "").includes("autocomplete_history");

const uniqueSortedValues = (values) =>
  [...new Set(values.map(normalizeAutocompleteValue).filter(Boolean))].sort(
    (firstValue, secondValue) => firstValue.localeCompare(secondValue, "th")
  );

export const getDefaultAutocompleteOptions = () =>
  AUTOCOMPLETE_FIELDS.reduce((options, fieldName) => {
    options[fieldName] = uniqueSortedValues(DEFAULT_OPTIONS[fieldName] || []);
    return options;
  }, {});

export const getAutocompleteOptionsFromBookings = (bookings = []) =>
  AUTOCOMPLETE_FIELDS.reduce((options, fieldName) => {
    const bookingKey = FIELD_TO_BOOKING_KEY[fieldName];
    options[fieldName] = uniqueSortedValues(
      bookings.map((booking) => booking?.[bookingKey])
    );
    return options;
  }, {});

export const mergeAutocompleteOptions = (...optionGroups) =>
  AUTOCOMPLETE_FIELDS.reduce((mergedOptions, fieldName) => {
    mergedOptions[fieldName] = uniqueSortedValues(
      optionGroups.flatMap((optionGroup) => optionGroup?.[fieldName] || [])
    );
    return mergedOptions;
  }, {});

export const getAutocompleteSuggestions = (
  options,
  fieldName,
  inputValue,
  limit = 3
) => {
  const query = normalizeAutocompleteValue(inputValue).toLocaleLowerCase("th");
  if (!query) return [];

  const rankedOptions = (options?.[fieldName] || []).reduce(
    (matches, option) => {
      const normalizedOption = option.toLocaleLowerCase("th");
      if (normalizedOption.startsWith(query)) {
        matches.startsWith.push(option);
      } else if (normalizedOption.includes(query)) {
        matches.includes.push(option);
      }

      return matches;
    },
    { startsWith: [], includes: [] }
  );

  return [...rankedOptions.startsWith, ...rankedOptions.includes].slice(
    0,
    limit
  );
};

export const fetchGooglePlaceSuggestions = async (inputValue) => {
  const input = normalizeAutocompleteValue(inputValue);
  if (input.length < 2) return [];

  const response = await fetch(
    `/api/google-places/autocomplete?input=${encodeURIComponent(input)}`
  );

  if (!response.ok) {
    throw new Error("Cannot load Google Places suggestions");
  }

  const payload = await response.json();
  if (payload.configured === false) {
    const error = new Error("Google Places API key is not configured");
    error.code = "GOOGLE_PLACES_API_KEY_MISSING";
    throw error;
  }

  return Array.isArray(payload.suggestions) ? payload.suggestions : [];
};

export const loadAutocompleteOptions = async (brandId) => {
  const { data, error } = await supabase
    .from("autocomplete_history")
    .select("field_name,value")
    .eq("brand_id", brandId)
    .in("field_name", AUTOCOMPLETE_FIELDS)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return AUTOCOMPLETE_FIELDS.reduce((options, fieldName) => {
    options[fieldName] = uniqueSortedValues(
      (data || [])
        .filter((item) => item.field_name === fieldName)
        .map((item) => item.value)
    );
    return options;
  }, {});
};

export const saveAutocompleteHistory = async (brandId, booking) => {
  const rows = AUTOCOMPLETE_FIELDS.map((fieldName) => ({
    brand_id: brandId,
    field_name: fieldName,
    value: normalizeAutocompleteValue(booking?.[FIELD_TO_BOOKING_KEY[fieldName]]),
    updated_at: new Date().toISOString(),
  })).filter((row) => row.value);

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("autocomplete_history")
    .upsert(rows, { onConflict: "brand_id,field_name,value" });

  if (error) {
    throw error;
  }
};
