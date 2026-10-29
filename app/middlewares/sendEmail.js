const nodemailer = require("nodemailer");
const path = require("path");

const sendEmail = async ({ to, subject, htmlContent, filePath = null }) => {
  const smtpPort = Number(process.env.SMTP_PORT || 465);
  const smtpSecure =
    String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";
  const smtpUser = process.env.SMTP_USER || "info@wporderplus.com";
  const fromEmail = process.env.MAIL_FROM_EMAIL || smtpUser;
  const fromName = process.env.MAIL_FROM_NAME || "Business Solution";

  if (!process.env.SMTP_PASS) {
    console.error("❌ Email error: SMTP_PASS is not configured.");
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.hostinger.com",
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: to,
    subject: subject,
    html: htmlContent,
    attachments: filePath
      ? [{ filename: path.basename(filePath), path: filePath }]
      : [],
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    if (info.accepted.length > 0) {
      console.log("✅ Email successfully sent to:", info.accepted.join(", "));
      return true;
    } else {
      console.log("❌ Email sending failed.");
      return false;
    }
  } catch (error) {
    const isRateLimited =
      error?.responseCode === 451 ||
      String(error?.response || error?.message || "")
        .toLowerCase()
        .includes("ratelimit");

    if (isRateLimited) {
      console.warn(
        `⚠️ Email not sent to ${to}: SMTP rate limit exceeded. Try again later or increase provider limit.`,
      );
    } else {
      console.error("❌ Email error:", error?.message || error);
    }
    return false;
  }
};

module.exports = sendEmail;
