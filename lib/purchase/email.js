import "server-only";
import { BRAND_DOCUMENTS } from "@/app/lib/brandDocuments";
import { emailPattern, statuses } from "./data";
import { purchaseDb, isPreview, result, rpc } from "./server";
import { signInvitation } from "./tokens";
import { invariant } from "./validation";
import { invitationContent } from "./invitation-email";

function mailConfig(brand) {
  const prefix = brand.toUpperCase();
  const from = process.env["PURCHASE_" + prefix + "_EMAIL_FROM"] || process.env[prefix + "_EMAIL_FROM"];
  const key = process.env.PURCHASE_RESEND_API_KEY || (!isPreview() && process.env.RESEND_API_KEY);
  const sandbox = isPreview() ? process.env.PURCHASE_TEST_EMAIL : undefined;
  const origin = process.env.PURCHASE_APP_URL;
  const parsed = URL.canParse(origin || "") ? new URL(origin) : null;
  invariant(key && from && parsed && !parsed.username && !parsed.password &&
    (parsed.protocol === "https:" || (!process.env.VERCEL_ENV && parsed.hostname === "localhost" && parsed.protocol === "http:"))
    && (!isPreview() || (sandbox && emailPattern.test(sandbox))),
  "ยังไม่ได้ตั้งค่าอีเมลระบบจัดซื้อ", 503);
  return {
    from, key, sandbox, origin: parsed.origin,
    replyTo: process.env[prefix + "_EMAIL_REPLY_TO"] || BRAND_DOCUMENTS[brand].email,
  };
}

const payload = (config, recipient, subject, content) => ({
  from: config.from, to: [config.sandbox || recipient], reply_to: config.replyTo, subject, ...content,
});

async function deliver(config, message, key) {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + config.key, "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json().catch(() => null);
    if (response.ok && typeof data?.id === "string") return { provider: data.id, failure: null };
    return { provider: null, failure: `resend_${response.status}` };
  } catch {
    return { provider: null, failure: "connection" };
  }
}

export async function sendOtp(brand, step, pin, nonce) {
  const config = mailConfig(brand);
  return deliver(config, payload(config, step.email, "รหัสยืนยันการอนุมัติจัดซื้อ", {
    text: `รหัส OTP ของคุณคือ ${pin}\nรหัสมีอายุ 5 นาทีและใช้ได้ครั้งเดียว`,
  }), "purchase-otp/" + nonce);
}

async function jobPayload(config, job) {
  const { step, requisition } = job;
  const number = requisition.number;
  if (job.kind === "invite") {
    const href = new URL("/api/purchase/invite/" + signInvitation(step.id, job.invite_expires_at), config.origin).href;
    const db = purchaseDb();
    const round = result(await db.from("purchase_approval_rounds").select("snapshot,sender_message,payment_id")
      .eq("requisition_id", requisition.id).eq("round", step.round).single());
    const payment = round.payment_id ? result(await db.from("purchase_payments").select("difference::text")
      .eq("id", round.payment_id).eq("requisition_id", requisition.id).single()) : null;
    const brand = BRAND_DOCUMENTS[requisition.brand];
    return payload(config, job.recipient, `${number} ขออนุมัติจัดซื้อ ระดับ ${step.level}`, invitationContent({
      brand: brand.name, logo: new URL(brand.logo, config.origin).href, href,
      document: round.snapshot.document, items: round.snapshot.items, senderMessage: round.sender_message,
      amount: payment?.difference ?? round.snapshot.document.total, overage: Boolean(payment),
    }));
  }
  const href = new URL(`/${requisition.brand}/purchase/${requisition.id}`, config.origin).href;
  return payload(config, job.recipient, `${number} ผลอนุมัติระดับ ${step.level}`, {
    text: `ใบตั้งเบิก ${number}\nระดับ ${step.level} — ${step.name}\nผล: ${statuses[step.status]}\n${step.comment}\nดูสถานะล่าสุด: ${href}`,
  });
}

export async function drainEmail({ requisitionId, jobId, force = false } = {}) {
  let query = purchaseDb().from("purchase_email_outbox").select(
    "id,kind,recipient,message,invite_expires_at,step:purchase_approval_steps!inner(id,round,level,name,status,comment),requisition:purchase_requisitions!inner(id,brand,number)",
  ).in("status", ["pending", "failed", "sending"]).order("next_attempt_at").limit(6);
  if (requisitionId) query = query.eq("requisition_id", requisitionId);
  if (jobId) query = query.eq("id", jobId);
  if (!force) query = query.lte("next_attempt_at", new Date().toISOString());
  const jobs = result(await query);
  await Promise.all(jobs.map(async (job) => {
    let config, message;
    try {
      config = mailConfig(job.requisition.brand);
      message = job.message || await jobPayload(config, job);
    } catch {
      await rpc("email_block", { p_job: job.id });
      return;
    }
    const claim = await rpc("email_claim", { p_job: job.id, p_message: message, p_now: force });
    if (!claim) return;
    const sent = await deliver(config, claim.message, "purchase-outbox/" + job.id);
    await rpc("email_finish", {
      p_job: job.id, p_attempt: claim.attempt_key, p_provider: sent.provider, p_failure: sent.failure,
    });
  }));
}

export async function sendQueued(requisitionId) {
  // The database transaction already committed. Pending or leased work can be retried.
  await drainEmail({ requisitionId }).catch(() => {});
}
