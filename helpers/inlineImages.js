const crypto = require("crypto");
const { saveFile } = require("./fileStorage");

// The admin panel reads image inputs with FileReader.readAsDataURL and sends
// them as base64 strings. Stored as-is they bloat every public API response
// (a single category image was 3 MB), so they are saved to disk and only the
// file name is kept in the database.

const EXTENSION_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
  // /images serves SVGs with a sandbox CSP (server.js), so scripts can't run.
  "image/svg+xml": ".svg",
};

const MIME_ALTERNATION = Object.keys(EXTENSION_BY_MIME)
  .map((mime) => mime.replace(/[.+]/g, "\\$&"))
  .join("|");

// A value that is exactly one data URI (an image field).
const WHOLE_DATA_URI = new RegExp(`^data:(${MIME_ALTERNATION});base64,[A-Za-z0-9+/=\\s]+$`, "i");
// Data URIs embedded in larger text, e.g. <img src="data:..."> in rich-text HTML.
const EMBEDDED_DATA_URI = new RegExp(`data:(${MIME_ALTERNATION});base64,[A-Za-z0-9+/=]+`, "gi");

const isInlineImage = (value) => typeof value === "string" && WHOLE_DATA_URI.test(value);

// Returns the bare "<uuid>.<ext>" name, the same form multer uploads store.
const storeDataUri = (dataUri, mime) => {
  const name = `${crypto.randomUUID()}${EXTENSION_BY_MIME[mime.toLowerCase()]}`;
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1).replace(/\s/g, "");
  return saveFile(Buffer.from(base64, "base64"), name);
};

const uploadOnce = (dataUri, mime, cache) => {
  if (!cache.has(dataUri)) cache.set(dataUri, storeDataUri(dataUri, mime));
  return cache.get(dataUri);
};

const replaceInString = async (value, cache) => {
  if (!value.includes("data:image/")) return value;

  const whole = value.match(WHOLE_DATA_URI);
  if (whole) return uploadOnce(value, whole[1], cache);

  const matches = [...value.matchAll(EMBEDDED_DATA_URI)];
  if (!matches.length) return value;
  // Inside HTML a bare name would not resolve, so use the /images path.
  const names = await Promise.all(matches.map((m) => uploadOnce(m[0], m[1], cache)));
  let index = 0;
  return value.replace(EMBEDDED_DATA_URI, () => `/images/${names[index++]}`);
};

/**
 * Deep-walks `value` and returns a copy where every base64 image data URI —
 * whole field values or ones embedded in HTML — is saved to disk and replaced
 * by its file name. Identical images inside one call are saved once.
 */
const replaceInlineImages = async (value, cache = new Map()) => {
  if (typeof value === "string") return replaceInString(value, cache);
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => replaceInlineImages(item, cache)));
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, item]) => [key, await replaceInlineImages(item, cache)]),
    );
    return Object.fromEntries(entries);
  }
  return value;
};

// Express middleware for JSON write routes that may receive inline images.
const inlineImagesToFiles = (req, res, next) => {
  if (!req.body || typeof req.body !== "object") return next();
  replaceInlineImages(req.body)
    .then((body) => {
      req.body = body;
      next();
    })
    .catch(next);
};

module.exports = {
  isInlineImage,
  replaceInlineImages,
  inlineImagesToFiles,
};
