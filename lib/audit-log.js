import { supabase } from "@/lib/supabase";
import { getClientIp, sanitizeText } from "@/lib/security";

const AUDIT_LOG_TABLE = "audit_logs";

const sanitizeMetadata = (value, depth = 0) => {
  if (depth > 2) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") return sanitizeText(value, 500);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeMetadata(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/password|token|cookie|secret|otp|bank/i.test(key))
        .slice(0, 40)
        .map(([key, item]) => [sanitizeText(key, 80), sanitizeMetadata(item, depth + 1)])
    );
  }
  return sanitizeText(String(value), 500);
};

export const writeAuditLog = async ({
  request,
  user,
  brand = "",
  action,
  resourceType = "",
  resourceId = "",
  result = "success",
  metadata = {},
} = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    user_id: sanitizeText(user?.id, 160) || null,
    username: sanitizeText(user?.username || user?.name, 180) || null,
    brand: sanitizeText(brand, 40) || null,
    role: sanitizeText(user?.role, 80) || null,
    action: sanitizeText(action, 120),
    resource_type: sanitizeText(resourceType, 120) || null,
    resource_id: sanitizeText(resourceId, 180) || null,
    result: sanitizeText(result, 80) || "success",
    metadata: sanitizeMetadata(metadata) || {},
    ip: request ? sanitizeText(getClientIp(request), 120) : null,
    user_agent: request ? sanitizeText(request.headers.get("user-agent"), 240) : null,
  };

  if (!entry.action) return;

  try {
    const { error } = await supabase.from(AUDIT_LOG_TABLE).insert(entry);
    if (error) throw error;
  } catch {
    if (process.env.NODE_ENV !== "production") {
      console.info("[audit]", entry);
    }
  }
};
