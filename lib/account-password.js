import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const hashPattern = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/;
export const hasProtectedPassword = (password) => hashPattern.test(password || "");

export function hashAccountPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return ["scrypt", salt, scryptSync(password, salt, 64).toString("hex")].join("$");
}

export function matchesAccountPassword(supplied, stored) {
  if (!stored || supplied.length > 1024) return false;
  const m = hashPattern.exec(stored);
  if (!m) return supplied === stored;
  return timingSafeEqual(scryptSync(supplied, m[1], 64), Buffer.from(m[2], "hex"));
}

export function accountCredentialTag(id, password, secret) {
  if (!id || !secret) return "";
  return createHmac("sha256", secret).update(JSON.stringify(["account-credential", id, password])).digest("base64url");
}
