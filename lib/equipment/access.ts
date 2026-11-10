import { can, canAccessBrand, normalizeRole } from "../rbac.js";
// Dedicated permissions keep the legacy permission matrix and both brands unchanged.
export function equipmentPermissions(
  user: {
    role?: string;
    active?: boolean;
    brands?: string[];
    permissions?: string[];
    deniedPermissions?: string[];
  } | null,
) {
  if (!user || user.active === false || !canAccessBrand(user, "pharadol"))
    return { read: false, write: false, admin: false };
  const role = normalizeRole(user.role);
  const denied = new Set(user.deniedPermissions || []);
  const allowed = (permission: string, roles: string[]) =>
    !denied.has("*") &&
    !denied.has(permission) &&
    (roles.includes(role) || can(user, permission, { brandId: "pharadol" }));
  const read = allowed("equipment.view", [
    "SUPER_ADMIN",
    "BRAND_ADMIN",
    "MANAGER",
    "STAFF",
    "VIEWER",
  ]);
  return {
    read,
    write:
      read &&
      allowed("equipment.write", [
        "SUPER_ADMIN",
        "BRAND_ADMIN",
        "MANAGER",
        "STAFF",
      ]),
    admin:
      read &&
      allowed("equipment.admin", ["SUPER_ADMIN", "BRAND_ADMIN", "MANAGER"]),
  };
}
