const fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");
const root = path.resolve(process.argv[2]),
  episode = JSON.parse(
    fs.readFileSync(path.join(root, "release/episode.json"), "utf8"),
  );
const source = episode.words.map((w) => ({ ...w })),
  words = [];
// Restore punctuation from the spoken script using character spans, without changing audio timing.
const normalize = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
for (const part of episode.parts) {
  const actual = source.filter((w) => w.scene === part.id);
  if (actual.map((w) => normalize(w.text)).join("") !== normalize(part.text))
    throw Error("Transcript mismatch in " + part.id);
  let at = 0;
  const punctuation = new Map();
  for (const token of part.text.split(/\s+/)) {
    at += normalize(token).length;
    const end = token.match(/[.,?!:;]+$/)?.[0];
    if (end) punctuation.set(at, end);
  }
  at = 0;
  for (const w of actual) {
    at += normalize(w.text).length;
    w.text = w.text.replace(/[.,?!:;]+$/, "") + (punctuation.get(at) || "");
  }
}
const aliases = (
  JSON.parse(fs.readFileSync(path.join(root, "project.json"), "utf8"))
    .caption_aliases || []
).map(([spoken, display]) => ({
  tokens: spoken.toLowerCase().split(" "),
  display,
}));
const clean = (t) => t.toLowerCase().replace(/[.,?!:;“”"']/g, "");
for (let i = 0; i < source.length; ) {
  const alias = aliases.find((a) =>
    a.tokens.every(
      (t, n) =>
        source[i + n] &&
        source[i + n].scene === source[i].scene &&
        clean(source[i + n].text) === t,
    ),
  );
  if (alias) {
    const last = source[i + alias.tokens.length - 1],
      punct = last.text.match(/[.,?!:;]+$/)?.[0] || "";
    words.push({ ...source[i], text: alias.display + punct, end: last.end });
    i += alias.tokens.length;
  } else {
    words.push({ ...source[i] });
    i++;
  }
}
let previous = 0;
for (const w of words) {
  if (
    w.start < previous - 0.001 ||
    w.end <= w.start ||
    w.end > episode.duration + 0.03
  )
    throw Error("Alignment invalid: " + JSON.stringify(w));
  previous = w.end;
}
const cues = [];
let group = [];
function emit() {
  if (group.length)
    cues.push({
      start: group[0].start,
      end: group.at(-1).end + 0.06,
      scene: group[0].scene,
      text: group.map((w) => w.text).join(" "),
      words: group,
    });
  group = [];
}
for (const w of words) {
  if (
    group.length &&
    (group[0].scene !== w.scene ||
      [...group, w].map((x) => x.text).join(" ").length > 57 ||
      w.end - group[0].start > 2.7 ||
      w.start - group.at(-1).end > 0.4)
  )
    emit();
  group.push(w);
  if (/[.!?]$/.test(w.text)) emit();
}
emit();
for (let i = 1; i < cues.length; i++) {
  const current = cues[i],
    prior = cues[i - 1];
  if (
    (current.words.length < 3 || current.end - current.start < 0.55) &&
    current.scene === prior.scene &&
    current.start - prior.words.at(-1).end < 0.25 &&
    !/[.!?]$/.test(prior.text) &&
    prior.text.length + current.text.length < 69
  ) {
    prior.words.push(...current.words);
    prior.text += " " + current.text;
    prior.end = current.end;
    cues.splice(i, 1);
    i--;
  }
}
for (let i = 0; i < cues.length; i++)
  cues[i].end = Math.min(
    cues[i].end,
    cues[i + 1]?.start ?? episode.duration,
    episode.duration,
  );
const time = (t, separator = ",") => {
  const m = Math.round(t * 1000);
  return `${String(Math.floor(m / 3600000)).padStart(2, "0")}:${String(Math.floor(m / 60000) % 60).padStart(2, "0")}:${String(Math.floor(m / 1000) % 60).padStart(2, "0")}${separator}${String(m % 1000).padStart(3, "0")}`;
};
function wrap(text) {
  if (text.length <= 31) return text;
  const tokens = text.split(" ");
  let best = 1,
    score = Infinity;
  for (let i = 1; i < tokens.length; i++) {
    const a = tokens.slice(0, i).join(" ").length,
      b = tokens.slice(i).join(" ").length;
    const n = Math.max(a, b) * 2 + Math.abs(a - b);
    if (n < score) {
      score = n;
      best = i;
    }
  }
  return tokens.slice(0, best).join(" ") + "\n" + tokens.slice(best).join(" ");
}
fs.writeFileSync(
  path.join(root, "release/captions/video_vi.srt"),
  cues
    .map(
      (c, i) =>
        `${i + 1}\n${time(c.start)} --> ${time(c.end)}\n${wrap(c.text)}\n`,
    )
    .join("\n"),
);
fs.writeFileSync(
  path.join(root, "release/captions/video_vi.vtt"),
  "WEBVTT\n\n" +
    cues
      .map(
        (c) =>
          `${time(c.start, ".")} --> ${time(c.end, ".")}\n${wrap(c.text)}\n`,
      )
      .join("\n"),
);
fs.writeFileSync(
  path.join(root, "release/captions/cues.json"),
  JSON.stringify(cues, null, 2),
);
fs.writeFileSync(
  path.join(root, "remotion/src/release-captions.json"),
  JSON.stringify(cues, null, 2),
);
const hash = (file) =>
  crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, file)))
    .digest("hex");
fs.writeFileSync(
  path.join(root, "release/captions/provenance.json"),
  JSON.stringify(
    {
      voice_sha256: hash("release/audio/voice.wav"),
      episode_sha256: hash("release/episode.json"),
      srt_sha256: hash("release/captions/video_vi.srt"),
      cues_sha256: hash("remotion/src/release-captions.json"),
      cues: cues.length,
      source:
        "Actual TTS word offsets after measured per-segment trimming; display aliases preserve full spoken span",
    },
    null,
    2,
  ),
);
console.log(
  "CAPTIONS",
  cues.length,
  "cues,",
  episode.duration.toFixed(3) + "s",
);
