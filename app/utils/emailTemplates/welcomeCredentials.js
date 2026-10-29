// utils/emailTemplates/welcomeCredentials.js
const escapeHtml = (s = "") =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const welcomeCredentialsTemplate = ({
  name = "User",
  email,
  password,
  loginUrl = process.env.APP_LOGIN_URL ||
    `${String(process.env.ORIGIN_URL || "").replace(/\/+$/, "")}/login`,
  brandName = process.env.MAIL_BRAND_NAME || "Business Solution",
}) => {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safePassword = escapeHtml(password);
  const safeUrl = escapeHtml(loginUrl);
  const safeBrandName = escapeHtml(brandName);

  return `
  <div style="font-family: Arial, sans-serif; background:#f6f7fb; padding:24px;">
    <div style="max-width:620px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:14px; overflow:hidden;">
      <div style="background:#111827; padding:18px 22px;">
        <h2 style="margin:0; color:#fff; font-size:18px;">${safeBrandName}</h2>
        <p style="margin:6px 0 0; color:#cbd5e1; font-size:13px;">Your account has been created</p>
      </div>

      <div style="padding:22px;">
        <p style="margin:0 0 10px; color:#111827; font-size:14px;">Hi ${safeName},</p>
        <p style="margin:0 0 16px; color:#374151; font-size:14px; line-height:1.6;">
          Your account registration was successful. Below are your login details:
        </p>

        <div style="border:1px solid #e5e7eb; border-radius:12px; padding:14px; background:#f9fafb;">
          <p style="margin:0 0 8px; color:#111827; font-size:14px;"><b>Email:</b> ${safeEmail}</p>
          <p style="margin:0; color:#111827; font-size:14px;"><b>Password:</b> ${safePassword}</p>
        </div>

        <div style="margin-top:18px;">
          <a href="${safeUrl}"
             style="display:inline-block; background:#4f46e5; color:#fff; text-decoration:none; padding:10px 16px; border-radius:10px; font-size:14px;">
             Login Now
          </a>
        </div>

        <p style="margin:18px 0 0; color:#6b7280; font-size:12px; line-height:1.6;">
          Security tip: Please change your password after your first login.
        </p>
      </div>

      <div style="border-top:1px solid #e5e7eb; padding:14px 22px; background:#ffffff;">
        <p style="margin:0; color:#9ca3af; font-size:12px;">
          If you did not request this account, please ignore this email.
        </p>
      </div>
    </div>
  </div>
  `;
};

module.exports = welcomeCredentialsTemplate;
