import { supabase } from "@/lib/supabase";
import {
  canAccessMemberBrand,
  canPermanentlyDeleteMember,
  getMemberReadableError,
  getSessionUserFromRequest,
  mapMemberRow,
  MEMBER_SELECT_COLUMNS,
  validateMemberPayload,
} from "@/lib/members";
import {
  rejectCrossSiteRequest,
  rejectDocumentNavigation,
  sanitizeText,
} from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getMemberForUser = async (id, user) => {
  const { data, error } = await supabase
    .from("members")
    .select(MEMBER_SELECT_COLUMNS)
    .eq("id", sanitizeText(id, 120))
    .maybeSingle();

  if (error) throw error;
  if (!data || !canAccessMemberBrand(user, data.brand)) return null;
  return data;
};

export async function GET(request, context) {
  const blockedNavigation = rejectDocumentNavigation(request);
  if (blockedNavigation) return blockedNavigation;

  const user = getSessionUserFromRequest(request);
  if (!user) {
    return Response.json({ success: false, error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }

  const { id } = await context.params;
  const row = await getMemberForUser(id, user).catch((error) => ({ __error: error }));

  if (row?.__error) {
    return Response.json({ success: false, error: getMemberReadableError(row.__error) }, { status: 500 });
  }
  if (!row) {
    return Response.json({ success: false, error: "ไม่พบข้อมูลสมาชิกหรือไม่มีสิทธิ์เข้าถึง" }, { status: 404 });
  }

  return Response.json({ success: true, member: mapMemberRow(row, { includeSensitive: true }) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request, context) {
  const blockedCrossSite = rejectCrossSiteRequest(request);
  if (blockedCrossSite) return blockedCrossSite;

  const user = getSessionUserFromRequest(request);
  if (!user) {
    return Response.json({ success: false, error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }

  const { id } = await context.params;
  const row = await getMemberForUser(id, user).catch((error) => ({ __error: error }));

  if (row?.__error) {
    return Response.json({ success: false, error: getMemberReadableError(row.__error) }, { status: 500 });
  }
  if (!row) {
    return Response.json({ success: false, error: "ไม่พบข้อมูลสมาชิกหรือไม่มีสิทธิ์เข้าถึง" }, { status: 404 });
  }

  const payload = await request.json().catch(() => null);
  const validation = validateMemberPayload(payload, { partial: true });
  if (!validation.valid) {
    return Response.json({ success: false, error: validation.errors[0], errors: validation.errors }, { status: 400 });
  }

  const updatePayload = {
    ...validation.data,
    updated_by: sanitizeText(user.username || user.name || user.id, 160),
    updated_at: new Date().toISOString(),
  };

  delete updatePayload.brand;
  delete updatePayload.member_code;

  const { data, error } = await supabase
    .from("members")
    .update(updatePayload)
    .eq("id", row.id)
    .eq("brand", row.brand)
    .select(MEMBER_SELECT_COLUMNS)
    .single();

  if (error) {
    return Response.json({ success: false, error: getMemberReadableError(error) }, { status: 500 });
  }

  return Response.json({ success: true, member: mapMemberRow(data, { includeSensitive: true }) });
}

export async function DELETE(request, context) {
  const blockedCrossSite = rejectCrossSiteRequest(request);
  if (blockedCrossSite) return blockedCrossSite;

  const user = getSessionUserFromRequest(request);
  if (!user) {
    return Response.json({ success: false, error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get("permanent") === "1" && !canPermanentlyDeleteMember(user)) {
    return Response.json({ success: false, error: "ไม่มีสิทธิ์ลบสมาชิกถาวร" }, { status: 403 });
  }

  const { id } = await context.params;
  const row = await getMemberForUser(id, user).catch((error) => ({ __error: error }));

  if (row?.__error) {
    return Response.json({ success: false, error: getMemberReadableError(row.__error) }, { status: 500 });
  }
  if (!row) {
    return Response.json({ success: false, error: "ไม่พบข้อมูลสมาชิกหรือไม่มีสิทธิ์เข้าถึง" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("members")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: sanitizeText(user.username || user.name || user.id, 160),
      updated_by: sanitizeText(user.username || user.name || user.id, 160),
      updated_at: new Date().toISOString(),
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
