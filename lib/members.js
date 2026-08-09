import { can, canAccessBrand, hasRole, normalizeSessionBrands as normalizeRbacSessionBrands } from "@/lib/rbac";
import { getSessionUserFromRequest } from "@/lib/server-auth";
import { normalizeBrand, sanitizeMultilineText, sanitizeText } from "@/lib/security";

export { getSessionUserFromRequest };

export const MEMBER_BRANDS = ["pharadol", "adisorn"];
export const MEMBER_BRAND_SET = new Set(MEMBER_BRANDS);
export const MEMBER_DEFAULT_PAGE_SIZE = 20;
export const MEMBER_MAX_PAGE_SIZE = 100;
export const MEMBER_STATUSES = [
  "ทดลองงาน",
  "ปกติ",
  "พักงานชั่วคราว",
  "ระงับสมาชิก",
  "ออกจากทีม",
];
export const MEMBER_POSITIONS = [
  "ช่างภาพหลัก",
  "ช่างภาพแคนดิด",
  "ช่างวิดีโอหลัก",
  "ช่างวิดีโอแคนดิด",
  "ผู้ช่วยช่างภาพ",
  "ผู้ช่วยช่างวิดีโอ",
  "ผู้ควบคุมโดรน",
  "ผู้ควบคุมไฟ",
  "ผู้บันทึกเสียง",
  "ช่างตัดต่อภาพ",
  "ช่างตัดต่อวิดีโอ",
  "ผู้ประสานงาน",
  "อื่นๆ",
];
export const MEMBER_GENDERS = ["ชาย", "หญิง", "อื่นๆ"];
export const THAI_BANKS = [
  "ธนาคารกรุงเทพ",
  "ธนาคารกสิกรไทย",
  "ธนาคารกรุงไทย",
  "ธนาคารไทยพาณิชย์",
  "ธนาคารกรุงศรีอยุธยา",
  "ธนาคารทหารไทยธนชาต",
  "ธนาคารออมสิน",
  "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร",
  "ธนาคารเกียรตินาคินภัทร",
  "ธนาคารซีไอเอ็มบี ไทย",
  "ธนาคารยูโอบี",
  "ธนาคารแลนด์ แอนด์ เฮ้าส์",
  "ธนาคารอาคารสงเคราะห์",
  "อื่นๆ",
];
export const THAI_PROVINCES = [
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

const EMAIL_PATTERN = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const PHONE_PATTERN = /^[0-9+\-\s().]{8,20}$/;
const POSTAL_CODE_PATTERN = /^\d{5}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const TEXT_FIELDS = {
  profileImageUrl: ["profile_image_url", 1200],
  firstName: ["first_name", 120],
  lastName: ["last_name", 120],
  nickname: ["nickname", 80],
  birthDate: ["birth_date", 20],
  gender: ["gender", 40],
  genderOther: ["gender_other", 80],
  phone: ["phone", 40],
  email: ["email", 180],
  lineId: ["line_id", 120],
  facebook: ["facebook", 240],
  emergencyContactName: ["emergency_contact_name", 160],
  emergencyContactRelationship: ["emergency_contact_relationship", 80],
  emergencyContactPhone: ["emergency_contact_phone", 40],
  addressHouseNumber: ["address_house_number", 80],
  addressBuildingVillage: ["address_building_village", 160],
  addressMoo: ["address_moo", 40],
  addressSoi: ["address_soi", 120],
  addressRoad: ["address_road", 120],
  addressSubdistrict: ["address_subdistrict", 120],
  addressDistrict: ["address_district", 120],
  addressProvince: ["address_province", 120],
  addressPostalCode: ["address_postal_code", 5],
  bankName: ["bank_name", 120],
  bankNameOther: ["bank_name_other", 120],
  bankAccountName: ["bank_account_name", 160],
  bankAccountNumber: ["bank_account_number", 40],
  position: ["position", 120],
  positionOther: ["position_other", 120],
  status: ["status", 80],
};

export const MEMBER_SELECT_COLUMNS =
  "id,brand,member_code,profile_image_url,first_name,last_name,nickname,birth_date,gender,gender_other,phone,email,line_id,facebook,emergency_contact_name,emergency_contact_relationship,emergency_contact_phone,address_house_number,address_building_village,address_moo,address_soi,address_road,address_subdistrict,address_district,address_province,address_postal_code,bank_name,bank_name_other,bank_account_name,bank_account_number,position,position_other,status,notes,created_at,updated_at,deleted_at,created_by,updated_by,deleted_by";

export const MEMBER_LIST_COLUMNS =
  "id,brand,member_code,profile_image_url,first_name,last_name,nickname,phone,email,line_id,facebook,address_province,position,position_other,status,created_at,updated_at,deleted_at,deleted_by";

export const isAdminUser = (user) => hasRole(user, "SUPER_ADMIN");

export const normalizeSessionBrands = (brands = []) =>
  normalizeRbacSessionBrands(brands).filter((brand) => MEMBER_BRAND_SET.has(brand));

export const resolveAuthorizedBrand = (user, requestedBrand) => {
  const normalizedBrand = normalizeBrand(requestedBrand);

  if (isAdminUser(user)) {
    return normalizedBrand || "";
  }

  const allowedBrands = normalizeSessionBrands(user?.brands);
  if (!normalizedBrand || !allowedBrands.includes(normalizedBrand)) {
    return null;
  }

  return normalizedBrand;
};

export const canAccessMemberBrand = (user, brand) => {
  if (!MEMBER_BRAND_SET.has(brand)) return false;
  return canAccessBrand(user, brand);
};

export const canPermanentlyDeleteMember = (user) =>
  can(user, "members.permanent_delete");

export const parseMemberPage = (value) => {
  const page = Number(value || 0);
  return Number.isFinite(page) ? Math.max(Math.floor(page), 0) : 0;
};

export const parseMemberPageSize = (value) => {
  const pageSize = Number(value || MEMBER_DEFAULT_PAGE_SIZE);
  return Number.isFinite(pageSize)
    ? Math.min(Math.max(Math.floor(pageSize), 1), MEMBER_MAX_PAGE_SIZE)
    : MEMBER_DEFAULT_PAGE_SIZE;
};

export const maskBankAccountNumber = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const tail = digits.slice(-4);
  return `•••• •••• ${tail}`;
};

export const buildMemberAddress = (member = {}) =>
  [
    member.addressHouseNumber,
    member.addressBuildingVillage,
    member.addressMoo ? `หมู่ ${member.addressMoo}` : "",
    member.addressSoi ? `ซ.${member.addressSoi}` : "",
    member.addressRoad ? `ถ.${member.addressRoad}` : "",
    member.addressSubdistrict ? `ต./แขวง ${member.addressSubdistrict}` : "",
    member.addressDistrict ? `อ./เขต ${member.addressDistrict}` : "",
    member.addressProvince,
    member.addressPostalCode,
  ]
    .filter(Boolean)
    .join(" ");

export const mapMemberRow = (row = {}, { includeSensitive = false } = {}) => {
  const member = {
    id: row.id || "",
    brand: row.brand || "",
    memberCode: row.member_code || "",
    profileImageUrl: row.profile_image_url || "",
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    nickname: row.nickname || "",
    birthDate: row.birth_date || "",
    gender: row.gender || "",
    genderOther: row.gender_other || "",
    phone: row.phone || "",
    email: row.email || "",
    lineId: row.line_id || "",
    facebook: row.facebook || "",
    emergencyContactName: row.emergency_contact_name || "",
    emergencyContactRelationship: row.emergency_contact_relationship || "",
    emergencyContactPhone: row.emergency_contact_phone || "",
    addressHouseNumber: row.address_house_number || "",
    addressBuildingVillage: row.address_building_village || "",
    addressMoo: row.address_moo || "",
    addressSoi: row.address_soi || "",
    addressRoad: row.address_road || "",
    addressSubdistrict: row.address_subdistrict || "",
    addressDistrict: row.address_district || "",
    addressProvince: row.address_province || "",
    addressPostalCode: row.address_postal_code || "",
    bankName: row.bank_name || "",
    bankNameOther: row.bank_name_other || "",
    bankAccountName: row.bank_account_name || "",
    bankAccountNumberMasked: maskBankAccountNumber(row.bank_account_number),
    position: row.position || "",
    positionOther: row.position_other || "",
    status: row.status || "ทดลองงาน",
    notes: row.notes || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    deletedAt: row.deleted_at || "",
    createdBy: row.created_by || "",
    updatedBy: row.updated_by || "",
    deletedBy: row.deleted_by || "",
  };

  if (includeSensitive) {
    member.bankAccountNumber = row.bank_account_number || "";
  }

  member.fullName = `${member.firstName} ${member.lastName}`.trim();
  member.addressText = buildMemberAddress(member);
  return member;
};

export const validateMemberPayload = (payload = {}, { partial = false } = {}) => {
  const errors = [];
  const sanitized = {};

  Object.entries(TEXT_FIELDS).forEach(([clientKey, [dbKey, maxLength]]) => {
    if (partial && !Object.prototype.hasOwnProperty.call(payload, clientKey)) return;

    const value =
      clientKey === "notes"
        ? sanitizeMultilineText(payload[clientKey], 2000)
        : sanitizeText(payload[clientKey], maxLength);
    sanitized[dbKey] = value;
  });

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "notes")) {
    sanitized.notes = sanitizeMultilineText(payload.notes, 2000);
  }

  const firstName = sanitized.first_name || "";
  const lastName = sanitized.last_name || "";

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "firstName")) {
    if (!firstName) errors.push("กรุณากรอกชื่อ");
  }
  if (!partial || Object.prototype.hasOwnProperty.call(payload, "lastName")) {
    if (!lastName) errors.push("กรุณากรอกนามสกุล");
  }

  if (sanitized.email && !EMAIL_PATTERN.test(sanitized.email)) {
    errors.push("อีเมลไม่ถูกต้อง");
  }
  if (sanitized.phone && !PHONE_PATTERN.test(sanitized.phone)) {
    errors.push("เบอร์โทรศัพท์ไม่ถูกต้อง");
  }
  if (sanitized.emergency_contact_phone && !PHONE_PATTERN.test(sanitized.emergency_contact_phone)) {
    errors.push("เบอร์โทรศัพท์ผู้ติดต่อฉุกเฉินไม่ถูกต้อง");
  }
  if (sanitized.address_postal_code && !POSTAL_CODE_PATTERN.test(sanitized.address_postal_code)) {
    errors.push("รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก");
  }
  if (sanitized.birth_date) {
    if (!DATE_PATTERN.test(sanitized.birth_date)) {
      errors.push("วันเกิดไม่ถูกต้อง");
    } else {
      const birthDate = new Date(`${sanitized.birth_date}T00:00:00.000Z`);
      const today = new Date();
      const todayOnly = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      if (birthDate.getTime() > todayOnly.getTime()) {
        errors.push("วันเกิดห้ามเป็นวันที่ในอนาคต");
      }
    }
  }
  if (sanitized.gender && !MEMBER_GENDERS.includes(sanitized.gender)) {
    errors.push("เพศไม่ถูกต้อง");
  }
  if (sanitized.position && !MEMBER_POSITIONS.includes(sanitized.position)) {
    errors.push("ตำแหน่งไม่ถูกต้อง");
  }
  if (sanitized.position === "อื่นๆ" && !sanitized.position_other) {
    errors.push("กรุณาระบุตำแหน่ง");
  }
  if (sanitized.status && !MEMBER_STATUSES.includes(sanitized.status)) {
    errors.push("สถานะสมาชิกไม่ถูกต้อง");
  }
  if (sanitized.bank_name === "อื่นๆ" && !sanitized.bank_name_other) {
    errors.push("กรุณาระบุชื่อธนาคาร");
  }

  if (!partial && !sanitized.status) {
    sanitized.status = "ทดลองงาน";
  }

  Object.keys(sanitized).forEach((key) => {
    if (sanitized[key] === undefined) delete sanitized[key];
  });

  return {
    valid: errors.length === 0,
    errors,
    data: sanitized,
  };
};

export const getMemberReadableError = (error) => {
  const message = String(error?.message || error || "");

  if (message.includes("members") || message.includes("member_sequences")) {
    return "ยังไม่ได้สร้างตาราง members กรุณารันไฟล์ supabase-members.sql";
  }
  if (message.includes("duplicate key") || error?.code === "23505") {
    return "รหัสสมาชิกซ้ำ กรุณาลองบันทึกอีกครั้ง";
  }

  return message || "ทำรายการสมาชิกไม่สำเร็จ";
};
