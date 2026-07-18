"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Barcode from "react-barcode";
import { supabase } from "@/lib/supabase";
import {
  formatBookingNumber,
  getNextAvailableBookingNumber,
  getNextBookingSequence,
} from "@/lib/booking-number";
import {
  fetchGooglePlaceSuggestions,
  getAutocompleteOptionsFromBookings,
  getAutocompleteSuggestions,
  getDefaultAutocompleteOptions,
  isMissingAutocompleteTableError,
  loadAutocompleteOptions,
  mergeAutocompleteOptions,
  saveAutocompleteHistory,
} from "@/lib/booking-autocomplete";
import {
  getPendingBookingPrefillKey,
  updateLocalCustomerRequest,
} from "@/app/lib/customerRequests";

const BRAND_ID = "adisorn";
const BRAND_BASE_PATH = "/adisorn";
const ROUTES = {
  home: BRAND_BASE_PATH,
  archives: `${BRAND_BASE_PATH}/archives`,
  booking: BRAND_BASE_PATH,
  bookingView: `${BRAND_BASE_PATH}?view`,
  calendar: `${BRAND_BASE_PATH}/calendar`,
  customers: `${BRAND_BASE_PATH}/customers`,
  dashboard: `${BRAND_BASE_PATH}/dashboard`,
  income: `${BRAND_BASE_PATH}/income`,
  notifications: `${BRAND_BASE_PATH}/notifications`,
  reports: `${BRAND_BASE_PATH}/reports`,
  settings: `${BRAND_BASE_PATH}/settings`,
  trash: `${BRAND_BASE_PATH}/trash`,
};

const CUSTOMERS_KEY = "adisorn_customers";
const SELECTED_BOOKING_KEY = "adisorn_selectedBooking";
const CURRENT_BOOKING_KEY = "adisorn_currentBooking";
const CUSTOM_BOOKING_NUMBER_KEY = "adisorn_customBookingNumber";
const BOOKING_NUMBER_MODE_KEY = "adisorn_bookingNumberMode";
const BOOKING_NUMBER_UPDATED_EVENT = "adisorn:booking-number-updated";
const BOOKING_NUMBER_CHANNEL = "adisorn-booking-number";
const NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY =
  "adisorn_nextBookingSequenceOverride";
const RESET_BOOKING_SEQUENCE_ACTIVE_KEY =
  "adisorn_resetBookingSequenceActive";
const BOOKING_DRAFT_KEY = "adisorn_bookingDraft";
const PENDING_BOOKING_PREFILL_KEY = getPendingBookingPrefillKey(BRAND_ID);
const PAYMENT_RECEIPTS_KEY = "adisorn_paymentReceipts";
const ARCHIVES_KEY = "adisorn_archives";
const SECURITY_PIN_KEY = "adisorn_securityPin";
const SECURITY_UNLOCKED_KEY = "adisorn_securityUnlocked";
const AUTO_LOCK_MINUTES = 15;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_CALENDAR_COLOR = "#111827";
const CALENDAR_COLOR_OPTIONS = [
  { label: "ฟ้า", value: "#3B82F6" },
  { label: "เขียว", value: "#10B981" },
  { label: "แดง/ชมพู", value: "#EF4444" },
  { label: "ส้ม", value: "#F97316" },
  { label: "ม่วง", value: "#8B5CF6" },
  { label: "เหลืองทอง", value: "#F59E0B" },
  { label: "เทาเข้ม", value: "#374151" },
  { label: "ดำ", value: "#111827" },
];

const readArrayFromStorage = (...keys) => {
  for (const key of keys) {
    try {
      const rawValue = localStorage.getItem(key);
      if (!rawValue) continue;

      const parsedValue = JSON.parse(rawValue);
      if (Array.isArray(parsedValue)) return parsedValue;
    } catch (error) {
      console.error(`Cannot read localStorage key: ${key}`, error);
    }
  }

  return [];
};

const getPaymentProgress = (totalPaid, finalPrice) => {
  if (totalPaid <= 0) return "ยังไม่ชำระ";
  if (finalPrice > 0 && totalPaid >= finalPrice) return "ชำระครบแล้ว";
  return "ชำระบางส่วน";
};

const getPaymentDisplayStatus = (paymentType, paidAmount) => {
  if (Number(paidAmount || 0) <= 0) return "ยังไม่ชำระ";
  if (paymentType === "เต็มจำนวน") return "ชำระแล้ว";
  if (paymentType === "มัดจำ") return "ชำระแล้ว(มัดจำ)";
  return "ชำระแล้ว";
};

const getPaymentDisplayStatusClass = (status) => {
  if (status === "ชำระแล้ว") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "ชำระแล้ว(มัดจำ)") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-zinc-200 bg-zinc-50 text-zinc-600";
};

const isDuplicateBookingNumberError = (error) =>
  error?.code === "23505" ||
  String(error?.message || "").includes("bookings_booking_number_key") ||
  String(error?.message || "").toLowerCase().includes("duplicate key");

const getGoogleClientSecretEnvLabel = () =>
  "ADISORN_GOOGLE_CLIENT_ID, ADISORN_GOOGLE_CLIENT_SECRET และ ADISORN_GOOGLE_REFRESH_TOKEN";

const normalizeSendErrorMessage = (message) => {
  const normalizedMessage = String(message || "").toLowerCase();

  if (
    normalizedMessage.includes("client secret") ||
    normalizedMessage.includes("invalid_client") ||
    normalizedMessage.includes("unauthorized_client")
  ) {
    return `Google Client Secret ไม่ถูกต้อง กรุณาตรวจค่า ${getGoogleClientSecretEnvLabel()} ใน .env.local/Vercel ให้ตรงกับ OAuth Client ที่ใช้ขอ refresh token แล้วเชื่อมต่อ Google ใหม่`;
  }

  if (
    normalizedMessage.includes("insufficient authentication scopes") ||
    normalizedMessage.includes("insufficient") ||
    normalizedMessage.includes("scope")
  ) {
    return "บัญชี Google นี้ยังไม่ได้อนุญาตสิทธิ์ Google Drive กรุณาเชื่อมบัญชีใหม่";
  }

  return message;
};

const getReadableErrorMessage = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value === "string") return normalizeSendErrorMessage(value);
  if (typeof value?.message === "string") {
    return normalizeSendErrorMessage(value.message);
  }
  if (typeof value?.error === "string") {
    return normalizeSendErrorMessage(value.error);
  }
  if (value?.error && typeof value.error === "object") {
    return getReadableErrorMessage(value.error, fallback);
  }

  try {
    return normalizeSendErrorMessage(JSON.stringify(value));
  } catch {
    return fallback;
  }
};

const isPdfSlipFile = (url, fileType = "", fileName = "") =>
  String(fileType || "").toLowerCase().includes("pdf") ||
  String(fileName || "").toLowerCase().endsWith(".pdf") ||
  String(url || "").toLowerCase().includes(".pdf");

const isImageSlipFile = (url, fileType = "", fileName = "") => {
  const normalizedType = String(fileType || "").toLowerCase();
  const normalizedName = String(fileName || url || "").toLowerCase();

  return (
    !url ||
    normalizedType.startsWith("image/") ||
    String(url).startsWith("data:image/") ||
    /\.(jpe?g|png|webp)$/i.test(normalizedName) ||
    (!normalizedType && !isPdfSlipFile(url, fileType, fileName))
  );
};

function getGoogleDriveFileId(url = "") {
  const normalizedUrl = String(url || "");

  return (
    normalizedUrl.match(/\/file\/d\/([^/]+)/)?.[1] ||
    normalizedUrl.match(/[?&]id=([^&]+)/)?.[1] ||
    ""
  );
}

function getDisplaySlipUrl(url = "") {
  const normalizedUrl = String(url || "").trim();
  if (!normalizedUrl) return "";

  const googleDriveFileId = getGoogleDriveFileId(normalizedUrl);

  if (googleDriveFileId) {
    return `https://drive.google.com/thumbnail?id=${googleDriveFileId}&sz=w1200`;
  }

  return normalizedUrl;
}

const getFirstFilledValue = (...values) =>
  values.find((value) => String(value || "").trim()) || "";

const getNormalizedSlipImage = (source = {}) =>
  getFirstFilledValue(
    source.slipImage,
    source.slip_image,
    source.slipUrl,
    source.slip_url,
    source.paymentSlipUrl,
    source.payment_slip_url,
    source.paymentProofUrl,
    source.payment_proof_url,
    source.proofImageUrl,
    source.proof_image_url,
    source.slipFile,
    source.slip_file,
    source.paymentSlip,
    source.payment_slip
  );

const getNormalizedSlipFileName = (source = {}) =>
  getFirstFilledValue(
    source.slipFileName,
    source.slip_file_name,
    source.paymentSlipFileName,
    source.payment_slip_file_name,
    source.paymentProofFileName,
    source.payment_proof_file_name,
    source.proofImageFileName,
    source.proof_image_file_name
  );

const getNormalizedSlipFileType = (source = {}) =>
  getFirstFilledValue(
    source.slipFileType,
    source.slip_file_type,
    source.paymentSlipFileType,
    source.payment_slip_file_type,
    source.paymentProofFileType,
    source.payment_proof_file_type,
    source.proofImageFileType,
    source.proof_image_file_type
  );

const getNormalizedSlipFields = (source = {}) => ({
  slipImage: getNormalizedSlipImage(source),
  slipFileName: getNormalizedSlipFileName(source),
  slipFileType: getNormalizedSlipFileType(source),
});

const normalizePaymentTransactionSlip = (transaction = {}, fallback = {}) => {
  const normalizedSlip = getNormalizedSlipFields(transaction);
  const fallbackSlip = getNormalizedSlipFields(fallback);

  return {
    ...transaction,
    slipImage: normalizedSlip.slipImage || fallbackSlip.slipImage,
    slipFileName: normalizedSlip.slipFileName || fallbackSlip.slipFileName,
    slipFileType: normalizedSlip.slipFileType || fallbackSlip.slipFileType,
  };
};

async function imageUrlToDataUrl(url) {
  if (!url) return "";
  if (String(url).startsWith("data:")) return url;

  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error("Cannot fetch image");

    const blob = await response.blob();

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Cannot convert slip image to data url", error);
    return "";
  }
}

const normalizeThaiMobileNumber = (value) => {
  let phoneNumber = String(value || "").replace(/\D/g, "");

  // รองรับรูปแบบ 0066xxxxxxxxx
  if (phoneNumber.startsWith("0066")) {
    phoneNumber = phoneNumber.slice(4);
  } else if (phoneNumber.startsWith("66")) {
    // รองรับ +66xxxxxxxxx และ 66xxxxxxxxx
    phoneNumber = phoneNumber.slice(2);
  }

  // เลขหลังรหัสประเทศไม่มี 0 นำหน้า
  if (/^[689]\d{8}$/.test(phoneNumber)) {
    phoneNumber = `0${phoneNumber}`;
  }

  // เบอร์มือถือไทยต้องขึ้นต้น 06, 08 หรือ 09 และมี 10 หลัก
  return /^0[689]\d{8}$/.test(phoneNumber)
    ? phoneNumber
    : "";
};

export default function BookingSystem() {
  const router = useRouter();

  const goTo = (route) => {
    router.push(route);
  };


  // FORM STATE


  // =========================
  // FORM STATE
  // =========================

const [customerName, setCustomerName] = useState("");
const [phone, setPhone] = useState("");
const [email, setEmail] = useState("");
const [service, setService] = useState("");
const [location, setLocation] = useState("");
const [locationSuggestions, setLocationSuggestions] = useState([]);
const [isLocationSuggestionsOpen, setIsLocationSuggestionsOpen] =
  useState(false);
const [googlePlaceSuggestions, setGooglePlaceSuggestions] = useState([]);
const [isLoadingGooglePlaces, setIsLoadingGooglePlaces] = useState(false);
const [googlePlacesMessage, setGooglePlacesMessage] = useState("");
const [autocompleteOptions, setAutocompleteOptions] = useState(
  getDefaultAutocompleteOptions
);
const [eventDate, setEventDate] = useState("");
const [startTime, setStartTime] = useState("");
const [endTime, setEndTime] = useState("");
const regularServiceOptions = [
  "ช่างภาพหลัก",
  "ช่างภาพแคนดิด",
  "ช่างภาพวิดีโอ",
  "ผู้ช่วยช่างภาพ",
  "QR Code",
  "Video Guestbook",
  "Photo Booth",
  "โดรน",
  "ค่าเดินทาง/ที่พัก",
];

const packageServiceOptions = [
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
];

const packageDescriptions = {
  "แพ็กเกจภาพนิ่ง 1": "ช่างภาพ 1 คน",
  "แพ็กเกจภาพนิ่ง 2": "ช่างภาพ 2 คน",
  "แพ็กเกจภาพนิ่ง 3": "ช่างภาพ 3 คน",
  "แพ็กเกจภาพนิ่ง 1 Plus": "ช่างภาพ 1 คน + ผู้ช่วย 1 คน",
  "แพ็กเกจภาพนิ่ง 2 Plus": "ช่างภาพ 2 คน + ผู้ช่วย 1 คน",
  "แพ็กเกจภาพนิ่ง 3 Plus": "ช่างภาพ 3 คน + ผู้ช่วย 1 คน",
  "แพ็กเกจวิดีโอ 1": "ช่างวิดีโอ 1 คน",
  "แพ็กเกจวิดีโอ 2": "ช่างวิดีโอ 2 คน",
  "แพ็กเกจวิดีโอ 3": "ช่างวิดีโอ 3 คน",
  "แพ็กเกจวิดีโอ 1 Plus": "ช่างวิดีโอ 1 คน + ผู้ช่วย 1 คน",
  "แพ็กเกจวิดีโอ 2 Plus": "ช่างวิดีโอ 2 คน + ผู้ช่วย 1 คน",
  "แพ็กเกจวิดีโอ 3 Plus": "ช่างวิดีโอ 3 คน + ผู้ช่วย 1 คน",
  "QR Code": {
    packageTitle: "QR CODE PACKAGE",
    title: "ADISORN WEDDING STUDIO บริการเสริมสแกนคิวอาร์รับรูป",
    details: [
      {
        title: "รับรูปได้ทันที",
        text: "แขกร่วมงานและญาติผู้ใหญ่สามารถรับรูปได้ทันทีหลังถ่ายเสร็จ ทั้งดาวน์โหลดจากตัวโปรแกรม หรือส่งเข้า LINE",
      },
      {
        title: "โทนสีและภาพ",
        text: "สีสันสดใส และสามารถเลือกโทนภาพเองได้",
      },
      {
        title: "ระบบคุณภาพ",
        text: "ทีมงานใช้โปรแกรมคุณภาพ หลังจบงานยังสามารถดาวน์โหลดรูปได้",
      },
    ],
    periodsTitle: "ช่วงเวลาใช้งาน",
    periods: [
      "พิธีรับไหว้",
      "ช่วงหลั่งน้ำพระพุทธมนต์",
      "ถ่ายรูปหน้า Backdrop",
    ],
  },
  "Video Guestbook": {
    packageTitle: "VIDEO GUESTBOOK PACKAGE",
    quote: "\"บางความทรงจำ...ไม่อาจบันทึกได้ด้วยภาพเพียงอย่างเดียว\"",
    description:
      "รอยยิ้ม น้ำเสียง และความรู้สึกจากคนที่คุณรัก\nคือของขวัญที่มีค่าที่สุดในวันสำคัญ",
    itemsTitle: "รายการอุปกรณ์และบริการ",
    items: [
      {
        title: "อุปกรณ์",
        text: "เครื่องโทรศัพท์บันทึกวิดีโอ 1 เครื่อง",
      },
      {
        title: "หน้าจอเฉพาะงาน",
        text: "เปลี่ยนภาพหน้าจอ Standby เฉพาะตัวงานลูกค้า",
      },
      {
        title: "การตกแต่ง",
        text: "ตกแต่งจุดวางอุปกรณ์และป้ายการใช้งานเพื่อความสวยงาม",
      },
      {
        title: "ทีมงานดูแล",
        text: "มีทีม Staff 1 คน คอยแนะนำการใช้งาน",
      },
      {
        title: "วิดีโอไฮไลท์",
        text: "VDO Reels คัดไฮไลท์แขกในงาน ตัดต่อวิดีโออวยพร ส่งภายใน 7 วัน",
      },
    ],
  },
};

const formatDescriptionItemText = (item, index) => {
  if (!item) return "";
  if (typeof item === "string") return `${index + 1}. ${item}`;

  const title = item.title ? `${index + 1}. ${item.title}` : "";
  const text = item.text || item.description || "";

  return [title, text].filter(Boolean).join("\n");
};

const getServiceDescriptionText = (description) => {
  if (!description) return "";
  if (typeof description === "string") return description;

  const lines = [];

  if (description.title) lines.push(description.title);
  if (description.quote) lines.push(description.quote);
  if (description.description) {
    lines.push(...String(description.description).split("\n"));
  }
  if (Array.isArray(description.details)) {
    lines.push(
      ...description.details.map((item, index) =>
        formatDescriptionItemText(item, index)
      )
    );
  }
  if (description.periodsTitle) lines.push(description.periodsTitle);
  if (Array.isArray(description.periods)) {
    lines.push(...description.periods.map((item) => `- ${item}`));
  }
  if (description.itemsTitle) lines.push(description.itemsTitle);
  if (Array.isArray(description.items)) {
    lines.push(
      ...description.items.map((item, index) =>
        formatDescriptionItemText(item, index)
      )
    );
  }

  return lines.filter(Boolean).join("\n");
};

const getInlineServiceDescription = (description) =>
  typeof description === "string" ? description.trim() : "";

const personnelServices = [
  "ช่างภาพหลัก",
  "ช่างภาพแคนดิด",
  "ช่างภาพวิดีโอ",
  "ผู้ช่วยช่างภาพ",
];

const [serviceItems, setServiceItems] = useState([]);
const [showServiceModal, setShowServiceModal] = useState(false);
const [selectedServiceName, setSelectedServiceName] = useState("");
const [selectedServiceType, setSelectedServiceType] = useState("service");
const [selectedServicePrice, setSelectedServicePrice] = useState("");
const [selectedServiceQuantity, setSelectedServiceQuantity] = useState("1");
const [discountPercent, setDiscountPercent] = useState("");
const [discountAmount, setDiscountAmount] = useState("");

const [slipImage, setSlipImage] = useState("");
const [slipFileName, setSlipFileName] = useState("");
const [slipFileType, setSlipFileType] = useState("");
const [slipPreviewFailed, setSlipPreviewFailed] = useState(false);
const [slipPdfPreviewUrl, setSlipPdfPreviewUrl] = useState("");
const [slipPdfPreviewFailed, setSlipPdfPreviewFailed] = useState(false);
const [paymentDate, setPaymentDate] = useState("");
const [paymentTime, setPaymentTime] = useState("");
const [paymentAmount, setPaymentAmount] = useState("");
const [paymentMethod, setPaymentMethod] = useState("โอนเงิน");
const [paymentStatus, setPaymentStatus] = useState("มัดจำ");
const [paymentProgress, setPaymentProgress] = useState("ยังไม่ชำระ");
const [jobStatus, setJobStatus] = useState("รอยืนยัน");
const [calendarColor, setCalendarColor] = useState(DEFAULT_CALENDAR_COLOR);
const [lastSavedBookingNumber, setLastSavedBookingNumber] = useState("");
const [paymentNote, setPaymentNote] = useState("");
const [paymentTransactions, setPaymentTransactions] = useState([]);
const [editingPaymentId, setEditingPaymentId] = useState(null);
const [isSecurityLocked, setIsSecurityLocked] = useState(false);
const [securityPinInput, setSecurityPinInput] = useState("");
const [securityMessage, setSecurityMessage] = useState("");

const [bookingDate, setBookingDate] = useState("");
const [today, setToday] = useState("");

const [filterStatus, setFilterStatus] = useState("ทั้งหมด");
const [filterJobStatus, setFilterJobStatus] = useState("ทั้งหมด");
const [customerCount, setCustomerCount] = useState(0);
const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
const [isSendOptionsOpen, setIsSendOptionsOpen] = useState(false);
const [emailPreview, setEmailPreview] = useState(null);
const [emailSentInfo, setEmailSentInfo] = useState(null);
const [emailSendMessage, setEmailSendMessage] = useState("");
const [emailSendStatus, setEmailSendStatus] = useState("idle");
const [isSendingEmail, setIsSendingEmail] = useState(false);
const [isPreparingAttachment, setIsPreparingAttachment] = useState(false);
const [isSendingSmsLink, setIsSendingSmsLink] = useState(false);
const [preparingSendChannel, setPreparingSendChannel] = useState("");
const [isViewMode, setIsViewMode] = useState(false);
const [isCustomerView, setIsCustomerView] = useState(false);
const [loadedBookingNumber, setLoadedBookingNumber] = useState("");
const [customBookingNumber, setCustomBookingNumber] = useState("");
const [nextBookingSequence, setNextBookingSequence] = useState(1);
const [isSaving, setIsSaving] = useState(false);
const [isBookingSaved, setIsBookingSaved] = useState(false);
const [isEditingBooking, setIsEditingBooking] = useState(false);
const [pendingCustomerRequestId, setPendingCustomerRequestId] = useState("");
const [isExporting, setIsExporting] = useState(false);
const [draftStatus, setDraftStatus] = useState("");
const [isDraftReady, setIsDraftReady] = useState(false);
const [isAuthorized, setIsAuthorized] = useState(false);
const [editedFields, setEditedFields] = useState({});
const [bookingPreviewScale, setBookingPreviewScale] = useState(1);
const saveLockRef = useRef(false);
const emailSendLockRef = useRef(false);
const attachmentLockRef = useRef(false);
const bookingPdfCacheRef = useRef(null);
const bookingPreviewPanelRef = useRef(null);

const markFieldEdited = (fieldName) => {
  setEditedFields((currentFields) =>
    currentFields[fieldName]
      ? currentFields
      : { ...currentFields, [fieldName]: true }
  );
};

const updateEditableField = (fieldName, setter, value) => {
  markFieldEdited(fieldName);
  setter(value);
};

const hasEditedFields = Object.keys(editedFields).length > 0;

const editableInputClass = (fieldName, value, extraClasses = "") => {
  const hasTypedValue =
    editedFields[fieldName] && String(value ?? "").trim() !== "";

  return `w-full rounded-2xl border outline-none transition ${
    hasTypedValue
      ? "booking-input-edited border-zinc-200 bg-white"
      : "border-zinc-200 bg-white"
  } ${extraClasses || "px-5 py-4"}`;
};

const actionDownloadButtonClass =
  "flex min-h-[48px] min-w-0 flex-1 items-center justify-center gap-2 rounded-[18px] border border-[#4A2E22] bg-[#4A2E22] px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_22px_rgba(74,46,34,0.16)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#5A3828] hover:shadow-[0_12px_26px_rgba(74,46,34,0.20)] disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60 sm:min-w-[145px]";
const actionSaveButtonClass =
  "flex min-h-[48px] min-w-0 flex-1 items-center justify-center gap-2 rounded-[18px] border border-[#4A2E22] bg-[#4A2E22] px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_22px_rgba(74,46,34,0.16)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#5A3828] hover:shadow-[0_12px_26px_rgba(74,46,34,0.20)] disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60 sm:min-w-[145px]";
const actionCreateButtonClass =
  "flex min-h-[48px] min-w-0 flex-1 items-center justify-center gap-2 rounded-[18px] border border-[#C9A46A] bg-[#C9A46A] px-4 py-2.5 text-sm font-bold text-[#111111] shadow-[0_10px_22px_rgba(201,164,106,0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#B88F52] hover:shadow-[0_12px_26px_rgba(201,164,106,0.26)] sm:min-w-[145px]";
const actionSendButtonClass =
  "flex min-h-[48px] min-w-0 flex-1 items-center justify-center gap-2 rounded-[18px] border border-[#E9DCCB] bg-[#F3E6CF] px-4 py-2.5 text-sm font-bold text-[#2B1A14] shadow-[0_8px_18px_rgba(43,26,20,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C9A46A] hover:bg-[#EAD7B8] disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60 sm:min-w-[145px]";
const actionEditButtonClass =
  "flex min-h-[48px] min-w-0 flex-1 items-center justify-center gap-2 rounded-[18px] border border-[#C9A46A] bg-white px-4 py-2.5 text-sm font-bold text-[#2B1A14] shadow-[0_8px_18px_rgba(43,26,20,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#F3E6CF] disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60 sm:min-w-[145px]";
const actionSecondaryButtonClass =
  "flex min-h-[48px] min-w-0 flex-1 items-center justify-center gap-2 rounded-[18px] border border-[#E9DCCB] bg-white px-4 py-2.5 text-sm font-bold text-[#2B1A14] shadow-[0_8px_18px_rgba(43,26,20,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C9A46A] hover:bg-[#F3E6CF] disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60 sm:min-w-[145px]";
const actionDangerButtonClass =
  "flex min-h-[48px] items-center justify-center gap-2 rounded-[20px] border border-red-300 bg-red-50 px-5 py-3 text-sm font-extrabold text-red-700 shadow-sm transition-all duration-200 hover:bg-red-100";
const actionMenuButtonClass =
  "flex min-h-[48px] items-center justify-center gap-2 rounded-[20px] border border-[#E9DCCB] bg-white px-5 py-3 text-sm font-extrabold text-[#2B1A14] shadow-[0_10px_22px_rgba(43,26,20,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C9A46A] hover:bg-[#F3E6CF]";
const actionMenuSmallButtonClass =
  "flex min-h-[46px] items-center justify-center gap-2 rounded-[20px] border border-[#E9DCCB] bg-white px-5 py-2.5 text-sm font-extrabold text-[#2B1A14] shadow-[0_10px_22px_rgba(43,26,20,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C9A46A] hover:bg-[#F3E6CF]";

const slipIsPdf = Boolean(slipImage) && isPdfSlipFile(slipImage, slipFileType, slipFileName);
const slipIsImage = Boolean(slipImage) && isImageSlipFile(slipImage, slipFileType, slipFileName);
const slipDisplayName = slipFileName || (slipIsPdf ? "ไฟล์สลิป PDF" : "หลักฐานการโอน");
const slipPreviewUrl = getDisplaySlipUrl(slipImage);

useEffect(() => {
  setSlipPreviewFailed(false);
  setSlipPdfPreviewFailed(false);
  setSlipPdfPreviewUrl("");
}, [slipImage]);

const emailSendMessageClass =
  {
    loading: "border-blue-200 bg-blue-50 text-blue-700",
    success: "border-green-200 bg-green-50 text-green-700",
    error: "border-red-200 bg-red-50 text-red-700",
  }[emailSendStatus] || "border-zinc-200 bg-zinc-50 text-zinc-700";

const HIGH_QUALITY_PDF_ERROR_MESSAGE =
  "สร้าง PDF คุณภาพสูงไม่สำเร็จ กรุณาลองใหม่";

const renderServiceDescription = (description, options = {}) => {
  if (!description) return null;

  const compact = options.compact || false;
  const renderDescriptionList = (items) => (
    <div className={compact ? "grid gap-1" : "grid gap-2"}>
      {items.map((item, index) => {
        if (typeof item === "string") {
          return <p key={item}>{index + 1}. {item}</p>;
        }

        const key = `${item.title || "item"}-${index}`;

        return (
          <div key={key}>
            {item.title && (
              <p className={compact ? "font-semibold text-zinc-700" : "font-semibold text-zinc-800"}>
                {index + 1}. {item.title}
              </p>
            )}
            {(item.text || item.description) && (
              <p className={compact ? "mt-0.5 text-zinc-500" : "mt-1 text-zinc-600"}>
                {item.text || item.description}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );

  if (typeof description === "string") {
    return (
      <p className={compact ? "mt-0.5 text-[10px] text-zinc-500" : "mt-1 whitespace-pre-line text-sm text-zinc-500"}>
        {description}
      </p>
    );
  }

  return (
    <div className={compact ? "mt-1 space-y-1 text-[10px] leading-relaxed text-zinc-500" : "mt-2 space-y-3 text-sm leading-6 text-zinc-600"}>
      {description.title && (
        <p className={compact ? "font-semibold text-zinc-700" : "font-semibold text-zinc-800"}>
          {description.title}
        </p>
      )}
      {description.quote && (
        <div className="mx-auto max-w-xl text-center">
          <p className={compact ? "text-[11px] font-bold leading-snug text-zinc-800" : "text-base font-bold leading-snug text-zinc-900"}>
            {description.quote}
          </p>
          {description.description && (
            <p className={compact ? "mt-1 whitespace-pre-line text-[10px] leading-relaxed text-zinc-500" : "mt-2 whitespace-pre-line text-sm leading-6 text-zinc-500"}>
              {description.description}
            </p>
          )}
        </div>
      )}
      {Array.isArray(description.details) && description.details.length > 0 && (
        renderDescriptionList(description.details)
      )}
      {Array.isArray(description.periods) && description.periods.length > 0 && (
        <div>
          {description.periodsTitle && (
            <p className="font-semibold text-zinc-700">{description.periodsTitle}</p>
          )}
          <ul className="mt-1 space-y-1">
            {description.periods.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      )}
      {Array.isArray(description.items) && description.items.length > 0 && (
        <div>
          {description.itemsTitle && (
            <p className="font-semibold text-zinc-700">{description.itemsTitle}</p>
          )}
          <div className="mt-1">
            {renderDescriptionList(description.items)}
          </div>
        </div>
      )}
    </div>
  );
};

const isPackageServiceName = (serviceName) =>
  packageServiceOptions.includes(serviceName);

const customerNameSuggestions = getAutocompleteSuggestions(
  autocompleteOptions,
  "customerName",
  customerName
);
const phoneSuggestions = getAutocompleteSuggestions(
  autocompleteOptions,
  "phone",
  phone
);
const serviceSuggestions = getAutocompleteSuggestions(
  autocompleteOptions,
  "service",
  service
);
const locationInputSuggestions = getAutocompleteSuggestions(
  { location: locationSuggestions },
  "location",
  location,
  8
);

const normalizedLocationInput = location.trim();
const googlePlaceNames = new Set(
  googlePlaceSuggestions.map((suggestion) => suggestion.value)
);
const visibleLocalLocationSuggestions = locationInputSuggestions.filter(
  (place) => !googlePlaceNames.has(place)
);
const showLocationSuggestionPanel =
  isLocationSuggestionsOpen && normalizedLocationInput !== "";
const chooseLocationSuggestion = (suggestion) => {
  updateEditableField("location", setLocation, suggestion);
  setIsLocationSuggestionsOpen(false);
};

  useEffect(() => {
    const verifyAccess = () => {
      try {
        const loggedIn = sessionStorage.getItem("loggedIn") === "true";
        const currentUser = JSON.parse(
          sessionStorage.getItem("currentUser") || "null"
        );
        const activeBrand = sessionStorage.getItem("activeBrand");
        const users = JSON.parse(
          localStorage.getItem("central_admin_users") || "[]"
        );
        const latestAccount = Array.isArray(users)
          ? users.find((user) => user.id === currentUser?.id)
          : null;
        const isAdmin = currentUser?.role === "ADMIN";
        const hasBrandAccess = currentUser?.brands?.includes("adisorn");
        const accountIsActive = latestAccount?.active === true;
        const brandIsCorrect =
          activeBrand === "adisorn" && (isAdmin || hasBrandAccess);
        const lastActivity = Number(
          sessionStorage.getItem("lastActivity") || Date.now()
        );
        const sessionExpired = Date.now() - lastActivity > SESSION_TIMEOUT_MS;

        if (
          !loggedIn ||
          !currentUser ||
          !accountIsActive ||
          !brandIsCorrect ||
          sessionExpired
        ) {
          sessionStorage.clear();
          window.location.replace("/login");
          return false;
        }

        sessionStorage.setItem("lastActivity", String(Date.now()));
        setIsAuthorized(true);
        return true;
      } catch (error) {
        console.error("Cannot verify Adisorn access", error);
        sessionStorage.clear();
        window.location.replace("/login");
        return false;
      }
    };

    if (!verifyAccess()) return;

    let activityTimer;

    const updateActivity = () => {
      window.clearTimeout(activityTimer);
      activityTimer = window.setTimeout(() => {
        sessionStorage.setItem("lastActivity", String(Date.now()));
      }, 500);
    };

    const handleStorage = (event) => {
      if (
        event.key === "central_admin_users" ||
        event.key === CUSTOMERS_KEY ||
        event.key === SELECTED_BOOKING_KEY ||
        event.key === CURRENT_BOOKING_KEY ||
        event.key === CUSTOM_BOOKING_NUMBER_KEY ||
        event.key === BOOKING_NUMBER_MODE_KEY ||
        event.key === NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY ||
        event.key === RESET_BOOKING_SEQUENCE_ACTIVE_KEY ||
        event.key === BOOKING_DRAFT_KEY ||
        event.key === PAYMENT_RECEIPTS_KEY ||
        event.key === ARCHIVES_KEY
      ) {
        verifyAccess();
      }
    };

    const handleFocus = () => {
      verifyAccess();
    };

    const sessionCheck = window.setInterval(verifyAccess, 60 * 1000);
    const activityEvents = ["mousedown", "keydown", "touchstart", "scroll"];

    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, updateActivity, { passive: true })
    );
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(sessionCheck);
      window.clearTimeout(activityTimer);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, updateActivity)
      );
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;
    const savedPin = localStorage.getItem(SECURITY_PIN_KEY);
    const isUnlocked = sessionStorage.getItem(SECURITY_UNLOCKED_KEY) === "true";

    if (savedPin && !isUnlocked) {
      const timer = window.setTimeout(() => {
        setIsSecurityLocked(true);
      }, 0);

      return () => window.clearTimeout(timer);
    }
  }, [isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) return;

    const previewPanel = bookingPreviewPanelRef.current;
    if (!previewPanel) return;

    const updatePreviewScale = () => {
      const panelWidth = previewPanel.clientWidth || 0;
      const availableWidth = Math.max(0, panelWidth - 40);
      const nextScale = Math.min(1, Math.max(0.72, availableWidth / 794));

      setBookingPreviewScale((currentScale) => {
        const roundedScale = Number(nextScale.toFixed(3));
        return Math.abs(currentScale - roundedScale) > 0.005
          ? roundedScale
          : currentScale;
      });
    };

    updatePreviewScale();

    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(updatePreviewScale)
        : null;

    resizeObserver?.observe(previewPanel);
    window.addEventListener("resize", updatePreviewScale);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePreviewScale);
    };
  }, [isAuthorized, isSidebarCollapsed, isViewMode]);

  useEffect(() => {
    if (!isAuthorized || normalizedLocationInput.length < 2) {
      return;
    }

    let isActive = true;

    const timer = window.setTimeout(() => {
      fetchGooglePlaceSuggestions(normalizedLocationInput)
        .then((suggestions) => {
          if (!isActive) return;
          setGooglePlaceSuggestions(suggestions);
          setGooglePlacesMessage("");
        })
        .catch((error) => {
          if (!isActive) return;
          if (error.code === "GOOGLE_PLACES_API_KEY_MISSING") {
            setGooglePlacesMessage("ยังไม่ได้ตั้งค่า Google Places API key");
          } else {
            console.error("Cannot load Google Places suggestions", error);
            setGooglePlacesMessage("ดึงข้อมูลจาก Google ไม่สำเร็จ");
          }
          setGooglePlaceSuggestions([]);
        })
        .finally(() => {
          if (isActive) setIsLoadingGooglePlaces(false);
        });
    }, 250);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [isAuthorized, normalizedLocationInput]);

  useEffect(() => {
    const savedPin = localStorage.getItem(SECURITY_PIN_KEY);
    if (!savedPin || isSecurityLocked) return;

    let timer;
    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        sessionStorage.removeItem(SECURITY_UNLOCKED_KEY);
        setIsSecurityLocked(true);
        setSecurityPinInput("");
        setSecurityMessage("ระบบถูกล็อกอัตโนมัติเพื่อความปลอดภัย");
      }, AUTO_LOCK_MINUTES * 60 * 1000);
    };

    const activityEvents = ["mousedown", "keydown", "touchstart", "scroll"];
    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, resetTimer, { passive: true })
    );
    resetTimer();

    return () => {
      window.clearTimeout(timer);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, resetTimer)
      );
    };
  }, [isSecurityLocked]);

  const setSecurityPin = () => {
    const currentPin = localStorage.getItem(SECURITY_PIN_KEY);

    if (currentPin) {
      const oldPin = window.prompt("กรอก PIN เดิมเพื่อเปลี่ยน PIN");
      if (oldPin !== currentPin) {
        window.alert("PIN เดิมไม่ถูกต้อง");
        return;
      }
    }

    const newPin = window.prompt("ตั้ง PIN ใหม่ 4-8 หลัก");
    if (!/^\d{4,8}$/.test(String(newPin || ""))) {
      window.alert("PIN ต้องเป็นตัวเลข 4-8 หลัก");
      return;
    }

    const confirmPin = window.prompt("กรอก PIN ใหม่อีกครั้ง");
    if (newPin !== confirmPin) {
      window.alert("PIN ทั้งสองครั้งไม่ตรงกัน");
      return;
    }

    localStorage.setItem(SECURITY_PIN_KEY, newPin);
    sessionStorage.setItem(SECURITY_UNLOCKED_KEY, "true");
    setIsSecurityLocked(false);
    window.alert("ตั้ง PIN เรียบร้อยแล้ว");
  };

  const lockSystem = () => {
    if (!localStorage.getItem(SECURITY_PIN_KEY)) {
      setSecurityPin();
      return;
    }

    sessionStorage.removeItem(SECURITY_UNLOCKED_KEY);
    setSecurityPinInput("");
    setSecurityMessage("");
    setIsSecurityLocked(true);
  };

  const unlockSystem = () => {
    const savedPin = localStorage.getItem(SECURITY_PIN_KEY);

    if (!savedPin || securityPinInput === savedPin) {
      sessionStorage.setItem(SECURITY_UNLOCKED_KEY, "true");
      setIsSecurityLocked(false);
      setSecurityPinInput("");
      setSecurityMessage("");
      return;
    }

    setSecurityMessage("PIN ไม่ถูกต้อง กรุณาลองใหม่");
  };
  useEffect(() => {
    if (!isAuthorized) return;

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const isCreateBookingRoute =
        window.location.pathname === ROUTES.booking && !params.has("view");

      if (!isCreateBookingRoute) {
        setIsDraftReady(true);
        return;
      }

      try {
        const rawPrefill = localStorage.getItem(PENDING_BOOKING_PREFILL_KEY);

        if (rawPrefill) {
          const prefill = JSON.parse(rawPrefill);

          if (prefill?.brand === BRAND_ID) {
            const prefillSlip = getNormalizedSlipFields(prefill);
            setCustomerName(prefill.customerName || "");
            setPhone(prefill.phone || "");
            setEmail(prefill.email || "");
            setLocation(prefill.location || "");
            setEventDate(prefill.eventDate || "");
            setPaymentNote(prefill.paymentNote || "");
            setSlipImage(prefillSlip.slipImage);
            setSlipFileName(prefillSlip.slipFileName);
            setSlipFileType(prefillSlip.slipFileType);
            setPendingCustomerRequestId(prefill.requestId || "");
            localStorage.removeItem(PENDING_BOOKING_PREFILL_KEY);
            localStorage.removeItem(BOOKING_DRAFT_KEY);
            setDraftStatus("เติมข้อมูลจากคำขอลูกค้าแล้ว");
            setEditedFields({});
            setIsDraftReady(true);
            return;
          }

          localStorage.removeItem(PENDING_BOOKING_PREFILL_KEY);
        }

        const rawDraft = localStorage.getItem(BOOKING_DRAFT_KEY);

        if (rawDraft) {
          const draft = JSON.parse(rawDraft);
          const draftSlip = getNormalizedSlipFields(draft);

          setCustomerName(draft.customerName || "");
          setPhone(draft.phone || "");
          setEmail(draft.email || "");
          setService(draft.service || "");
          setLocation(draft.location || "");
          setEventDate(draft.eventDate || "");
          setStartTime(draft.startTime || "");
          setEndTime(draft.endTime || "");
          setServiceItems(
            Array.isArray(draft.serviceItems) ? draft.serviceItems : []
          );
          setDiscountPercent(draft.discountPercent || "");
          setDiscountAmount(draft.discountAmount || "");
          setPaymentDate(draft.paymentDate || "");
          setPaymentTime(draft.paymentTime || "");
          setPaymentAmount(draft.paymentAmount || "");
          setPaymentMethod(draft.paymentMethod || "โอนเงิน");
          setPaymentStatus(draft.paymentStatus || "มัดจำ");
          setPaymentProgress(draft.paymentProgress || "ยังไม่ชำระ");
          setJobStatus(draft.jobStatus || "รอยืนยัน");
          setCalendarColor(draft.calendarColor || DEFAULT_CALENDAR_COLOR);
          setPaymentNote(draft.paymentNote || "");
          setPaymentTransactions(
            Array.isArray(draft.paymentTransactions)
              ? draft.paymentTransactions.map((transaction) =>
                  normalizePaymentTransactionSlip(transaction)
                )
              : []
          );
          setSlipImage(draftSlip.slipImage);
          setSlipFileName(draftSlip.slipFileName);
          setSlipFileType(draftSlip.slipFileType);
          setDraftStatus("กู้คืนร่างล่าสุดแล้ว");
        }
      } catch (error) {
        console.error("Cannot restore booking draft", error);
        localStorage.removeItem(BOOKING_DRAFT_KEY);
      } finally {
        setEditedFields({});
        setIsDraftReady(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isAuthorized]);

  useEffect(() => {
    if (!isDraftReady || isViewMode || loadedBookingNumber) return;

    const params = new URLSearchParams(window.location.search);
    const isCreateBookingRoute =
      window.location.pathname === ROUTES.booking && !params.has("view");

    if (!isCreateBookingRoute) return;

    const hasDraftContent =
      customerName.trim() ||
      phone.trim() ||
      email.trim() ||
      service.trim() ||
      location.trim() ||
      eventDate ||
      startTime ||
      endTime ||
      serviceItems.length > 0 ||
      discountPercent ||
      discountAmount ||
      paymentDate ||
      paymentTime ||
      paymentAmount ||
      paymentNote.trim() ||
      paymentTransactions.length > 0 ||
      slipImage;

    if (!hasDraftContent) {
      localStorage.removeItem(BOOKING_DRAFT_KEY);
      const timer = window.setTimeout(() => {
        setDraftStatus("");
      }, 0);

      return () => window.clearTimeout(timer);
    }

    const statusTimer = window.setTimeout(() => {
      setDraftStatus("กำลังบันทึกร่าง...");
    }, 0);

    const saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(
          BOOKING_DRAFT_KEY,
          JSON.stringify({
            customerName,
            phone,
            email,
            service,
            location,
            eventDate,
            startTime,
            endTime,
            serviceItems,
            discountPercent,
            discountAmount,
            paymentDate,
            paymentTime,
            paymentAmount,
            paymentMethod,
            paymentStatus,
            paymentProgress,
            jobStatus,
            calendarColor,
            paymentNote,
            paymentTransactions,
            slipImage,
            slipFileName,
            slipFileType,
            savedAt: new Date().toISOString(),
          })
        );

        setDraftStatus(
          `บันทึกร่างแล้ว ${new Date().toLocaleTimeString("th-TH", {
            hour: "2-digit",
            minute: "2-digit",
          })}`
        );
      } catch (error) {
        console.error("Cannot save booking draft", error);
        setDraftStatus("บันทึกร่างไม่สำเร็จ");
      }
    }, 800);

    return () => {
      window.clearTimeout(statusTimer);
      window.clearTimeout(saveTimer);
    };
  }, [
    isDraftReady,
    isViewMode,
    loadedBookingNumber,
    customerName,
    phone,
    email,
    service,
    location,
    eventDate,
    startTime,
    endTime,
    serviceItems,
    discountPercent,
    discountAmount,
    paymentDate,
    paymentTime,
    paymentAmount,
    paymentMethod,
    paymentStatus,
    paymentProgress,
    jobStatus,
    calendarColor,
    paymentNote,
    paymentTransactions,
    slipImage,
    slipFileName,
    slipFileType,
  ]);

  useEffect(() => {
    if (!isAuthorized) return;

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const hasViewParam = params.has("view");
      const isCreateBookingRoute =
        window.location.pathname === ROUTES.booking && !hasViewParam;
      const viewMode = hasViewParam;
      const customerView = false;

      const shouldOpenEditMode =
        viewMode &&
        params.get("view") === "" &&
        !params.has("pdf");

      setIsViewMode(shouldOpenEditMode ? false : viewMode);
      setIsCustomerView(customerView);

      if (shouldOpenEditMode) {
        window.history.replaceState({}, "", ROUTES.home);
      }

      if (isCreateBookingRoute) {
        setEditedFields({});
        setLoadedBookingNumber("");

        const bookingNumberMode =
          localStorage.getItem(BOOKING_NUMBER_MODE_KEY) || "auto";

        setCustomBookingNumber(
          bookingNumberMode === "custom"
            ? localStorage.getItem(CUSTOM_BOOKING_NUMBER_KEY) || ""
            : ""
        );
        localStorage.removeItem(SELECTED_BOOKING_KEY);
        localStorage.removeItem(CURRENT_BOOKING_KEY);
      }

      if (viewMode) {
        const savedBooking =
          localStorage.getItem(SELECTED_BOOKING_KEY) ||
          localStorage.getItem(CURRENT_BOOKING_KEY);

        if (savedBooking) {
          try {
            const booking = JSON.parse(savedBooking);
            const bookingSlip = getNormalizedSlipFields(booking);
            setEditedFields({});
            setLoadedBookingNumber(booking.bookingNumber || "");
            setIsBookingSaved(Boolean(booking.bookingNumber));
            setIsEditingBooking(false);
            setCustomBookingNumber("");
            setCustomerName(booking.customerName || "");
            setPhone(booking.phone || "");
            setEmail(booking.email || "");
            setService(booking.service || "");
            setLocation(booking.location || "");
            setEventDate(booking.eventDate || "");
            setStartTime(booking.startTime || "");
            setEndTime(booking.endTime || "");
            setServiceItems(
              Array.isArray(booking.serviceItems) ? booking.serviceItems : []
            );
            setDiscountPercent(
              booking.discountPercent == null
                ? ""
                : String(booking.discountPercent)
            );
            setDiscountAmount(
              booking.discountAmount == null
                ? ""
                : String(booking.discountAmount)
            );
            setSlipImage(bookingSlip.slipImage);
            setSlipFileName(bookingSlip.slipFileName);
            setSlipFileType(bookingSlip.slipFileType);
            setPaymentDate(booking.paymentDate || "");
            setPaymentTime(booking.paymentTime || "");
            setPaymentAmount(
              booking.paymentAmount == null
                ? ""
                : String(booking.paymentAmount)
            );
            setPaymentMethod(booking.paymentMethod || "โอนเงิน");
            setPaymentStatus(booking.paymentStatus || "มัดจำ");
            setPaymentProgress(booking.paymentProgress || "ยังไม่ชำระ");
            setJobStatus(booking.jobStatus || "รอยืนยัน");
            setCalendarColor(booking.calendarColor || DEFAULT_CALENDAR_COLOR);
            setPaymentNote(booking.paymentNote || "");
            setPaymentTransactions(
              Array.isArray(booking.paymentTransactions)
                ? booking.paymentTransactions.map((transaction) =>
                    normalizePaymentTransactionSlip(transaction, booking)
                  )
                : booking.paymentAmount
                  ? [
                      normalizePaymentTransactionSlip(
                        {
                          id: `${booking.bookingNumber || "booking"}-legacy`,
                          date: booking.paymentDate || "",
                          time: booking.paymentTime || "",
                          amount: Number(booking.paymentAmount || 0),
                          method: booking.paymentMethod || "โอนเงิน",
                          status: booking.paymentStatus || "มัดจำ",
                          note: booking.paymentNote || "",
                        },
                        booking
                      ),
                    ]
                  : []
            );
            setBookingDate(
              booking.bookingDate || new Date().toLocaleString("th-TH")
            );
            setToday(
              booking.today || new Date().toLocaleDateString("th-TH")
            );
          } catch (error) {
            console.error("Cannot load selected booking", error);
            setIsViewMode(false);
          }
        }
      } else {
        const now = new Date();
        setBookingDate(now.toLocaleString("th-TH"));
        setToday(now.toLocaleDateString("th-TH"));
      }

      const customers = readArrayFromStorage(CUSTOMERS_KEY);

      localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
      setCustomerCount(customers.length);

      const savedSequenceOverride = Number(
        localStorage.getItem(NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY)
      );
      const resetSequenceActive =
        localStorage.getItem(RESET_BOOKING_SEQUENCE_ACTIVE_KEY) === "true";

      setNextBookingSequence(
        resetSequenceActive &&
          Number.isFinite(savedSequenceOverride) &&
          savedSequenceOverride > 0
          ? savedSequenceOverride
          : getNextBookingSequence(customers)
      );

      if (!resetSequenceActive) {
        getNextAvailableBookingNumber({
          brandId: BRAND_ID,
          supabaseClient: supabase,
        }).then(({ sequence }) => {
          if (sequence != null) setNextBookingSequence(sequence);
        });
      }

      const localAutocompleteOptions = mergeAutocompleteOptions(
        getDefaultAutocompleteOptions(),
        getAutocompleteOptionsFromBookings(customers)
      );

      setAutocompleteOptions(localAutocompleteOptions);
      setLocationSuggestions(localAutocompleteOptions.location);

      loadAutocompleteOptions(BRAND_ID)
        .then((databaseAutocompleteOptions) => {
          const mergedOptions = mergeAutocompleteOptions(
            localAutocompleteOptions,
            databaseAutocompleteOptions
          );

          setAutocompleteOptions(mergedOptions);
          setLocationSuggestions(mergedOptions.location);
        })
        .catch((error) => {
          if (isMissingAutocompleteTableError(error)) return;
          console.error("Cannot load autocomplete history", error);
        });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) return;
    let channel = null;

    const syncBookingNumberSetting = (payload) => {
      const detail = payload?.detail || payload?.data || payload || {};
      const mode =
        detail.mode ||
        localStorage.getItem(BOOKING_NUMBER_MODE_KEY) ||
        "auto";
      const nextBookingNumber =
        detail.bookingNumber ??
        localStorage.getItem(CUSTOM_BOOKING_NUMBER_KEY) ??
        "";

      if (mode === "custom") {
        setCustomBookingNumber(String(nextBookingNumber));
        return;
      }

      localStorage.setItem(BOOKING_NUMBER_MODE_KEY, "auto");
      setCustomBookingNumber("");
      setLoadedBookingNumber("");
      const incomingSequenceOverride = Number(
        detail.sequenceOverride ??
          localStorage.getItem(NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY)
      );

      if (
        Number.isFinite(incomingSequenceOverride) &&
        incomingSequenceOverride > 0
      ) {
        setNextBookingSequence(incomingSequenceOverride);
      }
    };

    const handleStorage = (event) => {
      if (
        event.key === CUSTOM_BOOKING_NUMBER_KEY ||
        event.key === BOOKING_NUMBER_MODE_KEY ||
        event.key === NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY
      ) {
        syncBookingNumberSetting();
      }
    };

    const handlePageVisible = () => {
      if (document.visibilityState === "visible") {
        syncBookingNumberSetting();
      }
    };

    syncBookingNumberSetting();

    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(BOOKING_NUMBER_CHANNEL);
      channel.addEventListener("message", syncBookingNumberSetting);
    }

    window.addEventListener(
      BOOKING_NUMBER_UPDATED_EVENT,
      syncBookingNumberSetting
    );
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", syncBookingNumberSetting);
    window.addEventListener("pageshow", syncBookingNumberSetting);
    document.addEventListener("visibilitychange", handlePageVisible);

    return () => {
      if (channel) {
        channel.removeEventListener("message", syncBookingNumberSetting);
        channel.close();
      }

      window.removeEventListener(
        BOOKING_NUMBER_UPDATED_EVENT,
        syncBookingNumberSetting
      );
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", syncBookingNumberSetting);
      window.removeEventListener("pageshow", syncBookingNumberSetting);
      document.removeEventListener("visibilitychange", handlePageVisible);
    };
  }, [isAuthorized]);


// =========================
// DATE
// =========================

const todayRaw = new Date();

const generatedBookingNumber = formatBookingNumber(
  todayRaw,
  nextBookingSequence
);

const hasSequenceOverride =
  typeof window !== "undefined" &&
  Number(localStorage.getItem(NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY)) > 0;

const bookingNumber = customBookingNumber.trim()
  ? customBookingNumber.trim()
  : hasSequenceOverride
    ? generatedBookingNumber
    : loadedBookingNumber || generatedBookingNumber;
const documentBookingDate = bookingDate || new Date().toLocaleString("th-TH");
const documentToday = today || new Date().toLocaleDateString("th-TH");

const formatThaiDateInput = (value) => {
  if (!value) return "-";

  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return "-";

  return `${day}/${month}/${year + 543}`;
};

const formattedEventDate = formatThaiDateInput(eventDate);
  const serviceTotal = serviceItems.reduce(
    (sum, item) => sum + (Number(item.price) || 0),
    0
  );

  const percentDiscountValue =
    (serviceTotal * Number(discountPercent || 0)) / 100;

  const totalDiscount =
    percentDiscountValue + Number(discountAmount || 0);

  const finalPrice =
    Math.max(serviceTotal - totalDiscount, 0);

  const totalPaid = paymentTransactions.reduce(
    (sum, transaction) => sum + Number(transaction.amount || 0),
    0
  );

  const currentPaymentAmount = Number(paymentAmount || 0);
  const currentPaymentAlreadyRecorded =
    currentPaymentAmount > 0 &&
    paymentTransactions.some(
      (transaction) =>
        Number(transaction.amount || 0) === currentPaymentAmount &&
        (transaction.date || "") === (paymentDate || "") &&
        (transaction.time || "") === (paymentTime || "") &&
        (transaction.status || "") === (paymentStatus || "")
    );
  const previewPaymentAmount = currentPaymentAlreadyRecorded
    ? 0
    : currentPaymentAmount;
  const previewTotalPaid = Math.min(finalPrice, totalPaid + previewPaymentAmount);
  const remainingPayment = Math.max(finalPrice - totalPaid, 0);
  const previewRemainingPayment = Math.max(finalPrice - previewTotalPaid, 0);
  const paymentDisplayStatus = getPaymentDisplayStatus(
    paymentStatus,
    previewTotalPaid
  );
  const paymentDisplayStatusClass =
    getPaymentDisplayStatusClass(paymentDisplayStatus);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPaymentProgress(getPaymentProgress(totalPaid, finalPrice));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [totalPaid, finalPrice]);

  const isDenseDocument = serviceItems.length >= 5;

  const photographyServices = [
    "ช่างภาพหลัก",
    "ช่างภาพแคนดิด",
  ];

  const videoServices = [
    "ช่างภาพวิดีโอ",
  ];

  const hasPhotographyPackage = serviceItems.some(
    (item) =>
      item.name.startsWith("แพ็กเกจภาพนิ่ง") ||
      photographyServices.includes(item.name)
  );

  const hasVideoPackage = serviceItems.some(
    (item) =>
      item.name.startsWith("แพ็กเกจวิดีโอ") ||
      videoServices.includes(item.name)
  );

  const getServiceItemName = (item) =>
    String(item?.name || item?.title || "").trim();

  const hasQrCodePackage = serviceItems.some(
    (item) => getServiceItemName(item) === "QR Code"
  );

  const hasVideoGuestbookPackage = serviceItems.some(
    (item) => getServiceItemName(item) === "Video Guestbook"
  );

  const shouldShowPrimaryPackagePage =
    hasPhotographyPackage || hasVideoPackage;

  const shouldShowAddOnPackagePage =
    hasQrCodePackage || hasVideoGuestbookPackage;

  const shouldShowPackagePage =
    shouldShowPrimaryPackagePage || shouldShowAddOnPackagePage;

  const renderQrCodePackageSection = () => (
    <section className="rounded-2xl border border-zinc-200 overflow-hidden flex flex-col shrink-0 bg-white">
      <div className="package-section-header bg-zinc-900 text-white px-5 py-3 shrink-0">
        <h3 className="text-lg font-bold tracking-wide">
          QR CODE PACKAGE
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-5 text-[10px] leading-relaxed text-zinc-700">
        <div>
          <p className="font-bold text-sm text-zinc-900 mb-1">
            1. รับรูปได้ทันที
          </p>
          <p>
            แขกร่วมงานและญาติผู้ใหญ่สามารถรับรูปได้ทันทีหลังถ่ายเสร็จ
            ทั้งดาวน์โหลดจากตัวโปรแกรม หรือส่งเข้า LINE
          </p>
        </div>

        <div>
          <p className="font-bold text-sm text-zinc-900 mb-1">
            2. โทนสีและภาพ
          </p>
          <p>
            สีสันสดใส และสามารถเลือกโทนภาพเองได้
          </p>
        </div>

        <div>
          <p className="font-bold text-sm text-zinc-900 mb-1">
            3. ระบบคุณภาพ
          </p>
          <p>
            ทีมงานใช้โปรแกรมคุณภาพ หลังจบงานยังสามารถดาวน์โหลดรูปได้
          </p>
        </div>

        <div>
          <p className="font-bold text-sm text-zinc-900 mb-1">
            4. ช่วงเวลาใช้งาน
          </p>
          <ul className="space-y-0.5">
            <li>- พิธีรับไหว้</li>
            <li>- ช่วงหลั่งน้ำพระพุทธมนต์</li>
            <li>- ถ่ายรูปหน้า Backdrop</li>
          </ul>
        </div>
      </div>
    </section>
  );

  const renderVideoGuestbookPackageSection = () => (
    <section className="rounded-2xl border border-zinc-200 overflow-hidden flex flex-col shrink-0 bg-white">
      <div className="package-section-header bg-zinc-900 text-white px-5 py-3 shrink-0">
        <h3 className="text-lg font-bold tracking-wide">
          VIDEO GUESTBOOK PACKAGE
        </h3>
      </div>

      <div className="p-5 text-[10px] leading-relaxed text-zinc-700">
        <div className="mx-auto mb-4 max-w-xl text-center">
          <p className="text-sm font-bold leading-snug text-zinc-900">
            &quot;บางความทรงจำ...ไม่อาจบันทึกได้ด้วยภาพเพียงอย่างเดียว&quot;
          </p>
          <p className="mt-2 whitespace-pre-line text-[10px] leading-relaxed text-zinc-600">
            รอยยิ้ม น้ำเสียง และความรู้สึกจากคนที่คุณรัก{"\n"}
            คือของขวัญที่มีค่าที่สุดในวันสำคัญ
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <p className="font-bold text-sm text-zinc-900 mb-1">
              1. อุปกรณ์
            </p>
            <p>เครื่องโทรศัพท์บันทึกวิดีโอ 1 เครื่อง</p>
          </div>

          <div>
            <p className="font-bold text-sm text-zinc-900 mb-1">
              2. หน้าจอเฉพาะงาน
            </p>
            <p>เปลี่ยนภาพหน้าจอ Standby เฉพาะตัวงานลูกค้า</p>
          </div>

          <div>
            <p className="font-bold text-sm text-zinc-900 mb-1">
              3. การตกแต่ง
            </p>
            <p>ตกแต่งจุดวางอุปกรณ์และป้ายการใช้งานเพื่อความสวยงาม</p>
          </div>

          <div>
            <p className="font-bold text-sm text-zinc-900 mb-1">
              4. ทีมงานดูแล
            </p>
            <p>มีทีม Staff 1 คน คอยแนะนำการใช้งาน</p>
          </div>

          <div className="col-span-2">
            <p className="font-bold text-sm text-zinc-900 mb-1">
              5. วิดีโอไฮไลท์
            </p>
            <p>
              VDO Reels คัดไฮไลท์แขกในงาน ตัดต่อวิดีโออวยพร ส่งภายใน 7 วัน
            </p>
          </div>
        </div>
      </div>
    </section>
  );

  const openServiceModal = () => {
    setSelectedServiceName("");
    setSelectedServiceType("service");
    setSelectedServicePrice("");
    setSelectedServiceQuantity("1");
    setShowServiceModal(true);
  };

  const closeServiceModal = () => {
    setSelectedServiceName("");
    setSelectedServiceType("service");
    setSelectedServicePrice("");
    setSelectedServiceQuantity("1");
    setShowServiceModal(false);
  };

  const addServiceItem = () => {
    if (!selectedServiceName) {
      alert("กรุณาเลือกรายการบริการ");
      return;
    }

    if (selectedServicePrice === "" || Number(selectedServicePrice) < 0) {
      alert("กรุณากรอกราคาให้ถูกต้อง");
      return;
    }

    const isPersonnel = personnelServices.includes(selectedServiceName);
    const quantity = isPersonnel
      ? Math.min(Math.max(Number(selectedServiceQuantity) || 1, 1), 10)
      : 1;
    const unitPrice = Number(selectedServicePrice) || 0;

    setServiceItems((currentItems) => [
      ...currentItems,
      {
        id: `${Date.now()}-${Math.random()}`,
        name: selectedServiceName,
        description: packageDescriptions[selectedServiceName] || "",
        quantity,
        unitPrice,
        price: unitPrice * quantity,
      },
    ]);
    markFieldEdited("serviceItems");

    closeServiceModal();
  };

  const removeServiceItem = (id) => {
    setServiceItems((currentItems) =>
      currentItems.filter((item) => item.id !== id)
    );
    markFieldEdited("serviceItems");
  };

  const formatTimeInput = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);

    if (digits.length <= 2) {
      return digits;
    }

    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  };

  const isValidTime = (value) => {
    if (!/^\d{2}:\d{2}$/.test(value)) return false;

    const [hours, minutes] = value.split(":").map(Number);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  };

  const addPaymentTransaction = () => {
    const amount = Number(paymentAmount || 0);

    if (amount <= 0) {
      alert("กรุณากรอกยอดชำระให้มากกว่า 0 บาท");
      return;
    }

    if (totalPaid + amount > finalPrice) {
      alert("ยอดชำระรวมต้องไม่มากกว่ายอดรวมสุทธิ");
      return;
    }

    if (paymentTime && !isValidTime(paymentTime)) {
      alert("กรุณากรอกเวลาชำระให้ถูกต้อง เช่น 14:30");
      return;
    }

    setPaymentTransactions((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random()}`,
        date: paymentDate,
        time: paymentTime,
        amount,
        method: paymentMethod,
        status: paymentStatus,
        note: paymentNote.trim(),
        slipImage,
        slipFileName,
        slipFileType,
      },
    ]);
    markFieldEdited("paymentTransactions");

    setPaymentAmount("");
    setPaymentNote("");
    setSlipImage("");
    setSlipFileName("");
    setSlipFileType("");

    const nextPaid = totalPaid + amount;
    setPaymentProgress(
      nextPaid >= finalPrice
        ? "ชำระครบแล้ว"
        : nextPaid > 0
          ? "ชำระบางส่วน"
          : "ยังไม่ชำระ"
    );
  };

  const removePaymentTransaction = (id) => {
    setPaymentTransactions((current) =>
      current.filter((transaction) => transaction.id !== id)
    );
    markFieldEdited("paymentTransactions");
  };

  const escapeReceiptText = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const downloadPaymentReceipt = async (transaction, transactionIndex) => {
    const receiptWindow = window.open("", "_blank", "width=900,height=1100");

    if (!receiptWindow) {
      alert("เบราว์เซอร์ปิดกั้นหน้าต่างเอกสาร กรุณาอนุญาต Pop-up แล้วลองใหม่");
      return;
    }

    transaction = normalizePaymentTransactionSlip(transaction, {
      slipImage,
      slipFileName,
      slipFileType,
    });

    const installmentNumber = transactionIndex + 1;
    const cumulativePaid = paymentTransactions
      .slice(0, installmentNumber)
      .reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      );
    const receiptRemaining = Math.max(finalPrice - cumulativePaid, 0);
    const receiptNumber = `PAY-${bookingNumber}-${String(
      installmentNumber
    ).padStart(2, "0")}`;
    const printedAt = new Date();
    const printDateText = `${printedAt.getDate()}/${
      printedAt.getMonth() + 1
    }/${printedAt.getFullYear() + 543}`;
    const paymentDateText = transaction.date
      ? formatThaiDateInput(transaction.date)
      : printDateText;
    const paymentTimeText = transaction.time
      ? `${transaction.time} น.`
      : "ไม่ระบุเวลา";
    const paymentStatusText =
      receiptRemaining <= 0
        ? "ชำระแล้ว"
        : getPaymentDisplayStatus(
            transaction.status,
            Number(transaction.amount || 0)
          );
    const transactionSlipImage = transaction.slipImage || "";
    const transactionSlipFileName = transaction.slipFileName || "";
    const transactionSlipFileType = transaction.slipFileType || "";
    const transactionSlipIsPdf =
      Boolean(transactionSlipImage) &&
      isPdfSlipFile(
        transactionSlipImage,
        transactionSlipFileType,
        transactionSlipFileName
      );
    const transactionSlipIsImage =
      Boolean(transactionSlipImage) &&
      isImageSlipFile(
        transactionSlipImage,
        transactionSlipFileType,
        transactionSlipFileName
      );
    const transactionSlipPreviewDataUrl = transactionSlipIsImage
      ? await imageUrlToDataUrl(getDisplaySlipUrl(transactionSlipImage))
      : "";
    const slipSection = transactionSlipImage
      ? transactionSlipIsPdf
        ? `<div class="slip"><p class="label">หลักฐานการชำระเงิน</p><div class="slip-fallback"><strong>ไฟล์สลิป PDF</strong><span>${escapeReceiptText(
            transactionSlipFileName || "แนบไฟล์ PDF แล้ว"
          )}</span><a href="${escapeReceiptText(
            transactionSlipImage
          )}" target="_blank" rel="noreferrer">เปิดไฟล์สลิป</a></div></div>`
        : transactionSlipPreviewDataUrl
          ? `<div class="slip"><p class="label">หลักฐานการชำระเงิน</p><img src="${escapeReceiptText(
              transactionSlipPreviewDataUrl
            )}" alt="Payment slip" /></div>`
          : `<div class="slip"><p class="label">หลักฐานการชำระเงิน</p><div class="slip-fallback"><strong>มีหลักฐานการโอนแล้ว</strong><span>ไม่สามารถแสดงตัวอย่างสลิปได้ กรุณากดดูไฟล์เต็ม</span><a href="${escapeReceiptText(
              transactionSlipImage
            )}" target="_blank" rel="noreferrer">ดูสลิปเต็ม</a></div></div>`
      : "";

    const receiptArchivePayload = {
      id: receiptNumber,
      receiptNumber,
      bookingNumber,
      installmentNumber,
      customerName: customerName || "-",
      phone: phone || "-",
      email: email || "-",
      service: service || "-",
      eventDate,
      formattedEventDate,
      paymentDate: transaction.date || "",
      paymentDateText,
      paymentTime: transaction.time || "",
      paymentTimeText,
      paymentMethod: transaction.method || "-",
      paymentType: transaction.status || "-",
      paymentNote: transaction.note || "-",
      paymentStatus: paymentStatusText,
      installmentAmount: Number(transaction.amount || 0),
      cumulativePaid,
      finalPrice,
      remainingAmount: receiptRemaining,
      slipImage: transactionSlipImage,
      slipFileName: transactionSlipFileName,
      slipFileType: transactionSlipFileType,
      savedAt: new Date().toISOString(),
    };
    const serializedReceiptArchivePayload = JSON.stringify(
      receiptArchivePayload
    ).replaceAll("<", "\\u003c");
    const serializedArchivesKey = JSON.stringify(ARCHIVES_KEY);

    receiptWindow.document.write(`
      <!doctype html>
      <html lang="th">
        <head>
          <meta charset="utf-8" />
          <title>${escapeReceiptText(receiptNumber)}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
          <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
          <style>
            @page { size: A4; margin: 0; }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body {
              margin: 0;
              background: #dfe3e8;
              color: #18181b;
              font-family: "Noto Sans Thai", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              font-size: 16px;
              line-height: 1.55;
            }
            .page {
              width: 210mm;
              min-height: 297mm;
              margin: 0 auto;
              padding: 26px 30px 22px;
              background: #ffffff;
              display: flex;
              flex-direction: column;
              overflow: hidden;
              box-shadow: 0 18px 55px rgba(24, 24, 27, 0.08);
            }
            .header {
              display: grid;
              grid-template-columns: minmax(0, 1fr) 280px;
              align-items: center;
              gap: 24px;
              padding: 0 0 18px;
              border-bottom: 2px solid #18181b;
            }
            .brand-wrap {
              display: flex;
              align-items: center;
              gap: 16px;
              min-width: 0;
            }
            .brand-logo {
              width: 78px;
              height: 78px;
              border-radius: 999px;
              object-fit: cover;
              flex: 0 0 auto;
              box-shadow: 0 8px 22px rgba(87, 43, 5, 0.18);
            }
            .brand h1 {
              margin: 0;
              font-size: 27px;
              line-height: 1.15;
              font-weight: 800;
              letter-spacing: -0.2px;
            }
            .brand p {
              margin: 4px 0 0;
              color: #71717a;
              font-size: 14px;
            }
            .document-number {
              min-width: 0;
              text-align: right;
              padding: 0;
              border: 0;
              border-radius: 0;
              background: transparent;
            }
            .document-number h2 {
              margin: 0;
              font-size: 21px;
              line-height: 1.15;
              font-weight: 800;
            }
            .document-number p {
              margin: 3px 0 0;
              font-size: 16px;
              font-weight: 800;
            }
            .document-number .sub {
              margin-top: 2px;
              color: #71717a;
              font-size: 14px;
              font-weight: 500;
            }
            .title {
              margin: 18px 0 14px;
              text-align: center;
              font-size: 26px;
              line-height: 1.2;
              font-weight: 800;
            }
            .title::after {
              content: "";
              display: block;
              width: 42px;
              height: 3px;
              margin: 9px auto 0;
              border-radius: 999px;
              background: #059669;
            }
            .grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 34px;
              margin: 6px 0 20px;
              padding: 0 6px;
            }
            .info-block {
              min-width: 0;
            }
            .info-block h3 {
              margin: 0 0 12px;
              font-size: 21px;
              font-weight: 800;
              color: #18181b;
            }
            .info-line {
              margin: 7px 0;
              font-size: 17px;
              color: #27272a;
              line-height: 1.5;
              overflow-wrap: anywhere;
            }
            .payment-table {
              margin-top: 8px;
              overflow: hidden;
              border: 1px solid #d4d4d8;
              border-radius: 16px;
              background: #ffffff;
            }
            .payment-table-header {
              display: flex;
              align-items: center;
              justify-content: flex-start;
              padding: 13px 18px;
              background: #18181b;
              color: #ffffff;
              text-align: left;
            }
            .payment-table-header h3 {
              margin: 0;
              font-size: 18px;
              font-weight: 800;
            }
            .payment-table-header p {
              margin: 2px 0 0;
              color: #d4d4d8;
              font-size: 11px;
            }
            .payment-table-body {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 0 22px;
              padding: 9px 18px 10px;
            }
            .row {
              display: grid;
              grid-template-columns: minmax(110px, 0.8fr) minmax(0, 1.2fr);
              align-items: center;
              gap: 12px;
              padding: 6px 0;
              border-bottom: 1px solid #e4e4e7;
            }
            .row:nth-last-child(-n + 2) { border-bottom: 0; }
            .label {
              color: #52525b;
              font-weight: 500;
            }
            .value {
              text-align: right;
              font-weight: 700;
              overflow-wrap: anywhere;
            }
            .summary-wrap {
              width: 100%;
              margin-top: 14px;
            }
            .amount-card {
              width: 100%;
              border: 1px solid #d4d4d8;
              border-radius: 16px;
              overflow: hidden;
              background: #ffffff;
            }
            .amount-card .heading {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 14px;
              padding: 11px 16px;
              background: #18181b;
              color: #ffffff;
              border-bottom: 0;
            }
            .amount-card .heading strong {
              font-size: 17px;
              font-weight: 800;
            }
            .amount-card .heading span {
              color: #d4d4d8;
              font-size: 11px;
              font-weight: 500;
              text-align: right;
              white-space: nowrap;
            }
            .amount-card .content {
              display: grid;
              grid-template-columns: repeat(4, minmax(0, 1fr));
              padding: 0;
              background: #ffffff;
            }
            .summary-item {
              min-width: 0;
              padding: 12px 14px 14px;
              border-right: 1px solid #e4e4e7;
              text-align: center;
            }
            .summary-item:last-child {
              border-right: 0;
            }
            .summary-item .label {
              display: block;
              margin-bottom: 5px;
              color: #71717a;
              font-size: 11px;
              font-weight: 500;
              white-space: nowrap;
            }
            .summary-item .value {
              display: block;
              color: #18181b;
              font-size: 18px;
              line-height: 1.2;
              font-weight: 800;
              text-align: center;
              white-space: nowrap;
            }
            .summary-item.featured {
              background: #ecfdf5;
            }
            .summary-item.featured .label,
            .summary-item.featured .value {
              color: #047857;
            }
            .summary-item.featured .value {
              font-size: 22px;
            }
            .signature-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 18px;
              margin-top: auto;
              padding-top: 24px;
            }
            .signature-box {
              min-height: 96px;
              padding: 14px 18px;
              border: 1.5px solid #18181b;
              border-radius: 16px;
              background: #ffffff;
              text-align: center;
            }
            .signature-box h3 {
              margin: 0;
              font-size: 17px;
              font-weight: 800;
            }
            .signature-line {
              width: 68%;
              margin: 20px auto 8px;
              border-top: 1px solid #18181b;
            }
            .signature-box p {
              margin: 0;
              color: #71717a;
              font-size: 12px;
            }
            .signature-box .studio-name {
              margin-top: 14px;
              color: #18181b;
              font-size: 14px;
              font-weight: 700;
            }
            .signature-box .date-text {
              margin-top: 10px;
              color: #71717a;
              font-size: 12px;
            }
            .slip { margin-top: 16px; }
            .slip .label {
              margin: 0 0 10px;
              font-size: 19px;
              font-weight: 800;
              color: #18181b;
            }
            .slip img {
              display: block;
              max-width: 100%;
              max-height: 92mm;
              margin: 0 auto;
              border: 1px solid #d4d4d8;
              border-radius: 16px;
              object-fit: contain;
            }
            .slip-fallback {
              display: flex;
              min-height: 52mm;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 8px;
              border: 1px dashed #d4d4d8;
              border-radius: 16px;
              background: #fafafa;
              color: #52525b;
              text-align: center;
              padding: 18px;
            }
            .slip-fallback strong {
              color: #27272a;
              font-size: 18px;
            }
            .slip-fallback span {
              color: #71717a;
              font-size: 13px;
            }
            .slip-fallback a {
              display: inline-flex;
              margin-top: 4px;
              border-radius: 12px;
              background: #18181b;
              color: #ffffff;
              padding: 10px 14px;
              font-size: 13px;
              font-weight: 800;
              text-decoration: none;
            }
            .footer {
              margin-top: 16px;
              padding-top: 14px;
              border-top: 1px solid #e4e4e7;
              color: #a1a1aa;
              font-size: 12px;
              text-align: center;
            }
            .receipt-actions {
              position: fixed;
              right: 24px;
              bottom: 24px;
              z-index: 100;
              display: flex;
              align-items: flex-end;
              gap: 10px;
            }
            .download-menu-wrap {
              position: relative;
            }
            .download-menu {
              position: absolute;
              right: 0;
              bottom: calc(100% + 10px);
              display: none;
              min-width: 150px;
              overflow: hidden;
              border: 1px solid #d4d4d8;
              border-radius: 14px;
              background: #ffffff;
              box-shadow: 0 14px 35px rgba(24, 24, 27, 0.18);
            }
            .download-menu.show {
              display: block;
            }
            .download-menu button {
              display: block;
              width: 100%;
              border-radius: 0;
              padding: 11px 14px;
              background: #ffffff;
              color: #18181b;
              text-align: left;
              box-shadow: none;
            }
            .download-menu button:hover {
              background: #f4f4f5;
            }
            .receipt-actions button {
              border: 0;
              border-radius: 14px;
              padding: 12px 18px;
              font-family: inherit;
              font-size: 14px;
              font-weight: 800;
              cursor: pointer;
              box-shadow: 0 10px 30px rgba(24, 24, 27, 0.18);
            }
            .receipt-actions .save-button {
              background: #059669;
              color: #ffffff;
            }
            .receipt-actions .save-button:disabled {
              cursor: default;
              opacity: 0.75;
            }
            .receipt-actions .download-button {
              background: #18181b;
              color: #ffffff;
            }
            .receipt-actions .close-button {
              border: 1px solid #d4d4d8;
              background: #ffffff;
              color: #3f3f46;
            }
            @media print {
              body {
                background: #ffffff;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .page {
                margin: 0;
                box-shadow: none;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .payment-table,
              .amount-card,
              .signature-box {
                border-color: #18181b !important;
              }
              .payment-table-header,
              .amount-card .heading {
                background: #18181b !important;
                color: #ffffff !important;
              }
              .summary-item.featured {
                background: #ecfdf5 !important;
              }
              .receipt-actions { display: none !important; }
            }
          </style>
        </head>
        <body>
          <main class="page">
            <header class="header">
              <div class="brand-wrap">
                <img class="brand-logo" src="/logo.png" alt="Adisorn Wedding Studio" />
                <div class="brand">
                  <h1>Adisorn Wedding Studio</h1>
                  <p>adisornweddingstudio@gmail.com</p>
                  <p>โทร. 082 141 9633</p>
                </div>
              </div>
              <div class="document-number">
                <h2>ใบรับชำระเงินรายงวด</h2>
                <p>${escapeReceiptText(receiptNumber)}</p>
                <p class="sub">อ้างอิงใบจอง ${escapeReceiptText(bookingNumber)}</p>
              </div>
            </header>

            <h2 class="title">ใบรับชำระเงิน งวดที่ ${installmentNumber}</h2>

            <section class="grid">
              <div class="info-block">
                <h3>ข้อมูลลูกค้า</h3>
                <p class="info-line">ชื่อลูกค้า : ${escapeReceiptText(customerName || "-")}</p>
                <p class="info-line">เบอร์โทรศัพท์ : ${escapeReceiptText(phone || "-")}</p>
                <p class="info-line">อีเมล : ${escapeReceiptText(email || "-")}</p>
              </div>

              <div class="info-block">
                <h3>รายละเอียดการจอง</h3>
                <p class="info-line">เลขที่ใบจอง : ${escapeReceiptText(bookingNumber)}</p>
                <p class="info-line">ประเภทงาน : ${escapeReceiptText(service || "-")}</p>
                <p class="info-line">วันที่งาน : ${escapeReceiptText(formattedEventDate)}</p>
              </div>
            </section>

            <section class="payment-table">
              <div class="payment-table-header">
                <div>
                  <h3>รายละเอียดการชำระ</h3>
                  <p>ข้อมูลการชำระเงินสำหรับงวดนี้</p>
                </div>
              </div>
              <div class="payment-table-body">
                <div class="row"><span class="label">วันที่ชำระ</span><span class="value">${escapeReceiptText(paymentDateText)}</span></div>
                <div class="row"><span class="label">เวลาชำระ</span><span class="value">${escapeReceiptText(paymentTimeText)}</span></div>
                <div class="row"><span class="label">วิธีชำระ</span><span class="value">${escapeReceiptText(transaction.method || "-")}</span></div>
                <div class="row"><span class="label">ประเภทการชำระ</span><span class="value">${escapeReceiptText(transaction.status || "-")}</span></div>
                <div class="row"><span class="label">หมายเหตุ</span><span class="value">${escapeReceiptText(transaction.note || "-")}</span></div>
                <div class="row"><span class="label">สถานะ</span><span class="value">${escapeReceiptText(paymentStatusText)}</span></div>
              </div>
            </section>

            <div class="summary-wrap">
              <section class="amount-card">
                <div class="heading">
                  <strong>สรุปยอดการชำระ</strong>
                  <span>อ้างอิงใบจอง ${escapeReceiptText(bookingNumber)}</span>
                </div>
                <div class="content">
                  <div class="summary-item">
                    <span class="label">ยอดสุทธิทั้งหมด</span>
                    <span class="value">฿ ${finalPrice.toLocaleString()}</span>
                  </div>
                  <div class="summary-item featured">
                    <span class="label">ชำระงวดนี้</span>
                    <span class="value">฿ ${Number(transaction.amount || 0).toLocaleString()}</span>
                  </div>
                  <div class="summary-item">
                    <span class="label">ยอดชำระสะสม</span>
                    <span class="value">฿ ${cumulativePaid.toLocaleString()}</span>
                  </div>
                  <div class="summary-item">
                    <span class="label">ยอดคงเหลือ</span>
                    <span class="value">฿ ${receiptRemaining.toLocaleString()}</span>
                  </div>
                </div>
              </section>
            </div>

            ${slipSection}

            <section class="signature-grid">
              <div class="signature-box">
                <h3>ลูกค้า</h3>
                <div class="signature-line"></div>
                <p>วันที่ ........../........../..........</p>
              </div>

              <div class="signature-box">
                <h3>Adisorn Wedding Studio</h3>
                <p class="studio-name">ผู้รับชำระเงิน</p>
                <p class="date-text">วันที่ ${escapeReceiptText(paymentDateText)}</p>
              </div>
            </section>

            <footer class="footer">
              เอกสารฉบับนี้ออกโดยระบบ Adisorn Wedding Studio และอ้างอิงจากเลขที่ใบจอง ${escapeReceiptText(bookingNumber)}
            </footer>
          </main>
          <div class="receipt-actions">
            <button
              type="button"
              class="close-button"
              onclick="window.close()"
            >
              ปิดหน้าต่าง
            </button>
            <button
              id="save-receipt-button"
              type="button"
              class="save-button"
              onclick="saveReceiptToArchive()"
            >
              บันทึกเข้าคลังข้อมูล
            </button>
            <div class="download-menu-wrap">
              <button
                type="button"
                class="download-button"
                onclick="toggleDownloadMenu()"
              >
                ดาวน์โหลด
              </button>
              <div id="download-menu" class="download-menu">
                <button type="button" onclick="downloadReceiptPDF()">
                  PDF
                </button>
                <button type="button" onclick="downloadReceiptJPG()">
                  JPG
                </button>
              </div>
            </div>
          </div>
          <script>
            const receiptArchiveData = ${serializedReceiptArchivePayload};
            const receiptArchiveKey = ${JSON.stringify(PAYMENT_RECEIPTS_KEY)};
            const archivesKey = ${serializedArchivesKey};

            const toggleDownloadMenu = () => {
              document.getElementById("download-menu")?.classList.toggle("show");
            };

            const downloadReceiptPDF = () => {
              document.getElementById("download-menu")?.classList.remove("show");
              window.print();
            };

            const loadHtml2Canvas = () =>
              new Promise((resolve, reject) => {
                if (window.html2canvas) {
                  resolve(window.html2canvas);
                  return;
                }

                const script = document.createElement("script");
                script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
                script.onload = () => resolve(window.html2canvas);
                script.onerror = () => reject(new Error("โหลดเครื่องมือสร้าง JPG ไม่สำเร็จ"));
                document.head.appendChild(script);
              });

            const downloadReceiptJPG = async () => {
              document.getElementById("download-menu")?.classList.remove("show");

              try {
                const html2canvas = await loadHtml2Canvas();
                const page = document.querySelector(".page");
                if (!page) throw new Error("ไม่พบหน้าเอกสาร");

                const canvas = await html2canvas(page, {
                  scale: 2,
                  useCORS: true,
                  backgroundColor: "#ffffff",
                  logging: false,
                });
                const link = document.createElement("a");
                link.download = receiptArchiveData.receiptNumber + ".jpg";
                link.href = canvas.toDataURL("image/jpeg", 0.95);
                link.click();
              } catch (error) {
                console.error("Cannot download receipt JPG", error);
                window.alert("ไม่สามารถสร้างไฟล์ JPG ได้ กรุณาลองใหม่อีกครั้ง");
              }
            };

            const saveReceiptToArchive = () => {
              const saveButton = document.getElementById("save-receipt-button");

              try {
                const storedValue = localStorage.getItem(receiptArchiveKey);
                const parsedValue = storedValue ? JSON.parse(storedValue) : [];
                const receipts = Array.isArray(parsedValue) ? parsedValue : [];
                const existingIndex = receipts.findIndex(
                  (item) => item?.receiptNumber === receiptArchiveData.receiptNumber
                );
                const receiptDocumentClone = document.documentElement.cloneNode(true);
                receiptDocumentClone
                  .querySelectorAll(".receipt-actions, script")
                  .forEach((element) => element.remove());

                const savedReceipt = {
                  ...receiptArchiveData,
                  receiptHtml: "<!doctype html>" + receiptDocumentClone.outerHTML,
                  savedAt: new Date().toISOString(),
                };

                if (existingIndex >= 0) {
                  receipts[existingIndex] = savedReceipt;
                } else {
                  receipts.unshift(savedReceipt);
                }

                localStorage.setItem(receiptArchiveKey, JSON.stringify(receipts));

                const storedArchivesValue = localStorage.getItem(archivesKey);
                const parsedArchivesValue = storedArchivesValue
                  ? JSON.parse(storedArchivesValue)
                  : [];
                const archives = Array.isArray(parsedArchivesValue)
                  ? parsedArchivesValue
                  : [];
                const archiveRecord = {
                  ...savedReceipt,
                  id: "payment-receipt-" + savedReceipt.receiptNumber,
                  archiveType: "payment-receipt",
                  category: "ใบรับชำระเงิน",
                  documentType: "ใบรับชำระเงิน",
                  title: "ใบรับชำระเงิน " + savedReceipt.receiptNumber,
                  subtitle:
                    savedReceipt.customerName +
                    " · งวดที่ " +
                    savedReceipt.installmentNumber +
                    " · ฿ " +
                    Number(savedReceipt.installmentAmount || 0).toLocaleString(),
                  searchableText: [
                    savedReceipt.receiptNumber,
                    savedReceipt.bookingNumber,
                    savedReceipt.customerName,
                    savedReceipt.phone,
                    savedReceipt.email,
                    savedReceipt.paymentMethod,
                    savedReceipt.paymentStatus,
                  ]
                    .filter(Boolean)
                    .join(" "),
                  savedAt: new Date().toISOString(),
                };
                const existingArchiveIndex = archives.findIndex(
                  (item) =>
                    item?.archiveType === "payment-receipt" &&
                    item?.receiptNumber === savedReceipt.receiptNumber
                );

                if (existingArchiveIndex >= 0) {
                  archives[existingArchiveIndex] = archiveRecord;
                } else {
                  archives.unshift(archiveRecord);
                }

                localStorage.setItem(archivesKey, JSON.stringify(archives));

                if (saveButton) {
                  saveButton.textContent = "บันทึกเข้าคลังแล้ว";
                  saveButton.disabled = true;
                }
              } catch (error) {
                console.error("Cannot save payment receipt", error);
                window.alert(
                  "ไม่สามารถบันทึกใบรับชำระเข้าคลังข้อมูลได้ พื้นที่จัดเก็บอาจไม่เพียงพอ"
                );
              }
            };

            window.addEventListener("load", () => {
              document.title = ${JSON.stringify(receiptNumber)};

              try {
                const storedValue = localStorage.getItem(receiptArchiveKey);
                const parsedValue = storedValue ? JSON.parse(storedValue) : [];
                const isSaved =
                  Array.isArray(parsedValue) &&
                  parsedValue.some(
                    (item) =>
                      item?.receiptNumber === receiptArchiveData.receiptNumber &&
                      Boolean(item?.receiptHtml)
                  );
                const saveButton = document.getElementById("save-receipt-button");

                if (saveButton) {
                  if (isSaved) {
                    saveButton.textContent = "บันทึกเข้าคลังแล้ว";
                    saveButton.disabled = true;
                  } else {
                    saveButton.textContent = "บันทึกต้นฉบับเข้าคลัง";
                    saveButton.disabled = false;
                  }
                }
              } catch (error) {
                console.error("Cannot check payment receipt archive", error);
              }
            });
          </script>
        </body>
      </html>
    `);

    receiptWindow.document.close();
  };

  const validateBooking = () => {
    if (!customerName.trim()) {
      alert("กรุณากรอกชื่อลูกค้า");
      return false;
    }

    if (!phone.trim()) {
      alert("กรุณากรอกเบอร์โทรศัพท์");
      return false;
    }

    if (!service.trim()) {
      alert("กรุณากรอกประเภทงาน");
      return false;
    }

    if (!eventDate) {
      alert("กรุณาเลือกวันที่งาน");
      return false;
    }

    if (!isValidTime(startTime)) {
      alert("กรุณากรอกเวลาเริ่มงานให้ถูกต้อง เช่น 09:00");
      return false;
    }

    if (!isValidTime(endTime)) {
      alert("กรุณากรอกเวลาจบงานให้ถูกต้อง เช่น 18:00");
      return false;
    }

    if (serviceItems.length === 0) {
      alert("กรุณาเพิ่มรายการบริการอย่างน้อย 1 รายการ");
      return false;
    }

    if (finalPrice <= 0) {
      alert("ยอดรวมสุทธิต้องมากกว่า 0 บาท");
      return false;
    }

    if (totalPaid > finalPrice) {
      alert("ยอดชำระรวมต้องไม่มากกว่ายอดรวมสุทธิ");
      return false;
    }

    if (paymentProgress === "ชำระครบแล้ว" && totalPaid !== finalPrice) {
      alert("สถานะชำระครบแล้วต้องมียอดชำระรวมเท่ากับยอดรวมสุทธิ");
      return false;
    }

    if (Number(discountPercent || 0) > 100) {
      alert("ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100%");
      return false;
    }

    return true;
  };

  const clearForm = ({ keepCustomer = false } = {}) => {
    localStorage.removeItem(BOOKING_DRAFT_KEY);
    setDraftStatus("");
    setEditedFields({});
    if (!keepCustomer) {
      setCustomerName("");
      setPhone("");
      setEmail("");
    }

    setService("");
    setLocation("");
    setEventDate("");
    setStartTime("");
    setEndTime("");
    setServiceItems([]);
    setDiscountPercent("");
    setDiscountAmount("");
    setSlipImage("");
    setSlipFileName("");
    setSlipFileType("");
    setPaymentDate("");
    setPaymentTime("");
    setPaymentAmount("");
    setPaymentMethod("โอนเงิน");
    setPaymentStatus("มัดจำ");
    setPaymentProgress("ยังไม่ชำระ");
    setPaymentNote("");
    setPaymentTransactions([]);
    setJobStatus("รอยืนยัน");
    setCalendarColor(DEFAULT_CALENDAR_COLOR);
    setLastSavedBookingNumber("");
    setPendingCustomerRequestId("");
    setIsBookingSaved(false);
    setIsEditingBooking(false);
    setLoadedBookingNumber("");
    setCustomBookingNumber(
      localStorage.getItem(BOOKING_NUMBER_MODE_KEY) === "custom"
        ? localStorage.getItem(CUSTOM_BOOKING_NUMBER_KEY) || ""
        : ""
    );

    const now = new Date();
    setBookingDate(now.toLocaleString("th-TH"));
    setToday(now.toLocaleDateString("th-TH"));
  };

  const createNewBooking = () => {
    clearForm();
    setIsViewMode(false);
    setIsDownloadMenuOpen(false);
    setCustomBookingNumber(
      localStorage.getItem(BOOKING_NUMBER_MODE_KEY) === "custom"
        ? localStorage.getItem(CUSTOM_BOOKING_NUMBER_KEY) || ""
        : ""
    );
    localStorage.removeItem(SELECTED_BOOKING_KEY);
    localStorage.removeItem(CURRENT_BOOKING_KEY);

    const customers = readArrayFromStorage(CUSTOMERS_KEY);
    const savedSequenceOverride = Number(
      localStorage.getItem(NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY)
    );
    const resetSequenceActive =
      localStorage.getItem(RESET_BOOKING_SEQUENCE_ACTIVE_KEY) === "true";

    setCustomerCount(customers.length);
    setNextBookingSequence(
      resetSequenceActive &&
        Number.isFinite(savedSequenceOverride) &&
        savedSequenceOverride > 0
        ? savedSequenceOverride
        : getNextBookingSequence(customers)
    );
    if (!resetSequenceActive) {
      getNextAvailableBookingNumber({
        brandId: BRAND_ID,
        supabaseClient: supabase,
      }).then(({ sequence }) => {
        if (sequence != null) setNextBookingSequence(sequence);
      });
    }
    window.history.replaceState({}, "", ROUTES.booking);
  };

  const duplicateBooking = () => {
    setIsBookingSaved(false);
    const customers = readArrayFromStorage(CUSTOMERS_KEY);
    const now = new Date();

    const savedSequenceOverride = Number(
      localStorage.getItem(NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY)
    );
    const resetSequenceActive =
      localStorage.getItem(RESET_BOOKING_SEQUENCE_ACTIVE_KEY) === "true";

    setCustomerCount(customers.length);
    setNextBookingSequence(
      resetSequenceActive &&
        Number.isFinite(savedSequenceOverride) &&
        savedSequenceOverride > 0
        ? savedSequenceOverride
        : getNextBookingSequence(customers, now)
    );
    if (!resetSequenceActive) {
      getNextAvailableBookingNumber({
        brandId: BRAND_ID,
        supabaseClient: supabase,
        date: now,
      }).then(({ sequence }) => {
        if (sequence != null) setNextBookingSequence(sequence);
      });
    }
    setLoadedBookingNumber("");
    setCustomBookingNumber(
      localStorage.getItem(BOOKING_NUMBER_MODE_KEY) === "custom"
        ? localStorage.getItem(CUSTOM_BOOKING_NUMBER_KEY) || ""
        : ""
    );
    setBookingDate(now.toLocaleString("th-TH"));
    setToday(now.toLocaleDateString("th-TH"));
    setSlipImage("");
    setSlipFileName("");
    setSlipFileType("");
    setPaymentDate("");
    setPaymentTime("");
    setPaymentAmount("");
    setPaymentStatus("มัดจำ");
    setPaymentProgress("ยังไม่ชำระ");
    setPaymentNote("");
    setPaymentTransactions([]);
    setLastSavedBookingNumber("");
    alert("คัดลอกข้อมูลแล้ว กรุณาตรวจสอบวันที่ เวลา และข้อมูลการชำระเงินก่อนบันทึก");
  };

  const handleSlipUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      alert("กรุณาเลือกไฟล์รูปภาพหรือ PDF เท่านั้น");
      event.target.value = "";
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      alert("ไฟล์รูปมีขนาดใหญ่เกิน 12 MB กรุณาเลือกรูปที่เล็กลง");
      event.target.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024 && file.type.startsWith("image/")) {
      alert("ไฟล์มีขนาดใหญ่กว่า 2 MB ระบบจะย่อรูปให้อัตโนมัติ");
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (file.type === "application/pdf") {
        setSlipImage(String(reader.result || ""));
        setSlipFileName(file.name);
        setSlipFileType(file.type);
        return;
      }

      const image = new Image();
      image.onload = () => {
        const maxDimension = 1000;
        const scale = Math.min(
          1,
          maxDimension / Math.max(image.width, image.height)
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        setSlipImage(canvas.toDataURL("image/jpeg", 0.62));
        setSlipFileName(file.name);
        setSlipFileType(file.type || "image/jpeg");
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

// =========================
// PDF
// =========================
  const saveCustomer = async ({ forceUpdate = false } = {}) => {
  if (isSaving || saveLockRef.current) return;

  if (isBookingSaved && !forceUpdate) {
    window.alert("ใบจองนี้บันทึกเรียบร้อยแล้ว ไม่สามารถบันทึกซ้ำได้");
    return;
  }

  if (forceUpdate && !hasEditedFields) {
    window.alert("ยังไม่มีข้อมูลที่แก้ไข");
    return;
  }

  if (!validateBooking()) return;

    saveLockRef.current = true;
    setIsSaving(true);
    const currentSlip = { slipImage, slipFileName, slipFileType };
    const normalizedPaymentTransactions = paymentTransactions.map((transaction) =>
      normalizePaymentTransactionSlip(transaction, currentSlip)
    );

    let resolvedBookingNumber = bookingNumber;
    const isAutomaticNewBooking =
      !forceUpdate && !loadedBookingNumber && !customBookingNumber.trim();

    if (isAutomaticNewBooking) {
      const nextAvailable = await getNextAvailableBookingNumber({
        brandId: BRAND_ID,
        supabaseClient: supabase,
        date: todayRaw,
      });

      if (nextAvailable.sequence == null) {
        window.alert(
          "เลขที่การจองถูกใช้งานครบ 0001 ถึง 9999 แล้ว กรุณาใช้เลขแบบกำหนดเอง"
        );
        setIsSaving(false);
        return;
      }

      resolvedBookingNumber = nextAvailable.bookingNumber;
      setNextBookingSequence(nextAvailable.sequence);
    }

    let customer = {
      bookingNumber: resolvedBookingNumber,
      customerName,
      phone,
      email,
      service,
      location,
      eventDate,
      startTime,
      endTime,
      formattedEventDate,
      bookingDate,
      today,
      serviceItems,
      serviceTotal,
      discountPercent,
      discountAmount,
      totalDiscount,
      finalPrice,
      slipImage,
      slipFileName,
      slipFileType,
      paymentDate,
      paymentTime,
      paymentAmount,
      paymentMethod,
      paymentStatus,
      paymentProgress,
      jobStatus,
      calendarColor,
      remainingPayment: previewRemainingPayment,
      paymentNote,
      paymentTransactions: normalizedPaymentTransactions,
      totalPaid: previewTotalPaid,
      brandId: BRAND_ID,
    };

    const oldData = readArrayFromStorage(CUSTOMERS_KEY);
    const savedBookingNumberFromStorage = (() => {
      try {
        const rawBooking =
          localStorage.getItem(SELECTED_BOOKING_KEY) ||
          localStorage.getItem(CURRENT_BOOKING_KEY);
        const parsedBooking = rawBooking ? JSON.parse(rawBooking) : null;

        return parsedBooking?.bookingNumber || "";
      } catch (error) {
        console.error("Cannot read saved booking number", error);
        return "";
      }
    })();
    const originalBookingNumbers = [
      loadedBookingNumber,
      lastSavedBookingNumber,
      savedBookingNumberFromStorage,
      forceUpdate ? resolvedBookingNumber : "",
    ].filter(Boolean);
    const existingIndex = oldData.findIndex((item) =>
      originalBookingNumbers.includes(item.bookingNumber)
    );
    const existingCustomer =
      existingIndex !== -1 ? oldData[existingIndex] : null;

    const duplicateBookingIndex = oldData.findIndex(
      (item, index) =>
        item.bookingNumber === resolvedBookingNumber && index !== existingIndex
    );

    if (duplicateBookingIndex !== -1) {
      alert(`พบเลขที่การจองซ้ำในฐานข้อมูล: ${resolvedBookingNumber}`);
      setIsSaving(false);
      return;
    }

    if (existingIndex !== -1 && !forceUpdate) {
      alert("เลขที่การจองนี้ถูกบันทึกแล้ว กรุณากดปุ่ม ‘แก้ไขใบจอง’ หรือสร้างใบจองใหม่");
      setIsSaving(false);
      return;
    }

    if (existingIndex !== -1) {
      oldData[existingIndex] = customer;
    } else {
      oldData.push(customer);
    }

    try {
      const customerIndex = existingIndex !== -1 ? existingIndex : oldData.length - 1;
      const getBookingPayload = (booking) => ({
        booking_number: booking.bookingNumber,
        customer_name: booking.customerName,
        phone: booking.phone,
        email: booking.email,
        service: booking.service,
        location: booking.location,
        event_date: booking.eventDate || null,
        job_status: booking.jobStatus || "รอยืนยัน",
        booking_data: booking,
        archived: false,
        deleted: false,
      });
      const saveBookingToSupabase = async (booking) => {
        if (existingIndex !== -1 || forceUpdate) {
          const updateQuery = supabase
            .from("bookings")
            .update(getBookingPayload(booking));

          if (existingCustomer?.supabaseId) {
            return updateQuery.eq("id", existingCustomer.supabaseId);
          }

          return updateQuery.eq(
            "booking_number",
            existingCustomer?.bookingNumber ||
              savedBookingNumberFromStorage ||
              loadedBookingNumber ||
              booking.bookingNumber
          );
        }

        return supabase
          .from("bookings")
          .insert(getBookingPayload(booking))
          .select()
          .single();
      };
      const getAvailableBookingNumber = async () => {
        const latestBookings = oldData.filter(
          (_, index) => index !== customerIndex
        );
        const nextAvailable = await getNextAvailableBookingNumber({
          brandId: BRAND_ID,
          supabaseClient: supabase,
          date: todayRaw,
          extraItems: latestBookings,
        });

        if (nextAvailable.sequence == null) return "";

        return nextAvailable.bookingNumber;
      };

      let { error } = await saveBookingToSupabase(customer);
      let duplicateRetryCount = 0;

      while (
        isDuplicateBookingNumberError(error) &&
        existingIndex === -1 &&
        !forceUpdate &&
        duplicateRetryCount < 10
      ) {
        duplicateRetryCount += 1;
        const uniqueBookingNumber = await getAvailableBookingNumber();

        if (!uniqueBookingNumber) break;

        customer = {
          ...customer,
          bookingNumber: uniqueBookingNumber,
        };
        oldData[customerIndex] = customer;
        setNextBookingSequence(Number(uniqueBookingNumber.slice(-4)));

        ({ error } = await saveBookingToSupabase(customer));
      }

      if (error) {
        console.error(error);
        alert(`บันทึกลง Supabase ไม่สำเร็จ\n${error.message || ""}`);
        return;
      }

      try {
        await saveAutocompleteHistory(BRAND_ID, customer);
        const updatedAutocompleteOptions = mergeAutocompleteOptions(
          autocompleteOptions,
          getAutocompleteOptionsFromBookings([customer])
        );

        setAutocompleteOptions(updatedAutocompleteOptions);
        setLocationSuggestions(updatedAutocompleteOptions.location);
      } catch (historyError) {
        if (!isMissingAutocompleteTableError(historyError)) {
          console.error("Cannot save autocomplete history", historyError);
        }
      }

      localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(oldData));
      localStorage.setItem(CURRENT_BOOKING_KEY, JSON.stringify(customer));
      setCustomerCount(oldData.length);

      localStorage.removeItem(NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY);
      localStorage.removeItem(RESET_BOOKING_SEQUENCE_ACTIVE_KEY);

      const nextSequence = getNextBookingSequence(oldData);
      if (nextSequence != null) setNextBookingSequence(nextSequence);

      setLastSavedBookingNumber(customer.bookingNumber);
      setLoadedBookingNumber(customer.bookingNumber);
      setIsBookingSaved(true);
      setIsEditingBooking(false);
      setEditedFields({});
      localStorage.removeItem(BOOKING_DRAFT_KEY);
      setDraftStatus("");

      if (pendingCustomerRequestId && existingIndex === -1) {
        try {
          updateLocalCustomerRequest(BRAND_ID, pendingCustomerRequestId, {
            status: "converted",
            bookingId: customer.bookingNumber,
          });
          await fetch("/api/customer-requests", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: pendingCustomerRequestId,
              brand: BRAND_ID,
              status: "converted",
              bookingId: customer.bookingNumber,
            }),
          });
          setPendingCustomerRequestId("");
        } catch (requestUpdateError) {
          console.error("Cannot mark customer request converted", requestUpdateError);
        }
      }

      if (existingIndex === -1) {
        setCustomBookingNumber("");
        localStorage.removeItem(CUSTOM_BOOKING_NUMBER_KEY);
        localStorage.setItem(BOOKING_NUMBER_MODE_KEY, "auto");
        // localStorage.removeItem(NEXT_BOOKING_SEQUENCE_OVERRIDE_KEY); // Removed duplicate line if present

        const now = new Date();
        setBookingDate(now.toLocaleString("th-TH"));
        setToday(now.toLocaleDateString("th-TH"));
      }

      alert(
        existingIndex !== -1 || forceUpdate
          ? "แก้ไขข้อมูลสำเร็จ"
          : "บันทึกข้อมูลสำเร็จ"
      );
    } catch (error) {
      console.error("Cannot save booking", error);
      alert("ไม่สามารถบันทึกข้อมูลได้ พื้นที่จัดเก็บอาจไม่เพียงพอ กรุณาลดขนาดรูปสลิปหรือลบข้อมูลเก่าบางส่วน");
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  };


const downloadPDF = async () => {
  if (isExporting) return;
  if (!validateBooking()) return;

  setIsExporting(true);

  try {
    const pdfAttachment = await createBookingPdfAttachment();
    downloadBlob(pdfAttachment.blob, pdfAttachment.filename);
  } catch (error) {
    console.error("PDF export error:", error);
    alert(HIGH_QUALITY_PDF_ERROR_MESSAGE);
  } finally {
    setIsExporting(false);
  }
};

const stringToBytes = (value) =>
  new TextEncoder().encode(String(value || ""));

const concatBytes = (chunks) => {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });

  return result;
};

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () =>
      resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const createPdfBlobFromJpegs = (images) => {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const objects = [];
  const pageObjectNumbers = [];
  const imageObjectNumbers = [];
  const contentObjectNumbers = [];

  objects[1] = stringToBytes("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  images.forEach((image, index) => {
    const pageObjectNumber = 3 + index * 3;
    const imageObjectNumber = pageObjectNumber + 1;
    const contentObjectNumber = pageObjectNumber + 2;
    const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im${index + 1} Do\nQ`;

    pageObjectNumbers.push(pageObjectNumber);
    imageObjectNumbers.push(imageObjectNumber);
    contentObjectNumbers.push(contentObjectNumber);

    objects[pageObjectNumber] = stringToBytes(
      `${pageObjectNumber} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${
        index + 1
      } ${imageObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>\nendobj\n`
    );

    objects[imageObjectNumber] = concatBytes([
      stringToBytes(
        `${imageObjectNumber} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`
      ),
      image.bytes,
      stringToBytes("\nendstream\nendobj\n"),
    ]);

    objects[contentObjectNumber] = stringToBytes(
      `${contentObjectNumber} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`
    );
  });

  objects[2] = stringToBytes(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjectNumbers
      .map((objectNumber) => `${objectNumber} 0 R`)
      .join(" ")}] /Count ${pageObjectNumbers.length} >>\nendobj\n`
  );

  const maxObjectNumber = Math.max(
    2,
    ...pageObjectNumbers,
    ...imageObjectNumbers,
    ...contentObjectNumbers
  );
  const chunks = [stringToBytes("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n")];
  const offsets = [0];
  let byteOffset = chunks[0].length;

  for (let objectNumber = 1; objectNumber <= maxObjectNumber; objectNumber += 1) {
    offsets[objectNumber] = byteOffset;
    chunks.push(objects[objectNumber]);
    byteOffset += objects[objectNumber].length;
  }

  const xrefOffset = byteOffset;
  const xref = [
    "xref",
    `0 ${maxObjectNumber + 1}`,
    "0000000000 65535 f ",
    ...offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${maxObjectNumber + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");

  chunks.push(stringToBytes(xref));

  return new Blob(chunks, { type: "application/pdf" });
};

const waitForCaptureImages = async (root) => {
  const images = Array.from(root.querySelectorAll("img"));

  await Promise.all(
    images.map((image) => {
      if (image.complete && image.naturalWidth > 0) return Promise.resolve();

      return new Promise((resolve) => {
        const finish = () => resolve();

        image.addEventListener("load", finish, { once: true });
        image.addEventListener("error", finish, { once: true });
      });
    })
  );

  await Promise.all(
    images.map((image) =>
      typeof image.decode === "function"
        ? image.decode().catch(() => undefined)
        : Promise.resolve()
    )
  );
};

const isCanvasMostlyBlank = (canvas) => {
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) return false;

  const sampleSize = 50;
  const stepX = Math.max(1, Math.floor(canvas.width / sampleSize));
  const stepY = Math.max(1, Math.floor(canvas.height / sampleSize));
  let contentPixels = 0;
  let totalPixels = 0;

  for (let y = 0; y < canvas.height; y += stepY) {
    for (let x = 0; x < canvas.width; x += stepX) {
      const [red, green, blue, alpha] = context.getImageData(x, y, 1, 1).data;
      const isContent =
        alpha > 0 && (red < 245 || green < 245 || blue < 245);

      if (isContent) contentPixels += 1;
      totalPixels += 1;
    }
  }

  return totalPixels > 0 && contentPixels / totalPixels < 0.02;
};

const getBookingPageNumberBrandLabel = () =>
  BRAND_ID === "adisorn" ? "ADISORN WEDDING STUDIO" : "PHARADOL PRODUCTION";

const applyBookingPageNumbers = (pages) => {
  const totalPages = pages.length;
  const brandLabel = getBookingPageNumberBrandLabel();

  pages.forEach((page, index) => {
    page.querySelectorAll(".pdf-page-number").forEach((element) => {
      element.remove();
    });

    if (!page.style.position) {
      page.style.position = "relative";
    }

    const pageNumber = document.createElement("div");
    pageNumber.className = "pdf-page-number";
    pageNumber.textContent = `${brandLabel} | หน้า ${index + 1}/${totalPages}`;
    Object.assign(pageNumber.style, {
      position: "absolute",
      right: "56px",
      bottom: "56px",
      color: "rgba(156, 163, 175, 0.58)",
      fontSize: "8px",
      fontWeight: "400",
      lineHeight: "1",
      letterSpacing: "0",
      pointerEvents: "none",
      zIndex: "20",
    });

    page.appendChild(pageNumber);
  });
};

const waitForNextRender = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

const setBookingPdfPreparationStatus = async (
  message,
  status = "loading"
) => {
  setEmailSendStatus(status);
  setEmailSendMessage(message);
  await waitForNextRender();
};

const prepareSlipPreviewForCapture = async () => {
  if (!slipImage || !slipIsImage || !slipPreviewUrl || slipPreviewFailed) {
    return async () => {};
  }

  const slipForPdf = await imageUrlToDataUrl(slipPreviewUrl);

  if (slipForPdf) {
    setSlipPdfPreviewUrl(slipForPdf);
    setSlipPdfPreviewFailed(false);
  } else {
    setSlipPdfPreviewUrl("");
    setSlipPdfPreviewFailed(true);
  }

  await waitForNextRender();

  return async () => {
    setSlipPdfPreviewUrl("");
    setSlipPdfPreviewFailed(false);
    await waitForNextRender();
  };
};

const withTimeout = (promise, timeoutMs, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      window.setTimeout(() => reject(new Error(message)), timeoutMs)
    ),
  ]);

const captureBookingPagesAsJpegs = async (jpegQuality = 0.962) => {
  const html2canvas = (await import("html2canvas-pro")).default;
  const pages = Array.from(document.querySelectorAll(".print-area"));

  if (pages.length === 0) {
    throw new Error("ไม่พบหน้าเอกสารสำหรับสร้างไฟล์");
  }

  const cleanupSlipPreviewForCapture =
    await prepareSlipPreviewForCapture();

  document.body.classList.add("booking-exporting");

  try {
    applyBookingPageNumbers(pages);

    await new Promise((resolve) =>
      window.requestAnimationFrame(resolve)
    );

    const captureImages = pages.flatMap((page) =>
      Array.from(page.querySelectorAll("img"))
    );

    await Promise.allSettled(
      captureImages.map(
        (image) =>
          new Promise((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }

            let timer;

            const finish = () => {
              window.clearTimeout(timer);
              image.removeEventListener("load", finish);
              image.removeEventListener("error", finish);
              resolve();
            };

            timer = window.setTimeout(finish, 4000);
            image.addEventListener("load", finish, { once: true });
            image.addEventListener("error", finish, { once: true });
          })
      )
    );

    const images = [];

    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const pageRect = page.getBoundingClientRect();

      const captureWidth = Math.ceil(
        pageRect.width || page.offsetWidth || 794
      );

      const captureHeight = Math.ceil(
        pageRect.height || page.offsetHeight || 1123
      );

      const canvas = await html2canvas(page, {
        scale: 1.6,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
        imageTimeout: 5000,
        width: captureWidth,
        height: captureHeight,
        windowWidth: Math.max(
          document.documentElement.scrollWidth,
          captureWidth
        ),
        windowHeight: Math.max(
          document.documentElement.scrollHeight,
          captureHeight
        ),
        scrollX: -window.scrollX,
        scrollY: -window.scrollY,
        ignoreElements: (element) =>
          element.classList?.contains("no-print"),
        onclone: (clonedDocument) => {
          const clonedPages =
            clonedDocument.querySelectorAll(".print-area");

          const clonedPage = clonedPages[index];

          if (clonedPage instanceof HTMLElement) {
            clonedPage.style.boxShadow = "none";
            clonedPage.style.margin = "0";
          }
        },
      });

      if (isCanvasMostlyBlank(canvas)) {
        throw new Error(
          `สร้างไฟล์หน้า ${index + 1} แล้วได้หน้าว่าง กรุณาลองใหม่อีกครั้ง`
        );
      }

      const imageBlob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", jpegQuality)
      );

      if (!imageBlob) {
        throw new Error(
          `ไม่สามารถสร้างไฟล์หน้า ${index + 1} ได้`
        );
      }

      images.push({
        blob: imageBlob,
        width: canvas.width,
        height: canvas.height,
        bytes: new Uint8Array(await imageBlob.arrayBuffer()),
      });

      await new Promise((resolve) =>
        window.setTimeout(resolve, 0)
      );
    }

    return images;
  } finally {
    document.body.classList.remove("booking-exporting");
    await cleanupSlipPreviewForCapture();
  }
};;;


const compressPortablePdfImage = async (
  source,
  maxDimension = 2200,
  quality = 0.9
) => {
  if (
    !source ||
    !source.startsWith("data:image/") ||
    source.length < 900000
  ) {
    return source;
  }

  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      try {
        const naturalWidth = image.naturalWidth || image.width;
        const naturalHeight = image.naturalHeight || image.height;

        if (!naturalWidth || !naturalHeight) {
          resolve(source);
          return;
        }

        const ratio = Math.min(
          1,
          maxDimension / Math.max(naturalWidth, naturalHeight)
        );

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(naturalHeight * ratio));

        const context = canvas.getContext("2d", {
          alpha: false,
        });

        if (!context) {
          resolve(source);
          return;
        }

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(source);
      }
    };

    image.onerror = () => resolve(source);
    image.src = source;
  });
};

const getPortablePdfImageSource = async (image) => {
  const source =
    image.currentSrc ||
    image.getAttribute("src") ||
    image.src ||
    "";

  if (!source) return "";

  if (source.startsWith("data:image/")) {
    return compressPortablePdfImage(source);
  }

  if (source.startsWith("blob:")) {
    const dataUrl = await imageUrlToDataUrl(source);

    return dataUrl
      ? compressPortablePdfImage(dataUrl)
      : "";
  }

  try {
    return new URL(source, window.location.href).href;
  } catch {
    return source;
  }
};

const copyPdfFormElementValues = (sourceRoot, clonedRoot) => {
  const sourceFields = Array.from(
    sourceRoot.querySelectorAll("input, textarea, select")
  );
  const clonedFields = Array.from(
    clonedRoot.querySelectorAll("input, textarea, select")
  );

  sourceFields.forEach((sourceField, index) => {
    const clonedField = clonedFields[index];

    if (!clonedField) return;

    if (sourceField instanceof HTMLInputElement) {
      clonedField.setAttribute("value", sourceField.value);

      if (sourceField.checked) {
        clonedField.setAttribute("checked", "");
      } else {
        clonedField.removeAttribute("checked");
      }
    }

    if (sourceField instanceof HTMLTextAreaElement) {
      clonedField.textContent = sourceField.value;
    }

    if (sourceField instanceof HTMLSelectElement) {
      Array.from(clonedField.options).forEach(
        (option, optionIndex) => {
          if (sourceField.options[optionIndex]?.selected) {
            option.setAttribute("selected", "");
          } else {
            option.removeAttribute("selected");
          }
        }
      );
    }
  });
};

const createBookingVectorPdfHtml = async () => {
  const cleanupSlipPreviewForCapture =
    await prepareSlipPreviewForCapture();

  document.body.classList.add("booking-exporting");

  try {
    const pages = Array.from(
      document.querySelectorAll(".print-area")
    );

    if (pages.length === 0) {
      throw new Error("ไม่พบหน้าเอกสารสำหรับสร้าง PDF");
    }

    applyBookingPageNumbers(pages);
    await waitForNextRender();

    const sourceImages = pages.flatMap((page) =>
      Array.from(page.querySelectorAll("img"))
    );

    await Promise.allSettled(
      sourceImages.map(
        (image) =>
          new Promise((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }

            let timer;

            const finish = () => {
              window.clearTimeout(timer);
              image.removeEventListener("load", finish);
              image.removeEventListener("error", finish);
              resolve();
            };

            timer = window.setTimeout(finish, 4000);
            image.addEventListener("load", finish, {
              once: true,
            });
            image.addEventListener("error", finish, {
              once: true,
            });
          })
      )
    );

    const clonedPages = [];

    for (const sourcePage of pages) {
      const clonedPage = sourcePage.cloneNode(true);

      copyPdfFormElementValues(sourcePage, clonedPage);

      const originalImages = Array.from(
        sourcePage.querySelectorAll("img")
      );
      const copiedImages = Array.from(
        clonedPage.querySelectorAll("img")
      );

      for (
        let imageIndex = 0;
        imageIndex < originalImages.length;
        imageIndex += 1
      ) {
        const copiedImage = copiedImages[imageIndex];

        if (!copiedImage) continue;

        const portableSource =
          await getPortablePdfImageSource(
            originalImages[imageIndex]
          );

        if (portableSource) {
          copiedImage.setAttribute("src", portableSource);
          copiedImage.removeAttribute("srcset");
        }
      }

      clonedPage
        .querySelectorAll(".no-print")
        .forEach((element) => element.remove());

      clonedPages.push(clonedPage);
    }

    const documentClone =
      document.documentElement.cloneNode(true);

    documentClone
      .querySelectorAll("script, noscript")
      .forEach((element) => element.remove());

    const clonedHead =
      documentClone.querySelector("head");
    const clonedBody =
      documentClone.querySelector("body");

    if (!clonedHead || !clonedBody) {
      throw new Error("ไม่สามารถเตรียมโครงสร้างเอกสาร PDF ได้");
    }

    clonedHead
      .querySelectorAll("base")
      .forEach((element) => element.remove());

    const baseElement = document.createElement("base");
    baseElement.href = `${window.location.origin}/`;
    clonedHead.prepend(baseElement);

    const pdfStyle = document.createElement("style");

    pdfStyle.textContent = `
      @page {
        size: A4;
        margin: 0;
      }

      html,
      body {
        width: 210mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
      }

      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .vector-pdf-container {
        display: block !important;
        width: 210mm !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      .vector-pdf-container > .print-area {
        width: 210mm !important;
        height: 297mm !important;
        min-height: 297mm !important;
        max-height: 297mm !important;
        margin: 0 !important;
        box-sizing: border-box !important;
        box-shadow: none !important;
        transform: none !important;
        zoom: 1 !important;
        overflow: hidden !important;
        break-after: page !important;
        page-break-after: always !important;
      }

      .vector-pdf-container > .print-area:last-child {
        break-after: auto !important;
        page-break-after: auto !important;
      }

      .no-print {
        display: none !important;
      }
    `;

    clonedHead.appendChild(pdfStyle);
    clonedBody.innerHTML = "";
    clonedBody.classList.add("booking-vector-pdf");

    const pdfContainer =
      document.createElement("main");

    pdfContainer.className = "vector-pdf-container";

    clonedPages.forEach((page) => {
      pdfContainer.appendChild(page);
    });

    clonedBody.appendChild(pdfContainer);

    return {
      html: `<!doctype html>${documentClone.outerHTML}`,
      origin: window.location.origin,
    };
  } finally {
    document.body.classList.remove("booking-exporting");
    await cleanupSlipPreviewForCapture();
  }
};


const createBookingPdfCacheKey = async (html, filename) => {
  const source = `${filename}\u0000${html}`;

  if (window.crypto?.subtle) {
    const encoded = new TextEncoder().encode(source);
    const digest = await window.crypto.subtle.digest(
      "SHA-256",
      encoded
    );

    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `fallback-${(hash >>> 0).toString(16)}-${source.length}`;
};

const createBookingPdfFingerprint = (filename) =>
  JSON.stringify({
    brandId: BRAND_ID,
    filename,
    bookingNumber,
    customerName,
    phone,
    email,
    service,
    location,
    eventDate,
    startTime,
    endTime,
    formattedEventDate,
    bookingDate,
    today,
    serviceItems,
    serviceTotal,
    discountPercent,
    discountAmount,
    totalDiscount,
    finalPrice,
    slipImage,
    slipFileName,
    slipFileType,
    paymentDate,
    paymentTime,
    paymentAmount,
    paymentMethod,
    paymentStatus,
    paymentProgress,
    jobStatus,
    calendarColor,
    remainingPayment: previewRemainingPayment,
    paymentNote,
    paymentTransactions,
    totalPaid: previewTotalPaid,
  });

const createBookingPdfAttachment = async ({ onStatus } = {}) => {
  const filename = `${bookingNumber || "booking"}-booking.pdf`;
  const dataCacheKey = await createBookingPdfCacheKey(
    createBookingPdfFingerprint(filename),
    filename
  );

  const existingCache = bookingPdfCacheRef.current;

  if (
    existingCache?.dataKey === dataCacheKey &&
    existingCache?.attachment?.blob?.size > 0
  ) {
    if (onStatus) {
      await onStatus("พร้อมส่งแล้ว", "success");
    }
    return existingCache.attachment;
  }

  if (
    existingCache?.dataKey === dataCacheKey &&
    existingCache?.promise
  ) {
    if (onStatus) {
      await onStatus("กำลังสร้าง PDF คุณภาพสูง...");
    }

    const attachment = await existingCache.promise;

    if (onStatus) {
      await onStatus("พร้อมส่งแล้ว", "success");
    }

    return attachment;
  }

  const creationPromise = (async () => {
    if (onStatus) {
      await onStatus("กำลังเตรียมใบจอง...");
    }

    const vectorDocument =
      await createBookingVectorPdfHtml();

    if (onStatus) {
      await onStatus("กำลังสร้าง PDF คุณภาพสูง...");
    }

    const response = await fetch("/api/vector-pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        html: vectorDocument.html,
        origin: vectorDocument.origin,
        filename,
      }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));

      throw new Error(
        result?.error ||
          "ไม่สามารถสร้าง PDF แบบคมชัดได้"
      );
    }

    const blob = await response.blob();

    if (
      !blob ||
      blob.size === 0 ||
      !String(blob.type).includes("pdf")
    ) {
      throw new Error("ระบบได้รับไฟล์ PDF ที่ไม่สมบูรณ์");
    }

    if (onStatus) {
      await onStatus("กำลังแนบไฟล์...");
    }

    const base64 = await blobToBase64(blob);

    if (onStatus) {
      await onStatus("พร้อมส่งแล้ว", "success");
    }

    return {
      filename,
      blob,
      base64,
    };
  })();

  bookingPdfCacheRef.current = {
    dataKey: dataCacheKey,
    promise: creationPromise,
    attachment: null,
  };

  try {
    const attachment = await creationPromise;

    bookingPdfCacheRef.current = {
      dataKey: dataCacheKey,
      promise: null,
      attachment,
    };

    return attachment;
  } catch (error) {
    if (bookingPdfCacheRef.current?.dataKey === dataCacheKey) {
      bookingPdfCacheRef.current = null;
    }

    throw error;
  }
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.download = filename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const uploadBookingPdfToDrive = async (pdfAttachment) => {
  const formData = new FormData();
  const pdfFile =
    typeof File === "function"
      ? new File([pdfAttachment.blob], pdfAttachment.filename, {
          type: "application/pdf",
        })
      : pdfAttachment.blob;

  formData.append("file", pdfFile, pdfAttachment.filename);
  formData.append("brandId", BRAND_ID);
  formData.append("expectedBrandId", BRAND_ID);

  const response = await fetch("/api/google/upload", {
    method: "POST",
    body: formData,
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result?.success || !result?.file?.webViewLink) {
    throw new Error(result?.error || "อัปโหลด PDF เข้า Google Drive ไม่สำเร็จ");
  }

  return result.file;
};

const markBookingEmailSent = async ({ driveFile, messageId }) => {
  const sentAt = new Date().toISOString();
  const emailStatus = {
    emailSent: true,
    emailSentAt: sentAt,
    emailMessageId: messageId || "",
    emailRecipient: email.trim(),
    pdfDriveFileId: driveFile?.id || "",
    pdfDriveLink: driveFile?.webViewLink || "",
  };
  const applyStatus = (booking) =>
    booking?.bookingNumber === bookingNumber ? { ...booking, ...emailStatus } : booking;
  const customers = readArrayFromStorage(CUSTOMERS_KEY);
  const updatedCustomers = customers.map(applyStatus);
  const updatedCurrentBooking = applyStatus(
    JSON.parse(localStorage.getItem(CURRENT_BOOKING_KEY) || "null")
  );
  const updatedSelectedBooking = applyStatus(
    JSON.parse(localStorage.getItem(SELECTED_BOOKING_KEY) || "null")
  );

  localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(updatedCustomers));

  if (updatedCurrentBooking) {
    localStorage.setItem(CURRENT_BOOKING_KEY, JSON.stringify(updatedCurrentBooking));
  }

  if (updatedSelectedBooking) {
    localStorage.setItem(SELECTED_BOOKING_KEY, JSON.stringify(updatedSelectedBooking));
  }

  await supabase
    .from("bookings")
    .update({
      email: email.trim(),
      booking_data: updatedCurrentBooking || {
        bookingNumber,
        customerName,
        email: email.trim(),
        ...emailStatus,
      },
    })
    .eq("booking_number", bookingNumber);
};

const saveEmailHistoryRecord = ({ driveFile, messageId, subject, body }) => {
  const historyKey = `${BRAND_ID}_email_history`;
  const currentHistory = readArrayFromStorage(historyKey);
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    brandId: BRAND_ID,
    bookingNumber,
    customerName,
    recipient: email.trim(),
    subject,
    body,
    sentAt: new Date().toISOString(),
    status: "sent",
    messageId: messageId || "",
    pdfDriveFileId: driveFile?.id || "",
    pdfDriveLink: driveFile?.webViewLink || "",
  };

  localStorage.setItem(historyKey, JSON.stringify([record, ...currentHistory]));
};


const downloadJPG = async () => {
  if (isExporting) return;
  if (!validateBooking()) return;

  setIsExporting(true);

  try {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const images = await captureBookingPagesAsJpegs(0.95);

    images.forEach((image, index) => {
      zip.file(
        `${bookingNumber}-page-${index + 1}.jpg`,
        image.blob
      );
    });

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const zipUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");

    link.download = `${bookingNumber}-JPG.zip`;
    link.href = zipUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(zipUrl);
  } catch (error) {
    console.error("JPG ZIP export error:", error);
    alert("ไม่สามารถสร้างไฟล์ JPG แบบ ZIP ได้ กรุณาลองใหม่อีกครั้ง");
  } finally {
    setIsExporting(false);
  }
};

const openCustomerSendOptions = () => {
  setEmailSendMessage("");
  setEmailSendStatus("idle");
  setEmailSentInfo(null);
  setIsSendOptionsOpen(true);
};

const getBookingEmailSubject = () =>
  `เอกสารยืนยันการจอง ${bookingNumber} | Adisorn Wedding Studio`;

const getBookingEmailServiceDetails = () => {
  const detailItems = serviceItems
    .filter((item) => ["QR Code", "Video Guestbook"].includes(item.name))
    .map((item) => {
      const detail = getServiceDescriptionText(item.description);

      if (!detail) return "";

      return [`บริการ: ${item.name}`, detail].join("\n");
    })
    .filter(Boolean);

  if (detailItems.length === 0) return [];

  return ["", "รายละเอียดบริการเพิ่มเติม", ...detailItems];
};

const getBookingEmailBody = () =>
  [
    customerName ? `เรียน คุณ${customerName}` : "เรียน",
    "",
    "ทาง Adisorn Wedding Studio ขอขอบพระคุณที่ไว้วางใจใช้บริการของเรา",
    "",
    "ทางทีมงานได้จัดเตรียมเอกสารยืนยันการจองงานและรายละเอียดการชำระเงินไว้ให้แล้ว",
    "",
    "รายละเอียดงานโดยสรุป",
    `• เลขที่ใบจอง : ${bookingNumber || "-"}`,
    `• วันที่จัดงาน : ${formattedEventDate || eventDate || "-"}`,
    `• ประเภทงาน : ${service || "-"}`,
    ...getBookingEmailServiceDetails(),
    "",
    "หากมีการเปลี่ยนแปลงรายละเอียดงาน หรือต้องการสอบถามข้อมูลเพิ่มเติม สามารถติดต่อทีมงานได้ตลอดเวลา",
    "",
    "ขอขอบพระคุณอีกครั้งที่ให้เราเป็นส่วนหนึ่งในวันสำคัญของท่าน",
    "",
    "ขอแสดงความนับถือ",
    "",
    "Adisorn Wedding Studio",
    "โทร. 082 141 9633",
    "E-mail: adisornweddingstudio@gmail.com",
  ].join("\n");

const sendBookingEmail = async () => {
  if (isPreparingAttachment || isSendingEmail || attachmentLockRef.current) return;

  const customerEmail = email.trim();

  if (!customerEmail) {
    window.alert("กรุณากรอกอีเมลลูกค้าก่อนส่งใบจอง");
    return;
  }

  if (!customerEmail.includes("@")) {
    window.alert("รูปแบบอีเมลลูกค้าไม่ถูกต้อง");
    return;
  }

  setEmailSendMessage("กำลังเตรียมใบจอง...");
  setEmailSendStatus("loading");
  setPreparingSendChannel("email");
  attachmentLockRef.current = true;
  setIsPreparingAttachment(true);

  await new Promise((resolve) =>
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(resolve)
    )
  );

  let pdfAttachment;

  try {
    pdfAttachment = await createBookingPdfAttachment({
      onStatus: setBookingPdfPreparationStatus,
    });
  } catch (error) {
    console.error("Cannot create booking PDF attachment", error);
    setEmailSendStatus("error");
    setEmailSendMessage(HIGH_QUALITY_PDF_ERROR_MESSAGE);
    window.alert(HIGH_QUALITY_PDF_ERROR_MESSAGE);
    setPreparingSendChannel("");
    attachmentLockRef.current = false;
    setIsPreparingAttachment(false);
    return;
  }

  const subject = getBookingEmailSubject();
  const body = getBookingEmailBody();

  setEmailPreview({
    to: customerEmail,
    subject,
    body,
    pdfAttachment,
  });
  setEmailSendMessage("พร้อมส่งแล้ว");
  setEmailSendStatus("success");
  setIsSendOptionsOpen(false);
  setPreparingSendChannel("");
  attachmentLockRef.current = false;
  setIsPreparingAttachment(false);
};

const sendBookingSms = async () => {
  if (isPreparingAttachment || attachmentLockRef.current) return;

  const customerPhone = normalizeThaiMobileNumber(phone);

  if (!phone.trim()) {
    window.alert("กรุณากรอกเบอร์โทรศัพท์ลูกค้าก่อนส่ง SMS");
    return;
  }

  if (!customerPhone) {
    window.alert(
      "เบอร์โทรไม่ถูกต้อง กรุณากรอกเบอร์มือถือไทย 10 หลัก เช่น 0812345678"
    );
    return;
  }

  const smsBody = [
    `สวัสดีคุณ${customerName || "-"}`,
    `แจ้งรายละเอียดใบจอง ${bookingNumber}`,
    `วันที่จัดงาน: ${formattedEventDate || "-"}`,
    `ประเภทงาน: ${service || "-"}`,
    "หากต้องการแก้ไขข้อมูล สามารถติดต่อทีมงานได้เลยครับ",
    "Adisorn Wedding Studio",
  ].join("\n");
  const bodySeparator =
    /iPad|iPhone|iPod|Macintosh/i.test(window.navigator.userAgent) ? "&" : "?";

  try {
    setEmailSendMessage("กำลังเตรียมใบจอง...");
    setEmailSendStatus("loading");
    setPreparingSendChannel("sms");
    attachmentLockRef.current = true;
    setIsPreparingAttachment(true);

    await new Promise((resolve) =>
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(resolve)
      )
    );
    const pdfAttachment = await createBookingPdfAttachment({
      onStatus: setBookingPdfPreparationStatus,
    });
    const pdfFile =
      typeof File === "function"
        ? new File([pdfAttachment.blob], pdfAttachment.filename, {
            type: "application/pdf",
          })
        : null;

    setIsSendOptionsOpen(false);

    if (
      pdfFile &&
      navigator.share &&
      (!navigator.canShare || navigator.canShare({ files: [pdfFile] }))
    ) {
      await navigator.share({
        files: [pdfFile],
        text: smsBody,
        title: `ใบจอง ${bookingNumber}`,
      });
      return;
    }

    downloadBlob(pdfAttachment.blob, pdfAttachment.filename);
    window.alert(
      "ระบบดาวน์โหลด PDF ให้แล้ว กรุณาแนบไฟล์ PDF นี้ใน SMS ด้วยตนเอง"
    );
  } catch (error) {
    if (error?.name === "AbortError") return;

    console.error("Cannot create booking PDF for SMS", error);
    setEmailSendStatus("error");
    setEmailSendMessage(HIGH_QUALITY_PDF_ERROR_MESSAGE);
    window.alert(HIGH_QUALITY_PDF_ERROR_MESSAGE);
  } finally {
    setPreparingSendChannel("");
    attachmentLockRef.current = false;
    setIsPreparingAttachment(false);
  }

  window.location.href = `sms:${customerPhone}${bodySeparator}body=${encodeURIComponent(
    smsBody
  )}`;
};

const sendBookingSmsLink = async () => {
  if (
    isSendingSmsLink ||
    isPreparingAttachment ||
    attachmentLockRef.current
  ) {
    return;
  }

  const customerPhone = normalizeThaiMobileNumber(phone);

  if (!phone.trim()) {
    window.alert("กรุณากรอกเบอร์โทรศัพท์ลูกค้าก่อนส่ง SMS");
    return;
  }

  if (!customerPhone) {
    window.alert(
      "เบอร์โทรไม่ถูกต้อง กรุณากรอกเบอร์มือถือไทย 10 หลัก เช่น 0812345678"
    );
    return;
  }

  setIsSendingSmsLink(true);
  setPreparingSendChannel("sms-link");
  setEmailSendMessage("กำลังเตรียมใบจอง...");
  setEmailSendStatus("loading");
  attachmentLockRef.current = true;
  setIsPreparingAttachment(true);

  await new Promise((resolve) =>
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(resolve)
    )
  );

  let isPdfReady = false;

  try {
    const pdfAttachment = await createBookingPdfAttachment({
      onStatus: setBookingPdfPreparationStatus,
    });
    isPdfReady = true;
    const uploadData = new FormData();

    setEmailSendMessage("กำลังสร้างลิงก์ Google Drive...");
    setEmailSendStatus("loading");

    uploadData.append(
      "file",
      pdfAttachment.blob,
      pdfAttachment.filename
    );
    uploadData.append("brand", BRAND_ID);
    uploadData.append(
      "bookingNumber",
      bookingNumber || "booking"
    );

    const response = await fetch("/api/booking-document-link", {
      method: "POST",
      body: uploadData,
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.url) {
      throw new Error(
        result.error ||
          "ไม่สามารถสร้างลิงก์ Google Drive ได้"
      );
    }

    const brandName =
      BRAND_ID === "adisorn"
        ? "ADISORN WEDDING STUDIO"
        : "PHARADOL PRODUCTION";

    const smsBody = [
      brandName,
      "",
      customerName.trim()
        ? `เรียน คุณ${customerName.trim()}`
        : "เรียน ลูกค้า",
      `เอกสารยืนยันการจองเลขที่ ${
        bookingNumber || "-"
      } พร้อมแล้ว`,
      "",
      eventDate
        ? `วันจัดงาน: ${formattedEventDate}`
        : null,
      service.trim()
        ? `ประเภทงาน: ${service.trim()}`
        : null,
      "",
      "ดูรายละเอียดและดาวน์โหลดเอกสาร:",
      result.url,
      "",
      "หากต้องการแก้ไขข้อมูล สามารถติดต่อทีมงานได้เลยครับ",
    ]
      .filter((line) => line !== null)
      .join("\n");

    const bodySeparator =
      /iPad|iPhone|iPod|Macintosh/i.test(
        window.navigator.userAgent
      )
        ? "&"
        : "?";

    setIsSendOptionsOpen(false);

    window.location.href =
      `sms:${customerPhone}${bodySeparator}body=` +
      encodeURIComponent(smsBody);
  } catch (error) {
    console.error(
      "Cannot send SMS with Google Drive link",
      error
    );

    const message = isPdfReady
      ? error?.message || "ไม่สามารถส่ง SMS พร้อมลิงก์เอกสารได้"
      : HIGH_QUALITY_PDF_ERROR_MESSAGE;

    setEmailSendStatus("error");
    setEmailSendMessage(message);
    window.alert(message);
  } finally {
    setPreparingSendChannel("");
    attachmentLockRef.current = false;
    setIsPreparingAttachment(false);
    setIsSendingSmsLink(false);
  }
};

;

const confirmSendBookingEmail = async () => {
  if (!emailPreview) return;
  if (isSendingEmail || emailSendLockRef.current) return;

  emailSendLockRef.current = true;
  setIsSendingEmail(true);
  setEmailSendStatus("loading");
  setEmailSendMessage("กำลังอัปโหลด PDF ไป Google Drive...");

  try {
    const finalBody = emailPreview.body;
    let driveFile = null;
    let driveUploadError = "";

    try {
      driveFile = await uploadBookingPdfToDrive(emailPreview.pdfAttachment);
      setEmailSendStatus("loading");
      setEmailSendMessage("อัปโหลด PDF ไป Google Drive สำเร็จ กำลังส่งอีเมล...");
    } catch (driveError) {
      driveUploadError = getReadableErrorMessage(
        driveError,
        "อัปโหลด PDF ไป Google Drive ไม่สำเร็จ"
      );
      console.error("Cannot upload booking PDF to Drive:", driveError);
      setEmailSendStatus("loading");
      setEmailSendMessage("อัปโหลด Drive ไม่สำเร็จ กำลังส่งอีเมลต่อ...");
    }

    const response = await fetch("/api/google/gmail-send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        brandId: BRAND_ID,
        expectedBrandId: BRAND_ID,
        to: emailPreview.to,
        subject: emailPreview.subject,
        text: finalBody,
        pdfBase64: emailPreview.pdfAttachment.base64,
        filename: emailPreview.pdfAttachment.filename,
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        getReadableErrorMessage(
          result?.error || result,
          "ส่งอีเมลผ่าน Gmail ไม่สำเร็จ"
        )
      );
    }

    setEmailSentInfo({
      to: emailPreview.to,
      subject: emailPreview.subject,
      filename: emailPreview.pdfAttachment.filename,
      messageId: result?.messageId || "",
      threadId: result?.threadId || "",
      driveFileId: driveFile?.id || "",
      driveViewUrl: driveFile?.webViewLink || "",
      driveDownloadUrl: driveFile?.webContentLink || "",
      driveUploadError,
    });

    setEmailSendStatus("success");
    setEmailSendMessage(
      driveUploadError
        ? `ส่งอีเมลสำเร็จ แต่ยังอัปโหลด Drive ไม่สำเร็จ: ${driveUploadError}`
        : "ส่งอีเมลพร้อม PDF สำเร็จแล้ว"
    );
    setEmailPreview(null);
  } catch (error) {
    setEmailSendStatus("error");
    setEmailSendMessage(
      getReadableErrorMessage(error, "ส่งอีเมลผ่าน Gmail ไม่สำเร็จ")
    );
  } finally {
    emailSendLockRef.current = false;
    setIsSendingEmail(false);
  }
};

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500">
        กำลังตรวจสอบสิทธิ์การใช้งาน...
      </main>
    );
  }

  return (

    <div
      className={`booking-workspace min-h-screen overflow-x-hidden ${
        isViewMode ? "booking-workspace-view" : ""
      } ${isSidebarCollapsed ? "booking-workspace-collapsed" : ""}`}
      style={{
        "--booking-bg": "#FAF7F1",
        "--booking-card": "#FFFFFF",
        "--booking-border": "#E9DCCB",
        "--booking-text": "#2B1A14",
        "--booking-muted": "#7A6A5D",
        "--booking-primary": "#4A2E22",
        "--booking-primary-dark": "#2B1A14",
        "--booking-accent": "#C9A46A",
        "--booking-accent-soft": "#F3E6CF",
        "--booking-focus-ring": "rgba(201, 164, 106, 0.2)",
        "--booking-soft-surface": "#F3E6CF",
        "--booking-payment-surface": "#FAF7F1",
        "--booking-discount-surface": "#F3E6CF",
        "--booking-success": "#16A34A",
        "--booking-danger": "#DC2626",
        "--booking-accent-border": "rgba(201, 164, 106, 0.52)",
        "--booking-primary-shadow": "rgba(74, 46, 34, 0.18)",
        "--booking-card-shadow": "rgba(43, 26, 20, 0.09)",
        "--booking-button-on-accent": "#111111",
      }}
    >

      {/* ========================= */}
      {/* BACK OFFICE */}
      {/* ========================= */}

      <div
        className={`booking-form-panel no-print bg-white border shadow-xl z-30 transition-all duration-300 ${
          isViewMode
            ? "hidden"
            : isSidebarCollapsed
              ? "w-14 overflow-hidden p-2"
              : "w-full overflow-y-auto p-5 md:p-6"
        }`}
      >
        <button
          type="button"
          onClick={() => setIsSidebarCollapsed((current) => !current)}
          className={`booking-form-toggle sticky top-0 z-10 mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-xl font-bold text-white shadow ${
            isSidebarCollapsed ? "mx-auto" : "ml-auto"
          }`}
          aria-label={isSidebarCollapsed ? "เปิดระบบสร้างใบจอง" : "ย่อระบบสร้างใบจอง"}
          title={isSidebarCollapsed ? "เปิดระบบสร้างใบจอง" : "ย่อระบบสร้างใบจอง"}
        >
          {isSidebarCollapsed ? "›" : "‹"}
        </button>

        <div className={isSidebarCollapsed ? "hidden" : "block"}>

        <div className="mb-8">
          <h1 className="text-3xl font-bold">
            ระบบสร้างใบจอง
          </h1>
          {draftStatus && (
            <p
              className={`mt-2 text-sm font-medium ${
                draftStatus === "บันทึกร่างไม่สำเร็จ"
                  ? "text-red-600"
                  : "text-emerald-600"
              }`}
            >
              {draftStatus}
            </p>
          )}
        </div>


        <div className="space-y-5 pb-40">

          <input
            type="text"
            list={`${BRAND_ID}-customer-name-suggestions`}
            placeholder="ชื่อลูกค้า"
            value={customerName}
            onChange={(e) =>
              updateEditableField("customerName", setCustomerName, e.target.value)
            }
            autoComplete="off"
            className={editableInputClass("customerName", customerName)}
          />
          <datalist id={`${BRAND_ID}-customer-name-suggestions`}>
            {customerNameSuggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>

          <input
            type="text"
            list={`${BRAND_ID}-phone-suggestions`}
            placeholder="เบอร์โทรศัพท์"
            value={phone}
            onChange={(e) =>
              updateEditableField("phone", setPhone, e.target.value)
            }
            autoComplete="off"
            className={editableInputClass("phone", phone)}
          />
          <datalist id={`${BRAND_ID}-phone-suggestions`}>
            {phoneSuggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>

          <input
            type="email"
            placeholder="อีเมลลูกค้า"
            value={email}
            onChange={(e) =>
              updateEditableField("email", setEmail, e.target.value)
            }
            className={editableInputClass("email", email)}
          />


          <input
            type="text"
            list={`${BRAND_ID}-service-suggestions`}
            placeholder="ประเภทงาน"
            value={service}
            onChange={(e) =>
              updateEditableField("service", setService, e.target.value)
            }
            autoComplete="off"
            className={editableInputClass("service", service)}
          />
          <datalist id={`${BRAND_ID}-service-suggestions`}>
            {serviceSuggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>

          <div className="relative">
            <input
              type="text"
              placeholder="สถานที่"
              value={location}
              onChange={(e) => {
                const nextLocation = e.target.value;
                updateEditableField("location", setLocation, nextLocation);
                setIsLocationSuggestionsOpen(true);
                if (nextLocation.trim().length < 2) {
                  setGooglePlaceSuggestions([]);
                  setIsLoadingGooglePlaces(false);
                  setGooglePlacesMessage("");
                } else {
                  setIsLoadingGooglePlaces(true);
                }
              }}
              onFocus={() => setIsLocationSuggestionsOpen(true)}
              onBlur={() =>
                window.setTimeout(() => setIsLocationSuggestionsOpen(false), 120)
              }
              autoComplete="off"
              className={editableInputClass("location", location)}
            />

            {showLocationSuggestionPanel && (
              <div className="absolute left-0 right-0 top-full z-30 mt-3 overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-2xl">
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    chooseLocationSuggestion(normalizedLocationInput);
                  }}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-zinc-50"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center text-3xl leading-none text-zinc-900">
                    +
                  </span>
                  <span className="min-w-0 flex-1 truncate text-lg font-bold text-zinc-900">
                    {normalizedLocationInput}
                  </span>
                </button>

                <div className="max-h-80 overflow-y-auto py-2">
                  {isLoadingGooglePlaces && (
                    <div className="flex w-full items-center gap-4 px-5 py-3 text-left">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center text-2xl text-zinc-500">
                        ⌕
                      </span>
                      <span className="min-w-0 flex-1 truncate text-lg font-semibold text-zinc-500">
                        กำลังดึงสถานที่จาก Google...
                      </span>
                    </div>
                  )}

                  {!isLoadingGooglePlaces && googlePlacesMessage && (
                    <div className="flex w-full items-center gap-4 px-5 py-3 text-left">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center text-xl text-amber-600">
                        !
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold text-amber-700">
                          {googlePlacesMessage}
                        </span>
                        <span className="block truncate text-sm text-zinc-500">
                          ใส่ GOOGLE_PLACES_API_KEY ใน .env.local แล้ว restart server
                        </span>
                      </span>
                    </div>
                  )}

                  {googlePlaceSuggestions.map((place) => (
                    <button
                      key={place.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        chooseLocationSuggestion(place.value);
                      }}
                      className="flex w-full items-center gap-4 px-5 py-3 text-left transition hover:bg-zinc-50"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center text-2xl text-zinc-600">
                        ⌕
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-bold text-zinc-900">
                          {place.title}
                        </span>
                        {place.subtitle && (
                          <span className="block truncate text-sm text-zinc-500">
                            {place.subtitle}
                          </span>
                        )}
                        {!place.subtitle && (
                          <span className="block truncate text-sm text-zinc-500">
                            {place.source === "query"
                              ? "คำค้นแนะนำจาก Google"
                              : "สถานที่จาก Google"}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}

                  {visibleLocalLocationSuggestions.map((place) => (
                    <button
                      key={place}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        chooseLocationSuggestion(place);
                      }}
                      className="flex w-full items-center gap-4 px-5 py-3 text-left transition hover:bg-zinc-50"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center text-2xl text-zinc-600">
                        ⌕
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-bold text-zinc-900">
                          {place}
                        </span>
                        <span className="block truncate text-sm text-zinc-500">
                          จากประวัติและรายการสถานที่ของ {BRAND_ID}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <input
            type="date"
            value={eventDate}
            onChange={(e) =>
              updateEditableField("eventDate", setEventDate, e.target.value)
            }
            className={editableInputClass("eventDate", eventDate)}
          />

          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
            <label className="block text-sm font-semibold text-zinc-700">
              สีงานในปฏิทิน
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {CALENDAR_COLOR_OPTIONS.map((option) => {
                const isSelected = calendarColor === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      updateEditableField("calendarColor", setCalendarColor, option.value)
                    }
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition ${
                      isSelected
                        ? "border-zinc-900 ring-2 ring-zinc-200"
                        : "border-white ring-1 ring-zinc-200"
                    }`}
                    style={{ backgroundColor: option.value }}
                    aria-label={`เลือกสี${option.label}`}
                    title={option.label}
                  >
                    {isSelected && (
                      <span className="text-xs font-bold text-white">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-2 text-zinc-700">
                เวลาเริ่มงาน
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="--:--"
                maxLength={5}
                value={startTime}
                onChange={(e) =>
                  updateEditableField(
                    "startTime",
                    setStartTime,
                    formatTimeInput(e.target.value)
                  )
                }
                className={editableInputClass("startTime", startTime)}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-zinc-700">
                เวลาจบงาน
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="--:--"
                maxLength={5}
                value={endTime}
                onChange={(e) =>
                  updateEditableField(
                    "endTime",
                    setEndTime,
                    formatTimeInput(e.target.value)
                  )
                }
                className={editableInputClass("endTime", endTime)}
              />
            </div>
          </div>
          <div className="booking-form-section booking-service-section border rounded-2xl p-4 bg-zinc-50">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="booking-section-title font-bold text-lg">รายการบริการ</p>
                <p className="booking-section-subtitle text-sm text-zinc-500">
                  เพิ่มเฉพาะรายการที่ใช้ในงานนี้
                </p>
              </div>

              <button
                type="button"
                onClick={openServiceModal}
                className="booking-form-primary-button shrink-0 rounded-xl px-4 py-3 font-semibold"
              >
                + เพิ่มรายการ
              </button>
            </div>

            {serviceItems.length === 0 ? (
              <div className="booking-empty-state border border-dashed rounded-xl p-4 text-center text-zinc-400">
                ยังไม่มีรายการบริการ
              </div>
            ) : (
              <div className="space-y-2">
                {serviceItems.map((item) => (
                  <div
                    key={item.id}
                    className="booking-list-item flex items-center justify-between gap-3 bg-white border rounded-xl px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {item.name}
                        {personnelServices.includes(item.name)
                          ? ` × ${item.quantity || 1} คน`
                          : ""}
                      </p>
                      {item.description && (
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {renderServiceDescription(item.description, { compact: true })}
                        </div>
                      )}
                      <p className="text-sm text-zinc-500">
                        {personnelServices.includes(item.name) ? (
                          <>
                            ฿ {Number(item.unitPrice || 0).toLocaleString()} × {item.quantity || 1}
                            {" = "}฿ {Number(item.price || 0).toLocaleString()}
                          </>
                        ) : (
                          <>฿ {Number(item.price || 0).toLocaleString()}</>
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeServiceItem(item.id)}
                      className="text-red-600 font-semibold"
                    >
                      ลบ
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="booking-form-section booking-discount-section border rounded-2xl p-4">
            <p className="booking-section-title font-bold mb-3">
              ระบบส่วนลด
            </p>

            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                placeholder="ลด (%)"
                value={discountPercent}
                onChange={(e) =>
                  updateEditableField(
                    "discountPercent",
                    setDiscountPercent,
                    e.target.value
                  )
                }
                className={editableInputClass("discountPercent", discountPercent)}
              />

              <input
                type="number"
                placeholder="ลด (บาท)"
                value={discountAmount}
                onChange={(e) =>
                  updateEditableField(
                    "discountAmount",
                    setDiscountAmount,
                    e.target.value
                  )
                }
                className={editableInputClass("discountAmount", discountAmount)}
              />
            </div>

            <div className="booking-summary-card mt-3 rounded-xl bg-white p-3 border text-sm space-y-1">
              {serviceItems.length === 0 ? (
                <div className="text-zinc-400">ยังไม่มีรายการบริการ</div>
              ) : (
                serviceItems.map((item) => (
                  <div key={item.id} className="flex justify-between gap-3">
                    <span>
                      {item.name}
                      {personnelServices.includes(item.name)
                        ? ` × ${item.quantity || 1} คน`
                        : ""}
                    </span>
                    <span>฿ {Number(item.price || 0).toLocaleString()}</span>
                  </div>
                ))
              )}
              <div className="border-t pt-1 mt-1 font-semibold flex justify-between gap-3">
                <span>รวมค่าบริการ</span>
                <span>฿ {serviceTotal.toLocaleString()}</span>
              </div>
              {percentDiscountValue > 0 && (
                <div>
                  ส่วนลดจาก % : ฿ {percentDiscountValue.toLocaleString()}
                </div>
              )}
              {Number(discountAmount || 0) > 0 && (
                <div>
                  ส่วนลดเพิ่ม : ฿ {Number(discountAmount || 0).toLocaleString()}
                </div>
              )}
              {totalDiscount > 0 && (
                <div>
                  ส่วนลดรวม : ฿ {totalDiscount.toLocaleString()}
                </div>
              )}
              <div className="booking-summary-net font-bold text-green-700 text-base">
                ยอดสุทธิ : ฿ {finalPrice.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="booking-form-section booking-payment-section border rounded-2xl p-4">
            <p className="booking-section-title font-bold mb-3">
              รายละเอียดการจ่ายเงิน
            </p>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <input
                type="date"
                value={paymentDate}
                onChange={(e) =>
                  updateEditableField("paymentDate", setPaymentDate, e.target.value)
                }
                className={editableInputClass(
                  "paymentDate",
                  paymentDate,
                  "px-4 py-3"
                )}
              />

              <input
                type="text"
                inputMode="numeric"
                placeholder="เวลา เช่น 14:30"
                maxLength={5}
                value={paymentTime}
                onChange={(e) =>
                  updateEditableField(
                    "paymentTime",
                    setPaymentTime,
                    formatTimeInput(e.target.value)
                  )
                }
                className={editableInputClass(
                  "paymentTime",
                  paymentTime,
                  "px-4 py-3"
                )}
              />
            </div>

            <input
              type="number"
              min="0"
              placeholder="ยอดชำระ (บาท)"
              value={paymentAmount}
              onChange={(e) =>
                updateEditableField("paymentAmount", setPaymentAmount, e.target.value)
              }
              className={editableInputClass(
                "paymentAmount",
                paymentAmount,
                "mb-3 px-4 py-3"
              )}
            />

            <div className="booking-status-card mb-3 w-full rounded-2xl border bg-white px-4 py-3">
              <p className="text-xs text-zinc-500">สถานะการชำระ</p>
              <p
                className={`booking-payment-badge mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-bold ${paymentDisplayStatusClass}`}
              >
                {paymentDisplayStatus}
              </p>
            </div>

            <select
              value={jobStatus}
              onChange={(e) =>
                updateEditableField("jobStatus", setJobStatus, e.target.value)
              }
              className={editableInputClass(
                "jobStatus",
                jobStatus,
                "mb-3 px-4 py-3"
              )}
            >
              <option value="รอยืนยัน">สถานะงาน : รอยืนยัน</option>
              <option value="ยืนยันการจอง">สถานะงาน : ยืนยันการจอง</option>
              <option value="เตรียมงาน">สถานะงาน : เตรียมงาน</option>
              <option value="ถ่ายงานแล้ว">สถานะงาน : ถ่ายงานแล้ว</option>
              <option value="กำลังคัด/ตัดต่อ">สถานะงาน : กำลังคัด/ตัดต่อ</option>
              <option value="ส่งงานแล้ว">สถานะงาน : ส่งงานแล้ว</option>
              <option value="ปิดงาน">สถานะงาน : ปิดงาน</option>
            </select>

            <select
              value={paymentMethod}
              onChange={(e) =>
                updateEditableField(
                  "paymentMethod",
                  setPaymentMethod,
                  e.target.value
                )
              }
              className={editableInputClass(
                "paymentMethod",
                paymentMethod,
                "mb-3 px-4 py-3"
              )}
            >
              <option value="โอนเงิน">โอนเงิน</option>
              <option value="เงินสด">เงินสด</option>
              <option value="บัตรเครดิต/เดบิต">บัตรเครดิต/เดบิต</option>
              <option value="อื่น ๆ">อื่น ๆ</option>
            </select>

            <select
              value={paymentStatus}
              onChange={(e) =>
                updateEditableField(
                  "paymentStatus",
                  setPaymentStatus,
                  e.target.value
                )
              }
              className={editableInputClass(
                "paymentStatus",
                paymentStatus,
                "mb-3 px-4 py-3"
              )}
            >
              <option value="มัดจำ">ชำระ : มัดจำ</option>
              <option value="เต็มจำนวน">ชำระ : เต็มจำนวน</option>
            </select>

            {paymentStatus === "มัดจำ" && (
              <div className="booking-status-card w-full rounded-2xl border bg-white px-4 py-3 mb-3">
                <p className="text-xs text-zinc-500">ยอดคงเหลือที่ต้องชำระ</p>
                <p className="text-lg font-bold text-red-600">
                  ฿ {previewRemainingPayment.toLocaleString()}
                </p>
              </div>
            )}

            <textarea
              placeholder="หมายเหตุการชำระเงิน"
              value={paymentNote}
              onChange={(e) =>
                updateEditableField("paymentNote", setPaymentNote, e.target.value)
              }
              rows={3}
              className={editableInputClass(
                "paymentNote",
                paymentNote,
                "mb-3 resize-none px-4 py-3"
              )}
            />

            <button
              type="button"
              onClick={addPaymentTransaction}
              className="booking-form-primary-button booking-payment-button mb-3 w-full rounded-2xl px-4 py-3 font-semibold text-white transition"
            >
              + เพิ่มรายการชำระเงิน
            </button>

            {paymentTransactions.length > 0 && (
              <div className="booking-history-card mb-3 space-y-2 rounded-2xl border border-emerald-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <p className="booking-history-title font-bold text-emerald-800">ประวัติการชำระ</p>
                  <p className="booking-history-total font-bold text-emerald-700">
                    รวม ฿ {totalPaid.toLocaleString()}
                  </p>
                </div>

                {paymentTransactions.map((transaction, index) => (
                  <div
                    key={transaction.id}
                    className="rounded-xl border border-zinc-200 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-zinc-900">
                          งวดที่ {index + 1} · ฿ {Number(
                            transaction.amount || 0
                          ).toLocaleString()}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {transaction.date
                            ? new Date(transaction.date).toLocaleDateString(
                                "th-TH"
                              )
                            : "ไม่ระบุวันที่"}
                          {transaction.time
                            ? ` เวลา ${transaction.time} น.`
                            : ""}
                          {` · ${transaction.method || "ไม่ระบุวิธี"}`}
                        </p>
                        {transaction.note && (
                          <p className="mt-1 text-xs text-zinc-600">
                            {transaction.note}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            downloadPaymentReceipt(transaction, index)
                          }
                          className="booking-form-small-button rounded-lg px-3 py-2 text-xs font-semibold text-white transition"
                        >
                          ออกใบรับชำระ PDF
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            removePaymentTransaction(transaction.id)
                          }
                          className="text-sm font-semibold text-red-600"
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(event) => {
                markFieldEdited("slipImage");
                handleSlipUpload(event);
              }}
              className={editableInputClass("slipImage", slipImage, "booking-upload-input px-4 py-3")}
            />

            {slipImage && slipIsImage && slipPreviewUrl && !slipPreviewFailed && (
              <div className="booking-upload-preview mt-3">
                <img
                  src={slipPreviewUrl}
                  alt="หลักฐานการโอน"
                  onError={() => setSlipPreviewFailed(true)}
                  className="max-h-[300px] w-full rounded-2xl border object-contain md:max-h-[420px]"
                />
                <button
                  type="button"
                  onClick={() => window.open(slipImage, "_blank", "noopener,noreferrer")}
                  className="mt-3 inline-flex rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  ดูสลิปเต็ม
                </button>
              </div>
            )}

            {slipImage && slipIsImage && slipPreviewFailed && (
              <div className="booking-upload-preview mt-3 flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-6 py-10 text-center">
                <div className="rounded-full bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-500">
                  มีไฟล์แนบ
                </div>
                <div>
                  <p className="text-lg font-bold text-zinc-800">
                    มีหลักฐานการโอนแล้ว
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    ไม่สามารถแสดงตัวอย่างสลิปได้ กรุณากดดูไฟล์เต็ม
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => window.open(slipImage, "_blank", "noopener,noreferrer")}
                  className="booking-form-primary-button rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-sm transition"
                >
                  ดูสลิปเต็ม
                </button>
              </div>
            )}

            {slipImage && slipIsPdf && (
              <div className="booking-upload-preview mt-3 flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-6 py-10 text-center">
                <div className="rounded-full bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-500">
                  ไฟล์ PDF
                </div>
                <div>
                  <p className="text-lg font-bold text-zinc-800">ไฟล์สลิป PDF</p>
                  <p className="mt-1 text-sm text-zinc-400">{slipDisplayName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => window.open(slipImage, "_blank", "noopener,noreferrer")}
                  className="booking-form-primary-button rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-sm transition"
                >
                  เปิดไฟล์สลิป
                </button>
              </div>
            )}
          </div>
        </div>


        </div>
      </div>

      <div className={`booking-right-panel ${isViewMode ? "booking-right-panel-view" : ""}`}>
        <div
          className={`booking-action-panel no-print z-20 border border-zinc-200/70 bg-white/90 px-4 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-all duration-300 sm:px-5 ${
            isViewMode ? "hidden" : ""
          }`}
        >
        <div className="mx-auto max-w-[1180px]">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-zinc-900">เมนูจัดการ</h2>
              <p className="text-xs text-zinc-500">
                จัดการใบจองและข้อมูลลูกค้า
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsMoreMenuOpen((current) => !current)}
              className={`booking-more-toggle rounded-[20px] border bg-white px-5 py-3 text-sm font-extrabold shadow-[0_10px_22px_rgba(43,26,20,0.08)] transition-all duration-200 hover:bg-[#F3E6CF] ${
                isMoreMenuOpen
                  ? "booking-more-toggle-active"
                  : "border-[#E9DCCB] text-[#2B1A14]"
              }`}
            >
              {isMoreMenuOpen ? "ซ่อนเมนูเพิ่มเติม" : "เมนูเพิ่มเติม"}
            </button>
          </div>

          <div className="booking-action-grid grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 min-[1580px]:grid-cols-6">
            <div className="relative min-w-[170px] flex-1">
              <button
                type="button"
                onClick={() => setIsDownloadMenuOpen((current) => !current)}
                disabled={isExporting}
                className={`${actionDownloadButtonClass} w-full`}
              >
                <span className="text-lg">↓</span>
                <span>{isExporting ? "กำลังสร้างไฟล์..." : "ดาวน์โหลด"}</span>
              </button>

              {isDownloadMenuOpen && (
                <div className="absolute left-0 top-full z-[70] mt-2 w-full min-w-[170px] overflow-hidden rounded-[18px] border border-zinc-300 bg-white shadow-[0_16px_34px_rgba(24,24,27,0.12)]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDownloadMenuOpen(false);
                      downloadPDF();
                    }}
                    className="block w-full px-5 py-3 text-left text-sm font-extrabold text-zinc-900 transition hover:bg-zinc-50"
                  >
                    PDF
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsDownloadMenuOpen(false);
                      downloadJPG();
                    }}
                    className="block w-full border-t border-zinc-200 px-5 py-3 text-left text-sm font-extrabold text-zinc-900 transition hover:bg-zinc-50"
                  >
                    JPG
                  </button>

                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                saveCustomer({
                  forceUpdate: isBookingSaved && isEditingBooking,
                })
              }
              disabled={
                isSaving ||
                (isBookingSaved && !isEditingBooking) ||
                (isBookingSaved && isEditingBooking && !hasEditedFields)
              }
              className={actionSaveButtonClass}
            >
              <span className="text-lg">✓</span>
              <span>
                {isSaving
                  ? "กำลังบันทึก..."
                  : isBookingSaved && isEditingBooking && hasEditedFields
                    ? "บันทึกการแก้ไข"
                    : isBookingSaved && isEditingBooking
                      ? "ยังไม่มีการแก้ไข"
                    : isBookingSaved
                      ? "บันทึกแล้ว"
                      : "บันทึกข้อมูล"}
              </span>
            </button>

            <button
              type="button"
              onClick={createNewBooking}
              className={actionCreateButtonClass}
            >
              <span className="text-lg">＋</span>
              <span>สร้างใบจองใหม่</span>
            </button>

            <button
              type="button"
              onClick={openCustomerSendOptions}
              className={actionSendButtonClass}
            >
              <span className="text-lg">@</span>
              <span>ส่งข้อมูลลูกค้า</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!isBookingSaved && !loadedBookingNumber) {
                  window.alert("กรุณาบันทึกใบจองก่อน แล้วจึงแก้ไขข้อมูล");
                  return;
                }

                setEditedFields({});
                setIsEditingBooking(true);
              }}
              disabled={isSaving || isEditingBooking}
              className={actionEditButtonClass}
            >
              <span className="text-lg">✎</span>
              <span>{isEditingBooking ? "กำลังแก้ไข" : "แก้ไขใบจอง"}</span>
            </button>

            <button
              onClick={() => goTo(ROUTES.dashboard)}
              className={actionSecondaryButtonClass}
            >
              <span className="text-lg">⌂</span>
              <span>เมนูหลัก</span>
            </button>
          </div>

          {isMoreMenuOpen && (
            <div className="mt-4 space-y-4 border-t border-zinc-200/80 pt-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <button
                  type="button"
                    onClick={() => goTo(ROUTES.booking)}
                  className={actionMenuButtonClass}
                >
                  <span>＋</span>
                  <span>สร้างใบจอง</span>
                </button>

                <button
                  type="button"
                    onClick={() => goTo(ROUTES.customers)}
                  className={actionMenuButtonClass}
                >
                  <span>▣</span>
                  <span>ดูใบจอง</span>
                </button>

                <button
                  type="button"
                    onClick={() => goTo(ROUTES.customers)}
                  className={actionMenuButtonClass}
                >
                  <span>◉</span>
                  <span>ข้อมูลลูกค้า</span>
                </button>

                <button
                  type="button"
                    onClick={() => goTo(ROUTES.calendar)}
                  className={actionMenuButtonClass}
                >
                  <span>▦</span>
                  <span>ปฏิทินงาน</span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <button
                  type="button"
                    onClick={() => goTo(ROUTES.archives)}
                  className={actionMenuSmallButtonClass}
                >
                  <span>□</span>
                  <span>คลังข้อมูล</span>
                </button>

                <button
                  type="button"
                    onClick={() => goTo(ROUTES.income)}
                  className={actionMenuSmallButtonClass}
                >
                  <span>฿</span>
                  <span>รายได้</span>
                </button>

                <button
                  type="button"
                    onClick={() => goTo(ROUTES.reports)}
                  className={actionMenuSmallButtonClass}
                >
                  <span>▤</span>
                  <span>รายงาน</span>
                </button>

                <button
                  type="button"
                    onClick={() => goTo(ROUTES.notifications)}
                  className={actionMenuSmallButtonClass}
                >
                  <span>🔔</span>
                  <span>แจ้งเตือน</span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <button
                  type="button"
                    onClick={() => goTo(ROUTES.settings)}
                  className={actionMenuSmallButtonClass}
                >
                  <span>⚙</span>
                  <span>ตั้งค่า</span>
                </button>

                <button
                  type="button"
                  onClick={duplicateBooking}
                  className={actionMenuSmallButtonClass}
                >
                  <span>⧉</span>
                  <span>คัดลอกใบจองเดิม</span>
                </button>

                <button
                  type="button"
                  onClick={() => clearForm()}
                  className={actionDangerButtonClass}
                >
                  <span>⌫</span>
                  <span>ล้างแบบฟอร์ม</span>
                </button>

                <button
                  type="button"
                    onClick={() => goTo(ROUTES.trash)}
                  className={actionDangerButtonClass}
                >
                  <span>⌫</span>
                  <span>ถังขยะ</span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={openCustomerSendOptions}
                  className={actionMenuSmallButtonClass}
                >
                  <span>@</span>
                  <span>ส่งข้อมูลลูกค้า</span>
                </button>

                <button
                  type="button"
                  onClick={() => goTo(ROUTES.dashboard)}
                  className={actionMenuSmallButtonClass}
                >
                  <span>⌂</span>
                  <span>เมนูหลัก</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem("loggedIn");
                    localStorage.removeItem("currentUser");
                    localStorage.removeItem("activeBrand");
                    document.cookie = "loggedIn=; path=/; max-age=0; SameSite=Lax";
                    document.cookie = "activeBrand=; path=/; max-age=0; SameSite=Lax";
                    goTo("/login");
                  }}
                  className="flex min-h-[52px] items-center justify-center gap-2 rounded-[22px] border border-red-600 bg-red-600 px-5 py-3 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(220,38,38,0.20)] transition-all duration-200 hover:bg-red-700"
                >
                  <span>↪</span>
                  <span>ออกจากระบบ</span>
                </button>
              </div>
            </div>
          )}
        </div>
        </div>

      {/* ========================= */}
      {/* FRONT DOCUMENT */}
      {/* ========================= */}

        <div
          ref={bookingPreviewPanelRef}
          className={`booking-preview-panel print-container min-w-0 overflow-x-auto pb-10 transition-all duration-300 ${
            isViewMode
              ? "px-4 pt-0"
              : "px-0 pt-0"
          }`}
          style={{ "--booking-preview-scale": bookingPreviewScale }}
        >
        {isViewMode && (
          <div className="no-print mx-auto mb-5 flex w-full min-w-[min(210mm,calc(100vw-32px))] max-w-[210mm] flex-col gap-3 rounded-[22px] border border-zinc-200 bg-white/90 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => goTo(ROUTES.customers)}
              className={actionSecondaryButtonClass}
            >
              ← กลับหน้าข้อมูลลูกค้า
            </button>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsViewMode(false);
                  setEditedFields({});
                  setIsEditingBooking(true);
                  window.history.replaceState({}, "", ROUTES.home);
                }}
                className={actionEditButtonClass}
              >
                ✏️ แก้ไขใบจอง
              </button>

              <button
                type="button"
                onClick={openCustomerSendOptions}
                disabled={isPreparingAttachment}
                className={actionSendButtonClass}
              >
                {isPreparingAttachment ? "กำลังเตรียมไฟล์..." : "ส่งให้ลูกค้า"}
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsDownloadMenuOpen((current) => !current)}
                  disabled={isExporting}
                  className={actionDownloadButtonClass}
                >
                  {isExporting ? "กำลังสร้างไฟล์..." : "ดาวน์โหลด"}
                </button>

                {isDownloadMenuOpen && (
                  <div className="absolute right-0 top-full z-[70] mt-2 w-40 overflow-hidden rounded-[18px] border border-zinc-300 bg-white shadow-[0_16px_34px_rgba(24,24,27,0.12)]">
                    <button
                      type="button"
                      onClick={() => {
                        setIsDownloadMenuOpen(false);
                        downloadPDF();
                      }}
                      className="block w-full px-5 py-3 text-left text-sm font-extrabold text-zinc-900 transition hover:bg-zinc-50"
                    >
                      PDF
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsDownloadMenuOpen(false);
                        downloadJPG();
                      }}
                      className="block w-full border-t border-zinc-200 px-5 py-3 text-left text-sm font-extrabold text-zinc-900 transition hover:bg-zinc-50"
                    >
                      JPG
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <div
          className="print-area bg-white w-[210mm] h-[297mm] mx-auto shadow-2xl p-8 flex flex-col overflow-hidden"
        >

          {/* HEADER */}

         <div className={`flex justify-between items-start ${isDenseDocument ? "pb-3" : "pb-6"}`}>

            <div className="flex -translate-y-4 items-center gap-4">

              <img
                src="/logo.png"
                alt="logo"
                className={`${isDenseDocument ? "w-20 h-20" : "w-24 h-24"} rounded-full object-cover`}
              />

              <div>

                <h1 className={`${isDenseDocument ? "text-xl" : "text-2xl"} font-bold leading-tight`}>
                  Adisorn Wedding Studio
                </h1>

                <p className="mt-1 text-zinc-600 text-[10px] leading-tight">
                  adisornweddingstudio@gmail.com
                </p>

                <p className="mt-0.5 text-zinc-600 text-[10px] leading-tight">
                  โทร. 082 141 9633
                </p>

              </div>

            </div>

            <div className="ml-auto flex w-[220px] -translate-y-4 flex-col items-end">
              <div className="flex w-full justify-end overflow-hidden">
                <Barcode
                  value={bookingNumber}
                  width={Math.max(
                    0.55,
                    Math.min(0.9, 13 / Math.max(bookingNumber.length, 1))
                  )}
                  height={32}
                  margin={0}
                  displayValue={false}
                />
              </div>

              <p className="mt-2 w-full whitespace-nowrap text-right text-[16px] font-black tracking-normal">
                {bookingNumber}
              </p>

              <p className="mt-1 w-full whitespace-nowrap text-right text-[11px] text-black">
                วันที่จอง : {documentBookingDate}
              </p>
            </div>

          </div>

          <div className="-translate-y-8 border-t border-black" />

          {/* TITLE */}

          <div className={`text-center ${isDenseDocument ? "py-1" : "py-3"}`}>
            <h2 className={`${isDenseDocument ? "text-2xl" : "text-3xl"} font-bold`}>
              ใบสำคัญการจอง
            </h2>
          </div>

          {/* INFO */}

          <div className={`grid grid-cols-2 gap-8 ${isDenseDocument ? "mb-2" : "mb-4"}`}>
            <div>
              <h3 className={`${isDenseDocument ? "text-lg mb-1" : "text-xl mb-2"} font-bold`}>
                ข้อมูลลูกค้า
              </h3>
              <div className={`${isDenseDocument ? "text-sm" : "text-base"} space-y-0.5`}>
                <p>
                  ชื่อลูกค้า : {customerName || "-"}
                </p>
                <p>
                  เบอร์โทรศัพท์ : {phone || "-"}
                </p>
                <p>
                  อีเมล : {email || "-"}
                </p>
              </div>
            </div>
            <div>
              <h3 className={`${isDenseDocument ? "text-lg mb-1" : "text-xl mb-2"} font-bold`}>
                รายละเอียดการจอง
              </h3>
              <div className={`${isDenseDocument ? "text-sm" : "text-base"} space-y-0.5`}>
                <p>
                  ประเภทงาน : {service || "-"}
                </p>
                <p>
                  สถานที่ : {location || "-"}
                </p>
                <p>
                  วันเริ่มงาน : {formattedEventDate}
                </p>
                <div className="flex items-center gap-6 whitespace-nowrap">
                  <p>
                    เวลาเริ่มงาน : {startTime ? `${startTime} น.` : "-"}
                  </p>
                  <p>
                    เวลาจบงาน : {endTime ? `${endTime} น.` : "-"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* TABLE */}

          <div className={`${isDenseDocument ? "mb-2" : "mb-5"} overflow-hidden rounded-2xl border border-zinc-200 bg-white shrink-0`}>
            <div className={`service-table-header grid grid-cols-[1fr_120px_180px] items-center bg-zinc-900 px-5 ${isDenseDocument ? "py-1.5" : "py-2.5"} text-white`}>
              <div>
                <p className={`${isDenseDocument ? "text-base" : "text-lg"} font-bold`}>รายละเอียดบริการ</p>
                <p className={`${isDenseDocument ? "text-[10px]" : "text-xs"} mt-0.5 text-zinc-300`}>
                  รายการทีมงานและบริการที่เลือก
                </p>
              </div>
              <div className={`flex items-center justify-center ${isDenseDocument ? "text-base" : "text-lg"} font-bold`}>
                จำนวน
              </div>
              <div className={`text-right ${isDenseDocument ? "text-base" : "text-lg"} font-bold`}>ราคา</div>
            </div>
            <div className="divide-y divide-zinc-200">
              {serviceItems.length === 0 ? (
                <div className="grid grid-cols-[1fr_120px_180px] items-center px-5 py-3 text-zinc-400">
                  <div>ยังไม่มีรายการบริการ</div>
                  <div className="flex items-center justify-center">-</div>
                  <div className="text-right text-lg font-semibold">฿ 0</div>
                </div>
              ) : (
                serviceItems.map((item, index) => {
                  const isPersonnel = personnelServices.includes(item.name);
                  const inlineDescription = getInlineServiceDescription(item.description);
                  return (
                    <div
                      key={item.id}
                      className={`grid grid-cols-[1fr_120px_180px] items-center gap-4 px-5 ${isDenseDocument ? "py-1.5" : "py-2.5"}`}
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className={`flex shrink-0 items-center justify-center rounded-full bg-zinc-100 font-bold text-zinc-600 ${isDenseDocument ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-xs"}`}>
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={`${isDenseDocument ? "text-base" : "text-lg"} font-semibold text-zinc-900`}>
                              {item.name}
                            </p>
                            {inlineDescription && (
                              <p className="mt-0.5 text-[10px] text-zinc-500">
                                {inlineDescription}
                              </p>
                            )}
                          </div>
                          {isPersonnel && (
                            <p className={`${isDenseDocument ? "text-[10px]" : "text-xs"} mt-0.5 text-zinc-500`}>
                              ฿ {Number(item.unitPrice || 0).toLocaleString()} ต่อคน
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-center">
                        <span className={`inline-flex w-24 items-center justify-center rounded-full bg-zinc-100 font-semibold text-zinc-700 ${isDenseDocument ? "py-0.5 text-xs" : "py-1 text-sm"}`}>
                          {isPersonnel
                            ? `${item.quantity || 1} คน`
                            : isPackageServiceName(item.name)
                              ? "1 แพ็กเกจ"
                              : "1 รายการ"}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className={`${isDenseDocument ? "text-lg" : "text-xl"} font-bold text-zinc-900`}>
                          ฿ {Number(item.price || 0).toLocaleString()}
                        </p>
                        {isPersonnel && Number(item.quantity || 1) > 1 && (
                          <p className={`${isDenseDocument ? "text-[10px]" : "text-xs"} mt-0.5 text-zinc-500`}>
                            {Number(item.unitPrice || 0).toLocaleString()} × {item.quantity || 1}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-5 py-2.5">
              <span className="text-base font-semibold text-zinc-600">
                รวมค่าบริการทั้งหมด
              </span>
              <span className="text-2xl font-bold text-zinc-900">
                ฿ {serviceTotal.toLocaleString()}
              </span>
            </div>
          </div>

          {/* SUMMARY */}

          <div className={`flex justify-end shrink-0 ${isDenseDocument ? "mb-2" : "mb-4"}`}>
            <div className={`w-1/2 border rounded-2xl ${isDenseDocument ? "p-3" : "p-4"}`}>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-zinc-600">
                  <span>รวมค่าบริการ</span>
                  <span>฿ {serviceTotal.toLocaleString()}</span>
                </div>
                {percentDiscountValue > 0 && (
                  <div className="flex justify-between text-zinc-600">
                    <span>
                      ส่วนลดจากเปอร์เซ็นต์ ({Number(discountPercent || 0)}%)
                    </span>
                    <span>-฿ {percentDiscountValue.toLocaleString()}</span>
                  </div>
                )}
                {Number(discountAmount || 0) > 0 && (
                  <div className="flex justify-between text-zinc-600">
                    <span>ส่วนลดเพิ่มเติม</span>
                    <span>
                      -฿ {Number(discountAmount || 0).toLocaleString()}
                    </span>
                  </div>
                )}
                {totalDiscount > 0 && (
                  <div className="flex justify-between font-semibold text-red-600">
                    <span>ส่วนลดรวม</span>
                    <span>-฿ {totalDiscount.toLocaleString()}</span>
                  </div>
                )}
                <div className="border-t pt-2 mt-1 flex justify-between items-center font-bold">
                  <span className="text-2xl">ยอดรวมสุทธิ</span>
                  <span className="text-2xl">฿ {finalPrice.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* NOTES & SIGNATURE */}

          <div className={`mt-auto shrink-0 ${isDenseDocument ? "pt-1" : "pt-3"}`}>
            <div className={`${isDenseDocument ? "mb-3 text-[10px] leading-snug" : "mb-5 text-xs leading-relaxed"} text-zinc-600`}>
              <p className="mb-1 font-bold text-zinc-900">
                หมายเหตุ
              </p>
              <p>
                • หากต้องการต่อเวลารายชั่วโมง คิดเป็นชั่วโมงละ 1,500 บาท / ช่าง 1 คน
              </p>
              <p>
                • เมื่อจองแพ็กเกจช่างภาพหรือวิดีโอแล้ว ไม่สามารถลดแพ็กเกจได้
              </p>
            </div>

            {/* signature block moved to payment page */}
          </div>

        </div>

        {!isCustomerView && (
          <>
        <div
          className="print-area payment-page bg-white w-[210mm] h-[297mm] mx-auto shadow-2xl p-8 flex flex-col overflow-hidden mt-10"
        >
          <div className="flex justify-between items-start pb-6 shrink-0">
            <div className="flex -translate-y-4 items-center gap-4">
              <img
                src="/logo.png"
                alt="logo"
                className="w-24 h-24 rounded-full object-cover"
              />

              <div>
                <h1 className="text-2xl font-bold leading-tight">
                  Adisorn Wedding Studio
                </h1>
                <p className="mt-1 text-zinc-600 text-[10px] leading-tight">
                  adisornweddingstudio@gmail.com
                </p>
                <p className="mt-0.5 text-zinc-600 text-[10px] leading-tight">
                  โทร. 082 141 9633
                </p>
              </div>
            </div>

            <div className="ml-auto flex w-[220px] -translate-y-4 flex-col items-end">
              <div className="flex w-full justify-end overflow-hidden">
                <Barcode
                  value={bookingNumber}
                  width={Math.max(
                    0.55,
                    Math.min(0.9, 13 / Math.max(bookingNumber.length, 1))
                  )}
                  height={32}
                  margin={0}
                  displayValue={false}
                />
              </div>

              <p className="mt-2 w-full whitespace-nowrap text-right text-[16px] font-black tracking-normal">
                {bookingNumber}
              </p>

              <p className="mt-1 w-full whitespace-nowrap text-right text-[11px] text-black">
                วันที่จอง : {documentBookingDate}
              </p>
            </div>
          </div>

          <div className="-translate-y-8 border-t border-black shrink-0" />

          <div className="text-center py-6">
            <h2 className="text-3xl font-bold">หลักฐานการชำระเงิน</h2>
          </div>

          <div className="grid grid-cols-[0.76fr_1.24fr] gap-3 mb-4 shrink-0">
            <div className="grid grid-cols-[0.8fr_1.2fr] auto-rows-min content-start items-start gap-x-2 gap-y-0 rounded-2xl border border-zinc-200 p-4">
              <div className="mb-1.5">
                <p className="text-xs text-zinc-500">ชื่อลูกค้า</p>
                <p className="mt-0.5 text-sm font-semibold leading-none">
                  {customerName || "-"}
                </p>
              </div>

              <div className="mb-1.5">
                <p className="text-xs text-zinc-500">ประเภทงาน</p>
                <p className="mt-0.5 text-sm font-semibold leading-none">
                  {service || "-"}
                </p>
              </div>

              <div className="mb-1.5">
                <p className="text-xs text-zinc-500">วันที่ชำระ</p>
                <p className="mt-0.5 text-sm font-semibold leading-none">
                  {paymentDate
                    ? new Date(paymentDate).toLocaleDateString("th-TH")
                    : "-"}
                </p>
              </div>

              <div className="mb-1.5">
                <p className="text-xs text-zinc-500">เวลาชำระ</p>
                <p className="mt-0.5 text-sm font-semibold leading-none">
                  {paymentTime ? `${paymentTime} น.` : "-"}
                </p>
              </div>

              <div className="mb-1.5">
                <p className="text-xs text-zinc-500">ช่องทางการชำระ</p>
                <p className="mt-0.5 text-sm font-semibold leading-none">
                  {paymentMethod || "-"}
                </p>
              </div>

              <div className="mb-1.5">
                <p className="text-xs text-zinc-500">ยอดชำระ</p>
                <p className="mt-0.5 text-lg font-bold leading-none">
                  ฿ {Number(paymentAmount || 0).toLocaleString()}
                </p>
              </div>

              <div className="mb-1.5">
                <p className="text-xs text-zinc-500">สถานะ</p>
                <p
                  className={`mt-1 inline-flex whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none ${paymentDisplayStatusClass}`}
                >
                  {paymentDisplayStatus}
                </p>
              </div>

              <div className="mb-1.5">
                <p className="text-xs text-zinc-500">ยอดคงเหลือ</p>
                <p
                  className={`mt-0.5 text-sm font-bold leading-none ${
                    previewRemainingPayment <= 0
                      ? "text-green-700"
                      : "text-red-600"
                  }`}
                >
                  ฿ {previewRemainingPayment.toLocaleString()}
                </p>
              </div>

              <div className="col-span-2 mb-1.5">
                <p className="text-xs text-zinc-500">หมายเหตุ</p>
                <p className="text-xs whitespace-pre-wrap leading-snug">
                  {paymentNote || "-"}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 p-4 text-[11px] leading-relaxed text-zinc-700">
              <p className="text-sm font-bold text-zinc-900 mb-2">
                เงื่อนไขและการชำระเงิน
              </p>
              <p>• งวดที่ 1) มัดจำก่อนเริ่มงาน</p>
              <p>
                • งวดที่ 2) ชำระยอดส่วนที่เหลือวันถ่ายจริงเต็มจำนวน
                หรือไม่เกิน 24 ชั่วโมงหลังจบงาน
              </p>

              <p className="text-sm font-bold text-zinc-900 mt-3 mb-1">
                ข้อมูลการชำระเงิน
              </p>
              <p>• ชื่อบัญชี : นายอดิศร มีศิลป์ (Adisorn Meesin)</p>
              <p>• หมายเลขบัญชี : 415 038 792 4</p>
              <p>• ธนาคาร : ไทยพาณิชย์</p>
              <p>
                • หลักฐานการโอนเงินมัดจำใช้บริการเพจ Adisorn Wedding Studio
              </p>
              <p>• ผู้รับจอง : นายอดิศร มีศิลป์</p>
            </div>
          </div>

          <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
            {slipImage &&
            slipIsImage &&
            (slipPdfPreviewUrl || slipPreviewUrl) &&
            !slipPreviewFailed &&
            !slipPdfPreviewFailed ? (
              <div className="flex w-full flex-col items-center justify-center gap-3">
                <img
                  src={slipPdfPreviewUrl || slipPreviewUrl}
                  alt="หลักฐานการโอนงาน"
                  onError={() => setSlipPreviewFailed(true)}
                  className="max-h-[300px] w-full rounded-xl object-contain md:max-h-[420px]"
                />
                <button
                  type="button"
                  onClick={() => window.open(slipImage, "_blank", "noopener,noreferrer")}
                  className="no-print rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700"
                >
                  ดูสลิปเต็ม
                </button>
              </div>
            ) : slipImage && slipIsImage && (slipPreviewFailed || slipPdfPreviewFailed) ? (
              <div className="flex min-h-[240px] w-full flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-zinc-200 bg-zinc-50 px-6 py-10 text-center">
                <div className="rounded-full bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-500">
                  มีไฟล์แนบ
                </div>

                <div>
                  <p className="text-lg font-bold text-zinc-800">
                    มีหลักฐานการโอนแล้ว
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    ไม่สามารถแสดงตัวอย่างสลิปได้ กรุณากดดูไฟล์เต็ม
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => window.open(slipImage, "_blank", "noopener,noreferrer")}
                  className="no-print rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-zinc-800"
                >
                  ดูสลิปเต็ม
                </button>
              </div>
            ) : slipImage && slipIsPdf ? (
              <div className="flex min-h-[240px] w-full flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-zinc-200 bg-zinc-50 px-6 py-10 text-center">
                <div className="rounded-full bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-500">
                  ไฟล์ PDF
                </div>
                <div>
                  <p className="text-lg font-bold text-zinc-800">ไฟล์สลิป PDF</p>
                  <p className="mt-1 text-sm text-zinc-400">{slipDisplayName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => window.open(slipImage, "_blank", "noopener,noreferrer")}
                  className="no-print rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-zinc-800"
                >
                  เปิดไฟล์สลิป
                </button>
              </div>
            ) : (
              <div className="text-center text-zinc-400">
                <p className="text-xl font-semibold">ยังไม่ได้แนบหลักฐานการโอน</p>
                <p className="mt-2 text-sm">
                  เมื่ออัปโหลดรูป ภาพจะแสดงในพื้นที่นี้
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 w-full mt-5 shrink-0">
            <div className="border rounded-xl flex flex-col justify-between text-center w-full p-3 h-24">
              <p className="text-sm font-semibold">
                ลูกค้า
              </p>
              <div className="border-b"></div>
              <p className="text-zinc-500 text-[10px]">
                วันที่ ........../........../..........
              </p>
            </div>

            <div className="border rounded-xl flex flex-col items-center justify-center text-center w-full p-3 h-24 gap-3">
              <p className="text-xs font-semibold">
                Adisorn Wedding Studio
              </p>
              <p className="text-zinc-500 text-[10px]">
                วันที่ {documentToday}
              </p>
            </div>
          </div>
        </div>

        {shouldShowPrimaryPackagePage && (
        <div
          className="print-area package-page bg-white w-[210mm] h-[297mm] mx-auto shadow-2xl p-8 flex flex-col overflow-hidden mt-10"
        >
          <div className="flex justify-between items-start pb-6 shrink-0">
            <div className="flex -translate-y-4 items-center gap-4">
              <img
                src="/logo.png"
                alt="logo"
                className="w-24 h-24 rounded-full object-cover"
              />

              <div>
                <h1 className="text-2xl font-bold leading-tight">
                  Adisorn Wedding Studio
                </h1>
                <p className="mt-1 text-zinc-600 text-[10px] leading-tight">
                  adisornweddingstudio@gmail.com
                </p>
                <p className="mt-0.5 text-zinc-600 text-[10px] leading-tight">
                  โทร. 082 141 9633
                </p>
              </div>
            </div>

            <div className="ml-auto flex w-[220px] -translate-y-4 flex-col items-end">
              <div className="flex w-full justify-end overflow-hidden">
                <Barcode
                  value={bookingNumber}
                  width={Math.max(
                    0.55,
                    Math.min(0.9, 13 / Math.max(bookingNumber.length, 1))
                  )}
                  height={32}
                  margin={0}
                  displayValue={false}
                />
              </div>

              <p className="mt-2 w-full whitespace-nowrap text-right text-[16px] font-black tracking-normal">
                {bookingNumber}
              </p>

              <p className="mt-1 w-full whitespace-nowrap text-right text-[11px] text-black">
                วันที่จอง : {documentBookingDate}
              </p>
            </div>
          </div>

          <div className="-translate-y-8 border-t border-black shrink-0" />

          <div className="text-center py-4 shrink-0">
            <h2 className="text-3xl font-bold">สิ่งที่ลูกค้าจะได้รับ</h2>
          </div>

          <div className="grid grid-cols-4 gap-3 rounded-xl border border-zinc-200 px-4 py-3 mb-4 text-[10px] shrink-0">
            <div>
              <p className="text-zinc-500">ชื่อลูกค้า</p>
              <p className="font-semibold text-zinc-900">{customerName || "-"}</p>
            </div>
            <div>
              <p className="text-zinc-500">ประเภทงาน</p>
              <p className="font-semibold text-zinc-900">{service || "-"}</p>
            </div>
            <div>
              <p className="text-zinc-500">วันที่งาน</p>
              <p className="font-semibold text-zinc-900">{formattedEventDate}</p>
            </div>
            <div>
              <p className="text-zinc-500">เวลางาน</p>
              <p className="font-semibold text-zinc-900">
                {startTime && endTime ? `${startTime}–${endTime} น.` : "-"}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-zinc-500">สถานที่</p>
              <p className="font-semibold text-zinc-900">{location || "-"}</p>
            </div>
            <div>
              <p className="text-zinc-500">เบอร์โทรศัพท์</p>
              <p className="font-semibold text-zinc-900">{phone || "-"}</p>
            </div>
            <div>
              <p className="text-zinc-500">เลขที่การจอง</p>
              <p className="font-semibold text-zinc-900">{bookingNumber}</p>
            </div>
          </div>

          <div className={`flex flex-col gap-4 flex-1 min-h-0 ${hasPhotographyPackage && hasVideoPackage ? "" : "justify-start"}`}>
            {hasPhotographyPackage && (
            <section className="rounded-2xl border border-zinc-200 overflow-hidden flex flex-col shrink-0 basis-[40%]">
              <div className="package-section-header bg-zinc-900 text-white px-5 py-3 shrink-0">
                <h3 className="text-lg font-bold tracking-wide">
                  PHOTOGRAPHY PACKAGE
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-5 text-[10px] leading-relaxed text-zinc-700 overflow-hidden">
                <div>
                  <p className="font-bold text-sm text-zinc-900 mb-1">
                    1. ภาพถ่ายทั้งหมด
                  </p>
                  <p>
                    ถ่ายภาพไม่จำกัดจำนวน ได้รับภาพที่ผ่านการตกแต่งทั้งหมดเป็นไฟล์ JPEG
                    โดยไม่ส่งไฟล์ดิบ ปรับแสง สี มูดและโทนตามสไตล์ของช่างภาพ
                    ไม่มีการรีทัชเชิงลึก และปรับแต่งตามความเหมาะสมของภาพ
                  </p>
                </div>

                <div>
                  <p className="font-bold text-sm text-zinc-900 mb-1">
                    2. กำหนดการส่งงาน
                  </p>
                  <p>
                    ส่งงานหลังจากชำระเงินเต็มจำนวนแล้วเท่านั้น ภาพไฮไลท์ 20–50 ภาพ
                    จัดส่งภายใน 1–3 วัน และภาพทั้งหมดภายใน 3–7 วัน
                    ระยะเวลาอาจเปลี่ยนแปลงตามความหนาแน่นของคิวงาน
                    โดยงานที่เสร็จก่อนจะจัดส่งให้ก่อน
                  </p>
                </div>

                <div>
                  <p className="font-bold text-sm text-zinc-900 mb-1">
                    3. การสำรองไฟล์และการส่งงาน
                  </p>
                  <p>
                    ส่งไฟล์งาน Final ทางแฟลชไดรฟ์และ Google Drive
                    สำรองไฟล์ JPEG เป็นเวลา 1 ปี และสำรองไฟล์ RAW เป็นเวลา 1 เดือน
                  </p>
                </div>

                <div>
                  <p className="font-bold text-sm text-zinc-900 mb-1">
                    4. อุปกรณ์
                  </p>
                  <p>
                    กล้อง Sony พร้อมเลนส์ครบทุกระยะ ให้ภาพคมชัดและสีผิวสวย
                    พร้อมอุปกรณ์ไฟส่องสว่างสำหรับบริเวณพิธีและพื้นที่ถ่ายภาพ
                  </p>
                </div>
              </div>
            </section>

            )}
            {hasVideoPackage && (
            <section className="rounded-2xl border border-zinc-200 overflow-hidden flex flex-col flex-1 min-h-0">
              <div className="package-section-header bg-zinc-900 text-white px-5 py-3 shrink-0">
                <h3 className="text-lg font-bold tracking-wide">
                  VIDEO PACKAGE
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-5 text-[9px] leading-relaxed text-zinc-700 overflow-hidden">
                <div>
                  <p className="font-bold text-sm text-zinc-900 mb-1">
                    1. วิดีโอไฮไลท์
                  </p>
                  <p>
                    วิดีโอไฮไลท์รูปแบบ Cinema ที่ผ่านการถ่ายทำและตัดต่อแล้ว
                    ความยาวประมาณ 4–10 นาที จำนวน 1 คลิป ระยะเวลาขึ้นอยู่กับรายละเอียดของงาน
                    พร้อมเพลงประกอบและเสียงบรรยากาศบางช่วงภายในงาน
                    ลูกค้าสามารถเลือกเพลงได้ และแก้ไขงานได้ไม่เกิน 2 ครั้ง
                  </p>
                </div>

                <div>
                  <p className="font-bold text-sm text-zinc-900 mb-1">
                    2. วิดีโอรวม Footage
                  </p>
                  <p>
                    คลิปรวมวิดีโอที่บันทึกจากงานช่วงเช้าหรือช่วงเย็นและผ่านการตัดต่อแล้ว
                    ความยาวประมาณ 40–120 นาที จำนวน 1 คลิป
                    ใช้เสียงบรรยากาศจริงภายในงานเป็นหลัก
                  </p>
                </div>

                <div>
                  <p className="font-bold text-sm text-zinc-900 mb-1">
                    3. รูปแบบการถ่ายทำ
                  </p>
                  <p>
                    เนื่องจากเป็นการถ่ายทำรูปแบบ Cinema ช่างวิดีโอจะเปลี่ยนมุมกล้องตลอดเวลา
                    เพื่อให้ได้มุมภาพที่เหมาะสมที่สุด จึงไม่ใช่การตั้งกล้องบันทึกตั้งแต่ต้นจนจบงาน
                  </p>
                </div>

                <div>
                  <p className="font-bold text-sm text-zinc-900 mb-1">
                    4. กำหนดการส่งงาน
                  </p>
                  <p>
                    ส่งงานหลังจากชำระเงินเต็มจำนวนแล้วเท่านั้น วิดีโอไฮไลท์จัดส่งภายใน 7–14 วัน
                    และวิดีโอรวม Footage ภายใน 3 สัปดาห์
                    ระยะเวลาอาจเปลี่ยนแปลงตามความหนาแน่นของคิวงาน
                  </p>
                </div>

                <div>
                  <p className="font-bold text-sm text-zinc-900 mb-1">
                    5. การสำรองไฟล์และการส่งงาน
                  </p>
                  <p>
                    สำรองไฟล์ Footage เป็นเวลา 1 เดือน ส่งงาน Final ทาง Google Drive
                    และสำรองไฟล์งาน Final เป็นเวลา 1 ปี
                    หากต้องการแฟลชไดรฟ์มีค่าใช้จ่ายเพิ่มเติม
                  </p>
                </div>

                <div>
                  <p className="font-bold text-sm text-zinc-900 mb-1">
                    6. อุปกรณ์
                  </p>
                  <p>
                    กล้อง Sony พร้อมเลนส์ครบทุกระยะ เครื่องบันทึกเสียง ไมโครโฟน
                    และไฟส่องสว่างสำหรับบริเวณพิธี
                  </p>
                </div>
              </div>
            </section>
            )}
          </div>

          <div className="mt-4 text-[10px] leading-relaxed text-zinc-600 shrink-0">
            <p className="mb-1 font-bold text-zinc-900">
              หมายเหตุ
            </p>
            <p>
              • รายละเอียด ระยะเวลา และรูปแบบการส่งงานอาจปรับเปลี่ยนตามลักษณะงาน
              ปริมาณไฟล์ และความหนาแน่นของคิวงาน โดยทางสตูดิโอจะแจ้งให้ลูกค้าทราบตามความเหมาะสม
            </p>
          </div>
        </div>
        )}

        {shouldShowAddOnPackagePage && (
        <div
          className="print-area package-page bg-white w-[210mm] h-[297mm] mx-auto shadow-2xl p-8 flex flex-col overflow-hidden mt-10"
        >
          <div className="flex justify-between items-start pb-6 shrink-0">
            <div className="flex -translate-y-4 items-center gap-4">
              <img
                src="/logo.png"
                alt="logo"
                className="w-24 h-24 rounded-full object-cover"
              />

              <div>
                <h1 className="text-2xl font-bold leading-tight">
                  Adisorn Wedding Studio
                </h1>
                <p className="mt-1 text-zinc-600 text-[10px] leading-tight">
                  adisornweddingstudio@gmail.com
                </p>
                <p className="mt-0.5 text-zinc-600 text-[10px] leading-tight">
                  121 หมู่ 10 ตำบลไชยมงคล อำเภอเมือง จังหวัดนครราชสีมา 30000
                </p>
              </div>
            </div>

            <div className="ml-auto flex w-[220px] flex-col items-end">
              <div className="flex w-full justify-end overflow-hidden">
                <Barcode
                  value={bookingNumber}
                  width={Math.max(
                    0.55,
                    Math.min(0.9, 13 / Math.max(bookingNumber.length, 1))
                  )}
                  height={32}
                  margin={0}
                  displayValue={false}
                />
              </div>

              <p className="mt-2 w-full whitespace-nowrap text-right text-[16px] font-black tracking-normal">
                {bookingNumber}
              </p>

              <p className="mt-1 w-full whitespace-nowrap text-right text-[11px] text-black">
                วันที่จอง : {documentBookingDate}
              </p>
            </div>
          </div>

          <div className="-translate-y-8 border-t border-black shrink-0" />

          <div className="text-center py-4 shrink-0">
            <h2 className="text-3xl font-bold">สิ่งที่ลูกค้าจะได้รับ</h2>
          </div>

          <div className="grid grid-cols-4 gap-3 rounded-xl border border-zinc-200 px-4 py-3 mb-4 text-[10px] shrink-0">
            <div>
              <p className="text-zinc-500">ชื่อลูกค้า</p>
              <p className="font-semibold text-zinc-900">{customerName || "-"}</p>
            </div>
            <div>
              <p className="text-zinc-500">ประเภทงาน</p>
              <p className="font-semibold text-zinc-900">{service || "-"}</p>
            </div>
            <div>
              <p className="text-zinc-500">วันที่งาน</p>
              <p className="font-semibold text-zinc-900">{formattedEventDate}</p>
            </div>
            <div>
              <p className="text-zinc-500">เวลางาน</p>
              <p className="font-semibold text-zinc-900">
                {startTime && endTime ? `${startTime}–${endTime} น.` : "-"}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-zinc-500">สถานที่</p>
              <p className="font-semibold text-zinc-900">{location || "-"}</p>
            </div>
            <div>
              <p className="text-zinc-500">เบอร์โทรศัพท์</p>
              <p className="font-semibold text-zinc-900">{phone || "-"}</p>
            </div>
            <div>
              <p className="text-zinc-500">เลขที่การจอง</p>
              <p className="font-semibold text-zinc-900">{bookingNumber}</p>
            </div>
          </div>

          <div className="flex flex-col gap-4 flex-1 min-h-0 justify-start">
            {hasQrCodePackage && renderQrCodePackageSection()}
            {hasVideoGuestbookPackage && renderVideoGuestbookPackageSection()}
          </div>

          <div className="mt-4 text-[10px] leading-relaxed text-zinc-600 shrink-0">
            <p className="mb-1 font-bold text-zinc-900">
              หมายเหตุ
            </p>
            <p>
              • รายละเอียด ระยะเวลา และรูปแบบการส่งงานอาจปรับเปลี่ยนตามลักษณะงาน
              ปริมาณไฟล์ และความหนาแน่นของคิวงาน โดยทางสตูดิโอจะแจ้งให้ลูกค้าทราบตามความเหมาะสม
            </p>
          </div>
        </div>
        )}
          </>
        )}

        </div>
      </div>

      {showServiceModal && (
        <div className="no-print fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl md:p-6">
            <h2 className="text-2xl font-bold mb-1">เพิ่มรายการบริการ</h2>
            <p className="text-zinc-500 mb-5">
              เลือกรายการและกรอกราคา
            </p>

            <label className="block font-semibold mb-2">ประเภทรายการ</label>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedServiceType("service");
                  setSelectedServiceName("");
                }}
                className={`rounded-2xl border py-3 font-semibold ${
                  selectedServiceType === "service"
                    ? "bg-black text-white border-black"
                    : "bg-white text-zinc-700"
                }`}
              >
                รายการบริการ
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedServiceType("package");
                  setSelectedServiceName("");
                }}
                className={`rounded-2xl border py-3 font-semibold ${
                  selectedServiceType === "package"
                    ? "bg-black text-white border-black"
                    : "bg-white text-zinc-700"
                }`}
              >
                รายการแพ็กเกจ
              </button>
            </div>

            <label className="block font-semibold mb-2">
              {selectedServiceType === "package"
                ? "รายการแพ็กเกจ"
                : "รายการบริการ"}
            </label>
            <select
              value={selectedServiceName}
              onChange={(e) =>
                updateEditableField(
                  "selectedServiceName",
                  setSelectedServiceName,
                  e.target.value
                )
              }
              className={editableInputClass(
                "selectedServiceName",
                selectedServiceName,
                "mb-4 px-4 py-4"
              )}
            >
              <option value="">
                {selectedServiceType === "package"
                  ? "เลือกแพ็กเกจ"
                  : "เลือกรายการบริการ"}
              </option>
              {(selectedServiceType === "package"
                ? packageServiceOptions
                : regularServiceOptions
              ).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            {packageDescriptions[selectedServiceName] && (
              <div className="mb-4 rounded-2xl border bg-zinc-50 px-4 py-3">
                <p className="text-sm font-semibold text-zinc-700">
                  รายละเอียดบริการ
                </p>
                {renderServiceDescription(packageDescriptions[selectedServiceName])}
              </div>
            )}

            {personnelServices.includes(selectedServiceName) && (
              <>
                <label className="block font-semibold mb-2">จำนวนคน</label>
                <select
                  value={selectedServiceQuantity}
                  onChange={(e) =>
                    updateEditableField(
                      "selectedServiceQuantity",
                      setSelectedServiceQuantity,
                      e.target.value
                    )
                  }
                  className={editableInputClass(
                    "selectedServiceQuantity",
                    selectedServiceQuantity,
                    "mb-4 px-4 py-4"
                  )}
                >
                  {Array.from({ length: 10 }, (_, index) => index + 1).map(
                    (quantity) => (
                      <option key={quantity} value={quantity}>
                        {quantity} คน
                      </option>
                    )
                  )}
                </select>
              </>
            )}

            <label className="block font-semibold mb-2">
              {personnelServices.includes(selectedServiceName)
                ? "ราคาต่อคน"
                : isPackageServiceName(selectedServiceName)
                  ? "ราคาแพ็กเกจ"
                  : "ราคา"}
            </label>
            <input
              type="number"
              min="0"
              placeholder={
                personnelServices.includes(selectedServiceName)
                  ? "กรอกราคาต่อคน"
                  : isPackageServiceName(selectedServiceName)
                    ? "กรอกราคาแพ็กเกจ"
                    : "กรอกราคา"
              }
              value={selectedServicePrice}
              onChange={(e) =>
                updateEditableField(
                  "selectedServicePrice",
                  setSelectedServicePrice,
                  e.target.value
                )
              }
              className={editableInputClass(
                "selectedServicePrice",
                selectedServicePrice,
                "mb-6 px-4 py-4"
              )}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={closeServiceModal}
                className="border rounded-2xl py-4 font-semibold"
              >
                ยกเลิก
              </button>

              <button
                type="button"
                onClick={addServiceItem}
                className="bg-black text-white rounded-2xl py-4 font-semibold"
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      )}
      {isSendOptionsOpen && (
        <div className="no-print fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-zinc-900">
                ส่งข้อมูลลูกค้า
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                เลือกช่องทางที่ต้องการส่งรายละเอียดใบจอง
              </p>
            </div>

            <div className="grid gap-3">
              <button
                type="button"
                onClick={sendBookingEmail}
                disabled={isPreparingAttachment}
                className={actionSendButtonClass}
              >
                <span className="text-lg">@</span>
                <span>
                  {preparingSendChannel === "email"
                    ? emailSendMessage || "กำลังเตรียมไฟล์..."
                    : "ส่งอีเมลให้ลูกค้า"}
                </span>
              </button>

              <button
                type="button"
                onClick={sendBookingSms}
                disabled={isPreparingAttachment}
                className={actionSendButtonClass}
              >
                <span className="text-lg">SMS</span>
                <span>
                  {preparingSendChannel === "sms"
                    ? emailSendMessage || "กำลังเตรียมไฟล์..."
                    : "ส่งทาง SMS"}
                </span>
              </button>
                            <button
                type="button"
                onClick={sendBookingSmsLink}
                disabled={
                  isPreparingAttachment || isSendingSmsLink
                }
                className={`${actionSendButtonClass} sm:col-span-2`}
              >
                <span>
                  {isSendingSmsLink
                    ? "กำลังสร้างลิงก์ Google Drive..."
                    : "ส่ง SMS พร้อมลิงก์ Google Drive"}
                </span>
              </button>
            </div>

            {emailSendMessage && (
              <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-semibold ${emailSendMessageClass}`}>
                {emailSendMessage}
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsSendOptionsOpen(false)}
              className="mt-4 w-full rounded-[22px] border border-zinc-300 bg-white px-6 py-4 text-sm font-extrabold text-zinc-900 shadow-[0_10px_24px_rgba(24,24,27,0.08)] transition-all duration-200 hover:border-zinc-500 hover:bg-zinc-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}
      {emailPreview && (
        <div className="no-print fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-zinc-200 px-6 py-4">
              <h2 className="text-xl font-bold text-zinc-900">
                พรีวิวอีเมลใบจอง
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                ตรวจสอบข้อความก่อนส่งถึงลูกค้า
              </p>
            </div>

            <div className="space-y-4 px-4 py-5 md:px-6">
              <div className="grid gap-3 rounded-xl bg-zinc-50 p-4 text-sm">
                <div>
                  <span className="font-semibold text-zinc-500">อีเมลผู้รับ: </span>
                  <span className="text-zinc-900">{emailPreview.to}</span>
                </div>
                <div>
                  <span className="font-semibold text-zinc-500">หัวข้อ: </span>
                  <span className="text-zinc-900">{emailPreview.subject}</span>
                </div>
                {emailPreview.pdfAttachment && (
                  <div>
                    <span className="font-semibold text-zinc-500">
                      PDF:{" "}
                    </span>
                    <span className="text-zinc-900">
                      {emailPreview.pdfAttachment.filename}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-zinc-500">
                  เนื้อหาอีเมล
                </div>
                <pre className="max-h-[52vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-zinc-200 bg-white p-4 font-sans text-sm leading-7 text-zinc-800 md:max-h-[420px]">
                  {emailPreview.body}
                </pre>
                {serviceItems.some((item) =>
                  ["QR Code", "Video Guestbook"].includes(item.name)
                ) && (
                  <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4">
                    <p className="text-sm font-semibold text-zinc-700">
                      รายละเอียดบริการในอีเมล
                    </p>
                    <div className="mt-3 space-y-4">
                      {serviceItems
                        .filter((item) =>
                          ["QR Code", "Video Guestbook"].includes(item.name)
                        )
                        .map((item) => (
                          <div key={item.id} className="rounded-lg bg-zinc-50 p-3">
                            <p className="text-sm font-bold text-zinc-900">
                              {item.name}
                            </p>
                            {renderServiceDescription(item.description)}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {emailSendMessage && (
                <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${emailSendMessageClass}`}>
                  {emailSendMessage}
                </div>
              )}
            </div>

            <div className="flex flex-col justify-end gap-3 border-t border-zinc-200 px-4 py-4 sm:flex-row md:px-6">
              <button
                type="button"
                onClick={() => setEmailPreview(null)}
                disabled={isSendingEmail}
                className={actionSecondaryButtonClass}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmSendBookingEmail}
                disabled={isSendingEmail}
                className={actionSendButtonClass}
              >
                {isSendingEmail ? "กำลังส่งอีเมล..." : "ส่งอีเมลทันที"}
              </button>
            </div>
          </div>
        </div>
      )}
      {emailSentInfo && (
        <div className="no-print fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl md:p-6">
            <h2 className="text-xl font-bold text-zinc-900">
              ส่งอีเมลพร้อม PDF สำเร็จแล้ว
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              ระบบส่งอีเมลพร้อมแนบ PDF ให้ลูกค้าแล้ว
            </p>
            <div className="mt-4 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-700">
              <div>
                <span className="font-semibold text-zinc-500">อีเมลผู้รับ: </span>
                {emailSentInfo.to || "-"}
              </div>
              <div>
                <span className="font-semibold text-zinc-500">หัวข้อ: </span>
                {emailSentInfo.subject || "-"}
              </div>
              <div>
                <span className="font-semibold text-zinc-500">PDF: </span>
                {emailSentInfo.filename || "-"}
              </div>
              {emailSentInfo.driveViewUrl ? (
                <div className="mt-2">
                  <span className="font-semibold text-emerald-700">
                    อัปโหลด PDF ไป Google Drive สำเร็จ:{" "}
                  </span>
                  <a
                    href={emailSentInfo.driveViewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-sky-700 underline"
                  >
                    เปิดไฟล์
                  </a>
                </div>
              ) : (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                  ส่งอีเมลสำเร็จ แต่ยังอัปโหลด Drive ไม่สำเร็จ
                  {emailSentInfo.driveUploadError ? `: ${emailSentInfo.driveUploadError}` : ""}
                </div>
              )}
              {emailSentInfo.driveFileId && (
                <div className="mt-2 text-xs text-zinc-500">Drive File ID: {emailSentInfo.driveFileId}</div>
              )}
              {emailSentInfo.threadId && (
                <div className="mt-2 text-xs text-zinc-500">Thread ID: {emailSentInfo.threadId}</div>
              )}
              {emailSentInfo.messageId && (
                <div className="text-xs text-zinc-500">Message ID: {emailSentInfo.messageId}</div>
              )}
            </div>
            <div className="mt-5 flex flex-col justify-end gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setEmailSentInfo(null)}
                className="rounded-[22px] border border-zinc-300 bg-white px-6 py-4 text-sm font-extrabold text-zinc-900 shadow-[0_10px_24px_rgba(24,24,27,0.08)] transition-all duration-200 hover:border-zinc-500 hover:bg-zinc-50"
              >
                เสร็จสิ้น
              </button>
            </div>
          </div>
        </div>
      )}
      {/* PRINT STYLE */}
      <style jsx global>{`
        .booking-workspace {
          width: 100%;
          height: 100vh;
          min-height: 100vh;
          display: grid;
          grid-template-columns: minmax(0, 380px) minmax(0, 1fr);
          align-items: stretch;
          gap: 22px;
          padding: 22px;
          background: var(--booking-bg);
          color: var(--booking-text);
          overflow: hidden;
          box-sizing: border-box;
        }

        .booking-workspace *,
        .booking-workspace *::before,
        .booking-workspace *::after {
          box-sizing: border-box;
        }

        html,
        body {
          overflow-x: hidden;
        }

        .booking-workspace-collapsed {
          grid-template-columns: 56px minmax(0, 1fr);
        }

        .booking-workspace-view {
          display: block;
          height: auto;
          min-height: 100vh;
          overflow: visible;
          padding: 20px;
        }

        .booking-form-panel {
          grid-column: 1;
          grid-row: 1;
          width: 100%;
          height: calc(100vh - 44px);
          min-width: 0;
          max-width: 380px;
          max-height: calc(100vh - 44px);
          align-self: start;
          position: relative;
          overflow-y: auto;
          overflow-x: hidden;
          border-color: var(--booking-border);
          border-radius: 24px;
          background: var(--booking-card);
          box-shadow: 0 18px 50px rgba(43, 26, 20, 0.09);
        }

        .booking-form-panel input,
        .booking-form-panel select,
        .booking-form-panel textarea {
          width: 100%;
          min-height: 50px;
          border-radius: 16px;
          border-color: var(--booking-border);
          background: #ffffff;
          color: var(--booking-text);
          font-size: 14px;
          line-height: 1.25;
          transition:
            border-color 180ms ease,
            box-shadow 180ms ease,
            background-color 180ms ease;
        }

        .booking-form-panel input,
        .booking-form-panel select {
          height: 52px;
          padding: 0 18px !important;
        }

        .booking-form-panel textarea {
          min-height: 88px;
          padding: 13px 18px !important;
          resize: vertical;
        }

        .booking-form-panel input::placeholder,
        .booking-form-panel textarea::placeholder {
          color: var(--booking-muted);
          opacity: 0.78;
        }

        .booking-form-panel input:focus,
        .booking-form-panel select:focus,
        .booking-form-panel textarea:focus {
          border-color: var(--booking-accent) !important;
          box-shadow: 0 0 0 4px var(--booking-focus-ring) !important;
          outline: none;
        }

        .booking-form-panel .booking-input-edited {
          border-color: var(--booking-accent) !important;
          background: color-mix(in srgb, var(--booking-accent-soft) 34%, #ffffff 66%) !important;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--booking-accent) 13%, transparent) !important;
        }

        .booking-form-panel h1 {
          font-size: clamp(1.75rem, 2.1vw, 2rem);
          line-height: 1.1;
        }

        .booking-form-panel .space-y-5 > :not([hidden]) ~ :not([hidden]) {
          margin-top: 1rem;
        }

        .booking-form-toggle {
          background: var(--booking-primary);
        }

        .booking-form-section {
          border: 1px solid var(--booking-border) !important;
          border-radius: 24px !important;
          padding: 22px !important;
          background: var(--booking-card) !important;
          box-shadow: 0 14px 36px var(--booking-card-shadow);
        }

        .booking-service-section {
          background: linear-gradient(180deg, #ffffff 0%, rgba(250, 247, 241, 0.82) 100%) !important;
        }

        .booking-discount-section {
          border-color: var(--booking-accent-border) !important;
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--booking-discount-surface) 82%, #ffffff 18%) 0%, #ffffff 100%) !important;
        }

        .booking-payment-section {
          border-color: var(--booking-accent-border) !important;
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--booking-payment-surface) 84%, var(--booking-accent-soft) 16%) 0%, #ffffff 100%) !important;
        }

        .booking-section-title {
          position: relative;
          margin-bottom: 0.35rem;
          padding-left: 14px;
          color: var(--booking-primary) !important;
          font-size: 20px !important;
          line-height: 1.25;
          letter-spacing: 0;
        }

        .booking-section-title::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0.22em;
          bottom: 0.22em;
          width: 4px;
          border-radius: 999px;
          background: var(--booking-accent);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--booking-accent) 16%, transparent);
        }

        .booking-section-subtitle {
          color: var(--booking-muted) !important;
          line-height: 1.45;
        }

        .booking-form-primary-button,
        .booking-form-small-button {
          min-height: 50px;
          border: 0;
          background: var(--booking-primary) !important;
          color: #ffffff !important;
          box-shadow: 0 12px 26px var(--booking-primary-shadow);
          font-weight: 800;
          transition:
            transform 180ms ease,
            background-color 180ms ease,
            box-shadow 180ms ease;
        }

        .booking-form-primary-button:hover,
        .booking-form-small-button:hover {
          background: color-mix(in srgb, var(--booking-primary) 86%, #ffffff 14%) !important;
          box-shadow: 0 16px 30px var(--booking-primary-shadow);
          transform: translateY(-1px);
        }

        .booking-form-small-button {
          min-height: 36px;
          border-radius: 12px;
          padding: 8px 12px;
          font-size: 12px;
        }

        .booking-empty-state {
          border-color: var(--booking-accent-border) !important;
          background: color-mix(in srgb, var(--booking-accent-soft) 54%, #ffffff 46%) !important;
          color: var(--booking-muted) !important;
          border-radius: 18px !important;
        }

        .booking-list-item,
        .booking-summary-card,
        .booking-status-card,
        .booking-history-card,
        .booking-upload-preview {
          border-color: var(--booking-border) !important;
          border-radius: 18px !important;
          background: #ffffff !important;
          color: var(--booking-text);
        }

        .booking-list-item {
          box-shadow: 0 8px 18px rgba(43, 26, 20, 0.045);
        }

        .booking-summary-card {
          padding: 14px !important;
          color: var(--booking-text);
        }

        .booking-summary-net,
        .booking-history-title,
        .booking-history-total {
          color: var(--booking-primary-dark) !important;
        }

        .booking-status-card {
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82);
        }

        .booking-payment-badge {
          border-color: var(--booking-accent-border) !important;
          background: color-mix(in srgb, var(--booking-accent-soft) 66%, #ffffff 34%) !important;
          color: var(--booking-primary-dark) !important;
        }

        .booking-history-card {
          border-color: color-mix(in srgb, var(--booking-accent) 34%, var(--booking-border) 66%) !important;
          padding: 14px !important;
        }

        .booking-upload-input,
        .booking-form-panel input[type="file"] {
          min-height: 52px;
          border-style: dashed !important;
          border-color: var(--booking-accent-border) !important;
          background: color-mix(in srgb, var(--booking-accent-soft) 42%, #ffffff 58%) !important;
          color: var(--booking-muted);
          cursor: pointer;
        }

        .booking-upload-input::file-selector-button,
        .booking-form-panel input[type="file"]::file-selector-button {
          margin-right: 12px;
          border: 0;
          border-radius: 999px;
          background: var(--booking-primary);
          color: #ffffff;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
        }

        .booking-upload-preview {
          border-color: var(--booking-accent-border) !important;
          background: color-mix(in srgb, var(--booking-accent-soft) 28%, #ffffff 72%) !important;
        }

        .booking-right-panel {
          grid-column: 2;
          grid-row: 1;
          min-width: 0;
          width: 100%;
          height: calc(100vh - 44px);
          max-height: calc(100vh - 44px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .booking-right-panel-view {
          grid-column: 1 / -1;
          height: auto;
          max-height: none;
          display: block;
          overflow: visible;
        }

        .booking-action-panel {
          flex: 0 0 auto;
          min-width: 0;
          width: 100%;
          padding: 18px 20px;
          border-color: var(--booking-border);
          border-radius: 22px;
          overflow: visible;
          margin-bottom: 18px;
        }

        .booking-action-grid {
          grid-template-columns: repeat(3, minmax(150px, 1fr)) !important;
          gap: 10px !important;
        }

        .booking-more-toggle {
          color: var(--booking-text);
          border-color: var(--booking-border);
        }

        .booking-more-toggle-active {
          color: #ffffff;
          border-color: var(--booking-primary);
          background: var(--booking-primary);
          box-shadow: 0 12px 26px rgba(74, 46, 34, 0.18);
        }

        .booking-preview-panel {
          flex: 1 1 auto;
          min-width: 0;
          min-height: 0;
          width: 100%;
          height: auto;
          overflow-x: auto;
          overflow-y: auto;
          padding: 24px 20px 96px;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.42);
          box-shadow: inset 0 0 0 1px rgba(233, 220, 203, 0.78);
          scrollbar-gutter: stable both-edges;
        }

        .booking-preview-panel .print-area {
          flex: 0 0 auto;
          zoom: var(--booking-preview-scale, 1);
          margin-left: auto;
          margin-right: auto;
          box-shadow: 0 20px 60px rgba(43, 26, 20, 0.10);
        }

        @supports not (zoom: 1) {
          .booking-preview-panel .print-area {
            transform: scale(var(--booking-preview-scale, 1));
            transform-origin: top left;
            margin-left: max(0px, calc((100% - (210mm * var(--booking-preview-scale, 1))) / 2));
            margin-right: 0;
          }
        }

        body.booking-exporting .booking-preview-panel .print-area {
          zoom: 1 !important;
          transform: none !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
        }

        @media (max-width: 1500px) {
          .booking-workspace {
            grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
            gap: 18px;
            padding: 20px;
          }

          .booking-form-panel {
            max-width: 360px;
          }
        }

        @media (max-width: 1280px) {
          .booking-action-grid {
            grid-template-columns: repeat(2, minmax(150px, 1fr)) !important;
          }
        }

        @media (max-width: 1100px) {
          .booking-workspace,
          .booking-workspace-collapsed {
            height: auto;
            min-height: 100vh;
            grid-template-columns: 1fr;
            gap: 16px;
            padding: 16px;
            overflow: visible;
          }

          .booking-form-panel {
            grid-column: auto;
            grid-row: auto;
            position: relative;
            top: auto;
            height: auto;
            max-width: none;
            max-height: none;
            overflow: visible;
          }

          .booking-right-panel,
          .booking-right-panel-view {
            grid-column: auto;
            grid-row: auto;
            height: auto;
            max-height: none;
            overflow: visible;
          }

          .booking-workspace-collapsed .booking-form-panel {
            width: 100%;
          }

          .booking-preview-panel {
            grid-column: auto;
            grid-row: auto;
            flex: none;
            min-height: auto;
            overflow-x: auto;
            overflow-y: visible;
            padding: 18px 0 80px;
            border-radius: 20px;
          }

          .booking-action-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @page {
          size: A4 portrait;
          margin: 0;
        }

        @media print {
          .booking-workspace {
            display: block !important;
            height: auto !important;
            padding: 0 !important;
            background: white !important;
          }

          .booking-right-panel {
            display: block !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
          }

          .booking-preview-panel {
            padding: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
          }

          *,
          *::before,
          *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          html,
          body {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          .no-print {
            display: none !important;
          }

          .print-container {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }

          .print-area {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            margin: 0 auto !important;
            zoom: 1 !important;
            transform: none !important;
            padding: 10mm !important;
            box-sizing: border-box !important;
            box-shadow: none !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
            zoom: 1 !important;
            transform: none !important;
          }
          .payment-page {
            break-before: page !important;
            page-break-before: always !important;
            margin-top: 0 !important;
          }
          .package-page {
            break-before: page !important;
            page-break-before: always !important;
            margin-top: 0 !important;
          }
          .bg-zinc-900 {
            background-color: #18181b !important;
          }

          .bg-zinc-100 {
            background-color: #f4f4f5 !important;
          }

          .bg-zinc-50 {
            background-color: #fafafa !important;
          }

          .text-white {
            color: #ffffff !important;
          }

          .service-table-header,
          .service-table-header * {
            color: #ffffff !important;
            -webkit-text-fill-color: #ffffff !important;
          }

          .package-section-header,
          .package-section-header * {
            color: #ffffff !important;
            -webkit-text-fill-color: #ffffff !important;
          }

          .text-red-600,
          .text-red-600 * {
            color: #dc2626 !important;
            -webkit-text-fill-color: #dc2626 !important;
          }

          .text-green-700 {
            color: #15803d !important;
          }

          .border-zinc-200 {
            border-color: #e4e4e7 !important;
          }
  }
`}</style>

    </div>
  );
}
