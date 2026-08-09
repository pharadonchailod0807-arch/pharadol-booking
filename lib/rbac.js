const VALID_BRANDS = new Set(["pharadol", "adisorn"]);

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  BRAND_ADMIN: "BRAND_ADMIN",
  MANAGER: "MANAGER",
  STAFF: "STAFF",
  VIEWER: "VIEWER",
};

const ROLE_ALIASES = {
  ADMIN: ROLES.SUPER_ADMIN,
  super_admin: ROLES.SUPER_ADMIN,
  SUPERADMIN: ROLES.SUPER_ADMIN,
  SUPER_ADMIN: ROLES.SUPER_ADMIN,
  BRAND_ADMIN: ROLES.BRAND_ADMIN,
  brand_admin: ROLES.BRAND_ADMIN,
  MANAGER: ROLES.MANAGER,
  manager: ROLES.MANAGER,
  STAFF: ROLES.STAFF,
  staff: ROLES.STAFF,
  VIEWER: ROLES.VIEWER,
  viewer: ROLES.VIEWER,
};

const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: ["*"],
  [ROLES.BRAND_ADMIN]: [
    "members.view",
    "members.create",
    "members.edit",
    "members.delete",
    "customers.view",
    "customers.edit",
    "customers.delete",
    "bookings.view",
    "bookings.create",
    "bookings.edit",
    "bookings.delete",
    "income.view",
    "reports.view",
    "email.send",
    "settings.view",
    "settings.edit",
    "sensitive.bank_account.view",
  ],
  [ROLES.MANAGER]: [
    "members.view",
    "members.edit",
    "customers.view",
    "customers.edit",
    "bookings.view",
    "bookings.edit",
    "reports.view",
    "settings.view",
  ],
  [ROLES.STAFF]: [
    "members.view",
    "members.create",
    "members.edit",
    "members.delete",
    "customers.view",
    "customers.edit",
    "customers.delete",
    "bookings.view",
    "bookings.create",
    "bookings.edit",
    "bookings.delete",
    "email.send",
    "settings.view",
  ],
  [ROLES.VIEWER]: [
    "members.view",
    "customers.view",
    "bookings.view",
    "reports.view",
    "settings.view",
  ],
};

export const normalizeRole = (role) => {
  const rawRole = String(role || "").trim();
  return ROLE_ALIASES[rawRole] || ROLE_ALIASES[rawRole.toUpperCase()] || ROLES.STAFF;
};

export const normalizeSessionBrands = (brands = [], role = "") => {
  if (normalizeRole(role) === ROLES.SUPER_ADMIN) return ["pharadol", "adisorn"];

  return Array.isArray(brands)
    ? brands
        .map((brand) => (brand === "pharadon" ? "pharadol" : brand))
        .filter((brand) => VALID_BRANDS.has(brand))
    : [];
};

export const hasRole = (user, role) => normalizeRole(user?.role) === normalizeRole(role);

const getUserPermissions = (user) =>
  Array.isArray(user?.permissions)
    ? user.permissions.map((permission) => String(permission || "").trim()).filter(Boolean)
    : [];

const getUserDeniedPermissions = (user) =>
  Array.isArray(user?.deniedPermissions)
    ? user.deniedPermissions.map((permission) => String(permission || "").trim()).filter(Boolean)
    : [];

export const canAccessBrand = (user, brandId) => {
  const brand = String(brandId || "").trim();
  if (!VALID_BRANDS.has(brand)) return false;
  if (normalizeRole(user?.role) === ROLES.SUPER_ADMIN) return true;
  return normalizeSessionBrands(user?.brands, user?.role).includes(brand);
};

export const can = (user, permission, { brandId } = {}) => {
  const normalizedPermission = String(permission || "").trim();
  if (!user || user.active === false || !normalizedPermission) return false;

  if (brandId && !canAccessBrand(user, brandId)) return false;

  const deniedPermissions = new Set(getUserDeniedPermissions(user));
  if (deniedPermissions.has("*") || deniedPermissions.has(normalizedPermission)) {
    return false;
  }

  const explicitPermissions = new Set(getUserPermissions(user));
  if (explicitPermissions.has("*") || explicitPermissions.has(normalizedPermission)) {
    return true;
  }

  const role = normalizeRole(user.role);
  const rolePermissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[ROLES.STAFF];
  return rolePermissions.includes("*") || rolePermissions.includes(normalizedPermission);
};

export const getPermissionMatrix = () => ({
  roles: ROLES,
  permissionsByRole: ROLE_PERMISSIONS,
});
