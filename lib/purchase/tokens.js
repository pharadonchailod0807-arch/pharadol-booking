import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { uuidPattern } from "./data";
import { invariant } from "./validation";

export const inviteCookie = "__Host-purchase-invite";
export const reviewCookie = "__Host-purchase-review";
export const cookieOptions = (maxAge) => ({ httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge });

export function mac(namespace, value) {
  const secret = process.env.PURCHASE_SECRET;
  invariant(secret?.length >= 32, "ยังไม่ได้ตั้งค่าระบบอนุมัติ", 503);
  return createHmac("sha256", secret).update(namespace + ":" + value).digest("base64url");
}

export function equal(a, b) {
  const left = Buffer.from(a || "");
  const right = Buffer.from(b || "");
  return left.length === right.length && timingSafeEqual(left, right);
}

export const newSession = () => randomBytes(32).toString("base64url");
export const sessionHash = (session) => createHash("sha256").update(session).digest("hex");
export const otpHash = (step, otp) => mac("otp", step + ":" + otp);

export function signInvitation(step, expiration) {
  const value = step + "." + Date.parse(expiration);
  return value + "." + mac("invite", value);
}

export function parseInvitation(token) {
  if (typeof token !== "string" || token.length > 100) return null;
  const [step, exp, signature, extra] = token.split(".");
  if (extra !== undefined || !step || !uuidPattern.test(step) || !/^\d{13}$/.test(exp || "")
    || Number(exp) <= Date.now() || !equal(signature, mac("invite", step + "." + exp))) return null;
  return { step, expiry: Number(exp) };
}
