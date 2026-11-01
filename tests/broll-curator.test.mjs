import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import {
  planScript,
  discover,
  build,
  write,
  sha,
  probe,
  validateReview,
  framing,
  fetchRetry,
  stageManifest,
  processClip,
  local,
} from "../src/broll/curate.mjs";

test("end-to-end: HTTP fixture, visual gate, rights, cache, FFmpeg and explicit fallback", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dnt-broll-")),
    work = path.join(root, "work"),
    source = path.join(root, "fixture.mp4");
  const r = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=navy:s=640x360:r=30:d=4",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=4",
      "-vf",
      "drawbox=x=40:y=90:w=140:h=180:color=red:t=fill",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      source,
    ],
    { windowsHide: true },
  );
  assert.equal(r.status, 0);
  const previous = process.env.PEXELS_API_KEY;
  let requests = 0,
    downloads = 0,
    base;
  const server = http.createServer((req, res) => {
    if (req.url === "/file.mp4") {
      downloads++;
      res.setHeader("content-type", "video/mp4");
      res.end(fs.readFileSync(source));
      return;
    }
    requests++;
    assert.equal(req.headers.authorization, "fixture-not-a-real-key");
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        videos: [
          {
            id: 123,
            url: "https://www.pexels.com/video/123/",
            user: {
              name: "Synthetic test fixture",
              url: "https://www.pexels.com/@fixture",
            },
            duration: 4,
            video_files: [
              {
                id: 456,
                width: 640,
                height: 360,
                file_type: "video/mp4",
                link: base + "/file.mp4",
              },
            ],
          },
        ],
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  process.env.PEXELS_API_KEY = "fixture-not-a-real-key";
  const deps = { testMode: true, apiUrl: () => base + "/search" };
  try {
    write(path.join(root, "script.json"), {
      parts: [
        {
          id: "repair",
          start: 0,
          end: 2,
          text: "Kỹ thuật viên kiểm tra máy tính.",
          queries_en: ["computer repair workshop"],
        },
        {
          id: "bench",
          start: 2,
          end: 4,
          text: "Biểu đồ benchmark có nguồn.",
          claim_kind: "benchmark",
        },
      ],
    });
    const plan = planScript(path.join(root, "script.json"), work);
    assert.equal(plan.scenes[0].duration, 2);
    const catalog = await discover(work, deps),
      c = catalog.candidates[0];
    assert.equal(catalog.mode, "fixture");
    assert.equal(c.frames.length, 5);
    assert.equal(requests, 1);
    assert.equal(downloads, 1);
    let manifest = await build(work, deps);
    assert.equal(manifest.entries[0].status, "fallback");
    assert.match(manifest.entries[0].reason, /NO_VISUALLY_APPROVED/);
    const review = {
      scene_id: "repair",
      candidate_id: c.id,
      decision: "approve",
      reviewer: "automated-fixture-test",
      reviewed_at: new Date().toISOString(),
      preview_sha256: c.preview.sha256,
      frames_seen: c.frames.map((f) => f.sha256),
      observations:
        "Synthetic navy frame and red rectangle; this is a test record, never real footage approval.",
      segment: { in: 0.5, out: 2.5 },
      content_kind: "generic_illustration",
      layout: "contain",
      rights: {
        status: "verified",
        checked_at: new Date().toISOString(),
        checked_by: "synthetic-test-only",
        source_page: c.source_url,
        license_url: "https://www.pexels.com/license/",
        terms_url: "https://www.pexels.com/terms-of-service/",
        evidence:
          "Synthetic fixture for exercising the rights gate. Not a real license verification.",
        third_party_clearance: "not_needed",
        third_party_notes:
          "Generated rectangle, not downloaded stock footage; no third-party material in fixture.",
        attribution_required: false,
      },
    };
    assert.throws(
      () =>
        validateReview(plan.scenes[0], c, { ...review, frames_seen: [] }, work),
      /UNSEEN/,
    );
    assert.throws(
      () =>
        validateReview(
          {
            ...plan.scenes[0],
            requires_exact_model: true,
            required_model: "i5-9400F",
          },
          c,
          review,
          work,
        ),
      /EXACT_MODEL/,
    );
    assert.throws(
      () =>
        validateReview(
          plan.scenes[0],
          c,
          {
            ...review,
            content_kind: "exact_model",
            observed_model: "wrong model",
          },
          work,
        ),
      /MODEL_IDENTITY/,
    );
    assert.throws(
      () =>
        validateReview(
          plan.scenes[0],
          c,
          { ...review, rights: { ...review.rights, status: "needs_review" } },
          work,
        ),
      /RIGHTS_NOT/,
    );
    assert.throws(
      () =>
        validateReview(
          plan.scenes[0],
          c,
          { ...review, segment: { in: 3, out: 5 } },
          work,
        ),
      /SEGMENT/,
    );
    write(path.join(work, "reviews.json"), { reviews: [review] });
    manifest = await build(work, deps);
    assert.equal(manifest.entries[0].status, "selected");
    assert.equal(manifest.entries[1].status, "fallback");
    assert.equal(
      manifest.entries[1].reason,
      "BENCHMARK_RETAINS_SOURCED_GRAPHICS",
    );
    const output = probe(path.join(work, manifest.entries[0].clip_path));
    assert.equal(output.streams[0].width, 1080);
    assert.equal(output.streams[0].height, 1920);
    assert.equal(
      output.streams.some((s) => s.codec_type === "audio"),
      false,
    );
    assert.ok(Math.abs(Number(output.format.duration) - 2) < 0.1);
    await discover(work, deps);
    assert.equal(requests, 1);
    assert.equal(downloads, 1, "cached download reused");
    assert.throws(
      () =>
        stageManifest(
          path.join(work, "broll_manifest.json"),
          path.join(root, "public"),
        ),
      /Fixture/,
    );
    const keep = framing(640, 360, {
      layout: "crop",
      subject_bounds: [0, 0, 1, 1],
      bounds_cover_entire_segment: true,
    });
    assert.equal(keep.mode, "contain");
    const cropReview = {
      layout: "crop",
      subject_bounds: [0.1, 0.3, 0.1, 0.3],
      bounds_cover_entire_segment: true,
      segment: { in: 0, out: 0.5 },
    };
    const crop = framing(640, 360, cropReview);
    assert.equal(crop.mode, "crop");
    assert.ok(crop.crop_pixels[0] < 100, "crop follows off-center subject");
    processClip(source, path.join(root, "crop.mp4"), cropReview, 0.5);
    fs.appendFileSync(path.join(work, c.frames[0].path), "changed");
    assert.throws(
      () => validateReview(plan.scenes[0], c, review, work),
      /STALE_FRAMES/,
    );
    assert.throws(() => local(work, "../../escape"), /escapes/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previous === undefined) delete process.env.PEXELS_API_KEY;
    else process.env.PEXELS_API_KEY = previous;
    assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("API failures are bounded, do not leak bodies/headers, honor retry delay", async () => {
  let calls = 0;
  const body = "do-not-log-secret";
  await assert.rejects(
    fetchRetry(
      "https://api.pexels.com",
      {},
      {
        fetcher: async () => {
          calls++;
          return new Response(body, { status: 401 });
        },
      },
    ),
    /^Error: HTTP_401$/,
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    fetchRetry(
      "https://api.pexels.com",
      {},
      {
        fetcher: async () => {
          calls++;
          return new Response(body, {
            status: 429,
            headers: { "retry-after": "100" },
          });
        },
        sleep: async () => assert.fail("must not block 100 seconds"),
      },
    ),
    /HTTP_429/,
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    fetchRetry(
      "https://api.pexels.com",
      {},
      {
        fetcher: async () => {
          calls++;
          return new Response(body, { status: 503 });
        },
        sleep: async () => {},
      },
    ),
    /HTTP_503/,
  );
  assert.equal(calls, 3);
});

test("missing key yields manifest fallback; SRT timestamps and unknown query handling", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dnt-broll-no-key-")),
    previous = process.env.PEXELS_API_KEY;
  delete process.env.PEXELS_API_KEY;
  try {
    fs.writeFileSync(
      path.join(root, "a.srt"),
      "1\n00:00:00,000 --> 00:00:02,500\nCPU máy tính cũ.\n\n2\n00:00:02,500 --> 00:00:04,000\nChủ đề chưa dịch.\n",
    );
    const work = path.join(root, "work"),
      plan = planScript(path.join(root, "a.srt"), work);
    assert.equal(plan.scenes[0].duration, 2.5);
    assert.deepEqual(plan.scenes[1].queries_en, []);
    const c = await discover(work, {
      fetcher: async () => assert.fail("no key: no HTTP"),
    });
    assert.equal(c.candidates.length, 0);
    const m = await build(work);
    assert.match(m.entries[0].reason, /MISSING_KEY/);
    assert.equal(m.entries[1].reason, "ENGLISH_QUERY_REQUIRED");
  } finally {
    if (previous === undefined) delete process.env.PEXELS_API_KEY;
    else process.env.PEXELS_API_KEY = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Pixabay: video normalization, environment key, rights gate and secret-free cache", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dnt-pixabay-")),
    work = path.join(root, "work"),
    source = path.join(root, "local.mp4"),
    old = process.env.PIXABAY_API_KEY;
  let base,
    calls = 0;
  const generated = spawnSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=640x360:d=2:r=30",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    source,
  ]);
  assert.equal(generated.status, 0);
  const server = http.createServer((req, res) => {
    if (req.url === "/video.mp4") {
      res.end(fs.readFileSync(source));
      return;
    }
    calls++;
    const url = new URL(req.url, base);
    assert.equal(url.searchParams.get("key"), "fake-pixabay-fixture");
    assert.equal(req.headers.authorization, undefined);
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        hits: [
          {
            id: 42,
            pageURL: "https://pixabay.com/videos/id-42/",
            user: "LocalTest",
            user_id: 1,
            duration: 2,
            videos: {
              tiny: { url: base + "/video.mp4", width: 640, height: 360 },
            },
          },
        ],
      }),
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  process.env.PIXABAY_API_KEY = "fake-pixabay-fixture";
  const deps = {
    testMode: true,
    provider: "pixabay",
    apiUrl: (url) => base + "/search" + url.search,
  };
  try {
    write(path.join(root, "script.json"), {
      parts: [
        {
          id: "one",
          start: 0,
          end: 1,
          text: "Kiểm tra máy tính.",
          queries_en: ["computer"],
        },
      ],
    });
    planScript(path.join(root, "script.json"), work);
    const catalog = await discover(work, deps),
      c = catalog.candidates[0];
    assert.equal(c.provider, "pixabay");
    assert.equal(c.id, "pixabay-42");
    const review = {
      scene_id: "one",
      candidate_id: c.id,
      decision: "approve",
      reviewer: "fixture-only",
      reviewed_at: new Date().toISOString(),
      preview_sha256: c.preview.sha256,
      frames_seen: c.frames.map((f) => f.sha256),
      observations:
        "Synthetic blue fixture only. This exercises code, never approves actual stock rights.",
      segment: { in: 0, out: 1 },
      content_kind: "generic_illustration",
      layout: "contain",
      rights: {
        status: "verified",
        checked_by: "fixture-only",
        checked_at: new Date().toISOString(),
        source_page: c.source_url,
        license_url: "https://pixabay.com/service/license-summary/",
        terms_url: "https://pixabay.com/service/terms/",
        evidence:
          "Synthetic test record; not a real source-page or license review.",
        third_party_clearance: "not_needed",
        third_party_notes:
          "Generated solid color fixture, no third-party people, logos or works.",
        attribution_required: false,
      },
    };
    validateReview(
      JSON.parse(fs.readFileSync(path.join(work, "plan.json"))).scenes[0],
      c,
      review,
      work,
    );
    write(path.join(work, "reviews.json"), { reviews: [review] });
    const m = await build(work, deps);
    assert.equal(m.entries[0].source.provider, "Pixabay");
    assert.equal(
      m.entries[0].rights.terms_url,
      "https://pixabay.com/service/terms/",
    );
    await discover(work, deps);
    assert.equal(calls, 1);
    const jsonFiles = [
      path.join(work, "candidates.json"),
      path.join(work, "broll_manifest.json"),
      ...fs
        .readdirSync(path.join(work, "cache"))
        .filter((f) => f.endsWith(".json"))
        .map((f) => path.join(work, "cache", f)),
    ];
    for (const f of jsonFiles)
      assert(
        !fs.readFileSync(f, "utf8").includes("fake-pixabay-fixture"),
        "API key leaked into metadata",
      );
  } finally {
    await new Promise((r) => server.close(r));
    if (old === undefined) delete process.env.PIXABAY_API_KEY;
    else process.env.PIXABAY_API_KEY = old;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
