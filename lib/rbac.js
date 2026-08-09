const VALID_BRANDS = new Set(["pharadol", "adisorn"]);

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  BRAND_ADMIN: "BRAND_ADMIN",
  MANAGER: "MANAGER",
  STAFF: "STAFF",
  VIEWER: "VIEWER",
};

export const PERMISSIONS = {
  MEMBERS_VIEW: "members.view",
  MEMBERS_CREATE: "members.create",
  MEMBERS_EDIT: "members.edit",
  MEMBERS_DELETE: "members.delete",
  MEMBERS_PERMANENT_DELETE: "members.permanent_delete",
  CUSTOMERS_VIEW: "customers.view",
  CUSTOMERS_EDIT: "customers.edit",
  CUSTOMERS_DELETE: "customers.delete",
  CUSTOMERS_PERMANENT_DELETE: "customers.permanent_delete",
  BOOKINGS_VIEW: "bookings.view",
  BOOKINGS_CREATE: "bookings.create",
  BOOKINGS_EDIT: "bookings.edit",
  BOOKINGS_DELETE: "bookings.delete",
  BOOKINGS_PERMANENT_DELETE: "bookings.permanent_delete",
  INCOME_VIEW: "income.view",
  REPORTS_VIEW: "reports.view",
  EMAIL_SEND: "email.send",
  TRASH_RESTORE: "trash.restore",
  TRASH_PERMANENT_DELETE: "trash.permanent_delete",
  SETTINGS_VIEW: "settings.view",
  SETTINGS_EDIT: "settings.edit",
  AUDIT_VIEW: "audit.view",
  SECURITY_MANAGE: "security.manage",
  USERS_MANAGE: "users.manage",
  SENSITIVE_BANK_ACCOUNT_VIEW: "sensitive.bank_account.view",
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
    PERMISSIONS.MEMBERS_VIEW,
    PERMISSIONS.MEMBERS_CREATE,
    PERMISSIONS.MEMBERS_EDIT,
    PERMISSIONS.MEMBERS_DELETE,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_EDIT,
    PERMISSIONS.CUSTOMERS_DELETE,
    PERMISSIONS.BOOKINGS_VIEW,
    PERMISSIONS.BOOKINGS_CREATE,
    PERMISSIONS.BOOKINGS_EDIT,
    PERMISSIONS.BOOKINGS_DELETE,
    PERMISSIONS.INCOME_VIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.EMAIL_SEND,
    PERMISSIONS.TRASH_RESTORE,
    PERMISSIONS.SETTINGS_VIEW,
    PERMISSIONS.SETTINGS_EDIT,
    PERMISSIONS.SENSITIVE_BANK_ACCOUNT_VIEW,
  ],
  [ROLES.MANAGER]: [
    PERMISSIONS.MEMBERS_VIEW,
    PERMISSIONS.MEMBERS_EDIT,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_EDIT,
    PERMISSIONS.BOOKINGS_VIEW,
    PERMISSIONS.BOOKINGS_EDIT,
    PERMISSIONS.INCOME_VIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.TRASH_RESTORE,
    PERMISSIONS.SETTINGS_VIEW,
  ],
  [ROLES.STAFF]: [
    PERMISSIONS.MEMBERS_VIEW,
    PERMISSIONS.MEMBERS_CREATE,
    PERMISSIONS.MEMBERS_EDIT,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_EDIT,
    PERMISSIONS.BOOKINGS_VIEW,
    PERMISSIONS.BOOKINGS_CREATE,
    PERMISSIONS.BOOKINGS_EDIT,
    PERMISSIONS.EMAIL_SEND,
    PERMISSIONS.SETTINGS_VIEW,
  ],
  [ROLES.VIEWER]: [
    PERMISSIONS.MEMBERS_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.BOOKINGS_VIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.SETTINGS_VIEW,
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

export const hasPermission = can;

export const requireBrandAccess = (user, brandId) => canAccessBrand(user, brandId);

export const getPermissionMatrix = () => ({
  roles: ROLES,
  permissions: PERMISSIONS,
  permissionsByRole: ROLE_PERMISSIONS,
});
