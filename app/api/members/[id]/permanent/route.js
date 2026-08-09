import { supabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit-log";
import {
  canAccessMemberBrand,
  canPermanentlyDeleteMember,
  getMemberReadableError,
  getSessionUserFromRequest,
} from "@/lib/members";
import { permissionDeniedResponse } from "@/lib/server-auth";
import { rejectCrossSiteRequest, sanitizeText } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEMBER_PROFILE_PUBLIC_SEGMENT = "/storage/v1/object/public/member-profiles/";

const getMemberProfileStoragePath = (profileImageUrl, brand, memberId) => {
  if (!profileImageUrl) return "";

  try {
    const { pathname } = new URL(profileImageUrl);
    const markerIndex = pathname.indexOf(MEMBER_PROFILE_PUBLIC_SEGMENT);
    if (markerIndex === -1) return "";

    const path = decodeURIComponent(
      pathname.slice(markerIndex + MEMBER_PROFILE_PUBLIC_SEGMENT.length)
    );
    const expectedPrefix = `${brand}/${memberId}/`;
    return path.startsWith(expectedPrefix) ? path : "";
  } catch {
    return "";
  }
};

export async function DELETE(request, context) {
  const blockedCrossSite = rejectCrossSiteRequest(request);
  if (blockedCrossSite) return blockedCrossSite;

  const user = getSessionUserFromRequest(request);
  if (!user) {
    return Response.json({ success: false, error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }
  const { id } = await context.params;

  if (!canPermanentlyDeleteMember(user)) {
    return permissionDeniedResponse({
      request,
      user,
      permission: "members.permanent_delete",
      resourceType: "member",
      resourceId: sanitizeText(id, 120),
      deniedMessage: "ไม่มีสิทธิ์ลบสมาชิกถาวร",
    });
  }

  const { data: row, error: findError } = await supabase
    .from("members")
    .select("id,brand,profile_image_url")
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
    await writeAuditLog({
      request,
      user,
      brand: row.brand,
      action: "MEMBER_PERMANENT_DELETED",
      resourceType: "member",
      resourceId: row.id,
      result: "failure",
      metadata: { reason: getMemberReadableError(error) },
    });
    return Response.json({ success: false, error: getMemberReadableError(error) }, { status: 500 });
  }

  const profileStoragePath = getMemberProfileStoragePath(
    row.profile_image_url,
    row.brand,
    row.id
  );

  if (profileStoragePath) {
    const { error: storageError } = await supabase.storage
      .from("member-profiles")
      .remove([profileStoragePath]);

    if (storageError) {
      await writeAuditLog({
        request,
        user,
        brand: row.brand,
        action: "MEMBER_PROFILE_CLEANUP_FAILED",
        resourceType: "member",
        resourceId: row.id,
        result: "failure",
        metadata: { reason: getMemberReadableError(storageError) },
      });
    }
  }

  await writeAuditLog({
    request,
    user,
    brand: row.brand,
    action: "MEMBER_PERMANENT_DELETED",
    resourceType: "member",
    resourceId: row.id,
    result: "success",
  });

  return Response.json({ success: true });
}
