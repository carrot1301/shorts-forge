#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import platform from "../src/platform.cjs";
import {
  initProject,
  prepareProject,
  importVoice,
  finalize,
} from "../src/project.mjs";
const { repo, read, command, loadEnv, browserPath, present } = platform;
loadEnv();
const args = process.argv.slice(2),
  cmd = args.shift(),
  positionals = [],
  opts = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    if (!args[i + 1] || args[i + 1].startsWith("--"))
      throw Error("Missing option value");
    opts[args[i].slice(2)] = args[++i];
  } else positionals.push(args[i]);
}
const runFile = (f, argv = []) =>
  command(process.execPath, [path.join(repo, "src", f), ...argv]).then((r) => {
    if (r.stdout.length) process.stdout.write(r.stdout);
  });
async function voice(root) {
  const { project } = prepareProject(root);
  if (project.narration.mode === "import") await importVoice(root);
  else await runFile("voice.cjs", [root]);
  finalize(root);
  await runFile("captions.cjs", [root]);
}
async function build(root) {
  await voice(root);
  const e = read(path.join(root, "release/episode.json"));
  await runFile("models.cjs", [...new Set(e.parts.map((p) => p.model))]);
  await runFile("plates.mjs", [root]);
  const { render } = await import("../src/render.mjs");
  await render(root);
  const { qc } = await import("../src/qc.mjs");
  await qc(root);
}
async function main() {
  if (!cmd || ["help", "--help", "-h"].includes(cmd)) {
    console.log(
      `Shorts Forge — script to narrated vertical video\n\n  npm run forge -- init projects/my-short --template starter\n  npm run forge -- build projects/my-short\n  npm run demo\n\nCommands: doctor, init, voice, models, plates, render, build, qc, review, verify\nTemplates: starter, demo (offline), power, ssd\n\nStock: npm run forge -- broll plan|discover|build projects/my-short [--provider pixabay|pexels]\nGenerated projects, cache and API keys stay local. See README.md.`,
    );
    return;
  }
  if (cmd === "doctor") {
    let browser = false;
    try {
      browser = !!browserPath();
    } catch {}
    const data = {
      node: process.version,
      ffmpeg: present("ffmpeg"),
      ffprobe: present("ffprobe"),
      chromium: browser,
      pixabay_key_present: !!process.env.PIXABAY_API_KEY,
      pexels_key_present: !!process.env.PEXELS_API_KEY,
    };
    console.log(JSON.stringify(data, null, 2));
    if (!data.ffmpeg || !data.ffprobe || !data.chromium) {
      console.log("See README setup. Browser: npx playwright install chromium");
      process.exitCode = 1;
    }
    return;
  }
  if (cmd === "init") {
    if (!positionals[0])
      throw Error("Usage: init projects/name --template starter");
    const root = initProject(positionals[0], opts.template || "starter");
    console.log("Created", root, "— edit project.json, then run build.");
    return;
  }
  if (cmd === "demo") {
    const root = path.resolve(opts.out || path.join(repo, "projects/demo"));
    if (!fs.existsSync(path.join(root, "project.json")))
      initProject(root, "demo");
    await build(root);
    return;
  }
  if (cmd === "broll") {
    const sub = positionals[0],
      root = path.resolve(positionals[1] || "");
    if (!positionals[1])
      throw Error("Usage: broll plan|discover|build projects/name");
    const { main: broll } = await import("../src/broll/curate.mjs");
    const work = path.join(root, "broll");
    if (sub === "plan")
      await broll([
        "plan",
        "--script",
        path.join(root, "release/episode.json"),
        "--out",
        work,
      ]);
    else if (sub === "discover")
      await broll([
        "discover",
        "--work",
        work,
        "--provider",
        opts.provider || "pixabay",
      ]);
    else if (sub === "build") await broll(["build", "--work", work]);
    else throw Error("B-roll commands: plan, discover, build");
    return;
  }
  if (!positionals[0]) throw Error("Specify a project directory");
  const root = path.resolve(positionals[0]);
  if (cmd === "build") {
    await build(root);
    return;
  }
  if (cmd === "voice") {
    await voice(root);
    return;
  }
  if (cmd === "models") {
    const { project } = prepareProject(root);
    await runFile("models.cjs", [
      ...new Set(project.parts.map((p) => p.model)),
    ]);
    return;
  }
  if (cmd === "plates") {
    await runFile("plates.mjs", [root]);
    return;
  }
  if (cmd === "render") {
    const { render } = await import("../src/render.mjs");
    await render(root);
    return;
  }
  if (cmd === "qc" || cmd === "review") {
    const { qc } = await import("../src/qc.mjs");
    await qc(root);
    return;
  }
  if (cmd === "verify") {
    const { verifyReview } = await import("../src/qc.mjs");
    verifyReview(root);
    return;
  }
  throw Error("Unknown command. Run npm run forge -- help");
}
main().catch((e) => {
  console.error("Shorts Forge:", e.message);
  process.exitCode = 1;
});
