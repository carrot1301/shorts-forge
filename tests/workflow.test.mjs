import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  validateWords,
  validateProject,
  initProject,
  finalize,
} from "../src/project.mjs";
import { captionsASS } from "../src/render.mjs";
import platform from "../src/platform.cjs";
import { approvedStock } from "../src/stock.mjs";
const { repo, read, write, relativeFile, sha } = platform;
test("imported offsets require exact transcript and monotonically ordered real word spans", () => {
  const p = [{ id: "one", text: "Xin chào!" }];
  assert.equal(
    validateWords(
      [
        { text: "Xin", start: 0, end: 0.2, scene: "one" },
        { text: "chào", start: 0.21, end: 0.5, scene: "one" },
      ],
      p,
      1,
    ),
    true,
  );
  assert.throws(
    () =>
      validateWords([{ text: "khác", start: 0, end: 0.2, scene: "one" }], p, 1),
    /Transcript differs/,
  );
  assert.throws(
    () =>
      validateWords(
        [
          { text: "Xin", start: 0, end: 0.4, scene: "one" },
          { text: "chào", start: 0.2, end: 0.5, scene: "one" },
        ],
        p,
        1,
      ),
    /alignment/,
  );
});
test("project-relative media paths cannot escape and scene IDs cannot become commands or paths", () => {
  assert.throws(() => relativeFile(os.tmpdir(), "../outside"), /escapes/);
  const p = read(path.join(repo, "examples/demo/project.json"));
  assert.equal(validateProject(p), p);
  assert.throws(
    () =>
      validateProject({ ...p, parts: [{ ...p.parts[0], id: "../unsafe" }] }),
    /Unsafe/,
  );
  assert.throws(
    () => validateProject({ ...p, narration: { mode: "edge", rate: "fast" } }),
    /rate/,
  );
});
test("ASS caption text cannot inject formatting or forced new lines", () => {
  const s = captionsASS([
    { start: 0, end: 1, text: "Hello {\\pos(0,0)} world" },
  ]);
  assert(!s.includes("{\\pos(0,0)}"));
  assert(s.includes("{\\pos(540,1590)}"));
});
test("template init refuses an existing directory, produces independent portable files, validates imported demo", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shorts-forge-"));
  try {
    const root = path.join(tmp, "project");
    initProject(root, "demo");
    const p = read(path.join(root, "project.json")),
      w = read(path.join(root, "words.json"));
    validateWords(w, p.parts, 9);
    assert.throws(() => initProject(root, "demo"), /not empty/);
    assert(fs.existsSync(path.join(root, "narration.flac")));
    assert(!JSON.stringify(p).includes("F:"));
  } finally {
    assert(path.resolve(tmp).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test("stock integration permits explicit fallback without reviews, rejects fixture mode and stale timeline", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shorts-forge-gate-"));
  try {
    const scene = { id: "hook", start: 0, end: 1, duration: 1 };
    const episode = path.join(root, "release/episode.json"),
      work = path.join(root, "broll");
    write(episode, { parts: [scene] });
    write(path.join(work, "plan.json"), {
      script_sha256: sha(episode),
      scenes: [scene],
    });
    const planHash = sha(path.join(work, "plan.json"));
    write(path.join(work, "candidates.json"), {
      mode: "offline_missing_key",
      plan_sha256: planHash,
      candidates: [],
    });
    write(path.join(work, "broll_manifest.json"), {
      script_sha256: sha(episode),
      plan_sha256: planHash,
      discovery_mode: "offline_missing_key",
      entries: [
        {
          scene_id: "hook",
          timeline: { start: 0, end: 1, duration: 1 },
          status: "fallback",
        },
      ],
    });
    assert.deepEqual(approvedStock(root), []);
    const catalog = read(path.join(work, "candidates.json"));
    write(path.join(work, "candidates.json"), { ...catalog, mode: "fixture" });
    assert.throws(() => approvedStock(root), /Fixture/);
    write(path.join(work, "candidates.json"), catalog);
    write(episode, { parts: [{ ...scene, end: 2 }] });
    assert.throws(() => approvedStock(root), /timeline changed/);
  } finally {
    assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
