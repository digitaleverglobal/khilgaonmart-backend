const esc = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const fmtCurrency = (value) => {
  const n = Number(value) || 0;
  return (
    "৳" +
    n.toLocaleString("en", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
};

const fmtNum = (value) => (Number(value) || 0).toLocaleString();

const thStyle =
  'style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#475569;background:#f8fafc;border-bottom:2px solid #e2e8f0;"';

const sectionTitle = (title) =>
  `<h3 style="margin:0 0 10px;font-size:14px;font-weight:700;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:6px;">${esc(title)}</h3>`;

const profitLossInvoiceTemplate = ({
  companyName = process.env.MAIL_BRAND_NAME || "Business Solution",
  reportTitle = "Profit & Loss Invoice",
  reportDate = "",
  invoiceNumber = "",
  salesType = "",
  selectedProducts = [],
  employeeReports = [],
  calculationSummary = {},
  savedHistory = [],
  supportEmail = process.env.MAIL_SUPPORT_EMAIL || process.env.MAIL_FROM_EMAIL || "",
}) => {
  const {
    totalCost = 0,
    totalRevenue = 0,
    revenue = 0,
    grossProfit = 0,
    marketingCost = 0,
    otherCost = 0,
    returnRate = 0,
    returnDeduction = 0,
    finalProfit = 0,
  } = calculationSummary;

  const finalProfitColor =
    (Number(finalProfit) || 0) >= 0 ? "#059669" : "#dc2626";

  // ── Product variants section (used by Daily Profit & Loss By Product) ───
  const productSection =
    selectedProducts.length > 0
      ? (() => {
          const rows = selectedProducts
            .map((p) => {
              const profitColor =
                (Number(p.profit) || 0) >= 0 ? "#059669" : "#dc2626";
              return `<tr>
                <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;">${esc(p.name)}</td>
                <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;">${esc(p.sku)}</td>
                <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;">${fmtNum(p.unitsSold)}</td>
                <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-weight:700;">${fmtCurrency(p.totalCost)}</td>
                <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-weight:700;">${fmtCurrency(p.totalRevenue)}</td>
                <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-weight:700;color:${profitColor};">${fmtCurrency(p.profit)}</td>
              </tr>`;
            })
            .join("");
          return `
      ${sectionTitle("Product Variants")}
      <div style="overflow-x:auto;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;min-width:560px;">
          <thead><tr>
            <th ${thStyle}>Product</th>
            <th ${thStyle}>SKU</th>
            <th ${thStyle}>Units Sold</th>
            <th ${thStyle}>Total Purchase</th>
            <th ${thStyle}>Total Sale</th>
            <th ${thStyle}>Profit/Loss</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
        })()
      : "";

  // ── Employee reports section (used by Daily Profit & Loss By User) ───────
  const employeeSection =
    employeeReports.length > 0
      ? (() => {
          const rows = employeeReports
            .map(
              (r) => `<tr>
                <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">${esc(r.reportDate)}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-weight:600;">${esc(r.name)}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#64748b;">${esc(r.failed)}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#64748b;">${esc(r.pending)}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#64748b;">${esc(r.inbox)}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#64748b;">${esc(r.call)}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#64748b;">${esc(r.whatsapp)}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-weight:700;">${fmtNum(r.totalAssign)}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-weight:700;">${fmtNum(r.totalOrder)}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-weight:700;">${fmtCurrency(r.totalAmount)}</td>
              </tr>`,
            )
            .join("");
          return `
      ${sectionTitle("Employee Reports")}
      <div style="overflow-x:auto;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;min-width:720px;">
          <thead><tr>
            <th ${thStyle}>Date</th>
            <th ${thStyle}>Name</th>
            <th ${thStyle}>Failed</th>
            <th ${thStyle}>Pending</th>
            <th ${thStyle}>Inbox</th>
            <th ${thStyle}>Call</th>
            <th ${thStyle}>WhatsApp</th>
            <th ${thStyle}>Assign</th>
            <th ${thStyle}>Order</th>
            <th ${thStyle}>Amount</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
        })()
      : "";

  // ── Calculation breakdown ────────────────────────────────────────────────
  const effectiveTotalRevenue = Number(totalRevenue) || Number(revenue) || 0;
  const breakdownSection = `
      ${sectionTitle("Calculation Breakdown")}
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#475569;font-size:13px;">Gross Profit</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:700;font-size:13px;">${fmtCurrency(grossProfit)}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#475569;font-size:13px;">Return (${(Number(returnRate) || 0).toFixed(2)}%)</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:700;font-size:13px;">${fmtCurrency(returnDeduction)}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#475569;font-size:13px;">Marketing Spends</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:700;font-size:13px;">${fmtCurrency(marketingCost)}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#475569;font-size:13px;">Other Expenses</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:700;font-size:13px;">${fmtCurrency(otherCost)}</td>
        </tr>
        ${
          Number(totalCost) > 0
            ? `
        <tr>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#475569;font-size:13px;">Total Purchase</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:700;font-size:13px;">${fmtCurrency(totalCost)}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#475569;font-size:13px;">Total Sale</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:700;font-size:13px;">${fmtCurrency(effectiveTotalRevenue)}</td>
        </tr>`
            : `
        <tr>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;color:#475569;font-size:13px;">Total Revenue</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:700;font-size:13px;" colspan="3">${fmtCurrency(effectiveTotalRevenue)}</td>
        </tr>`
        }
        <tr style="background:#f8fafc;">
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-weight:700;font-size:13px;" colspan="2">Net Profit / Loss</td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-weight:700;font-size:15px;color:${finalProfitColor};" colspan="2">${fmtCurrency(finalProfit)}</td>
        </tr>
      </table>`;

  // ── Saved history table ──────────────────────────────────────────────────
  const isUserMode =
    savedHistory.length > 0 && savedHistory[0].purchase === undefined;
  const historyRows =
    savedHistory.length > 0
      ? savedHistory
          .map((hr) => {
            const plColor =
              (Number(hr.profitLoss) || 0) >= 0 ? "#059669" : "#dc2626";
            if (isUserMode) {
              return `<tr>
                <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;">${esc(hr.date)}</td>
                <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;">${esc(hr.salesType)}</td>
                <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-weight:700;">${fmtCurrency(hr.revenue)}</td>
                <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-weight:700;">${fmtCurrency(hr.return)}</td>
                <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-weight:700;">${fmtCurrency(hr.cost)}</td>
                <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-weight:700;color:${plColor};">${fmtCurrency(hr.profitLoss)}</td>
              </tr>`;
            }
            return `<tr>
              <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;">${esc(hr.date)}</td>
              <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;">${esc(hr.salesType)}</td>
              <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;">${fmtNum(hr.products)}</td>
              <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-weight:700;">${fmtCurrency(hr.purchase)}</td>
              <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-weight:700;">${fmtCurrency(hr.revenue)}</td>
              <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-weight:700;">${fmtCurrency(hr.return)}</td>
              <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-weight:700;">${fmtCurrency(hr.cost)}</td>
              <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-weight:700;color:${plColor};">${fmtCurrency(hr.profitLoss)}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="${isUserMode ? 6 : 8}" style="padding:16px;text-align:center;color:#94a3b8;">কোনো saved history নেই</td></tr>`;

  const historySection = `
      ${sectionTitle("Saved Profit/Loss History")}
      <div style="overflow-x:auto;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;min-width:${isUserMode ? 480 : 600}px;">
          <thead><tr>
            <th ${thStyle}>Date</th>
            <th ${thStyle}>Sales Type</th>
            ${isUserMode ? "" : `<th ${thStyle}>Products</th><th ${thStyle}>Purchase</th>`}
            <th ${thStyle}>Sale</th>
            <th ${thStyle}>Return</th>
            <th ${thStyle}>Cost</th>
            <th ${thStyle}>Profit/Loss</th>
          </tr></thead>
          <tbody>${historyRows}</tbody>
        </table>
      </div>`;

  return `
<div style="margin:0;padding:24px;background:#f4f7fb;font-family:Arial,sans-serif;">
  <div style="max-width:700px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">

    <div style="padding:22px 24px;background:linear-gradient(135deg,#0f172a,#1d4ed8);">
      <h2 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${esc(companyName)}</h2>
      <p style="margin:6px 0 0;color:#dbeafe;font-size:13px;">${esc(reportTitle)}</p>
    </div>

    <div style="padding:24px;">

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin-bottom:20px;">
        ${invoiceNumber ? `<p style="margin:0 0 6px;color:#0f172a;font-size:13px;"><strong>Invoice No:</strong> ${esc(invoiceNumber)}</p>` : ""}
        ${reportDate ? `<p style="margin:0 0 6px;color:#0f172a;font-size:13px;"><strong>Date:</strong> ${esc(reportDate)}</p>` : ""}
        ${salesType ? `<p style="margin:0;color:#0f172a;font-size:13px;"><strong>Sales Type:</strong> ${esc(salesType)}</p>` : ""}
      </div>

      ${productSection}
      ${employeeSection}
      ${breakdownSection}
      ${historySection}

      <p style="margin:18px 0 0;color:#4b5563;font-size:13px;line-height:1.7;">
        If you have any questions, please contact us at
        <a href="mailto:${esc(supportEmail)}" style="color:#1d4ed8;text-decoration:none;">${esc(supportEmail)}</a>.
      </p>
    </div>

    <div style="padding:14px 24px;border-top:1px solid #e5e7eb;background:#f9fafb;">
      <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">
        This is an automated message from ${esc(companyName)}.
      </p>
    </div>
  </div>
</div>
  `;
};

module.exports = profitLossInvoiceTemplate;
