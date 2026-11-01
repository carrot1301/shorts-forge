import fs from "node:fs";
import path from "node:path";
import platform from "./platform.cjs";
const { repo, read, write, relativeFile, digest, sha, command, probe } =
  platform;
export const models = [
  "abstract",
  "psu",
  "tiers",
  "flow",
  "ssd",
  "wear",
  "backup",
];
export function validateProject(p) {
  if (
    p.schema_version !== 1 ||
    typeof p.title !== "string" ||
    !p.title.trim() ||
    !Array.isArray(p.parts) ||
    !p.parts.length
  )
    throw Error("Need schema_version: 1, title and nonempty parts");
  for (const [field, max] of [
    ["brand", 30],
    ["series", 30],
    ["tagline", 60],
  ])
    if (
      p[field] !== undefined &&
      (typeof p[field] !== "string" || p[field].length > max)
    )
      throw Error(field + " is too long");
  const seen = new Set();
  for (const s of p.parts) {
    if (!/^[a-zA-Z0-9_-]+$/.test(s.id) || seen.has(s.id))
      throw Error("Unsafe or duplicate scene id");
    seen.add(s.id);
    for (const k of ["heading", "text"])
      if (typeof s[k] !== "string" || !s[k].trim())
        throw Error("Missing scene " + k);
    if (!models.includes(s.model)) throw Error("Unknown model " + s.model);
    for (const key of ["eyebrow", "sub", "big", "detail", "source"])
      if (s[key] !== undefined && typeof s[key] !== "string")
        throw Error("Expected text field " + key);
    if (s.heading.length > 100 || s.text.length > 6000)
      throw Error("Scene text too long; split it into smaller parts");
  }
  const n = p.narration || {};
  if (!["edge", "import"].includes(n.mode))
    throw Error("narration.mode must be edge or import");
  if (n.voice && !/^[a-z]{2}-[A-Z]{2}-[A-Za-z0-9]+Neural$/.test(n.voice))
    throw Error("Invalid neural voice name");
  if (n.rate && !/^[+-]\d{1,2}%$/.test(n.rate))
    throw Error("Use a rate such as +15%");
  if (n.mode === "import" && (!n.audio || !n.words))
    throw Error("Imported narration needs relative audio and words paths");
  return p;
}
export function initProject(directory, template = "starter") {
  if (!["starter", "demo", "power", "ssd"].includes(template))
    throw Error("Templates: starter, demo, power, ssd");
  const root = path.resolve(directory);
  if (fs.existsSync(root) && fs.readdirSync(root).length)
    throw Error("Destination is not empty; choose another directory");
  fs.mkdirSync(root, { recursive: true });
  fs.cpSync(path.join(repo, "examples", template), root, { recursive: true });
  prepareProject(root);
  return root;
}
export function prepareProject(directory) {
  const root = path.resolve(directory),
    p = validateProject(read(path.join(root, "project.json")));
  for (const d of [
    "release/audio",
    "release/captions",
    "remotion/src",
    "remotion/public/release",
    "qc",
    "delivery",
  ])
    fs.mkdirSync(path.join(root, d), { recursive: true });
  write(path.join(root, "meta.json"), { title: p.title });
  write(
    path.join(root, "release/script.json"),
    p.parts.map((s) => ({
      eyebrow: "",
      sub: "",
      big: "",
      detail: "",
      source: "",
      ...s,
    })),
  );
  return { root, project: p };
}
export function validateWords(words, parts, duration) {
  if (!Array.isArray(words) || !words.length)
    throw Error("Actual aligned word offsets are required");
  const fold = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  let previous = 0;
  for (const w of words) {
    if (
      !Number.isFinite(w.start) ||
      !Number.isFinite(w.end) ||
      w.start < previous - 0.002 ||
      w.end <= w.start ||
      w.end > duration + 0.03 ||
      !parts.some((s) => s.id === w.scene) ||
      typeof w.text !== "string" ||
      !fold(w.text)
    )
      throw Error("Invalid word alignment");
    previous = w.end;
  }
  let lastScene = -1;
  for (const w of words) {
    const i = parts.findIndex((p) => p.id === w.scene);
    if (i < lastScene) throw Error("Word scenes are out of order");
    lastScene = i;
  }
  for (const p of parts)
    if (
      words
        .filter((w) => w.scene === p.id)
        .map((w) => fold(w.text))
        .join("") !== fold(p.text)
    )
      throw Error("Transcript differs from script in " + p.id);
  return true;
}
export async function importVoice(directory) {
  const { root, project: p } = prepareProject(directory),
    n = p.narration,
    audio = relativeFile(root, n.audio),
    words = read(relativeFile(root, n.words));
  const info = await probe(audio),
    duration = Number(info.format.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 180)
    throw Error("Audio must be >0 and <=180 seconds");
  validateWords(words, p.parts, duration);
  const wav = path.join(root, "release/audio/voice.wav");
  const analysis = await command("ffmpeg", [
    "-hide_banner",
    "-i",
    audio,
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json",
    "-f",
    "null",
    "-",
  ]);
  const stats = JSON.parse(
    analysis.stderr.match(/\{[^{}]*"input_i"[\s\S]*?\}/)[0],
  );
  await command("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    audio,
    "-vn",
    "-af",
    `loudnorm=I=-16:TP=-1.5:LRA=7:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`,
    "-ar",
    "48000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    wav,
  ]);
  const parts = p.parts.map((part, i) => {
    const own = words.filter((w) => w.scene === part.id);
    return {
      ...part,
      start: i === 0 ? 0 : own[0].start,
      end:
        i === p.parts.length - 1
          ? duration
          : words.find((w) => w.scene === p.parts[i + 1].id).start,
      words: own,
    };
  });
  write(path.join(root, "release/episode.json"), {
    title: p.title,
    fps: 30,
    width: 1080,
    height: 1920,
    voice: "imported narration",
    rate: "unchanged",
    duration,
    parts,
    words,
    script_sha256: digest(
      JSON.stringify(read(path.join(root, "release/script.json"))),
    ),
    voice_sha256: sha(wav),
    alignment_source:
      "User-supplied actual word offsets, transcript verified; no estimated timing",
  });
}
export function finalize(directory) {
  const { root, project: p } = prepareProject(directory),
    file = path.join(root, "release/episode.json"),
    e = read(file);
  if (
    e.script_sha256 !==
    digest(JSON.stringify(read(path.join(root, "release/script.json"))))
  )
    throw Error("Script changed. Regenerate or import narration.");
  validateWords(e.words, p.parts, e.duration);
  e.parts = e.parts.map((part, i) => ({ ...part, ...p.parts[i] }));
  e.brand = p.brand || "YOUR CHANNEL";
  e.series = p.series || "SHORTS FORGE";
  e.number = String(p.number || 1).padStart(2, "0");
  e.tagline = p.tagline || "TỪ Ý TƯỞNG ĐẾN VIDEO";
  e.render_duration = Math.ceil((e.duration + 1) * 30) / 30;
  e.durationInFrames = Math.round(e.render_duration * 30);
  write(file, e);
  write(path.join(root, "remotion/src/release-data.json"), e);
  return e;
}
