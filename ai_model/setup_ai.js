const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const aiPath = path.join(__dirname);
const venvPath = path.join(aiPath, "venv");

try {
  if (!fs.existsSync(venvPath)) {
    console.log("⚡ Virtual environment not found. Creating...");

    execSync("python -m venv venv", { cwd: aiPath, stdio: "inherit" });

    console.log("⚡ Installing requirements...");
    execSync("venv\\Scripts\\pip install -r requirements.txt", {
      cwd: aiPath,
      stdio: "inherit",
    });
  } else {
    console.log("✅ Virtual environment already exists");
  }

  console.log("🚀 Starting AI server...");
  execSync(
    "venv\\Scripts\\python -m uvicorn main:app --reload --port 8000",
    { cwd: aiPath, stdio: "inherit" }
  );
} catch (err) {
  console.error("❌ AI setup failed", err);
  process.exit(1);
}