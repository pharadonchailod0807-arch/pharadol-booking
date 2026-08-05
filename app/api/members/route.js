import { supabase } from "@/lib/supabase";
import {
  canAccessMemberBrand,
  getMemberReadableError,
  getSessionUserFromRequest,
  isAdminUser,
  mapMemberRow,
  MEMBER_LIST_COLUMNS,
  MEMBER_SELECT_COLUMNS,
  parseMemberPage,
  parseMemberPageSize,
  resolveAuthorizedBrand,
  validateMemberPayload,
} from "@/lib/members";
import {
  getClientIp,
  normalizeBrand,
  rateLimit,
  rejectCrossSiteRequest,
  rejectDocumentNavigation,
  sanitizeText,
} from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SORTS = {
  newest: { column: "created_at", ascending: false },
  code_desc: { column: "member_code", ascending: false },
  code_asc: { column: "member_code", ascending: true },
  name_asc: { column: "first_name", ascending: true },
  name_desc: { column: "first_name", ascending: false },
  birthday: { column: "birth_date", ascending: true },
};

const SEARCH_COLUMNS = [
  "member_code",
  "first_name",
  "last_name",
  "nickname",
  "phone",
  "email",
  "line_id",
  "facebook",
];
const MEMBER_CREATE_RETRIES = 8;

const formatMemberCode = (sequence) =>
  `MB-${String(sequence).padStart(4, "0")}`;

const isMissingRpcSchemaError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST202" ||
    (message.includes("create_member_with_sequence") &&
      message.includes("schema cache"))
  );
};

const getSearchFilter = (search) => {
  const safeSearch = sanitizeText(search, 120).replace(/[%_,]/g, " ");
  if (!safeSearch) return "";
  return SEARCH_COLUMNS.map((column) => `${column}.ilike.%${safeSearch}%`).join(",");
};

const createMemberWithSequenceFallback = async ({ brand, memberData, actor }) => {
  const sequenceSeed = await supabase
    .from("member_sequences")
    .upsert(
      { brand, last_number: 0, updated_at: new Date().toISOString() },
      { onConflict: "brand", ignoreDuplicates: true }
    );

  if (sequenceSeed.error) throw sequenceSeed.error;

  let lastError = null;

  for (let attempt = 0; attempt < MEMBER_CREATE_RETRIES; attempt += 1) {
    const { data: currentSequence, error: sequenceReadError } = await supabase
      .from("member_sequences")
      .select("last_number")
      .eq("brand", brand)
      .single();

    if (sequenceReadError) throw sequenceReadError;

    const currentNumber = Number(currentSequence?.last_number || 0);
    const nextNumber = currentNumber + 1;
    const memberCode = formatMemberCode(nextNumber);

    const { data: updatedSequence, error: sequenceUpdateError } = await supabase
      .from("member_sequences")
      .update({
        last_number: nextNumber,
        updated_at: new Date().toISOString(),
      })
      .eq("brand", brand)
      .eq("last_number", currentNumber)
      .select("last_number")
      .maybeSingle();

    if (sequenceUpdateError) throw sequenceUpdateError;
    if (!updatedSequence) continue;

    const { data: member, error: insertError } = await supabase
      .from("members")
      .insert({
        ...memberData,
        brand,
        member_code: memberCode,
        created_by: actor,
        updated_by: actor,
      })
      .select(MEMBER_SELECT_COLUMNS)
      .single();

    if (!insertError) return member;

    lastError = insertError;
    if (insertError.code !== "23505") throw insertError;
  }

  throw lastError || new Error("ไม่สามารถสร้างรหัสสมาชิกได้ กรุณาลองใหม่");
};

const createMemberWithSequence = async ({ brand, memberData, actor }) => {
  const { data, error } = await supabase
    .rpc("create_member_with_sequence", {
      p_brand: brand,
      p_member: memberData,
      p_created_by: actor,
    })
    .single();

  if (error && !isMissingRpcSchemaError(error)) throw error;

  if (!error) {
    const { data: row, error: detailError } = await supabase
      .from("members")
      .select(MEMBER_SELECT_COLUMNS)
      .eq("id", data?.id || data)
      .eq("brand", brand)
      .single();

    if (detailError) throw detailError;
    return row;
  }

  return createMemberWithSequenceFallback({ brand, memberData, actor });
};

export async function GET(request) {
  const blockedNavigation = rejectDocumentNavigation(request);
  if (blockedNavigation) return blockedNavigation;

  const user = getSessionUserFromRequest(request);
  if (!user) {
    return Response.json({ success: false, error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedBrand = normalizeBrand(searchParams.get("brand"));
  const authorizedBrand = resolveAuthorizedBrand(user, requestedBrand);

  if (authorizedBrand === null) {
    return Response.json({ success: false, error: "ไม่มีสิทธิ์เข้าถึงข้อมูลสมาชิกแบรนด์นี้" }, { status: 403 });
  }

  const page = parseMemberPage(searchParams.get("page"));
  const pageSize = parseMemberPageSize(searchParams.get("pageSize"));
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const trashMode = searchParams.get("trash") === "1";
  const statsMode = searchParams.get("stats") === "1";

  let query = supabase
    .from("members")
    .select(statsMode ? "id" : MEMBER_LIST_COLUMNS, { count: "exact", head: statsMode });

  if (authorizedBrand) {
    query = query.eq("brand", authorizedBrand);
  } else if (!isAdminUser(user)) {
    return Response.json({ success: false, error: "กรุณาระบุแบรนด์" }, { status: 400 });
  }

  query = trashMode ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);

  const position = sanitizeText(searchParams.get("position"), 120);
  const status = sanitizeText(searchParams.get("status"), 80);
  const gender = sanitizeText(searchParams.get("gender"), 40);
  const province = sanitizeText(searchParams.get("province"), 120);
  const searchFilter = getSearchFilter(searchParams.get("search"));

  if (position) query = query.eq("position", position);
  if (status) query = query.eq("status", status);
  if (gender) query = query.eq("gender", gender);
  if (province) query = query.eq("address_province", province);
  if (searchFilter) query = query.or(searchFilter);

  if (statsMode) {
    const { error, count } = await query;
    if (error) {
      return Response.json({ success: false, error: getMemberReadableError(error) }, { status: 500 });
    }
    return Response.json({ success: true, total: Number(count || 0) }, { headers: { "Cache-Control": "no-store" } });
  }

  const sort = SORTS[searchParams.get("sort")] || SORTS.newest;
  const { data, error, count } = await query
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return Response.json({ success: false, error: getMemberReadableError(error) }, { status: 500 });
  }

  return Response.json(
    {
      success: true,
      members: Array.isArray(data) ? data.map((row) => mapMemberRow(row)) : [],
      page,
      pageSize,
      total: Number(count || 0),
      hasMore: count == null ? Array.isArray(data) && data.length === pageSize : to + 1 < count,
      canAdmin: isAdminUser(user),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request) {
  const blockedCrossSite = rejectCrossSiteRequest(request);
  if (blockedCrossSite) return blockedCrossSite;

  const user = getSessionUserFromRequest(request);
  if (!user) {
    return Response.json({ success: false, error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }

  const limited = rateLimit({
    key: `member-create:${user.id || user.username}:${getClientIp(request)}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const payload = await request.json().catch(() => null);
  const requestedBrand = normalizeBrand(payload?.brand);
  const brand = resolveAuthorizedBrand(user, requestedBrand);

  if (!brand) {
    return Response.json({ success: false, error: "ไม่มีสิทธิ์เพิ่มสมาชิกแบรนด์นี้" }, { status: 403 });
  }

  if (!canAccessMemberBrand(user, brand)) {
    return Response.json({ success: false, error: "ไม่มีสิทธิ์เพิ่มสมาชิกแบรนด์นี้" }, { status: 403 });
  }

  const validation = validateMemberPayload(payload);
  if (!validation.valid) {
    return Response.json({ success: false, error: validation.errors[0], errors: validation.errors }, { status: 400 });
  }

  try {
    const row = await createMemberWithSequence({
      brand,
      memberData: validation.data,
      actor: sanitizeText(user.username || user.name || user.id, 160),
    });

    return Response.json({ success: true, member: mapMemberRow(row, { includeSensitive: true }) });
  } catch (error) {
    return Response.json({ success: false, error: getMemberReadableError(error) }, { status: 500 });
  }
}
