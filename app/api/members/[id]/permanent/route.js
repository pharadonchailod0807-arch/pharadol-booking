import { supabase } from "@/lib/supabase";
import {
  canAccessMemberBrand,
  canPermanentlyDeleteMember,
  getMemberReadableError,
  getSessionUserFromRequest,
} from "@/lib/members";
import { rejectCrossSiteRequest, sanitizeText } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request, context) {
  const blockedCrossSite = rejectCrossSiteRequest(request);
  if (blockedCrossSite) return blockedCrossSite;

  const user = getSessionUserFromRequest(request);
  if (!user) {
    return Response.json({ success: false, error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }
  if (!canPermanentlyDeleteMember(user)) {
    return Response.json({ success: false, error: "ไม่มีสิทธิ์ลบสมาชิกถาวร" }, { status: 403 });
  }

  const { id } = await context.params;
  const { data: row, error: findError } = await supabase
    .from("members")
    .select("id,brand")
    .eq("id", sanitizeText(id, 120))
    .maybeSingle();

  if (findError) {
    return Response.json({ success: false, error: getMemberReadableError(findError) }, { status: 500 });
  }
  if (!row || !canAccessMemberBrand(user, row.brand)) {
    return Response.json({ success: false, error: "ไม่พบข้อมูลสมาชิกหรือไม่มีสิทธิ์เข้าถึง" }, { status: 404 });
  }

  const { error } = await supabase
    .from("members")
    .delete()
    .eq("id", row.id)
    .eq("brand", row.brand);

  if (error) {
    return Response.json({ success: false, error: getMemberReadableError(error) }, { status: 500 });
  }

  return Response.json({ success: true });
}
