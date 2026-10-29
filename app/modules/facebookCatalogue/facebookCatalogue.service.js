const db = require("../../../models");

const stripHtml = (value) => String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const cdata = (value) => `<![CDATA[${String(value || "").replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
const xmlText = (value) => String(value || "").replace(/[<>&'"]/g, (char) => ({
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "'": "&apos;",
  '"': "&quot;",
}[char]));

const parseImages = (images) => {
  if (!images) return [];
  if (Array.isArray(images)) return images;
  if (typeof images === "string") {
    try {
      const parsed = JSON.parse(images);
      return Array.isArray(parsed) ? parsed : [images];
    } catch {
      return [images];
    }
  }
  return [];
};

const buildAssetUrl = (value, backendBase) => {
  const image = String(value || "").trim();
  if (!image || image.startsWith("data:")) return null;
  if (/^https?:\/\//i.test(image)) return image;
  if (image.startsWith("/")) return `${backendBase}${image}`;
  return `${backendBase}/images/${image}`;
};

const generateFeed = async () => {
  const products = await db.product.findAll({
    where: { status: "Active" },
    paranoid: true,
    order: [["Id", "ASC"]],
    include: [{ model: db.variation, as: "variations", required: false }],
  });

  const FRONTEND_BASE = (process.env.ORIGIN_URL || process.env.FRONTEND_URL || "https://yourdomain.com").replace(/\/$/, "");
  const BACKEND_BASE = (process.env.BACKEND_URL || process.env.API_URL || process.env.BASE_URL || process.env.ORIGIN_URL || "https://holydeen.com").replace(/\/$/, "");

  const items = products.map((p) => {
    const plain = p.get({ plain: true });
    const firstVariation = plain.variations?.[0];
    const weight = firstVariation?.weight ? `${firstVariation.weight} ${firstVariation.unit || "g"}` : null;
    const stock = Number(firstVariation?.stock ?? firstVariation?.quantity ?? plain.quantity ?? 0);
    const availability = plain.status === "Active" && stock !== 0 ? "in stock" : "out of stock";
    const salePrice = Number(firstVariation?.newPrice || plain.sale_price || 0);
    const oldPrice = Number(firstVariation?.oldPrice || 0);
    const regularPrice = oldPrice > salePrice && salePrice > 0 ? oldPrice : salePrice || oldPrice;
    const imageLink = buildAssetUrl(parseImages(plain.images)[0] || plain.file || plain.image, BACKEND_BASE);
    const description = stripHtml(plain.shortDescription || plain.description || plain.note || plain.name);
    const sku = plain.sku || firstVariation?.sku || `WZ-${plain.Id}`;

    return `
    <item>
      <g:id>${plain.Id}</g:id>
      <g:title>${cdata(plain.name)}</g:title>
      <g:description>${cdata(description || plain.name)}</g:description>
      <g:link>${xmlText(`${FRONTEND_BASE}/product/${plain.slug ? `${encodeURIComponent(plain.slug)}-` : ""}${plain.Id}`)}</g:link>
      ${imageLink ? `<g:image_link>${xmlText(imageLink)}</g:image_link>` : ""}
      <g:condition>new</g:condition>
      <g:availability>${availability}</g:availability>
      <g:price>${regularPrice.toFixed(2)} BDT</g:price>${oldPrice > salePrice && salePrice > 0 ? `\n      <g:sale_price>${salePrice.toFixed(2)} BDT</g:sale_price>` : ""}
      <g:sku>${xmlText(sku)}</g:sku>
      <g:brand>${cdata(process.env.STORE_NAME || "Kafela Mart")}</g:brand>${weight ? `\n      <g:shipping_weight>${xmlText(weight)}</g:shipping_weight>` : ""}
    </item>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Product Catalogue</title>
    <link>${FRONTEND_BASE}</link>
    <description>Product feed for Facebook Catalogue</description>
    <language>en-us</language>
    ${items}
  </channel>
</rss>`;

  return { xml, count: products.length };
};

module.exports = { generateFeed };
