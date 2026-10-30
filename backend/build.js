
const fs = require("fs");
const path = require("path");

const frontendDir = path.resolve(
  __dirname,
  "../lets-talk-english-site"
);

const publicDir = path.join(__dirname, "public");

if (!fs.existsSync(frontendDir)) {
  console.error("Frontend directory not found:", frontendDir);
  process.exit(1);
}

fs.mkdirSync(publicDir, { recursive: true });

fs.cpSync(frontendDir, publicDir, {
  recursive: true,
  force: true
});

console.log("Frontend successfully copied to backend/public");
