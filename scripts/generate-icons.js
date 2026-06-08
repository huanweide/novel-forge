// 从 SVG 生成 PWA 所需的 PNG 图标（192px 和 512px）
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const PUBLIC = path.join(__dirname, "..", "public");
const svg = fs.readFileSync(path.join(PUBLIC, "icon.svg"), "utf-8");

async function main() {
  // 192x192
  await sharp(Buffer.from(svg)).resize(192, 192).png().toFile(path.join(PUBLIC, "icon-192.png"));
  console.log("✅ icon-192.png");

  // 512x512
  await sharp(Buffer.from(svg)).resize(512, 512).png().toFile(path.join(PUBLIC, "icon-512.png"));
  console.log("✅ icon-512.png");
}

main().catch((e) => {
  console.error("❌ 图标生成失败:", e.message);
  process.exit(1);
});
