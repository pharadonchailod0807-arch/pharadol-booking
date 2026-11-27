import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSessionUserFromRequest } from "@/lib/server-auth";
import { AUTH_SESSION_COOKIE } from "@/lib/auth";
import { equipmentSessionRevoked } from "@/lib/equipment/session";
import { currentAccountAuthority } from "@/lib/account-authority";
import { rejectCrossSiteRequest } from "@/lib/security";
import { purchaseAccess } from "./access";
import { invariant, PurchaseError } from "./validation";

export const bucket = "purchase-private";
export const isPreview = () => process.env.VERCEL_ENV === "preview";

let client;
export function purchaseDb() {
  if (client) return client;
  const url = process.env.PURCHASE_SUPABASE_URL || (!isPreview() && process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.PURCHASE_SUPABASE_SERVICE_ROLE_KEY || (!isPreview() && process.env.SUPABASE_SERVICE_ROLE_KEY);
  invariant(url && key, "ยังไม่ได้ตั้งค่าฐานข้อมูลระบบจัดซื้อ", 503);
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export function result(response) {
  if (response.error) throw response.error;
  return response.data;
}

export const rpc = async (name, values) => result(await purchaseDb().rpc("purchase_" + name, values));

export function json(body, status = 200) {
  return Response.json(body, { status, headers: {
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
  } });
}

const databaseErrors = {
  "P0002": [404, "ไม่พบข้อมูล"],
  "42501": [403, "ไม่มีสิทธิ์ทำรายการนี้"],
  "40001": [409, "เอกสารถูกอัปเดต กรุณาโหลดใหม่"],
  "23505": [409, "พบข้อมูลซ้ำ กรุณาตรวจสอบรายการ"],
  "23514": [409, "ตรวจสอบสถานะเอกสารและข้อมูลที่กรอก"],
  "22003": [400, "จำนวนเงินหรือจำนวนสินค้าเกินขอบเขตที่รองรับ"],
  "PGRST202": [503, "ยังไม่ได้ติดตั้ง Migration ระบบจัดซื้อ"],
  "PGRST205": [503, "ยังไม่ได้ติดตั้ง Migration ระบบจัดซื้อ"],
  "42P01": [503, "ยังไม่ได้ติดตั้ง Migration ระบบจัดซื้อ"],
};

export function failure(error) {
  if (error instanceof PurchaseError) return json({ error: error.message }, error.status);
  if (error instanceof SyntaxError) return json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
  const [status, fallback] = databaseErrors[error?.code] || [503, "ระบบจัดซื้อไม่พร้อมใช้งาน กรุณาลองใหม่"];
  // Only intentional, fixed messages raised by our RPCs may reach the client.
  const message = ["23514", "23505"].includes(error?.code) && /^[ก-๙]/u.test(error?.message || "")
    ? error.message : fallback;
  return json({ error: message }, status);
}

export function checkOrigin(request) {
  invariant(!rejectCrossSiteRequest(request), "ไม่อนุญาตให้ทำรายการจากเว็บไซต์อื่น", 403);
}

export async function authorize(request, brand, right = "view") {
  invariant(["pharadol", "adisorn"].includes(brand), "ไม่พบแบรนด์", 404);
  invariant(process.env.AUTH_SECRET?.length >= 32, "ยังไม่ได้ตั้งค่าการเข้าสู่ระบบ", 503);
  const user = getSessionUserFromRequest(request);
  invariant(user, "กรุณาเข้าสู่ระบบ", 401);
  const access = purchaseAccess(user, brand);
  invariant(access[right], "ไม่มีสิทธิ์เข้าถึงระบบจัดซื้อของแบรนด์นี้", 403);
  const token = request.cookies.get(AUTH_SESSION_COOKIE)?.value || "";
  invariant(!(await equipmentSessionRevoked(token, user.id)), "Session ถูกยกเลิก กรุณาเข้าสู่ระบบใหม่", 401);
  if (right === "manage") {
    const authority = await currentAccountAuthority(user);
    invariant(authority?.protectedPassword && purchaseAccess(authority.account, brand).manage,
      "กรุณาตั้งรหัสผ่านบัญชีใหม่ผ่านหน้าผู้ดูแลระบบ แล้วเข้าสู่ระบบอีกครั้งก่อนจัดการผู้อนุมัติ", 403);
  }
  return { user, access, actor: String(user.id || user.username), brand };
}

export async function readDocument(brand, id) {
  const query = await purchaseDb().from("purchase_requisitions").select("*").eq("brand", brand).eq("id", id).maybeSingle();
  const row = result(query);
  invariant(row, "ไม่พบเอกสาร", 404);
  return row;
}

export const paymentColumns = "id,requisition_id,purchased_on,vendor,previous_approved_total::text,actual_total::text,difference::text,method,paid_on,receipt_number,receipt_id,notes,status,created_at";
export const visibleStep = "id,round,level,name,position,status,acted_at,comment,invite_expires_at";

export async function documentDetail(brand, id, access, user, viewedRound) {
  const original = await readDocument(brand, id);
  const db = purchaseDb();
  const queries = await Promise.all([
    rpc("snapshot", { p_id: id }),
    db.from("purchase_approval_steps").select(visibleStep).eq("requisition_id", id).order("round").order("level"),
    db.from("purchase_approval_rounds").select("round,kind,created_at").eq("requisition_id", id).order("round"),
    db.from("purchase_payments").select(paymentColumns).eq("requisition_id", id).order("created_at", { ascending: false }),
    db.from("purchase_attachments").select("*").eq("requisition_id", id).eq("kind", "receipt").eq("active", true),
    db.from("purchase_email_outbox").select("id,kind,recipient,status,failure,attempts,first_attempt_at,sent_at,step_id").eq("requisition_id", id)
      .order("next_attempt_at", { ascending: false }),
    db.from("purchase_audit_logs").select("id,actor,action,detail,created_at").eq("requisition_id", id)
      .order("created_at", { ascending: false }).limit(200),
  ]);
  const [snapshot, ...rest] = queries;
  const [steps, rounds, payments, receipts, mail, audit] = rest.map(result);
  let viewed = null;
  if (viewedRound) {
    viewed = result(await db.from("purchase_approval_rounds").select("snapshot,round,kind,payment_id")
      .eq("requisition_id", id).eq("round", viewedRound).maybeSingle());
    invariant(viewed, "ไม่พบเอกสารรอบที่เลือก", 404);
  }
  return { ...snapshot, steps, rounds, payments, receipts, mail, audit, access, viewed, serverTime: new Date().toISOString(),
    viewer: { name: user.name || user.username, email: user.email || (original.proposer_id === String(user.id || user.username) ? original.proposer_email : "") } };
}

export const objectKey = (brand, requisition, attachment) => `${brand}/${requisition}/${attachment}`;

export async function downloadFile(brand, requisition, file) {
  return result(await purchaseDb().storage.from(bucket).download(objectKey(brand, requisition, file.id)));
}

export function fileResponse(blob, file, inline = false) {
  const name = encodeURIComponent(file.name.toWellFormed()).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16));
  return new Response(blob, { headers: {
    "Content-Type": file.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${inline && file.mime.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
    "Cross-Origin-Resource-Policy": "same-origin", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
}
