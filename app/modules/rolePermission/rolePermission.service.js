const ApiError = require("../../../error/ApiError");
const db = require("../../../models");
const {
  DEFAULT_ROLE_MENU_PERMISSIONS,
} = require("../../config/roleMenuPermissions");
const {
  ALL_VALID_MENU_PERMISSIONS,
  HOLYDEEN_DASHBOARD_MENU_PERMISSIONS,
} = require("../../enums/menuPermissions");
const { ENUM_USER_ROLE } = require("../../enums/user");

const RolePermission = db.rolePermission;

const validMenuPermissionSet = new Set(ALL_VALID_MENU_PERMISSIONS);
const manageableMenuPermissionSet = new Set(HOLYDEEN_DASHBOARD_MENU_PERMISSIONS);
const protectedRoleKeys = new Set(
  [ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.USER].map((role) =>
    role.toLowerCase(),
  ),
);

const uniq = (items = []) => [...new Set(items)];

const normalizeRole = (role) => String(role || "").trim();
const normalizeRoleKey = (role) => normalizeRole(role).toLowerCase();
const builtInRoles = Object.values(ENUM_USER_ROLE);
const builtInRoleByKey = new Map(
  builtInRoles.map((role) => [normalizeRoleKey(role), role]),
);
const isBuiltInRole = (role) => builtInRoleByKey.has(normalizeRoleKey(role));

const validateRoleName = (role) => {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) {
    throw new ApiError(400, "Role is required");
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{1,63}$/.test(normalizedRole)) {
    throw new ApiError(
      400,
      "Role must start with a letter and contain only letters, numbers, dash or underscore",
    );
  }
  return normalizedRole;
};

const isValidRole = (role) => Boolean(normalizeRole(role));

// Legacy permission keys used by older UI versions.
// Backend routes currently guard with "department_designation", so we treat these as equivalent.
const LEGACY_PERMISSION_ALIASES = {
  department_management: "department_designation",
  designation_management: "department_designation",
};

const LEGACY_TO_HOLYDEEN_PERMISSION_ALIASES = {
  overview: ["dashboard"],
  order: ["orders"],
  orders: ["orders"],
  all_orders: ["orders"],
  sale: ["orders"],
  product: ["products"],
  item: ["products"],
  stock_product: ["products"],
  supplier: ["supplier"],
  purchase: ["purchase"],
  purchase_requisition: ["purchase"],
  user_management: ["admin_user"],
  role_permissions: ["admin_roles", "admin_permissions"],
  settings: ["website_setting"],
  logo: ["website_setting"],
  cod_change: ["website_setting"],
  cod_charge: ["website_setting"],
  delivery_advance: ["website_setting"],
  delivery_charge: ["website_setting"],
  marketing: ["marketing_tools"],
  ads_campaign_kpi: ["marketing_tools"],
  profit_loss: ["reports"],
  auto_profit_loss: ["reports"],
  stock_alert: ["reports"],
  log_history: ["reports"],
};

const expandLegacyPermissions = (permissions = []) => {
  const expanded = new Set(permissions);
  permissions.forEach((key) => {
    const mapped = LEGACY_PERMISSION_ALIASES[key];
    if (mapped) expanded.add(mapped);
  });
  return Array.from(expanded);
};

const toManageableMenuPermissions = (permissions = []) => {
  const manageable = new Set();

  normalizeMenuPermissions(permissions).forEach((permission) => {
    const normalizedPermission = sanitizePermission(permission);
    if (manageableMenuPermissionSet.has(normalizedPermission)) {
      manageable.add(normalizedPermission);
    }

    (LEGACY_TO_HOLYDEEN_PERMISSION_ALIASES[normalizedPermission] || []).forEach(
      (mappedPermission) => manageable.add(mappedPermission),
    );
  });

  return HOLYDEEN_DASHBOARD_MENU_PERMISSIONS.filter((permission) =>
    manageable.has(permission),
  );
};

const sanitizePermission = (permission) => {
  if (typeof permission !== "string") {
    return permission;
  }

  return permission.trim().toLowerCase();
};

const normalizeMenuPermissions = (menuPermissions) => {
  if (Array.isArray(menuPermissions)) {
    if (
      menuPermissions.length === 1 &&
      typeof menuPermissions[0] === "string"
    ) {
      const onlyValue = menuPermissions[0].trim();
      if (onlyValue.startsWith("[") || onlyValue.startsWith("{")) {
        return normalizeMenuPermissions(onlyValue);
      }
    }

    return menuPermissions;
  }

  if (menuPermissions == null || menuPermissions === "") {
    return [];
  }

  if (typeof menuPermissions === "string") {
    try {
      const parsed = JSON.parse(menuPermissions);
      return normalizeMenuPermissions(parsed);
    } catch (error) {
      return [];
    }
  }

  if (typeof menuPermissions === "object") {
    return normalizeMenuPermissions(menuPermissions.menuPermissions);
  }

  return [];
};

const validateRole = (role) => {
  validateRoleName(role);
};

const ensureRoleExists = async (role) => {
  const normalizedRole = validateRoleName(role);
  const record = await RolePermission.findOne({ where: { role: normalizedRole } });
  if (!record && !isBuiltInRole(normalizedRole)) {
    throw new ApiError(400, "Invalid role");
  }
  return record || { role: builtInRoleByKey.get(normalizeRoleKey(normalizedRole)) };
};

const validateMenuPermissions = (menuPermissions) => {
  const normalizedPermissions = expandLegacyPermissions(
    normalizeMenuPermissions(menuPermissions).map(sanitizePermission),
  );

  if (!Array.isArray(normalizedPermissions)) {
    throw new ApiError(400, "menuPermissions must be an array");
  }

  const invalidPermissions = uniq(normalizedPermissions).filter(
    (permission) => !validMenuPermissionSet.has(permission),
  );

  if (invalidPermissions.length) {
    throw new ApiError(
      400,
      `Unknown menu permission(s): ${invalidPermissions.join(", ")}`,
    );
  }

  return uniq(normalizedPermissions);
};

const includeNewSettingsChildren = (role, permissions = []) => {
  const permissionSet = new Set(normalizeMenuPermissions(permissions));
  const defaults = DEFAULT_ROLE_MENU_PERMISSIONS[role] || [];

  if (
    permissionSet.has("settings") &&
    defaults.includes("notice") &&
    !permissionSet.has("notice")
  ) {
    permissionSet.add("notice");
  }

  if (defaults.includes("tasks") && !permissionSet.has("tasks")) {
    permissionSet.add("tasks");
  }

  if (defaults.includes("loan") && !permissionSet.has("loan")) {
    permissionSet.add("loan");
  }

  [
    "cod_change",
    "cod_charge",
    "delivery_advance",
    "delivery_charge",
    "ads_campaign_kpi",
    "auto_profit_loss",
    "stock_alert",
    "cs_work_reports",
    "logistic_work_reports",
    "employee_profile",
    "employee_kpi",
  ].forEach((permission) => {
    if (defaults.includes(permission) && !permissionSet.has(permission)) {
      permissionSet.add(permission);
    }
  });

  return Array.from(permissionSet);
};

const getDefaultPermissionsForRole = (role) => {
  const normalizedRole = validateRoleName(role);
  return uniq(DEFAULT_ROLE_MENU_PERMISSIONS[normalizedRole] || []);
};

const getEffectiveMenuPermissions = async (role) => {
  const normalizedRole = validateRoleName(role);

  const record = await RolePermission.findOne({
    where: { role: normalizedRole },
  });

  if (!record) {
    // Fallback to configured defaults when no explicit role-permission record exists.
    // This keeps the UI navigable out of the box and prevents empty permission sets.
    return validateMenuPermissions(getDefaultPermissionsForRole(normalizedRole));
  }

  const effectivePermissions = validateMenuPermissions(
    includeNewSettingsChildren(normalizedRole, record.menuPermissions || []),
  );

  // Super admin always receives every dashboard capability, including newly
  // introduced menu permissions that may not exist in an older DB record.
  if (normalizeRoleKey(normalizedRole) === normalizeRoleKey(ENUM_USER_ROLE.SUPER_ADMIN)) {
    return uniq([...effectivePermissions, ...HOLYDEEN_DASHBOARD_MENU_PERMISSIONS]);
  }

  return effectivePermissions;
};

const getAllRolePermissions = async () => {
  const records = await RolePermission.findAll({
    order: [["createdAt", "ASC"], ["Id", "ASC"]],
  });

  const recordsByRole = new Map(
    records.map((record) => [normalizeRoleKey(record.role), record]),
  );
  const roleNames = uniq([
    ...builtInRoles,
    ...records.map((record) => record.role),
  ]);

  return Promise.all(
    roleNames.map(async (role) => {
      const record = recordsByRole.get(normalizeRoleKey(role));
      const resolvedRole = record?.role || role;
      return {
        Id: record?.Id,
        role: resolvedRole,
        menuPermissions:
          normalizeRoleKey(resolvedRole) === normalizeRoleKey(ENUM_USER_ROLE.SUPER_ADMIN)
            ? getAvailableMenuPermissions()
            : toManageableMenuPermissions(
                record
                  ? validateMenuPermissions(
                      includeNewSettingsChildren(
                        resolvedRole,
                        record.menuPermissions || [],
                      ),
                    )
                  : await getEffectiveMenuPermissions(resolvedRole),
              ),
        createdAt: record?.createdAt,
        updatedAt: record?.updatedAt,
      };
    }),
  );
};

const getAvailableMenuPermissions = () => HOLYDEEN_DASHBOARD_MENU_PERMISSIONS;

const getRolePermissionByRole = async (role) => {
  const normalizedRole = validateRoleName(role);
  const record = await RolePermission.findOne({ where: { role: normalizedRole } });
  if (!record && !DEFAULT_ROLE_MENU_PERMISSIONS[normalizedRole]) {
    throw new ApiError(404, "Role not found");
  }
  return {
    Id: record?.Id,
    role: normalizedRole,
    menuPermissions:
      normalizeRoleKey(normalizedRole) === normalizeRoleKey(ENUM_USER_ROLE.SUPER_ADMIN)
        ? getAvailableMenuPermissions()
        : toManageableMenuPermissions(await getEffectiveMenuPermissions(normalizedRole)),
  };
};

const updateRolePermissions = async (role, menuPermissions) => {
  const normalizedRole = validateRoleName(role);
  const normalizedPermissions = validateMenuPermissions(menuPermissions);

  await RolePermission.upsert({
    role: normalizedRole,
    menuPermissions: normalizedPermissions,
  });

  return getRolePermissionByRole(normalizedRole);
};

const createRolePermissions = async (payload = {}) => {
  const role = validateRoleName(payload.role);
  const exists = await RolePermission.findOne({ where: { role } });
  if (exists) throw new ApiError(409, "Role already exists");

  const menuPermissions = validateMenuPermissions(payload.menuPermissions || []);
  await RolePermission.create({ role, menuPermissions });
  return getRolePermissionByRole(role);
};

const deleteRolePermissions = async (role) => {
  const normalizedRole = validateRoleName(role);
  if (protectedRoleKeys.has(normalizeRoleKey(normalizedRole))) {
    throw new ApiError(400, "This role cannot be deleted");
  }

  const transaction = await db.sequelize.transaction();
  let reassignedUsers = 0;
  let deleted = 0;

  try {
    if (db.user) {
      const [updatedCount] = await db.user.update(
        { role: ENUM_USER_ROLE.USER },
        {
          where: { role: normalizedRole },
          paranoid: true,
          transaction,
        },
      );
      reassignedUsers = updatedCount;
    }

    deleted = await RolePermission.destroy({
      where: { role: normalizedRole },
      transaction,
    });

    if (!deleted) throw new ApiError(404, "Role not found");

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  if (!deleted) throw new ApiError(404, "Role not found");
  return { deleted: true, reassignedUsers };
};

const hasMenuPermission = (userPermissions = [], requiredPermission) => {
  const alias = LEGACY_PERMISSION_ALIASES[requiredPermission];
  const holydeenAliases = {
    user_management: ["admin_user", "admin_roles", "admin_permissions"],
    cod_change: ["website_setting"],
    cod_charge: ["website_setting"],
    delivery_advance: ["website_setting"],
    delivery_charge: ["website_setting"],
  };

  return (
    userPermissions.includes(requiredPermission) ||
    (alias ? userPermissions.includes(alias) : false) ||
    (holydeenAliases[requiredPermission] || []).some((permission) =>
      userPermissions.includes(permission),
    ) ||
    // Also allow legacy keys to satisfy the canonical permission check.
    (requiredPermission === "department_designation" &&
      (userPermissions.includes("department_management") ||
        userPermissions.includes("designation_management"))) ||
    userPermissions.includes("*") ||
    requiredPermission === "*"
  );
};

module.exports = {
  getAllRolePermissions,
  getRolePermissionByRole,
  createRolePermissions,
  updateRolePermissions,
  deleteRolePermissions,
  getEffectiveMenuPermissions,
  getDefaultPermissionsForRole,
  getAvailableMenuPermissions,
  validateMenuPermissions,
  validateRole,
  validateRoleName,
  ensureRoleExists,
  isValidRole,
  hasMenuPermission,
};
