import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import platform from "./platform.cjs";
const { read, write, sha, command, probe } = platform;
export async function qc(directory) {
  const root = path.resolve(directory);
  assert(
    !fs.existsSync(path.join(root, ".render.lock")),
    "Rendering still active. Wait before QC.",
  );
  const output = path.join(root, "delivery/video.mp4"),
    e = read(path.join(root, "release/episode.json")),
    prov = read(path.join(root, "qc/render-provenance.json")),
    cues = read(path.join(root, "release/captions/cues.json")),
    voice = path.join(root, "release/audio/voice.wav");
  assert.equal(sha(output), prov.output_sha256, "Video changed after render");
  assert.equal(sha(voice), prov.voice_sha256);
  assert.equal(
    sha(path.join(root, "release/episode.json")),
    prov.episode_sha256,
  );
  const m = await probe(output),
    v = m.streams.find((s) => s.codec_type === "video"),
    a = m.streams.find((s) => s.codec_type === "audio");
  assert(
    v.width === 1080 &&
      v.height === 1920 &&
      v.codec_name === "h264" &&
      v.pix_fmt === "yuv420p" &&
      v.color_range === "tv" &&
      v.avg_frame_rate === "30/1",
    "Unexpected video format",
  );
  assert(
    a.codec_name === "aac" && a.sample_rate === "48000",
    "Unexpected audio",
  );
  assert.equal(Number(v.nb_frames), e.durationInFrames);
  assert(Math.abs(Number(v.duration) - e.render_duration) < 0.04);
  assert(Math.abs(Number(a.duration) - e.render_duration) < 0.05);
  let end = 0;
  for (const c of cues) {
    assert(
      c.start >= end - 0.001 && c.end > c.start && c.end <= e.duration + 0.01,
      "Caption alignment invalid",
    );
    end = c.end;
  }
  const decoded = await command("ffmpeg", [
    "-hide_banner",
    "-i",
    output,
    "-vf",
    "blackdetect=d=0.15:pix_th=0.02:pic_th=0.98",
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json",
    "-f",
    "null",
    "-",
  ]);
  assert(
    !/error|invalid|corrupt|black_start:/i.test(decoded.stderr),
    "Decode or black frame issue",
  );
  const loud = JSON.parse(
    decoded.stderr.match(/\{[^{}]*"input_i"[\s\S]*?\}/)[0],
  );
  assert(
    Math.abs(Number(loud.input_i) + 16) < 1 && Number(loud.input_tp) <= -0.9,
    "Loudness outside -16 ±1 LUFS / peak limits",
  );
  const [src, aac] = await Promise.all([
    command("ffmpeg", [
      "-v",
      "error",
      "-i",
      voice,
      "-ar",
      "8000",
      "-ac",
      "1",
      "-f",
      "s16le",
      "pipe:1",
    ]),
    command("ffmpeg", [
      "-v",
      "error",
      "-i",
      output,
      "-vn",
      "-ar",
      "8000",
      "-ac",
      "1",
      "-f",
      "s16le",
      "pipe:1",
    ]),
  ]);
  let dot = 0,
    aa = 0,
    bb = 0;
  assert(aac.stdout.length >= src.stdout.length, "Audio truncated");
  for (let i = 0; i < src.stdout.length; i += 2) {
    const x = src.stdout.readInt16LE(i),
      y = aac.stdout.readInt16LE(i);
    dot += x * y;
    aa += x * x;
    bb += y * y;
  }
  const correlation = dot / Math.sqrt(aa * bb);
  assert(correlation > 0.97, "Narration not aligned with exported AAC");
  const select = cues
      .map((c) => `eq(n\\,${Math.round((c.start + c.end) * 15)})`)
      .join("+"),
    raw = await command("ffmpeg", [
      "-v",
      "error",
      "-i",
      output,
      "-vf",
      `select=${select},crop=1080:230:0:1475`,
      "-fps_mode",
      "vfr",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ]);
  const stride = 1080 * 230 * 3;
  assert.equal(
    raw.stdout.length,
    stride * cues.length,
    "Cue sample count differs",
  );
  const bounds = [];
  for (let i = 0; i < cues.length; i++) {
    let x1 = 1080,
      x2 = -1,
      y1 = 230,
      y2 = -1;
    for (let y = 0; y < 230; y++)
      for (let x = 0; x < 1080; x++) {
        const j = i * stride + (y * 1080 + x) * 3;
        if (
          raw.stdout[j] > 210 &&
          raw.stdout[j + 1] > 210 &&
          raw.stdout[j + 2] > 210
        ) {
          x1 = Math.min(x1, x);
          x2 = Math.max(x2, x);
          y1 = Math.min(y1, y);
          y2 = Math.max(y2, y);
        }
      }
    assert(
      x2 >= 0 && x1 >= 85 && x2 <= 995 && y1 >= 10 && y2 <= 220,
      "Caption overflow: " + (i + 1),
    );
    bounds.push({
      cue: i + 1,
      x: x1,
      y: y1 + 1475,
      width: x2 - x1 + 1,
      height: y2 - y1 + 1,
    });
  }
  write(path.join(root, "qc/caption-bounds.json"), bounds);
  const frames = [];
  for (const p of e.parts) {
    const c = cues.find((c) => c.scene === p.id),
      at = (c.start + c.end) / 2,
      file = path.join(root, "qc", p.id + "-review.png");
    await command("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-ss",
      String(at),
      "-i",
      output,
      "-frames:v",
      "1",
      "-update",
      "1",
      file,
    ]);
    frames.push({
      scene: p.id,
      time: at,
      image: path.relative(root, file).split(path.sep).join("/"),
      sha256: sha(file),
      decision: "needs_review",
      observations: "",
    });
  }
  write(path.join(root, "qc/review.template.json"), {
    output_sha256: sha(output),
    reviewer: "",
    reviewed_at: null,
    decision: "needs_review",
    scenes: frames,
  });
  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  fs.writeFileSync(
    path.join(root, "qc/review.html"),
    `<!doctype html><meta charset="utf-8"><title>Shorts Forge review</title><style>body{background:#091322;color:#edf3ff;font:18px system-ui;padding:24px}img{width:360px;max-width:100%}video{height:600px;max-width:100%}a{color:#4de0bd}section{display:flex;flex-wrap:wrap;gap:24px}article{max-width:380px}</style><h1>Review before publishing</h1><p>Technical checks do not approve claims, pictures or rights. Watch the whole video, including audio. Copy review.template.json to review.json and record actual observations after inspection.</p><video src="../delivery/video.mp4" controls></video><section>${frames.map((f) => `<article><h2>${esc(f.scene)}</h2><img src="${esc(path.basename(f.image))}"><p>${f.time.toFixed(2)} seconds</p></article>`).join("")}</section>`,
  );
  const result = {
    status: "PASS",
    output_sha256: sha(output),
    duration: Number(v.duration),
    frames: Number(v.nb_frames),
    format: "1080x1920 H.264 yuv420p tv-range / AAC 48kHz",
    fps: 30,
    loudness_lufs: Number(loud.input_i),
    true_peak_dbtp: Number(loud.input_tp),
    audio_correlation: correlation,
    captions: cues.length,
    caption_bounds: "PASS",
    full_decode: "PASS",
    black_frames: "NONE",
    stock_clips: prov.stock.length,
    visual_review: "PENDING: inspect qc/review.html and full video",
    checked_at: new Date().toISOString(),
  };
  write(path.join(root, "delivery/qc.json"), result);
  console.log(
    "Technical QC PASS. Visual/editorial review pending:",
    path.join(root, "qc/review.html"),
  );
  return result;
}
export function verifyReview(directory) {
  const root = path.resolve(directory),
    r = read(path.join(root, "qc/review.json")),
    t = read(path.join(root, "qc/review.template.json"));
  assert(
    r.decision === "approve" &&
      r.reviewer &&
      Number.isFinite(Date.parse(r.reviewed_at)),
    "An explicit completed review is required",
  );
  assert.equal(
    r.output_sha256,
    sha(path.join(root, "delivery/video.mp4")),
    "Video changed after review",
  );
  assert.equal(r.scenes.length, t.scenes.length);
  for (const f of t.scenes) {
    const d = r.scenes.find((s) => s.scene === f.scene);
    assert(
      d?.decision === "approve" &&
        d.sha256 === f.sha256 &&
        sha(path.join(root, f.image)) === f.sha256 &&
        d.observations?.trim().length >= 20,
      "Missing or stale scene review: " + f.scene,
    );
  }
  console.log(
    "Explicit visual review record verified. No publishing was performed.",
  );
  return true;
}
