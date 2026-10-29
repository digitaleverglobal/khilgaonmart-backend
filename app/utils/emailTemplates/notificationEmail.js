const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const notificationEmailTemplate = ({
  brandName = process.env.MAIL_BRAND_NAME || "Business Solution",
  name = "User",
  message = "",
  url = "",
}) => {
  const appUrl = String(process.env.ORIGIN_URL || "").replace(/\/+$/, "");
  const safeUrl = /^https?:\/\//i.test(url)
    ? url
    : `${appUrl}${String(url || "").startsWith("/") ? url : `/${url}`}`;

  return `
  <div style="font-family:Arial,sans-serif;background:#f6f7fb;padding:24px;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
      <div style="background:#111827;padding:18px 22px;">
        <h2 style="margin:0;color:#ffffff;font-size:18px;">${escapeHtml(brandName)}</h2>
        <p style="margin:6px 0 0;color:#cbd5e1;font-size:13px;">New notification</p>
      </div>

      <div style="padding:22px;">
        <p style="margin:0 0 10px;color:#111827;font-size:14px;">Hi ${escapeHtml(name)},</p>
        <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
          ${escapeHtml(message)}
        </p>

        ${
          appUrl && url
            ? `<a href="${escapeHtml(safeUrl)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:10px;font-size:14px;">View Notification</a>`
            : ""
        }

        <p style="margin:18px 0 0;color:#6b7280;font-size:12px;line-height:1.6;">
          You can also see this notification after logging in to the website.
        </p>
      </div>
    </div>
  </div>`;
};

module.exports = notificationEmailTemplate;
