import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  authorize, bucket, checkOrigin, documentDetail, downloadFile, failure, fileResponse, json, objectKey,
  purchaseDb, readDocument, result, rpc,
} from "@/lib/purchase/server";
import { emailStatuses, fileLimit, statuses } from "@/lib/purchase/data";
import {
  approvalInput, approverInput, date, email, fileInfo, id, invariant, inventoryInput, paymentInput, requisitionInput, string, version,
} from "@/lib/purchase/validation";
import { drainEmail, sendQueued } from "@/lib/purchase/email";
import { invitation, otp, reviewSession, reviewDocument, decide } from "@/lib/purchase/review";
import { cookieOptions, equal, inviteCookie, reviewCookie } from "@/lib/purchase/tokens";
import { purchaseAccess } from "@/lib/purchase/access";

export const runtime = "nodejs";
export const maxDuration = 60;

const writeActions = new Set(["submit", "revise", "cancel", "file_remove", "renew"]);
const financeActions = new Set(["start", "payment"]);
const listStatuses = Object.keys(statuses).filter((name) => !["queued", "accepted"].includes(name));

function nextDay(value) {
  const time = new Date(value + "T00:00:00Z");
  time.setUTCDate(time.getUTCDate() + 1);
  return time.toISOString().slice(0, 10);
}

async function list(brand, query) {
  const sorted = query.get("sort") || "created_at";
  const status = query.get("status") || null;
  invariant(!status || listStatuses.includes(status), "สถานะไม่ถูกต้อง");
  const page = Number(query.get("page") || 1);
  invariant(Number.isInteger(page) && page > 0 && page <= 100000, "เลขหน้าไม่ถูกต้อง");
  const from = date(query.get("from"));
  const to = date(query.get("to"));
  invariant(!from || !to || from <= to, "วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด");
  return rpc("list", {
    p_brand: brand, p_query: string(query.get("q"), 150, "คำค้นหา"),
    p_status: status, p_from: from ? from + "T00:00:00+07:00" : null,
    p_until: to ? nextDay(to) + "T00:00:00+07:00" : null,
    p_sort: ["created_at", "number", "total"].includes(sorted) ? sorted : "created_at",
    p_asc: query.get("order") === "asc", p_page: page,
  });
}

function declaredSize(request, limit) {
  invariant(Number(request.headers.get("content-length") || 0) <= limit, "ข้อมูลมีขนาดใหญ่เกินไป", 413);
}

async function cappedBody(request, limit) {
  declaredSize(request, limit);
  invariant(request.body, "กรุณาระบุข้อมูล");
  const reader = request.body.getReader();
  const buffers = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        invariant(false, "ข้อมูลมีขนาดใหญ่เกินไป", 413);
      }
      buffers.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(buffers, total);
}

async function body(request) {
  invariant(request.headers.get("content-type")?.split(";")[0] === "application/json", "ใช้รูปแบบ JSON", 415);
  const data = JSON.parse((await cappedBody(request, 640 * 1024)).toString("utf8"));
  invariant(data && typeof data === "object" && !Array.isArray(data), "รูปแบบข้อมูลไม่ถูกต้อง");
  return data;
}

async function upload(request, brand, requisitionId) {
  const mime = request.headers.get("content-type") || "";
  invariant(["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mime), "ชนิดไฟล์ไม่รองรับ", 415);
  const params = request.nextUrl.searchParams;
  const kind = params.get("kind");
  invariant(["product", "quotation", "receipt"].includes(kind), "ประเภทไฟล์ไม่ถูกต้อง");
  const auth = await authorize(request, brand, kind === "receipt" ? "finance" : "write");
  const document = await readDocument(brand, requisitionId);
  const expected = version(params.get("version"));
  invariant(document.version === expected, "เอกสารถูกอัปเดต กรุณาโหลดใหม่", 409);
  invariant(kind === "receipt" ? document.status === "purchasing" : ["draft", "returned"].includes(document.status),
    "ไม่สามารถแนบไฟล์ในสถานะปัจจุบัน", 409);
  const name = string(params.get("name"), 200, "ชื่อไฟล์", true);
  const item = kind === "product" ? id(params.get("item")) : null;
  const buffer = await cappedBody(request, fileLimit);
  const verified = fileInfo(buffer, mime, kind);
  const attachment = randomUUID();
  const storage = purchaseDb().storage.from(bucket);
  const key = objectKey(brand, requisitionId, attachment);
  result(await storage.upload(key, buffer, { contentType: verified, upsert: false }));
  try {
    return await rpc("mutate", { p_brand: brand, p_id: requisitionId, p_actor: auth.actor, p_action: "file_add",
      p_data: { id: attachment, kind, name, item_id: item, mime: verified, bytes: buffer.length, version: expected } });
  } catch (error) {
    // A database rejection rolls back metadata. On an ambiguous transport failure keep the private object intact.
    if (/^(23|40|P0002)/.test(error?.code || "")) await storage.remove([key]).catch(() => {});
    throw error;
  }
}

async function approvedFile(request, attachmentId) {
  const session = await reviewSession(request);
  invariant(session, "กรุณายืนยัน OTP", 403);
  const data = await reviewDocument(session.step);
  const attachment = data.files.find((file) => file.id === attachmentId) ||
    (data.receipt?.id === attachmentId ? data.receipt : null);
  invariant(attachment, "ไม่พบไฟล์", 404);
  return fileResponse(await downloadFile(data.document.brand, data.document.id, attachment), attachment, true);
}

async function publicGet(request, path) {
  const [scope, operation, target] = path;
  if (scope === "invite" && path.length === 2) {
    const step = await invitation(operation);
    const response = NextResponse.redirect(new URL("/purchase-review", request.url), {
      status: 303, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
    });
    if (step) {
      response.cookies.set(inviteCookie, operation, cookieOptions(Math.ceil((Date.parse(step.invite_expires_at) - Date.now()) / 1000)));
      response.cookies.set(reviewCookie, "", cookieOptions(0));
    } else {
      response.cookies.set(inviteCookie, "", cookieOptions(0));
      response.cookies.set(reviewCookie, "", cookieOptions(0));
    }
    return response;
  }
  if (scope === "worker" && path.length === 1) {
    const secret = process.env.PURCHASE_CRON_SECRET;
    invariant(secret?.length >= 32 && equal(request.headers.get("authorization"), "Bearer " + secret), "ไม่พบรายการ", 404);
    await drainEmail();
    return json({ ok: true });
  }
  if (scope === "review" && operation === "files" && path.length === 3) return approvedFile(request, id(target));
  if (scope === "review" && path.length === 1) {
    const session = await reviewSession(request);
    if (session) return json({ stage: "review", data: await reviewDocument(session.step) });
    const pending = await invitation(request.cookies.get(inviteCookie)?.value);
    return json({ stage: pending ? "otp" : "invalid" });
  }
  return null;
}

async function staffGet(request, path) {
  const [brand, resource, operation, target] = path;
  const query = request.nextUrl.searchParams;
  const right = resource === "approvers" ? "manage" : operation === "inventory" ? "inventory" : operation === "approval-route" ? "write" : "view";
  const { user, access } = await authorize(request, brand, right);
  if (path.length === 1) return json({ ...await list(brand, query), access, viewer: { name: user.name || user.username, email: user.email || "" } });
  const db = purchaseDb();
  if (resource === "approvers" && path.length === 2) {
    const rows = result(await db.from("purchase_approvers").select("*").eq("brand", brand).order("level").order("active", { ascending: false }));
    const brands = ["pharadol", "adisorn"].filter((candidate) => purchaseAccess(user, candidate).manage);
    return json({ approvers: rows, brands });
  }
  const reqId = id(resource);
  if (operation === "approval-route" && path.length === 3) {
    const doc = await readDocument(brand, reqId);
    invariant(["draft", "returned"].includes(doc.status), "เอกสารนี้ส่งขออนุมัติแล้ว กรุณาโหลดใหม่", 409);
    const candidates = result(await db.from("purchase_approvers").select("id,level,name,position,email,updated_at::text")
      .eq("brand", brand).eq("active", true).order("level").order("name").order("id"));
    return json({ candidates, version: doc.version });
  }
  if (path.length === 2) return json(await documentDetail(brand, reqId, access, user,
    query.has("round") ? version(query.get("round")) : null));
  if (operation === "pdf" && path.length === 3) {
    const data = await documentDetail(brand, reqId, access, user, query.has("round") ? version(query.get("round")) : null);
    const { exportPurchasePdf } = await import("@/lib/purchase/pdf");
    return exportPurchasePdf(data);
  }
  await readDocument(brand, reqId);
  if (operation === "inventory" && path.length === 3) {
    const data = await rpc("equipment_options", { p_id: reqId, p_serial: string(query.get("serial"), 160, "Serial Number") });
    invariant(data, "บันทึกการจัดซื้อให้เสร็จก่อนเพิ่มเข้าคลัง", 409);
    return json(data);
  }
  if (operation === "files" && path.length === 4) {
    const file = result(await db.from("purchase_attachments").select("*").eq("id", id(target)).eq("requisition_id", reqId).maybeSingle());
    invariant(file, "ไม่พบไฟล์", 404);
    return fileResponse(await downloadFile(brand, reqId, file), file, query.get("inline") === "1");
  }
  return json({ error: "ไม่พบรายการ" }, 404);
}

export async function GET(request, { params }) {
  try {
    const { path } = await params;
    return await publicGet(request, path) || await staffGet(request, path);
  } catch (error) {
    return failure(error);
  }
}

async function publicPost(request, operation) {
  const input = await body(request);
  if (operation === "decision") {
    await decide(request, input);
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(reviewCookie, "", cookieOptions(0));
    response.cookies.set(inviteCookie, "", cookieOptions(0));
    return response;
  }
  invariant(["request", "verify"].includes(operation), "ไม่พบรายการ", 404);
  const token = await otp(request, operation, input.code);
  if (!token) return json({ ok: true });
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(reviewCookie, token, cookieOptions(1800));
  return response;
}

async function save(request, brand, resource) {
  const { user, actor } = await authorize(request, brand, "write");
  const input = await body(request);
  const reqId = id(resource || input.id);
  const data = requisitionInput(input, Boolean(resource));
  const original = resource ? await readDocument(brand, reqId) : null;
  const address = original && original.proposer_id !== actor ? original.proposer_email : email(user.email || input.proposer_email);
  const name = string(user.name || user.username, 160, "ชื่อผู้เสนอ", true);
  const saved = await rpc("save", { p_brand: brand, p_id: reqId, p_actor: actor, p_name: name, p_email: address, p_data: data });
  return json({ id: saved, version: (await readDocument(brand, saved)).version }, resource ? 200 : 201);
}

async function staffPost(request, path) {
  const [brand, resource, operation] = path;
  if (path.length === 1 || (path.length === 3 && operation === "edit")) return save(request, brand, resource);
  if (resource === "approvers" && path.length === 2) {
    const { actor } = await authorize(request, brand, "manage");
    return json({ id: await rpc("approver_save", { p_brand: brand, p_actor: actor, p_data: approverInput(await body(request)) }) });
  }
  invariant(path.length === 3, "ไม่พบรายการ", 404);
  const reqId = id(resource);
  if (operation === "files") return json(await upload(request, brand, reqId), 201);
  const right = operation === "inventory" ? "inventory" : financeActions.has(operation) ? "finance" : "write";
  const { actor } = await authorize(request, brand, right);
  const input = await body(request);
  if (operation === "inventory") {
    return json({ links: await rpc("into_equipment", { p_id: reqId, p_actor: actor, p_items: inventoryInput(input) }) });
  }
  if (operation === "retry") {
    await readDocument(brand, reqId);
    const jobId = id(input.id);
    const job = result(await purchaseDb().from("purchase_email_outbox").select("id,status").eq("requisition_id", reqId).eq("id", jobId).maybeSingle());
    invariant(job && job.status in emailStatuses, "ไม่พบงานส่งอีเมล", 404);
    await drainEmail({ requisitionId: reqId, jobId, force: true });
    return json({ delivery: await deliveryStatus(jobId) });
  }
  invariant(writeActions.has(operation) || financeActions.has(operation), "ไม่พบรายการ", 404);
  const data = { version: version(input.version) };
  if (operation === "submit") Object.assign(data, approvalInput(input));
  if (operation === "payment") Object.assign(data, paymentInput(input));
  if (operation === "file_remove") {
    data.id = id(input.id);
    await readDocument(brand, reqId);
    const file = result(await purchaseDb().from("purchase_attachments").select("kind").eq("id", data.id)
      .eq("requisition_id", reqId).maybeSingle());
    if (file?.kind === "receipt") await authorize(request, brand, "finance");
  }
  const updated = await rpc("mutate", { p_brand: brand, p_id: reqId, p_actor: actor, p_action: operation, p_data: data });
  if (updated.round || operation === "renew") await sendQueued(reqId);
  if (operation === "submit") return json({ ...updated, delivery: await deliveryStatus(updated.invite_job) });
  return json(updated);
}

async function deliveryStatus(jobId) {
  if (!jobId) return "unknown";
  const response = await purchaseDb().from("purchase_email_outbox").select("status").eq("id", jobId).maybeSingle();
  return response.data?.status || "unknown";
}

export async function POST(request, { params }) {
  try {
    checkOrigin(request);
    const { path } = await params;
    if (path[0] === "review" && path.length === 2) return await publicPost(request, path[1]);
    return await staffPost(request, path);
  } catch (error) {
    return failure(error);
  }
}
