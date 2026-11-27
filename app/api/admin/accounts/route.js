import { randomUUID } from "node:crypto";
import { currentAccountAuthority } from "@/lib/account-authority";
import { hashAccountPassword } from "@/lib/account-password";
import { hasRole, ROLES } from "@/lib/rbac";
import { rejectCrossSiteRequest } from "@/lib/security";
import { getSessionUserFromRequest } from "@/lib/server-auth";
import { supabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";

const accounts = "admin_users";
const publicFields = "id,name,username,role,brands,active";

function response(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
const fail = (error, status = 400) => response({ error }, status);

async function authorize(request) {
  const user = getSessionUserFromRequest(request);
  if (!user || !hasRole(user, ROLES.SUPER_ADMIN)) return null;
  return currentAccountAuthority(user);
}

function clean(value, limit) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length <= limit && !text.includes("\0") ? text : "";
}

async function body(request) {
  if (Number(request.headers.get("content-length") || 0) > 16 * 1024 ||
    !request.headers.get("content-type")?.startsWith("application/json")) return null;
  const value = await request.json().catch(() => null);
  return value && !Array.isArray(value) && typeof value === "object" ? value : null;
}

function writeResult({ data, error }, status = 200) {
  if (error?.code === "23505") return fail("ชื่อเข้าสู่ระบบนี้ถูกใช้งานแล้ว", 409);
  if (error) return fail("ไม่สามารถบันทึกบัญชีได้ กรุณาลองใหม่", 503);
  if (!data) return fail("ไม่พบบัญชีที่ระบุ", 404);
  return response({ user: data }, status);
}

export async function GET(request) {
  if (!await authorize(request)) return fail("กรุณาเข้าสู่ระบบใหม่ด้วยบัญชีผู้ดูแลระบบ", 403);
  const { data, error } = await supabaseServer.from(accounts).select(publicFields).order("username");
  return error ? fail("ไม่สามารถโหลดบัญชีได้", 503) : response({ users: data });
}

export async function POST(request) {
  const blocked = rejectCrossSiteRequest(request);
  if (blocked) return blocked;
  const auth = await authorize(request);
  if (!auth?.protectedPassword) return fail("ผู้ดูแลระบบต้องตั้งรหัสผ่านใหม่และเข้าสู่ระบบอีกครั้ง", 403);
  const input = await body(request);
  const name = clean(input?.name, 160), username = clean(input?.username, 180);
  const password = clean(input?.password, 1024);
  const role = input?.role;
  const brands = role === "ADMIN" ? ["adisorn", "pharadol"] : input?.brands;
  if (!name || !username || password.length < 12 || !["ADMIN", "STAFF"].includes(role) ||
    !Array.isArray(brands) || (role === "STAFF" && (brands.length !== 1 || !["adisorn", "pharadol"].includes(brands[0])))) {
    return fail("ตรวจชื่อ บทบาท แบรนด์ และรหัสผ่านอย่างน้อย 12 ตัวอักษร");
  }
  return writeResult(await supabaseServer.from(accounts).insert({
    id: randomUUID(), name, username, role, brands, password: hashAccountPassword(password), active: true,
  }).select(publicFields).single(), 201);
}

export async function PATCH(request) {
  const blocked = rejectCrossSiteRequest(request);
  if (blocked) return blocked;
  const auth = await authorize(request);
  if (!auth) return fail("กรุณาเข้าสู่ระบบใหม่ด้วยบัญชีผู้ดูแลระบบ", 403);
  const input = await body(request);
  const id = clean(input?.id, 180);
  if (!id) return fail("ไม่พบบัญชีที่ระบุ", 404);
  const self = id === auth.account.id;
  const patch = { updated_at: new Date().toISOString() };
  if (Object.hasOwn(input, "password")) {
    const password = clean(input.password, 1024);
    if (password.length < 12) return fail("กำหนดรหัสผ่านอย่างน้อย 12 ตัวอักษร");
    if (!self && !auth.protectedPassword) return fail("กรุณาตั้งรหัสผ่านบัญชีของคุณใหม่ก่อน", 403);
    patch.password = hashAccountPassword(password);
  } else {
    if (!auth.protectedPassword) return fail("กรุณาตั้งรหัสผ่านบัญชีของคุณใหม่ก่อน", 403);
    if (Object.hasOwn(input, "username")) {
      patch.username = clean(input.username, 180);
      if (!patch.username) return fail("กรอกชื่อเข้าสู่ระบบ");
    } else if (typeof input.active === "boolean" && (!self || input.active)) {
      patch.active = input.active;
    } else {
      return fail("ไม่สามารถเปลี่ยนสถานะบัญชีนี้ได้");
    }
  }
  return writeResult(await supabaseServer.from(accounts).update(patch).eq("id", id).select(publicFields).maybeSingle());
}

export async function DELETE(request) {
  const blocked = rejectCrossSiteRequest(request);
  if (blocked) return blocked;
  const auth = await authorize(request);
  if (!auth?.protectedPassword) return fail("ผู้ดูแลระบบต้องตั้งรหัสผ่านใหม่และเข้าสู่ระบบอีกครั้ง", 403);
  const input = await body(request);
  const id = clean(input?.id, 180);
  if (!id || id === auth.account.id) return fail("ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้");
  return writeResult(await supabaseServer.from(accounts).delete().eq("id", id).select(publicFields).maybeSingle());
}
