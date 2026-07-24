import { createClient } from "@supabase/supabase-js";
import {
  getClientIp,
  normalizeBrand,
  rateLimit,
  rejectCrossSiteRequest,
  sanitizeText,
} from "@/lib/security";
import { formatBookingNumber, getNextBookingSequence } from "@/lib/booking-number";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CREATE_RETRIES = 20;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const isDuplicateBookingNumberError = (error) =>
  error?.code === "23505" ||
  String(error?.message || "").includes("bookings_booking_number_key") ||
  String(error?.message || "").toLowerCase().includes("duplicate key");

const getBangkokDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
  };
};

const getBangkokNow = () => {
  const date = new Date();
  const { year, month, day } = getBangkokDateParts(date);
  const bookingDate = date.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
  const today = date.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });

  return {
    date: new Date(year, month - 1, day),
    bookingDate,
    today,
  };
};

const normalizeBookingRow = (row) => {
  const bookingData = row?.booking_data || {};
  const bookingNumber = bookingData.bookingNumber || row?.booking_number || "";
  const supabaseId = row?.id || bookingData.supabaseId || bookingData.bookingId || "";

  return {
    ...bookingData,
    supabaseId,
    bookingId: supabaseId,
    bookingNumber,
    customerName: bookingData.customerName || row?.customer_name || "",
    phone: bookingData.phone || row?.phone || "",
    email: bookingData.email || row?.email || "",
    service: bookingData.service || row?.service || "",
    location: bookingData.location || row?.location || "",
    eventDate: bookingData.eventDate || row?.event_date || "",
    jobStatus: bookingData.jobStatus || row?.job_status || "รอยืนยัน",
  };
};

const getBookingBrand = (row) => {
  const bookingData = row?.booking_data || row || {};
  return normalizeBrand(
    bookingData.brandId ||
      bookingData.brand ||
      row?.brand_id ||
      row?.brand ||
      ""
  );
};

const getBookingNumberSources = async (brandId) => {
  const { data, error } = await supabase
    .from("bookings")
    .select("booking_number, booking_data, deleted, archived");

  if (error) throw error;

  return (Array.isArray(data) ? data : [])
    .map((row) => {
      const bookingData = row?.booking_data || {};
      return {
        brandId: getBookingBrand(row),
        bookingNumber: bookingData.bookingNumber || row?.booking_number || "",
      };
    })
    .filter((item) => item.brandId === brandId && item.bookingNumber);
};

const getNextBookingNumberFromDatabase = async (
  brandId,
  date,
  blockedBookingNumbers = new Set()
) => {
  const sources = [
    ...(await getBookingNumberSources(brandId)),
    ...Array.from(blockedBookingNumbers).map((bookingNumber) => ({
      brandId,
      bookingNumber,
    })),
  ];
  const sequence = getNextBookingSequence(sources);

  if (sequence == null) {
    throw new Error("เลขที่ใบจองของแบรนด์นี้ถูกใช้งานครบ 0001 ถึง 9999 แล้ว");
  }

  return {
    bookingNumber: formatBookingNumber(date, sequence),
    sequence,
  };
};

const createBookingPayload = ({ booking, bookingNumber, brandId, bangkokNow }) => {
  const bookingData = {
    ...booking,
    bookingNumber,
    bookingDate: bangkokNow.bookingDate,
    today: bangkokNow.today,
    brandId,
  };

  return {
    booking_number: bookingNumber,
    customer_name: sanitizeText(bookingData.customerName, 180),
    phone: sanitizeText(bookingData.phone, 80),
    email: sanitizeText(bookingData.email, 180),
    service: sanitizeText(bookingData.service, 240),
    location: sanitizeText(bookingData.location, 500),
    event_date: bookingData.eventDate || null,
    job_status: sanitizeText(bookingData.jobStatus || "รอยืนยัน", 80),
    booking_data: bookingData,
    archived: false,
    deleted: false,
  };
};

const updateBookingPayload = ({ booking, existingRow, brandId }) => {
  const existingBooking = normalizeBookingRow(existingRow);
  const bookingNumber = existingBooking.bookingNumber;
  const bookingData = {
    ...booking,
    bookingNumber,
    bookingDate: booking.bookingDate || existingBooking.bookingDate || "",
    today: booking.today || existingBooking.today || "",
    brandId,
    supabaseId: existingBooking.supabaseId,
    bookingId: existingBooking.supabaseId,
  };

  return {
    booking_number: bookingNumber,
    customer_name: sanitizeText(bookingData.customerName, 180),
    phone: sanitizeText(bookingData.phone, 80),
    email: sanitizeText(bookingData.email, 180),
    service: sanitizeText(bookingData.service, 240),
    location: sanitizeText(bookingData.location, 500),
    event_date: bookingData.eventDate || null,
    job_status: sanitizeText(bookingData.jobStatus || "รอยืนยัน", 80),
    booking_data: bookingData,
  };
};

const findExistingBooking = async ({ bookingId, bookingNumber, brandId }) => {
  if (bookingId) {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const rowBrand = getBookingBrand(data);
    if (rowBrand && rowBrand !== brandId) {
      throw new Error("พบใบจองคนละแบรนด์ ไม่สามารถบันทึกทับได้");
    }

    return data;
  }

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("booking_number", bookingNumber);

  if (error) throw error;

  const matchingRows = (Array.isArray(data) ? data : []).filter((row) => {
    const rowBrand = getBookingBrand(row);
    return !rowBrand || rowBrand === brandId;
  });

  if (matchingRows.length > 1) {
    throw new Error("พบใบจองเลขเดียวกันมากกว่าหนึ่งรายการ กรุณาเปิดจากหน้ารายการแล้วบันทึกใหม่");
  }

  return matchingRows[0] || null;
};

export async function POST(request) {
  const blockedCrossSite = rejectCrossSiteRequest(request);
  if (blockedCrossSite) return blockedCrossSite;

  const limited = rateLimit({
    key: `bookings:create:${getClientIp(request)}`,
    limit: 20,
    windowMs: 60_000,
    message: "มีการบันทึกใบจองบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  });
  if (limited) return limited;

  if (!supabase) {
    return Response.json(
      { success: false, error: "ยังไม่ได้ตั้งค่า Supabase สำหรับบันทึกใบจอง" },
      { status: 500 }
    );
  }

  try {
    const payload = await request.json();
    const brandId = normalizeBrand(payload?.brandId);
    const booking = payload?.booking && typeof payload.booking === "object"
      ? payload.booking
      : {};

    if (!brandId) {
      return Response.json(
        { success: false, error: "ไม่พบแบรนด์ของใบจอง" },
        { status: 400 }
      );
    }

    if (booking.bookingNumber) {
      return Response.json(
        {
          success: false,
          error:
            "ใบจองใหม่ต้องออกเลขจากฐานข้อมูลเท่านั้น กรุณาล้างเลขกำหนดเองแล้วบันทึกอีกครั้ง",
        },
        { status: 400 }
      );
    }

    const bangkokNow = getBangkokNow();
    let lastError = null;
    const blockedBookingNumbers = new Set();

    for (let attempt = 1; attempt <= MAX_CREATE_RETRIES; attempt += 1) {
      const { bookingNumber } = await getNextBookingNumberFromDatabase(
        brandId,
        bangkokNow.date,
        blockedBookingNumbers
      );
      const bookingPayload = createBookingPayload({
        booking,
        bookingNumber,
        brandId,
        bangkokNow,
      });

      const { data, error } = await supabase
        .from("bookings")
        .insert(bookingPayload)
        .select("*")
        .single();

      if (!error) {
        const normalizedBooking = normalizeBookingRow(data);

        return Response.json({
          success: true,
          booking: normalizedBooking,
          row: data,
        });
      }

      lastError = error;

      if (!isDuplicateBookingNumberError(error)) {
        break;
      }

      blockedBookingNumbers.add(bookingNumber);
    }

    throw lastError || new Error("ไม่สามารถออกเลขใบจองใหม่ได้");
  } catch (error) {
    console.error("Cannot create booking", error?.message || error);

    return Response.json(
      {
        success: false,
        error:
          error?.message ||
          "บันทึกใบจองไม่สำเร็จ กรุณาตรวจสอบข้อมูลแล้วลองใหม่",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  const blockedCrossSite = rejectCrossSiteRequest(request);
  if (blockedCrossSite) return blockedCrossSite;

  const limited = rateLimit({
    key: `bookings:update:${getClientIp(request)}`,
    limit: 40,
    windowMs: 60_000,
    message: "มีการแก้ไขใบจองบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  });
  if (limited) return limited;

  if (!supabase) {
    return Response.json(
      { success: false, error: "ยังไม่ได้ตั้งค่า Supabase สำหรับบันทึกใบจอง" },
      { status: 500 }
    );
  }

  try {
    const payload = await request.json();
    const brandId = normalizeBrand(payload?.brandId);
    const bookingId = sanitizeText(payload?.bookingId, 120);
    const bookingNumber = sanitizeText(payload?.bookingNumber, 120);
    const booking = payload?.booking && typeof payload.booking === "object"
      ? payload.booking
      : {};

    if (!brandId) {
      return Response.json(
        { success: false, error: "ไม่พบแบรนด์ของใบจอง" },
        { status: 400 }
      );
    }

    if (!bookingId && !bookingNumber) {
      return Response.json(
        { success: false, error: "ไม่พบเลขหรือ ID ของใบจองที่ต้องการแก้ไข" },
        { status: 400 }
      );
    }

    const existingRow = await findExistingBooking({
      bookingId,
      bookingNumber,
      brandId,
    });

    if (!existingRow) {
      return Response.json(
        { success: false, error: "ไม่พบใบจองเดิมในฐานข้อมูล" },
        { status: 404 }
      );
    }

    const bookingPayload = updateBookingPayload({
      booking,
      existingRow,
      brandId,
    });

    const { data, error } = await supabase
      .from("bookings")
      .update(bookingPayload)
      .eq("id", existingRow.id)
      .select("*")
      .single();

    if (error) throw error;

    return Response.json({
      success: true,
      booking: normalizeBookingRow(data),
      row: data,
    });
  } catch (error) {
    console.error("Cannot update booking", error?.message || error);

    return Response.json(
      {
        success: false,
        error:
          error?.message ||
          "แก้ไขใบจองไม่สำเร็จ กรุณาตรวจสอบข้อมูลแล้วลองใหม่",
      },
      { status: 500 }
    );
  }
}
