const { ENUM_USER_ROLE } = require("../app/enums/user");

const PRIVILEGED_ROLES = [ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN];
const DEFAULT_DELETE_APPROVAL_NOTE = "Delete requested";

const getPrivilegedRoles = (options = {}) =>
  Array.isArray(options.privilegedRoles) && options.privilegedRoles.length
    ? options.privilegedRoles
    : PRIVILEGED_ROLES;

const isPrivilegedRole = (role, options = {}) =>
  getPrivilegedRoles(options).includes(role);

const sanitizeApprovalNote = (value) => {
  const note = String(value || "").trim();
  return note || null;
};

const getTodayYmd = () => {
  // Prefer BD time for date-based approval rules.
  try {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
};

const normalizeYmd = (value) => String(value || "").slice(0, 10);

const shouldCreateBePending = (payload = {}, options = {}) => {
  const hasDateField =
    options.hasDateField ??
    Object.prototype.hasOwnProperty.call(payload || {}, "date");

  if (!hasDateField) return false;

  const inputDate = normalizeYmd(payload.date);
  // Requirement: for non-privileged users, if "today's date" is not provided
  // (missing/empty) or is not today -> Pending.
  if (!inputDate) return true;
  return inputDate !== getTodayYmd();
};

const applyCreateWorkflow = (payload = {}, user = {}, options = {}) => {
  const privileged = isPrivilegedRole(user.role);
  const nextStatus = privileged
    ? payload.status || "Active"
    : shouldCreateBePending(payload, options)
      ? "Pending"
      : "Active";

  return {
    ...payload,
    // Non-privileged users cannot choose status on create. Only back-dated records become Pending.
    status: nextStatus,
    pendingAction: null,
    approvalNote: null,
    requestedByUserId: privileged ? null : user.Id || null,
  };
};

const applyUpdateWorkflow = (payload = {}, user = {}, options = {}) => {
  if (isPrivilegedRole(user.role, options)) {
    return {
      ...payload,
      status: payload.status || "Active",
      pendingAction: null,
      approvalNote: sanitizeApprovalNote(payload.approvalNote),
      requestedByUserId: null,
    };
  }

  return {
    ...payload,
    status: "Pending",
    pendingAction: "Update",
    approvalNote: sanitizeApprovalNote(payload.approvalNote),
    requestedByUserId: user.Id || null,
  };
};

const ensureDeleteNote = (note) => {
  const sanitized = sanitizeApprovalNote(note);
  return sanitized || DEFAULT_DELETE_APPROVAL_NOTE;
};

const buildDeleteWorkflowPayload = (note, user = {}) => ({
  status: "Pending",
  pendingAction: "Delete",
  approvalNote: ensureDeleteNote(note),
  requestedByUserId: user.Id || null,
});

module.exports = {
  isPrivilegedRole,
  applyCreateWorkflow,
  applyUpdateWorkflow,
  buildDeleteWorkflowPayload,
};
