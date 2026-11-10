import "server-only";
import { createClient } from "@supabase/supabase-js";
import { verifySignedPayload } from "@/lib/auth";
import { EquipmentError } from "./validation";

// Current production uses signed application sessions. If the optional session
// registry is deployed later, respect its revocations without importing pending
// authentication changes or creating/modifying any legacy authentication table.
export async function equipmentSessionRevoked(token: string, userId: string) {
  const session = verifySignedPayload(token);
  if (!session?.sid || !userId) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false; // Equipment data endpoints fail closed on missing configuration.
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db
    .from("user_sessions")
    .select("revoked_at,expires_at")
    .eq("session_id", session.sid)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (["PGRST205", "42P01"].includes(error.code)) return false;
    throw new EquipmentError("ไม่สามารถตรวจสอบ Session ได้ กรุณาลองใหม่", 503);
  }
  return Boolean(
    data?.revoked_at ||
    (data?.expires_at && new Date(data.expires_at).getTime() <= Date.now()),
  );
}
