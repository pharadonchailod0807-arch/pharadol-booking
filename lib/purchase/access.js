import { can, canAccessBrand, normalizeRole, ROLES } from "../rbac.js";
import { equipmentPermissions } from "../equipment/access.ts";

const { SUPER_ADMIN, BRAND_ADMIN, MANAGER, STAFF, VIEWER } = ROLES;
const administrators = [SUPER_ADMIN, BRAND_ADMIN];
const managers = [...administrators, MANAGER];
const editors = [...managers, STAFF];

export function purchaseAccess(user, brand) {
  const denied = new Set(user?.deniedPermissions || []);
  const role = normalizeRole(user?.role);
  const allowed = (permission, roles) =>
    Boolean(user && user.active !== false && canAccessBrand(user, brand) &&
      !denied.has("*") && !denied.has(permission) &&
      (roles.includes(role) || can(user, permission, { brandId: brand })));
  const view = allowed("purchase.view", [...editors, VIEWER]);
  return {
    view,
    write: view && allowed("purchase.write", editors),
    finance: view && allowed("purchase.finance", managers),
    manage: view && allowed("purchase.manage", administrators),
    inventory: brand === "pharadol" && view && allowed("purchase.inventory", managers) &&
      equipmentPermissions(user).write,
  };
}
