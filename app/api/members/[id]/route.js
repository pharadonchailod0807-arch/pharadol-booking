import { supabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit-log";
import {
  canAccessMemberBrand,
  canPermanentlyDeleteMember,
  getMemberReadableError,
  getSessionUserFromRequest,
  mapMemberRow,
  MEMBER_SELECT_COLUMNS,
  validateMemberPayload,
} from "@/lib/members";
import { can } from "@/lib/rbac";
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
  if (!can(user, "members.view", { brandId: row.brand })) {
    return Response.json({ success: false, error: "ไม่มีสิทธิ์เข้าถึงข้อมูลสมาชิกแบรนด์นี้" }, { status: 403 });
  }

  const includeSensitive = can(user, "sensitive.bank_account.view", { brandId: row.brand });
  if (includeSensitive && row.bank_account_number) {
    await writeAuditLog({
      request,
      user,
      brand: row.brand,
      action: "BANK_ACCOUNT_VIEWED",
      resourceType: "member",
      resourceId: row.id,
      result: "success",
    });
  }

  return Response.json(
    {
      success: true,
      member: mapMemberRow(row, {
        includeSensitive,
      }),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
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
  if (!can(user, "members.edit", { brandId: row.brand })) {
    return Response.json({ success: false, error: "ไม่มีสิทธิ์แก้ไขข้อมูลสมาชิกแบรนด์นี้" }, { status: 403 });
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
    await writeAuditLog({
      request,
      user,
      brand: row.brand,
      action: "MEMBER_UPDATED",
      resourceType: "member",
      resourceId: row.id,
      result: "failure",
      metadata: { reason: getMemberReadableError(error) },
    });
    return Response.json({ success: false, error: getMemberReadableError(error) }, { status: 500 });
  }

  await writeAuditLog({
    request,
    user,
    brand: row.brand,
    action: "MEMBER_UPDATED",
    resourceType: "member",
    resourceId: row.id,
    result: "success",
  });

  return Response.json({
    success: true,
    member: mapMemberRow(data, {
      includeSensitive: can(user, "sensitive.bank_account.view", { brandId: row.brand }),
    }),
  });
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
  if (!can(user, "members.delete", { brandId: row.brand })) {
    return Response.json({ success: false, error: "ไม่มีสิทธิ์ลบข้อมูลสมาชิกแบรนด์นี้" }, { status: 403 });
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
    await writeAuditLog({
      request,
      user,
      brand: row.brand,
      action: "MEMBER_DELETED",
      resourceType: "member",
      resourceId: row.id,
      result: "failure",
      metadata: { reason: getMemberReadableError(error) },
    });
    return Response.json({ success: false, error: getMemberReadableError(error) }, { status: 500 });
  }

  await writeAuditLog({
    request,
    user,
    brand: row.brand,
    action: "MEMBER_DELETED",
    resourceType: "member",
    resourceId: row.id,
    result: "success",
  });

  return Response.json({ success: true, member: mapMemberRow(data) });
}
