import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { equipmentPermissions } from "@/lib/equipment/access";
import EquipmentManager from "./EquipmentManager";
import { assertEquipmentAuthConfig } from "@/lib/equipment/server";
import { equipmentSessionRevoked } from "@/lib/equipment/session";
export const dynamic = "force-dynamic";
export const metadata = { title: "Equipment | Pharadol Production" };
export default async function EquipmentPage() {
  const cookieStore = await cookies(),
    user = verifySessionToken(
      cookieStore.get(AUTH_SESSION_COOKIE)?.value || "",
    );
  if (!user || user.active === false)
    redirect("/login?next=/pharadol/equipment");
  try {
    assertEquipmentAuthConfig();
  } catch {
    return (
      <div className="p-8 text-sm">
        ระบบ Equipment ยังไม่พร้อม กรุณาตั้งค่า AUTH_SECRET
        ที่ปลอดภัยบนเซิร์ฟเวอร์
      </div>
    );
  }
  if (
    await equipmentSessionRevoked(
      cookieStore.get(AUTH_SESSION_COOKIE)?.value || "",
      user.id,
    )
  )
    redirect("/login?next=/pharadol/equipment");
  const permissions = equipmentPermissions(user);
  if (!permissions.read)
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">ไม่มีสิทธิ์เข้าถึงคลังอุปกรณ์</h1>
        <p className="mt-3 text-sm">
          Equipment เปิดใช้งานสำหรับ Pharadol Production เท่านั้น
        </p>
      </div>
    );
  return <EquipmentManager permissions={permissions} />;
}
