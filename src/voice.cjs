const fs = require("fs"),
  path = require("path"),
  crypto = require("crypto"),
  { spawnSync } = require("child_process");
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const root = path.resolve(process.argv[2]),
  parts = JSON.parse(
    fs.readFileSync(path.join(root, "release/script.json"), "utf8"),
  );
const settings =
  JSON.parse(fs.readFileSync(path.join(root, "project.json"), "utf8"))
    .narration || {};
const voiceName = settings.voice || "vi-VN-NamMinhNeural",
  rate = settings.rate || "+15%";
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8e6,
  });
  if (r.status !== 0) throw Error(r.stderr || r.error);
  return r.stdout;
};
const escape = (t) =>
  t.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
function timestamp() {
  const d = new Date();
  return `${d.toUTCString().slice(0, 3)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")} ${d.getUTCFullYear()} ${d.toISOString().slice(11, 19)} GMT+0000 (Coordinated Universal Time)Z`;
}
async function main() {
  let at = 0;
  const allWords = [],
    timeline = [],
    files = [];
  for (const [index, p] of parts.entries()) {
    const dir = path.join(root, "release/audio", p.id);
    fs.mkdirSync(dir, { recursive: true });
    const marker = path.join(dir, "complete.sha256"),
      signature = hash(p.text + "|" + voiceName + "|" + rate + "|v=2");
    if (
      !fs.existsSync(marker) ||
      fs.readFileSync(marker, "utf8") !== signature
    ) {
      let done = false;
      for (let attempt = 1; attempt <= 24 && !done; attempt++) {
        const t = new MsEdgeTTS({
          connectionTimeoutMs: 10000,
          synthesisTimeoutMs: 25000,
        });
        let timer;
        try {
          await t.setMetadata(
            voiceName,
            OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
            { wordBoundaryEnabled: true, sentenceBoundaryEnabled: false },
          );
          const send = t._send.bind(t);
          t._send = (message, ...rest) =>
            send(
              message.includes("Path:ssml")
                ? message.replace(
                    "Path:ssml",
                    `X-Timestamp:${timestamp()}\r\nPath:ssml`,
                  )
                : message,
              ...rest,
            );
          const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${voiceName.slice(0, 5)}'><voice name='${voiceName}'><prosody pitch='+0Hz' rate='${rate}' volume='+0%'>${escape(p.text)}</prosody></voice></speak>`;
          await Promise.race([
            t.rawToFile(dir, ssml),
            new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(Error("TTS hard deadline")),
                40000,
              );
            }),
          ]);
          const meta = JSON.parse(
            fs.readFileSync(path.join(dir, "metadata.json"), "utf8"),
          );
          if (!meta.Metadata.some((m) => m.Type === "WordBoundary"))
            throw Error("Missing actual word boundaries");
          fs.writeFileSync(marker, signature);
          done = true;
        } catch (e) {
          console.log(p.id, "retry", attempt, e.message);
          if (attempt === 24) throw e;
          await new Promise((resolve) => setTimeout(resolve, 3000));
        } finally {
          clearTimeout(timer);
          t.close();
        }
      }
    }
    const boundaries = JSON.parse(
      fs.readFileSync(path.join(dir, "metadata.json"), "utf8"),
    ).Metadata.filter((m) => m.Type === "WordBoundary");
    const raw = path.join(dir, "raw.wav");
    run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-i",
      path.join(dir, "audio.mp3"),
      "-ar",
      "48000",
      "-ac",
      "1",
      raw,
    ]);
    const first = boundaries[0].Data.Offset / 1e7,
      last =
        (boundaries.at(-1).Data.Offset + boundaries.at(-1).Data.Duration) / 1e7;
    const rawDuration = Number(
      run("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nw=1:nk=1",
        raw,
      ]),
    );
    if (last > rawDuration + 0.08)
      throw Error("TTS metadata exceeds actual audio");
    // Keep 60ms before the first spoken word and 140ms after the last, preserving fluent pacing.
    const trimStart = Math.max(0, first - 0.06),
      trimEnd = Math.min(rawDuration, last + 0.14);
    const wav = path.join(dir, "voice.wav");
    run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-i",
      raw,
      "-af",
      `atrim=start=${trimStart}:end=${trimEnd},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.015,afade=t=out:st=${Math.max(0, trimEnd - trimStart - 0.025)}:d=0.025`,
      "-ar",
      "48000",
      "-ac",
      "1",
      wav,
    ]);
    const duration = Number(
      run("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nw=1:nk=1",
        wav,
      ]),
    );
    const words = boundaries.map((m) => ({
      text: m.Data.text.Text,
      start: at + m.Data.Offset / 1e7 - trimStart,
      end: at + (m.Data.Offset + m.Data.Duration) / 1e7 - trimStart,
      scene: p.id,
    }));
    allWords.push(...words);
    timeline.push({ ...p, start: at, end: at + duration, words });
    files.push(wav);
    at += duration;
    console.log(
      `${index + 1}/${parts.length}`,
      p.id,
      duration.toFixed(3) + "s",
    );
  }
  if (at <= 0 || at > 180)
    throw Error("Narration must be >0 and <=180 seconds; actual " + at);
  const list = path.join(root, "release/audio/concat.txt");
  fs.writeFileSync(
    list,
    files.map((f) => `file '${f.replaceAll("\\", "/")}'`).join("\n"),
  );
  const joined = path.join(root, "release/audio/voice-joined.wav");
  run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-c:a",
    "pcm_s16le",
    joined,
  ]);
  const voice = path.join(root, "release/audio/voice.wav");
  // Two pass loudness normalization, preserving the exact timing of this PCM timeline.
  const analysis = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      joined,
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", windowsHide: true, maxBuffer: 8e6 },
  );
  if (analysis.status !== 0) throw Error(analysis.stderr);
  const stats = JSON.parse(analysis.stderr.match(/\{[\s\S]*\}/)[0]);
  run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    joined,
    "-af",
    `loudnorm=I=-16:TP=-1.5:LRA=7:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`,
    "-ar",
    "48000",
    "-ac",
    "1",
    voice,
  ]);
  fs.writeFileSync(
    path.join(root, "release/audio/loudness-pass1.json"),
    JSON.stringify(stats, null, 2),
  );
  fs.writeFileSync(
    path.join(root, "release/audio/words.json"),
    JSON.stringify(allWords, null, 2),
  );
  const release = {
    title: JSON.parse(fs.readFileSync(path.join(root, "meta.json"), "utf8"))
      .title,
    fps: 30,
    width: 1080,
    height: 1920,
    voice: voiceName,
    rate,
    duration: at,
    durationInFrames: Math.ceil(at * 30) + 6,
    parts: timeline,
    words: allWords,
    script_sha256: hash(JSON.stringify(parts)),
    voice_sha256: hash(fs.readFileSync(voice)),
  };
  fs.writeFileSync(
    path.join(root, "release/episode.json"),
    JSON.stringify(release, null, 2),
  );
  fs.writeFileSync(
    path.join(root, "remotion/src/release-data.json"),
    JSON.stringify(release, null, 2),
  );
  fs.copyFileSync(voice, path.join(root, "remotion/public/release/voice.wav"));
  console.log("VOICE COMPLETE", at.toFixed(3) + "s");
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
