/**
 * One-time migration: move base64 image data URIs stored in the database
 * (site settings logo/favicon/footer images, category images, ...) to
 * files in UPLOAD_DIR and replace them with the file name. New saves are converted by helpers/inlineImages.js.
 *
 * Original values of every changed row are written to a backup JSON file
 * before anything is updated.
 *
 * Usage:
 *   node tools/migrateInlineImages.js --dry-run   # report only
 *   node tools/migrateInlineImages.js             # save files + update rows
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const db = require("../models");
const { replaceInlineImages } = require("../helpers/inlineImages");

const dryRun = process.argv.includes("--dry-run");

const TARGETS = [
  { model: "siteSetting", columns: ["data"] },
  { model: "category", columns: ["imageFile", "image", "bannerImage"] },
  { model: "subcategory", columns: ["imageFile", "image", "bannerImage"] },
  { model: "brand", columns: ["logo", "image", "imageFile"] },
  { model: "landingPage", columns: ["headerLogo", "footerLogo", "logo", "image", "imageFile", "bannerImage"] },
];

const parseJson = (value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const byteLength = (value) =>
  Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value ?? null));

async function main() {
  const backup = [];
  const updates = [];

  for (const { model, columns } of TARGETS) {
    const Model = db[model];
    if (!Model) continue;
    const present = columns.filter((column) => Model.rawAttributes[column]);
    if (!present.length) continue;

    const rows = await Model.findAll({ attributes: ["Id", ...present], paranoid: false });
    for (const row of rows) {
      const original = row.get({ plain: true });
      const cache = new Map();
      const changes = {};
      for (const column of present) {
        const value = original[column];
        if (value == null || !JSON.stringify(value).includes("data:image/")) continue;
        const converted = await (dryRun ? Promise.resolve(null) : replaceInlineImages(parseJson(value), cache));
        changes[column] = { before: byteLength(value), after: dryRun ? null : byteLength(converted), converted };
      }
      if (!Object.keys(changes).length) continue;
      backup.push({ model, Id: original.Id, values: Object.fromEntries(Object.keys(changes).map((c) => [c, original[c]])) });
      updates.push({ Model, model, Id: original.Id, changes });
    }
  }

  for (const { model, Id, changes } of updates) {
    for (const [column, { before, after }] of Object.entries(changes)) {
      const fmt = (n) => `${(n / 1024).toFixed(1)} KB`;
      console.log(`${model}#${Id}.${column}: ${fmt(before)}${after == null ? "" : ` -> ${fmt(after)}`}`);
    }
  }
  if (!updates.length) {
    console.log("No inline images found.");
    return;
  }
  if (dryRun) {
    console.log(`\n${updates.length} row(s) would be updated. Run without --dry-run to migrate.`);
    return;
  }

  const backupFile = path.resolve(`inline-images-backup-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backup));
  console.log(`\nBackup of original values: ${backupFile}`);

  for (const { Model, Id, changes } of updates) {
    const values = Object.fromEntries(Object.entries(changes).map(([c, { converted }]) => [c, converted]));
    await Model.update(values, { where: { Id }, paranoid: false });
  }
  console.log(`Updated ${updates.length} row(s).`);
}

db.sequelize
  .authenticate()
  .then(main)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
