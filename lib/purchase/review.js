import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { paymentColumns, purchaseDb, result, rpc, visibleStep } from "./server";
import { sendOtp, sendQueued } from "./email";
import { inviteCookie, newSession, otpHash, parseInvitation, reviewCookie, sessionHash } from "./tokens";
import { invariant, string } from "./validation";

export async function pendingStep(stepId) {
  const step = result(await purchaseDb().from("purchase_approval_steps")
    .select("id,requisition_id,round,level,email,invite_expires_at,req:purchase_requisitions!inner(brand,status,round,current_level)")
    .eq("id", stepId).eq("status", "pending").gt("invite_expires_at", new Date().toISOString()).maybeSingle());
  if (!step || step.req.round !== step.round || step.req.current_level !== step.level ||
    !["pending", "overage_pending"].includes(step.req.status)) return null;
  return step;
}

export async function invitation(token) {
  const parsed = parseInvitation(token);
  if (!parsed) return null;
  const step = await pendingStep(parsed.step);
  return step && Date.parse(step.invite_expires_at) === parsed.expiry ? step : null;
}

export async function reviewSession(request) {
  const key = request.cookies.get(reviewCookie)?.value || "";
  if (!/^[a-zA-Z0-9_-]{43}$/.test(key)) return null;
  const hash = sessionHash(key);
  const row = result(await purchaseDb().from("purchase_approval_sessions").select("step_id")
    .eq("session_hash", hash).gt("expires_at", new Date().toISOString()).maybeSingle());
  if (!row) return null;
  const step = await pendingStep(row.step_id);
  return step ? { hash, step } : null;
}

export async function otp(request, action, code) {
  const step = await invitation(request.cookies.get(inviteCookie)?.value);
  invariant(step, "ลิงก์ไม่ถูกต้อง หมดอายุ หรือดำเนินการแล้ว", 403);
  const pin = action === "request" ? String(randomInt(100000, 1000000)) : String(code || "");
  invariant(/^\d{6}$/.test(pin), "กรอกรหัส OTP 6 หลัก");
  const session = action === "verify" ? newSession() : null;
  const status = await rpc("otp", {
    p_step: step.id, p_invite_expires: step.invite_expires_at, p_action: action, p_hash: otpHash(step.id, pin),
    p_session: session ? sessionHash(session) : null,
  });
  invariant(status !== "limited", "ครบจำนวนครั้งที่กำหนด หรือกรุณารอ 60 วินาทีก่อนขออีกครั้ง", 429);
  invariant(status !== "wrong", "รหัส OTP ไม่ถูกต้อง", 400);
  invariant(status !== "expired", "รหัสหมดอายุหรือใช้แล้ว กรุณาขอรหัสใหม่", 400);
  invariant(["sent", "verified"].includes(status), "ลิงก์ไม่ถูกต้องหรือหมดอายุ", 403);
  if (action === "request") {
    const sent = await sendOtp(step.req.brand, step, pin, randomUUID());
    invariant(sent.provider, "ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่ใน 60 วินาที", 503);
  }
  return session;
}

export async function reviewDocument(step) {
  const db = purchaseDb();
  const [round, steps] = await Promise.all([
    db.from("purchase_approval_rounds").select("round,kind,snapshot,payment_id,sender_message")
      .eq("requisition_id", step.requisition_id).eq("round", step.round).single().then(result),
    db.from("purchase_approval_steps").select(visibleStep).eq("requisition_id", step.requisition_id)
      .eq("round", step.round).order("level").then(result),
  ]);
  let payment = null;
  let receipt = null;
  if (round.payment_id) {
    payment = result(await db.from("purchase_payments").select(paymentColumns).eq("id", round.payment_id)
      .eq("requisition_id", step.requisition_id).single());
    if (payment.receipt_id) {
      receipt = result(await db.from("purchase_attachments").select("*").eq("id", payment.receipt_id)
        .eq("requisition_id", step.requisition_id).eq("kind", "receipt").single());
    }
  }
  return {
    ...round.snapshot,
    document: { ...round.snapshot.document, status: step.req.status },
    round: { round: round.round, kind: round.kind }, steps, payment, receipt, senderMessage: round.sender_message,
  };
}

export async function decide(request, input) {
  const session = await reviewSession(request);
  invariant(session, "กรุณายืนยัน OTP ใหม่", 403);
  const decision = input.decision;
  invariant(["approved", "rejected", "returned"].includes(decision), "กรุณาเลือกผลการอนุมัติ");
  const comment = string(input.comment, 2000, "ความคิดเห็น", decision !== "approved");
  const requisitionId = await rpc("review", { p_session: session.hash, p_decision: decision, p_comment: comment });
  await sendQueued(requisitionId);
}
