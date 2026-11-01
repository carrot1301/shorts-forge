import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { validateReview, local, sha, probe } from "./broll/curate.mjs";
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
export function approvedStock(root) {
  const work = path.join(root, "broll"),
    manifestFile = path.join(work, "broll_manifest.json");
  if (!fs.existsSync(manifestFile)) return [];
  const manifest = read(manifestFile),
    planFile = path.join(work, "plan.json"),
    plan = read(planFile),
    catalog = read(path.join(work, "candidates.json")),
    reviews = fs.existsSync(path.join(work, "reviews.json"))
      ? read(path.join(work, "reviews.json")).reviews
      : [],
    episode = read(path.join(root, "release/episode.json"));
  assert.notEqual(
    catalog.mode,
    "fixture",
    "Fixture footage cannot enter production",
  );
  assert.notEqual(manifest.discovery_mode, "fixture");
  assert.equal(
    manifest.script_sha256,
    sha(path.join(root, "release/episode.json")),
    "Narration timeline changed; re-plan stock",
  );
  assert.equal(plan.script_sha256, manifest.script_sha256);
  assert.equal(manifest.plan_sha256, sha(planFile), "Stock plan changed");
  assert.equal(catalog.plan_sha256, manifest.plan_sha256);
  assert.equal(manifest.entries.length, plan.scenes.length);
  const entries = [];
  for (const e of manifest.entries) {
    const s = plan.scenes.find((s) => s.id === e.scene_id),
      part = episode.parts.find((p) => p.id === e.scene_id);
    assert(s && part, "Stock scene must match a narration scene");
    assert.deepEqual(e.timeline, {
      start: s.start,
      end: s.end,
      duration: s.duration,
    });
    assert(
      Math.abs(part.start - s.start) < 0.001 &&
        Math.abs(part.end - s.end) < 0.001,
      "Stock must cover the whole scene; split script parts for shorter cuts",
    );
    if (e.status === "fallback") continue;
    assert.equal(e.status, "selected");
    assert.notEqual(s.claim_kind, "benchmark");
    const c = catalog.candidates.find(
        (c) => c.scene_id === s.id && c.id === e.source.id,
      ),
      r = reviews.find(
        (r) =>
          r.scene_id === s.id &&
          r.candidate_id === e.source.id &&
          r.decision === "approve",
      );
    assert(c && r, "Missing review evidence");
    validateReview(s, c, r, work);
    assert.deepEqual(e.visual_review, r);
    assert.deepEqual(e.rights, r.rights);
    assert.equal(e.source.url, c.source_url);
    assert.equal(
      e.source.provider,
      c.provider === "pixabay" ? "Pixabay" : "Pexels",
    );
    assert.equal(
      e.source.source_sha256,
      sha(local(work, `cache/${c.id}-${c.full_file.id}.mp4`)),
    );
    const clip = local(work, e.clip_path);
    assert.equal(sha(clip), e.clip_sha256, "Stock clip changed");
    const info = probe(clip);
    assert(
      !info.streams.some((s) => s.codec_type === "audio") &&
        info.streams.some((s) => s.width === 1080 && s.height === 1920),
      "Stock clip must be silent portrait prepared media",
    );
    assert(
      Math.abs(Number(info.format.duration) - s.duration) < 0.12,
      "Stock clip duration changed",
    );
    entries.push({ ...e, file: clip });
  }
  return entries;
}
