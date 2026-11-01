const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const {
  repo,
  browserPath,
  sha,
  digest,
  read,
  write,
} = require("./platform.cjs");
const modes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["abstract", "psu", "tiers", "flow", "ssd", "wear", "backup"];
const allowed = new Set([
  "abstract",
  "psu",
  "tiers",
  "flow",
  "ssd",
  "wear",
  "backup",
]);
async function main() {
  for (const m of modes) if (!allowed.has(m)) throw Error("Unknown model");
  const dir = path.join(repo, "cache/models");
  fs.mkdirSync(dir, { recursive: true });
  const signature = digest(
    [
      sha(path.join(repo, "src/models/scene.html")),
      sha(path.join(repo, "public/BeVietnamPro-Bold.ttf")),
      read(path.join(repo, "node_modules/three/package.json")).version,
    ].join("|"),
  );
  const pending = modes.filter((m) => {
    const f = path.join(dir, m + ".mp4"),
      r = f + ".json";
    return (
      !fs.existsSync(f) ||
      !fs.existsSync(r) ||
      read(r).signature !== signature ||
      read(r).sha256 !== sha(f)
    );
  });
  if (!pending.length) {
    console.log("3D models cached");
    return;
  }
  const files = {
    "/": path.join(repo, "src/models/scene.html"),
    "/three.js": path.join(repo, "node_modules/three/build/three.module.js"),
    "/three.core.js": path.join(repo, "node_modules/three/build/three.core.js"),
    "/public/BeVietnamPro-Bold.ttf": path.join(
      repo,
      "public/BeVietnamPro-Bold.ttf",
    ),
  };
  const server = http.createServer((req, res) => {
    const f = files[req.url];
    if (!f) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader(
      "Content-Type",
      f.endsWith(".js")
        ? "application/javascript"
        : f.endsWith(".ttf")
          ? "font/ttf"
          : "text/html",
    );
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: browserPath(),
      headless: true,
      args: ["--enable-unsafe-swiftshader", "--disable-gpu-sandbox"],
    });
    const page = await browser.newPage({
      viewport: { width: 920, height: 610 },
    });
    page.on("pageerror", (e) => console.error("Model page:", e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.ready, { timeout: 60000 });
    for (const mode of pending) {
      const output = path.join(dir, mode + ".mp4"),
        temp = path.join(dir, mode + ".partial.mp4");
      const ff = spawn(
        "ffmpeg",
        [
          "-y",
          "-v",
          "error",
          "-f",
          "image2pipe",
          "-vcodec",
          "png",
          "-framerate",
          "30",
          "-i",
          "pipe:0",
          "-an",
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "18",
          "-pix_fmt",
          "yuv420p",
          "-color_range",
          "tv",
          "-movflags",
          "+faststart",
          temp,
        ],
        { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
      );
      let err = "";
      ff.stderr.on("data", (d) => (err += d));
      const done = new Promise((r, j) => {
        ff.on("error", j);
        ff.on("close", (c) => (c === 0 ? r() : j(Error(err))));
      });
      for (let f = 0; f < 180; f++) {
        const png = Buffer.from(
          await page.evaluate(({ mode, f }) => window.draw(mode, f), {
            mode,
            f,
          }),
          "base64",
        );
        if (f === 45) fs.writeFileSync(path.join(dir, mode + ".png"), png);
        if (!ff.stdin.write(png))
          await new Promise((r) => ff.stdin.once("drain", r));
      }
      ff.stdin.end();
      await done;
      fs.renameSync(temp, output);
      write(output + ".json", {
        signature,
        sha256: sha(output),
        frames: 180,
        fps: 30,
        width: 920,
        height: 610,
        kind: "original concept geometry",
        third_party_footage: false,
      });
      console.log("3D", mode, "complete");
    }
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
