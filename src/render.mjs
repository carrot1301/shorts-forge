import fs from "node:fs";
import path from "node:path";
import platform from "./platform.cjs";
import { approvedStock } from "./stock.mjs";
const { repo, read, write, sha, digest, command } = platform;
export function wrap(text, limit = 30) {
  if (text.length <= limit) return text;
  const tok = text.split(" ");
  let best = 1,
    score = Infinity;
  for (let i = 1; i < tok.length; i++) {
    const a = tok.slice(0, i).join(" ").length,
      b = tok.slice(i).join(" ").length,
      s = Math.max(a, b) * 2 + Math.abs(a - b);
    if (s < score) {
      score = s;
      best = i;
    }
  }
  return tok.slice(0, best).join(" ") + "\\N" + tok.slice(best).join(" ");
}
const time = (t) => {
  const cs = Math.round(t * 100);
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};
export function captionsASS(cues) {
  return (
    `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Be Vietnam Pro,58,&H00FFFFFF,&H00FFFFFF,&H00201009,&H00000000,0,0,0,0,100,100,0,0,1,2.2,0,5,85,85,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` +
    cues
      .map(
        (c) =>
          `Dialogue: 0,${time(c.start)},${time(c.end)},Default,,0,0,0,,{\\pos(540,1590)}${wrap(c.text.replaceAll("\\", "").replaceAll("{", "").replaceAll("}", ""))}\n`,
      )
      .join("")
  );
}
export async function render(directory) {
  const root = path.resolve(directory),
    qc = path.join(root, "qc"),
    e = read(path.join(root, "release/episode.json")),
    prov = read(path.join(root, "release/captions/provenance.json")),
    audio = path.join(root, "release/audio/voice.wav"),
    voiceHash = sha(audio),
    episodeHash = sha(path.join(root, "release/episode.json"));
  if (
    voiceHash !== prov.voice_sha256 ||
    episodeHash !== prov.episode_sha256 ||
    sha(path.join(root, "release/captions/video_vi.srt")) !== prov.srt_sha256
  )
    throw Error("Caption provenance invalid; regenerate captions");
  const lock = path.join(root, ".render.lock");
  let fd;
  try {
    fd = fs.openSync(lock, "wx");
  } catch {
    throw Error(
      "Render already active, or stale .render.lock; verify process stopped before removing it.",
    );
  }
  fs.writeFileSync(fd, String(process.pid));
  fs.closeSync(fd);
  try {
    const stock = approvedStock(root),
      chunks = [],
      modelReceipts = [];
    let frameAt = 0;
    const run = (args) => command("ffmpeg", args, { cwd: qc });
    fs.mkdirSync(path.join(qc, "fonts"), { recursive: true });
    for (const f of ["BeVietnamPro-Regular.ttf", "BeVietnamPro-Bold.ttf"])
      fs.copyFileSync(path.join(repo, "public", f), path.join(qc, "fonts", f));
    for (let i = 0; i < e.parts.length; i++) {
      const p = e.parts[i],
        end =
          i === e.parts.length - 1
            ? e.durationInFrames
            : Math.round(p.end * 30),
        frames = end - frameAt;
      const png = path.join(qc, p.id + "-plate.png");
      let clip = path.join(repo, "cache/models", p.model + ".mp4");
      const selected = stock.find((s) => s.scene_id === p.id);
      if (selected) {
        clip = path.join(qc, p.id + "-stock-panel.mp4");
        const textFile = p.id + "-credit.txt";
        fs.writeFileSync(
          path.join(qc, textFile),
          `${selected.label} · ${selected.source.author.name} / ${selected.source.provider}`,
        );
        await run([
          "-y",
          "-v",
          "error",
          "-i",
          selected.file,
          "-an",
          "-vf",
          `scale=920:610:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=920:610:(ow-iw)/2:(oh-ih)/2:color=0x101e34,drawbox=x=0:y=0:w=iw:h=50:color=0x101e34@0.92:t=fill,drawtext=fontfile=fonts/BeVietnamPro-Regular.ttf:textfile=${textFile}:expansion=none:fontsize=16:fontcolor=white:x=12:y=15,tpad=stop_mode=clone:stop_duration=2`,
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "19",
          "-pix_fmt",
          "yuv420p",
          clip,
        ]);
      } else {
        const receipt = read(clip + ".json");
        if (receipt.sha256 !== sha(clip)) throw Error("3D clip hash changed");
        modelReceipts.push({ model: p.model, sha256: receipt.sha256 });
      }
      const file = p.id + "-visual.mp4",
        output = path.join(qc, file),
        cache = output + ".json",
        signature = digest(
          [sha(png), sha(clip), frames, sha(new URL(import.meta.url))].join(
            "|",
          ),
        );
      chunks.push(file);
      if (
        !fs.existsSync(output) ||
        !fs.existsSync(cache) ||
        read(cache).signature !== signature ||
        read(cache).sha256 !== sha(output)
      ) {
        await run([
          "-y",
          "-v",
          "error",
          "-loop",
          "1",
          "-framerate",
          "30",
          "-i",
          png,
          ...(selected ? [] : ["-stream_loop", "-1"]),
          "-i",
          clip,
          "-filter_complex",
          "[0:v][1:v]overlay=x=80:y=560:shortest=1,format=yuv420p[v]",
          "-map",
          "[v]",
          "-an",
          "-frames:v",
          String(frames),
          "-r",
          "30",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "19",
          "-threads",
          "4",
          "-color_range",
          "tv",
          output,
        ]);
        write(cache, { signature, sha256: sha(output) });
      }
      frameAt = end;
      console.log(p.id, frames, "frames");
    }
    fs.writeFileSync(
      path.join(qc, "concat.txt"),
      chunks.map((f) => `file '${f}'`).join("\n"),
    );
    await run([
      "-y",
      "-v",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "concat.txt",
      "-c:v",
      "copy",
      "visual.mp4",
    ]);
    fs.writeFileSync(
      path.join(qc, "captions.ass"),
      captionsASS(read(path.join(root, "release/captions/cues.json"))),
    );
    const output = path.join(root, "delivery/video.mp4"),
      temp = path.join(root, "delivery/video.partial.mp4");
    await run([
      "-y",
      "-v",
      "error",
      "-i",
      "visual.mp4",
      "-i",
      audio,
      "-vf",
      "subtitles=filename=captions.ass:fontsdir=fonts,format=yuv420p",
      "-af",
      `apad=whole_dur=${e.render_duration}`,
      "-t",
      String(e.render_duration),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "19",
      "-threads",
      "4",
      "-r",
      "30",
      "-color_range",
      "tv",
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      temp,
    ]);
    fs.renameSync(temp, output);
    for (const ext of ["srt", "vtt"])
      fs.copyFileSync(
        path.join(root, "release/captions/video_vi." + ext),
        path.join(root, "delivery", "captions." + ext),
      );
    write(path.join(root, "delivery/timeline.json"), e);
    write(path.join(qc, "render-provenance.json"), {
      rendered_at: new Date().toISOString(),
      episode_sha256: episodeHash,
      voice_sha256: voiceHash,
      srt_sha256: prov.srt_sha256,
      output_sha256: sha(output),
      frame_count: frameAt,
      models: modelReceipts,
      stock: stock.map((s) => ({
        scene: s.scene_id,
        sha256: s.clip_sha256,
        source_url: s.source.url,
        credit: s.source.author,
        provider: s.source.provider,
      })),
      renderer_sha256: sha(new URL(import.meta.url)),
    });
    fs.writeFileSync(
      path.join(root, "delivery/credits.md"),
      "# Credits\n\nOriginal concept geometry and layout: Shorts Forge, based on DNT PC LAB.\nFont: Be Vietnam Pro (SIL OFL). Narration: " +
        (e.voice || "imported audio") +
        ".\n\n" +
        stock
          .map(
            (s) =>
              `- ${s.source.author.name} / ${s.source.provider}: ${s.source.url}\n  License: ${s.rights.license_url}`,
          )
          .join("\n") +
        "\n",
    );
    console.log("Rendered", output);
    return output;
  } finally {
    fs.unlinkSync(lock);
  }
}
