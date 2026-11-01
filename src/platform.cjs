const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawn, spawnSync } = require("node:child_process");
const repo = path.resolve(__dirname, "..");
const read = (f) =>
  JSON.parse(fs.readFileSync(f, "utf8").replace(/^\uFEFF/, ""));
function write(f, data) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(data, null, 2) + "\n");
}
const sha = (f) =>
  crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const digest = (s) => crypto.createHash("sha256").update(s).digest("hex");
function command(exe, args, { cwd, maxBuffer = 100e6 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let chunks = [],
      err = "",
      bytes = 0;
    p.stdout.on("data", (d) => {
      bytes += d.length;
      if (bytes > maxBuffer) p.kill();
      else chunks.push(d);
    });
    p.stderr.on("data", (d) => {
      if (err.length < 8e6) err += d;
    });
    p.on("error", () =>
      reject(Error(`${exe} is unavailable. Run npm run doctor.`)),
    );
    p.on("close", (c) =>
      c === 0
        ? resolve({ stdout: Buffer.concat(chunks), stderr: err })
        : reject(Error(`${exe} failed (${c}). ${err.slice(-4000)}`)),
    );
  });
}
function browserPath() {
  const { chromium } = require("playwright");
  const requested = process.env.SHORTS_FORGE_BROWSER;
  if (requested) {
    if (!fs.existsSync(requested))
      throw Error("SHORTS_FORGE_BROWSER does not exist");
    return requested;
  }
  const candidates = [
    chromium.executablePath(),
    process.platform === "win32" &&
      path.join(
        process.env.PROGRAMFILES || "C:/Program Files",
        "Google/Chrome/Application/chrome.exe",
      ),
    process.platform === "win32" &&
      path.join(
        process.env["PROGRAMFILES(X86)"] || "C:/Program Files (x86)",
        "Microsoft/Edge/Application/msedge.exe",
      ),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  const found = candidates.find((f) => fs.existsSync(f));
  if (!found)
    throw Error("Chromium missing. Run: npx playwright install chromium");
  return found;
}
const probe = async (f) =>
  JSON.parse(
    (
      await command("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        f,
      ])
    ).stdout.toString(),
  );
function loadEnv() {
  const f = path.join(repo, ".env");
  if (fs.existsSync(f)) process.loadEnvFile(f);
}
function relativeFile(root, relative) {
  if (
    typeof relative !== "string" ||
    !relative.trim() ||
    path.isAbsolute(relative)
  )
    throw Error("Use a project-relative input path");
  const result = path.resolve(root, relative),
    base = path.resolve(root);
  if (!result.startsWith(base + path.sep))
    throw Error("Input path escapes project directory");
  return result;
}
function present(exe) {
  return (
    spawnSync(exe, ["-version"], { windowsHide: true, stdio: "ignore" })
      .status === 0
  );
}
module.exports = {
  repo,
  read,
  write,
  sha,
  digest,
  command,
  browserPath,
  probe,
  loadEnv,
  relativeFile,
  present,
};
