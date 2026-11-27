import "server-only";
import { accountCredentialTag, hasProtectedPassword } from "./account-password";
import { normalizeRole } from "./rbac";
import { supabaseServer } from "./supabase";

export async function currentAccountAuthority(user) {
  if (!user?.id || !user.credentialTag || !process.env.SUPABASE_SERVICE_ROLE_KEY || !(process.env.AUTH_SECRET?.length >= 32)) return null;
  const { data, error } = await supabaseServer.from("admin_users").select("id,role,active,brands,password")
    .eq("id", user.id).maybeSingle();
  if (error || !data?.active || normalizeRole(data.role) !== normalizeRole(user.role) ||
    user.credentialTag !== accountCredentialTag(data.id, data.password, process.env.AUTH_SECRET)) return null;
  return { protectedPassword: hasProtectedPassword(data.password), account: { ...user, brands: data.brands } };
}
