import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { getSessionUserFromRequest, getActorName } from "@/lib/server-auth";
import { rejectCrossSiteRequest, rateLimit } from "@/lib/security";
import { equipmentPermissions } from "./access";
import { EquipmentError, inventoryParams } from "./validation";
import { AUTH_SESSION_COOKIE } from "@/lib/auth";
import { equipmentSessionRevoked } from "./session";
export function assertEquipmentAuthConfig() {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)
    throw new EquipmentError(
      "ระบบ Equipment ยังไม่พร้อม: กรุณาตั้งค่า AUTH_SECRET ที่ปลอดภัยบนเซิร์ฟเวอร์ (อย่างน้อย 32 ตัวอักษร)",
      503,
    );
}
export function equipmentDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new EquipmentError(
      "ระบบ Equipment ยังไม่พร้อม: กรุณาตั้งค่า SUPABASE_SERVICE_ROLE_KEY บนเซิร์ฟเวอร์และติดตั้ง Migration",
      503,
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function authorizeEquipment(
  request: NextRequest,
  write = false,
  admin = false,
) {
  const user = getSessionUserFromRequest(request);
  if (!user) throw new EquipmentError("กรุณาเข้าสู่ระบบ", 401);
  assertEquipmentAuthConfig();
  if (
    await equipmentSessionRevoked(
      request.cookies.get(AUTH_SESSION_COOKIE)?.value || "",
      user.id,
    )
  )
    throw new EquipmentError("Session ถูกยกเลิก กรุณาเข้าสู่ระบบใหม่", 401);
  const permissions = equipmentPermissions(user);
  if (
    !permissions.read ||
    (write && !permissions.write) ||
    (admin && !permissions.admin)
  )
    throw new EquipmentError("ไม่มีสิทธิ์เข้าถึง Equipment ของ Pharadol", 403);
  const brand = request.nextUrl.searchParams.get("brand");
  if (brand && brand !== "pharadol")
    throw new EquipmentError("Equipment ใช้งานได้เฉพาะ Pharadol", 403);
  if (write) {
    const rejected = rejectCrossSiteRequest(request);
    if (rejected)
      throw new EquipmentError("ไม่อนุญาตให้ทำรายการจากเว็บไซต์อื่น", 403);
  }
  return {
    user,
    actor: `${user.id || user.username}:${getActorName(user)}`,
    permissions,
  };
}
export function equipmentJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function equipmentFailure(error: unknown) {
  if (error instanceof EquipmentError)
    return equipmentJson(
      { success: false, error: error.message },
      error.status,
    );
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    "23505": "รหัสอุปกรณ์ Serial Number หรือหมวดหมู่นี้มีอยู่แล้ว",
    "23514":
      "ทำรายการไม่ได้: ตรวจสอบจำนวนคงเหลือ วันที่ สถานะ และรายการเบิกหรือซ่อมที่ค้างอยู่",
    "23503": "ไม่พบข้อมูลอ้างอิง กรุณาโหลดข้อมูลใหม่",
    "42501": "ไม่มีสิทธิ์ทำรายการนี้",
    "40001": "ข้อมูลถูกเปลี่ยนโดยผู้ใช้อื่น กรุณาโหลดใหม่ก่อนแก้ไข",
    P0002: "ไม่พบรายการอุปกรณ์ที่ต้องการ",
    "22P02": "รูปแบบข้อมูลไม่ถูกต้อง",
    PGRST202: "ยังไม่ได้ติดตั้ง Equipment Migration ในฐานข้อมูล",
    "42P01": "ยังไม่ได้ติดตั้ง Equipment Migration ในฐานข้อมูล",
  };
  return equipmentJson(
    {
      success: false,
      error:
        messages[code || ""] ||
        "ไม่สามารถเชื่อมต่อระบบ Equipment ได้ กรุณาลองใหม่",
    },
    code === "P0002"
      ? 404
      : code === "42501"
        ? 403
        : ["23505", "23514", "23503", "40001"].includes(code || "")
          ? 409
          : 503,
  );
}
export function limitEquipment(actor: string) {
  return rateLimit({ key: `equipment:${actor}`, limit: 90, windowMs: 60000 });
}
export function inventoryQuery(
  db: ReturnType<typeof equipmentDb>,
  params: URLSearchParams,
) {
  const p = inventoryParams(params);
  let query = db
    .from("equipment_inventory")
    .select("*", { count: "exact" })
    .eq("brand", "pharadol");
  query = p.archived
    ? query.not("archived_at", "is", null)
    : query.is("archived_at", null);
  if (p.category) query = query.eq("category_id", p.category);
  // Status filters select quantities so mixed batches remain discoverable in every relevant state.
  if (p.status)
    query = query.gt(
      {
        available: "available",
        in_use: "in_use",
        maintenance: "maintenance",
        damaged: "damaged",
        retired: "retired",
      }[p.status]!,
      0,
    );
  if (p.search)
    query = query.or(
      [
        "equipment_code",
        "name",
        "manufacturer",
        "model",
        "serial_number",
        "storage_location",
      ]
        .map((c) => `${c}.ilike.%${p.search}%`)
        .join(","),
    );
  return {
    query: query
      .order(p.sort, { ascending: p.ascending, nullsFirst: false })
      .order("id"),
    params: p,
  };
}
