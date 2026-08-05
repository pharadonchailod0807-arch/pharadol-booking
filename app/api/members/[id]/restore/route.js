import { supabase } from "@/lib/supabase";
import {
  canAccessMemberBrand,
  getMemberReadableError,
  getSessionUserFromRequest,
  mapMemberRow,
  MEMBER_SELECT_COLUMNS,
} from "@/lib/members";
import { rejectCrossSiteRequest, sanitizeText } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, context) {
  const blockedCrossSite = rejectCrossSiteRequest(request);
  if (blockedCrossSite) return blockedCrossSite;

  const user = getSessionUserFromRequest(request);
  if (!user) {
    return Response.json({ success: false, error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
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

  const { data, error } = await supabase
    .from("members")
    .update({
      deleted_at: null,
      deleted_by: null,
      updated_at: new Date().toISOString(),
      updated_by: sanitizeText(user.username || user.name || user.id, 160),
    })
    .eq("id", row.id)
    .eq("brand", row.brand)
    .select(MEMBER_SELECT_COLUMNS)
    .single();

  if (error) {
    return Response.json({ success: false, error: getMemberReadableError(error) }, { status: 500 });
  }

  return Response.json({ success: true, member: mapMemberRow(data) });
}
