const BACKDATED_PENDING_APPROVAL_MESSAGE =
  "Backdated entry is awaiting approval. Please contact your administrator.";

const getTodayYmd = () => {
  try {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
  } catch (error) {
    return new Date().toISOString().slice(0, 10);
  }
};

const normalizeYmd = (value) => String(value || "").slice(0, 10);

const resolveApprovalNotificationMessage = ({
  status,
  note,
  date,
  approvedMessage,
  fallbackMessage,
}) => {
  const normalizedStatus = String(status || "").trim();
  const normalizedNote = String(note || "").trim();
  const normalizedDate = normalizeYmd(date);

  if (normalizedStatus === "Approved") {
    return approvedMessage;
  }

  if (normalizedStatus === "Pending" && normalizedDate) {
    return normalizedDate !== getTodayYmd()
      ? BACKDATED_PENDING_APPROVAL_MESSAGE
      : normalizedNote || fallbackMessage;
  }

  return normalizedNote || fallbackMessage;
};

module.exports = {
  BACKDATED_PENDING_APPROVAL_MESSAGE,
  resolveApprovalNotificationMessage,
};
