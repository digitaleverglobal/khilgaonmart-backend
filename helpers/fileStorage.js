const fs = require("fs");
const path = require("path");

// Uploaded images/PDFs are stored on disk and served from /images.
// In production point UPLOAD_DIR outside the deployed app folder, or files
// are lost on the next deploy.
// Relative values resolve from the project root (next to server.js), not cwd.
const UPLOAD_DIR = path.resolve(__dirname, "..", process.env.UPLOAD_DIR || "images");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Writes `buffer` as UPLOAD_DIR/<name> and returns the stored name.
const saveFile = async (buffer, name) => {
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), buffer);
  return name;
};

module.exports = {
  UPLOAD_DIR,
  saveFile,
};
