import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const API = "https://api.pexels.com/v1/videos/";
const LICENSE = "https://www.pexels.com/license/";
const TERMS = "https://www.pexels.com/terms-of-service/";
const PROVIDERS = {
  pexels: {
    name: "Pexels",
    url: "https://www.pexels.com",
    license: LICENSE,
    terms: TERMS,
    env: "PEXELS_API_KEY",
  },
  pixabay: {
    name: "Pixabay",
    url: "https://pixabay.com",
    license: "https://pixabay.com/service/license-summary/",
    terms: "https://pixabay.com/service/terms/",
    env: "PIXABAY_API_KEY",
  },
};
function providerFor(name = "pexels") {
  assert(PROVIDERS[name], "Unknown provider");
  return PROVIDERS[name];
}
function sourcePage(s, provider = "pexels") {
  if (provider === "pexels") return pexelsPage(s);
  try {
    const u = new URL(s);
    return (
      u.protocol === "https:" &&
      u.hostname === "pixabay.com" &&
      u.pathname.startsWith("/videos/")
    );
  } catch {
    return false;
  }
}
function normalizePixabay(result) {
  assert(Array.isArray(result.hits), "Malformed Pixabay response");
  return {
    videos: result.hits.map((v) => ({
      id: v.id,
      url: v.pageURL,
      duration: v.duration,
      user: {
        name: v.user,
        url: `https://pixabay.com/users/${encodeURIComponent(v.user)}-${v.user_id}/`,
      },
      video_files: Object.values(v.videos)
        .filter((f) => f.url)
        .map((f, i) => ({
          ...f,
          id: v.id * 10 + i,
          file_type: "video/mp4",
          link: f.url,
        })),
    })),
  };
}
const now = () => new Date().toISOString();
const digest = (data) => crypto.createHash("sha256").update(data).digest("hex");
export const sha = (file) => digest(fs.readFileSync(file));
const read = (file) =>
  JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
export function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}
const finite = (n) => typeof n === "number" && Number.isFinite(n);
const assert = (v, m) => {
  if (!v) throw Error(m);
};
export function local(root, relative) {
  const result = path.resolve(root, relative);
  assert(
    result.startsWith(path.resolve(root) + path.sep),
    "Path escapes work directory",
  );
  return result;
}
function run(exe, args) {
  const r = spawnSync(exe, args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  assert(!r.error && r.status === 0, `${exe} failed`);
  return r.stdout;
}
export function probe(file) {
  return JSON.parse(
    run("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      file,
    ]),
  );
}
export function doctor() {
  const result = {
    node: process.version,
    ffmpeg: run("ffmpeg", ["-version"]).split("\n")[0],
    ffprobe: run("ffprobe", ["-version"]).split("\n")[0],
    pexels_key_present: !!process.env.PEXELS_API_KEY,
    pixabay_key_present: !!process.env.PIXABAY_API_KEY,
  };
  return result;
}
const fold = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
export function queriesFor(s) {
  if (s.queries_en) {
    assert(
      Array.isArray(s.queries_en) &&
        s.queries_en.length &&
        s.queries_en.every(
          (q) => typeof q === "string" && q.trim() && /^[\x20-\x7e]+$/.test(q),
        ),
      "queries_en must be English ASCII phrases",
    );
    return [...new Set(s.queries_en)].slice(0, 2);
  }
  if (s.required_model)
    return [`${s.required_model} close up`, `${s.required_model} installation`];
  const t = fold([s.text, s.title, s.intent].filter(Boolean).join(" "));
  const rules = [
    [
      /bao hanh|sua chua|repair|warranty/,
      [
        "computer technician inspecting motherboard",
        "computer repair workshop",
      ],
    ],
    [
      /game|gaming|fps/,
      ["hands playing computer game", "gaming desktop computer"],
    ],
    [
      /cpu|intel|amd|ryzen|processor|chip/,
      ["computer processor close up", "technician assembling desktop computer"],
    ],
    [
      /main|bo mach|motherboard/,
      ["computer motherboard close up", "installing computer components"],
    ],
    [
      /gia|tien|mua|price|buy/,
      ["customer choosing computer in shop", "computer hardware shop"],
    ],
    [/ram|memory/, ["installing computer memory", "computer ram close up"]],
  ];
  return rules.find(([re]) => re.test(t))?.[1] || [];
}
function srtParts(text) {
  const seconds = (t) => {
    const [h, m, s] = t.replace(",", ".").split(":").map(Number);
    return h * 3600 + m * 60 + s;
  };
  return text
    .replace(/\r/g, "")
    .trim()
    .split(/\n\s*\n/)
    .map((block, i) => {
      const lines = block.split("\n");
      const ix = lines.findIndex((l) => l.includes("-->"));
      assert(ix >= 0, "Missing SRT timestamps");
      const [a, b] = lines[ix].split("-->").map((s) => s.trim().split(" ")[0]);
      return {
        id: `cue-${i + 1}`,
        start: seconds(a),
        end: seconds(b),
        text: lines.slice(ix + 1).join(" "),
      };
    });
}
export function planScript(input, out) {
  const raw = fs.readFileSync(input, "utf8").replace(/^\uFEFF/, "");
  const obj =
    path.extname(input).toLowerCase() === ".srt"
      ? { parts: srtParts(raw) }
      : JSON.parse(raw);
  const parts = obj.parts || obj.scenes;
  assert(
    Array.isArray(parts) && parts.length,
    "Need timestamped parts/scenes or SRT",
  );
  let previous = 0;
  const ids = new Set();
  const scenes = parts.map((p, i) => {
    const id = String(p.id || `scene-${i + 1}`);
    assert(/^[\w-]+$/.test(id) && !ids.has(id), "Unsafe/duplicate scene ID");
    ids.add(id);
    assert(
      finite(p.start) &&
        finite(p.end) &&
        p.start >= previous - 0.001 &&
        p.end > p.start,
      "Scene timestamps overlap or are invalid",
    );
    previous = p.end;
    assert(
      typeof p.text === "string" && p.text.trim(),
      "Missing narration text",
    );
    const technical = fold(p.text);
    const claim_kind =
      p.claim_kind ||
      (["gaming", "multi"].includes(p.type) ||
      /\b(benchmark|cinebench|fps)\b/.test(technical)
        ? "benchmark"
        : ["core-intel", "core-amd", "smt"].includes(p.type) ||
            /\b\d+\s*(nhan|luong|cores|threads)\b/.test(technical)
          ? "specification"
          : "illustration");
    assert(
      ["illustration", "specification", "benchmark"].includes(claim_kind),
      "Invalid claim_kind",
    );
    const scene = {
      ...p,
      id,
      start: p.start,
      end: p.end,
      duration: p.end - p.start,
      claim_kind,
      requires_exact_model: !!p.requires_exact_model,
      required_model: p.required_model || null,
      fallback: p.fallback || {
        kind: "existing_renderer",
        scene_id: id,
        renderer_type: p.type || null,
        reason: "Keep existing approved photos/3D/graphics for this scene",
      },
      queries_en: queriesFor(p),
    };
    return scene;
  });
  const plan = {
    schema_version: 1,
    created_at: now(),
    script_path: path.resolve(input),
    script_sha256: sha(input),
    fps: 30,
    duration: Math.max(...scenes.map((s) => s.end)),
    scenes,
  };
  write(path.join(out, "plan.json"), plan);
  return plan;
}

// Errors carry only codes, never response bodies, request headers or secret values.
export async function fetchRetry(url, options = {}, deps = {}) {
  const fetcher = deps.fetcher || fetch,
    sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let n = 0; n < 3; n++) {
    let response;
    try {
      response = await fetcher(url, {
        ...options,
        redirect: "error",
        signal: AbortSignal.timeout(45000),
      });
    } catch {
      if (n === 2) throw Error("NETWORK_ERROR");
      await sleep(500 * (n + 1));
      continue;
    }
    if (response.ok) return response;
    const code = `HTTP_${response.status}`;
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404
    )
      throw Error(code);
    if (response.status !== 429 && response.status < 500) throw Error(code);
    const retry = response.headers.get("retry-after");
    const delay = retry
      ? Number.isFinite(Number(retry))
        ? Number(retry) * 1000
        : Date.parse(retry) - Date.now()
      : 1000 * 2 ** n;
    if (n === 2 || delay > 5000) throw Error(code);
    await sleep(Math.max(0, delay));
  }
}
const pexelsPage = (s) => {
  try {
    const u = new URL(s);
    return (
      u.protocol === "https:" &&
      ["www.pexels.com", "pexels.com"].includes(u.hostname) &&
      u.pathname.startsWith("/video/")
    );
  } catch {
    return false;
  }
};
function mediaUrl(value) {
  const u = new URL(value);
  assert(
    u.protocol === "https:" &&
      [
        "videos.pexels.com",
        "images.pexels.com",
        "player.vimeo.com",
        "cdn.pixabay.com",
      ].includes(u.hostname),
    "UNTRUSTED_MEDIA_HOST",
  );
  return u.href;
}
const safeError = (e) =>
  /^(HTTP_\d{3}|NETWORK_ERROR|MISSING_KEY|UNTRUSTED_MEDIA_HOST|DOWNLOAD_TOO_LARGE)$/.test(
    e.message,
  )
    ? e.message
    : "MEDIA_OR_API_ERROR";
async function download(url, dest, deps) {
  const meta = dest + ".json";
  if (
    fs.existsSync(dest) &&
    fs.existsSync(meta) &&
    sha(dest) === read(meta).sha256
  )
    return;
  const response = await fetchRetry(url, {}, deps);
  assert(
    Number(response.headers.get("content-length") || 0) <= 300 * 1024 * 1024,
    "DOWNLOAD_TOO_LARGE",
  );
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const temp = dest + ".partial";
  let length = 0;
  try {
    const fd = fs.openSync(temp, "w");
    try {
      for await (const chunk of response.body) {
        length += chunk.length;
        assert(length <= 300 * 1024 * 1024, "DOWNLOAD_TOO_LARGE");
        fs.writeSync(fd, chunk);
      }
    } finally {
      fs.closeSync(fd);
    }
    assert(length > 0, "EMPTY_DOWNLOAD");
    fs.renameSync(temp, dest);
    write(meta, { sha256: sha(dest), bytes: length, downloaded_at: now() });
  } catch (e) {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
    throw e;
  }
}
function mp4s(video) {
  return (video.video_files || [])
    .filter((f) => f.file_type === "video/mp4" && f.width > 0 && f.height > 0)
    .sort((a, b) => a.width * a.height - b.width * b.height);
}
export function extractFrames(file, work, stem, from, to) {
  assert(to > from, "Invalid preview window");
  const times = [0, 0.25, 0.5, 0.75, 1].map((n) => from + (to - from) * n);
  return times.map((at, i) => {
    const relative = `frames/${stem}-${i}.jpg`,
      dest = local(work, relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(Math.max(0, at - 0.015)),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "scale=480:-2",
      dest,
    ]);
    return { path: relative, at, sha256: sha(dest) };
  });
}
function renderReview(work, catalog) {
  const esc = (s) =>
    String(s ?? "").replace(
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
  const config = providerFor(catalog.provider || "pexels");
  const html = `<!doctype html><meta charset="utf-8"><title>B-roll visual review</title><style>body{background:#101827;color:#eef;font:18px system-ui;margin:32px}article{border:1px solid #456;padding:20px;margin:24px 0}img{max-width:19%;height:150px;object-fit:contain}video{width:480px;max-width:100%}a{color:#8cf}</style><h1>B-roll review · pending until visually inspected</h1><p><a href="https://www.pexels.com">Videos provided by Pexels</a>. A search match is not a visual or license approval.</p>${catalog.candidates.map((c) => `<article><h2>${esc(c.scene_id)} · ${esc(c.id)}</h2><p><a href="${esc(c.source_url)}">Original video</a> · <a href="${esc(c.author.url)}">${esc(c.author.name)}</a></p><video controls muted src="${esc(c.preview.path)}"></video><div>${c.frames.map((f) => `<a href="${esc(f.path)}"><img src="${esc(f.path)}" alt="${f.at.toFixed(2)} seconds"></a>`).join("")}</div><p>Inspect actual subject, motion, model markings, rights and chosen segment. ${esc(c.preview.window.in)}–${esc(c.preview.window.out)} seconds sampled.</p></article>`).join("")}<h2>Search status</h2><pre>${esc(JSON.stringify(catalog.searches, null, 2))}</pre>`;
  fs.writeFileSync(
    path.join(work, "review.html"),
    html.replace(
      '<a href="https://www.pexels.com">Videos provided by Pexels</a>',
      `<a href="${config.url}">Videos provided by ${config.name}</a>`,
    ),
  );
}
export async function discover(work, deps = {}) {
  const plan = read(path.join(work, "plan.json")),
    provider = deps.provider || "pexels",
    config = providerFor(provider);
  const key = process.env[config.env];
  const catalog = {
    schema_version: 1,
    created_at: now(),
    provider,
    plan_sha256: sha(path.join(work, "plan.json")),
    mode: deps.testMode ? "fixture" : key ? "live" : "offline_missing_key",
    api_requests: 0,
    searches: [],
    candidates: [],
  };
  let stopCode = null;
  for (const scene of plan.scenes) {
    if (scene.claim_kind === "benchmark") {
      catalog.searches.push({
        scene_id: scene.id,
        status: "fallback",
        reason: "BENCHMARK_RETAINS_SOURCED_GRAPHICS",
      });
      continue;
    }
    if (!scene.queries_en.length) {
      catalog.searches.push({
        scene_id: scene.id,
        status: "fallback",
        reason: "ENGLISH_QUERY_REQUIRED",
      });
      continue;
    }
    const seen = new Set();
    for (const query of scene.queries_en.slice(0, 2)) {
      const request = {
        scene_id: scene.id,
        query,
        provider_url: config.url,
        status: "pending",
      };
      catalog.searches.push(request);
      try {
        const cache = local(
          work,
          `cache/api-${provider}-${digest(query).slice(0, 24)}.json`,
        );
        let result;
        if (
          fs.existsSync(cache) &&
          Date.now() - fs.statSync(cache).mtimeMs < 86400000
        ) {
          result = read(cache);
          request.cache_hit = true;
        } else {
          if (!key) throw Error("MISSING_KEY");
          if (stopCode) throw Error(stopCode);
          const url =
            provider === "pixabay"
              ? new URL("https://pixabay.com/api/videos/")
              : new URL("search", API);
          url.search = new URLSearchParams(
            provider === "pixabay"
              ? {
                  key,
                  q: query,
                  lang: "en",
                  per_page: "3",
                  page: "1",
                  video_type: "film",
                  safesearch: "true",
                }
              : { query, locale: "en-US", per_page: "3", page: "1" },
          ).toString();
          catalog.api_requests++;
          const response = await fetchRetry(
            deps.apiUrl ? deps.apiUrl(url) : url,
            provider === "pixabay" ? {} : { headers: { Authorization: key } },
            deps,
          );
          const raw = await response.json();
          result = provider === "pixabay" ? normalizePixabay(raw) : raw;
          assert(Array.isArray(result.videos), "Malformed API response");
          write(cache, result);
          request.rate_remaining = response.headers.get(
            "x-ratelimit-remaining",
          );
          request.rate_reset = response.headers.get("x-ratelimit-reset");
        }
        request.status = "ok";
        request.results = result.videos.length;
        for (const video of result.videos.slice(0, 3)) {
          if (seen.has(video.id)) continue;
          seen.add(video.id);
          const files = mp4s(video);
          if (
            !files.length ||
            !sourcePage(video.url, provider) ||
            !video.user?.name ||
            !video.user?.url
          )
            continue;
          const file = files[0],
            id = `${provider}-${video.id}`;
          assert(/^(pexels|pixabay)-\d+$/.test(id), "Invalid video id");
          try {
            const url = deps.testMode ? file.link : mediaUrl(file.link),
              relative = `cache/${id}-${file.id}.mp4`,
              dest = local(work, relative);
            await download(url, dest, deps);
            const info = probe(dest),
              duration = Number(info.format.duration),
              window = {
                in: 0,
                out: Math.min(duration - 0.04, Math.max(8, scene.duration + 2)),
              };
            assert(window.out > 0, "Invalid video");
            const frames = extractFrames(
              dest,
              work,
              `${scene.id}-${id}`,
              window.in,
              window.out,
            );
            const full =
              files
                .filter((f) => f.height >= 1080)
                .sort(
                  (a, b) =>
                    Math.abs(a.height - 1920) - Math.abs(b.height - 1920),
                )[0] || files.at(-1);
            catalog.candidates.push({
              id,
              provider,
              scene_id: scene.id,
              source_url: video.url,
              author: { name: video.user.name, url: video.user.url },
              query,
              duration,
              preview: {
                path: relative,
                sha256: sha(dest),
                window,
                file_id: file.id,
              },
              frames,
              full_file: full,
              rights_status: "needs_review",
              selection_status: "pending_visual_review",
            });
          } catch (e) {
            (request.candidate_errors ??= []).push({ id, code: safeError(e) });
          }
        }
      } catch (e) {
        request.status = "fallback";
        request.reason = safeError(e);
        if (["HTTP_429", "HTTP_401", "HTTP_403"].includes(request.reason))
          stopCode = request.reason;
      }
    }
  }
  write(path.join(work, "candidates.json"), catalog);
  renderReview(work, catalog);
  // Never overwrite an agent's existing decisions.
  write(path.join(work, "reviews.template.json"), {
    reviews: catalog.candidates.map((c) => ({
      scene_id: c.scene_id,
      candidate_id: c.id,
      decision: "needs_review",
      reviewer: "",
      reviewed_at: null,
      preview_sha256: c.preview.sha256,
      frames_seen: [],
      observations: "",
      segment: {
        in: 0,
        out: plan.scenes.find((s) => s.id === c.scene_id).duration,
      },
      content_kind: "generic_illustration",
      layout: "contain",
      rights: { status: "needs_review" },
    })),
  });
  return catalog;
}
export function validateReview(scene, c, r, work) {
  assert(r?.decision === "approve", "VISUAL_REVIEW_REQUIRED");
  assert(
    r.reviewer &&
      r.reviewed_at &&
      Number.isFinite(Date.parse(r.reviewed_at)) &&
      r.observations?.trim().length >= 20,
    "INCOMPLETE_VISUAL_REVIEW",
  );
  assert(
    r.preview_sha256 === c.preview.sha256 &&
      sha(local(work, c.preview.path)) === c.preview.sha256,
    "STALE_PREVIEW",
  );
  assert(
    c.frames.length >= 3 &&
      c.frames.every(
        (f) =>
          r.frames_seen?.includes(f.sha256) &&
          sha(local(work, f.path)) === f.sha256,
      ),
    "UNSEEN_OR_STALE_FRAMES",
  );
  assert(
    finite(r.segment?.in) &&
      finite(r.segment?.out) &&
      r.segment.in >= c.preview.window.in &&
      r.segment.out <= c.preview.window.out + 0.02 &&
      r.segment.out - r.segment.in >= scene.duration - 0.02,
    "SEGMENT_NOT_REVIEWED_OR_TOO_SHORT",
  );
  assert(
    scene.claim_kind !== "benchmark",
    "BENCHMARK_RETAINS_SOURCED_GRAPHICS",
  );
  assert(
    ["generic_illustration", "exact_model"].includes(r.content_kind),
    "INVALID_CONTENT_KIND",
  );
  if (scene.requires_exact_model || scene.claim_kind === "specification")
    assert(
      r.content_kind === "exact_model" && scene.required_model,
      "EXACT_MODEL_REQUIRED",
    );
  if (r.content_kind === "exact_model")
    assert(
      scene.required_model &&
        fold(r.observed_model || "") === fold(scene.required_model) &&
        r.model_evidence?.observations?.length >= 20 &&
        /^https:\/\//.test(r.model_evidence?.source_url || ""),
      "MODEL_IDENTITY_NOT_VERIFIED",
    );
  const rights = r.rights,
    config = providerFor(c.provider || "pexels");
  assert(
    rights?.status === "verified" &&
      rights.checked_by &&
      Number.isFinite(Date.parse(rights.checked_at)) &&
      rights.source_page === c.source_url &&
      sourcePage(c.source_url, c.provider || "pexels") &&
      rights.license_url === config.license &&
      rights.terms_url === config.terms &&
      rights.evidence?.length >= 20,
    "RIGHTS_NOT_VERIFIED",
  );
  assert(
    ["not_needed", "cleared"].includes(rights.third_party_clearance) &&
      rights.third_party_notes?.length >= 20 &&
      typeof rights.attribution_required === "boolean",
    "THIRD_PARTY_RIGHTS_NEED_REVIEW",
  );
  assert(["contain", "crop"].includes(r.layout), "INVALID_LAYOUT");
  return true;
}
export function framing(width, height, review) {
  const contain = {
    mode: "contain",
    filter:
      "scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x080f1d",
    reason: "Preserve complete source scene over supplementary navy background",
  };
  if (review.layout !== "crop") return contain;
  const b = review.subject_bounds;
  if (
    !review.bounds_cover_entire_segment ||
    !Array.isArray(b) ||
    b.length !== 4 ||
    !b.every(finite) ||
    b[0] < 0 ||
    b[1] < 0 ||
    b[2] <= 0 ||
    b[3] <= 0 ||
    b[0] + b[2] > 1 ||
    b[1] + b[3] > 1
  )
    return {
      ...contain,
      reason: "Crop rejected: missing reviewed full-segment subject bounds",
    };
  let cw = Math.floor(Math.min(width, (height * 9) / 16) / 2) * 2,
    ch = Math.floor((cw * 16) / 9 / 2) * 2;
  const [sx, sy, sw, sh] = b.map((v, i) => v * (i % 2 === 0 ? width : height));
  const margin = 0.025;
  if (sw + 2 * width * margin > cw || sh + 2 * height * margin > ch)
    return {
      ...contain,
      reason: "Crop rejected: subject union plus safety margin does not fit",
    };
  const x =
      Math.round(Math.max(0, Math.min(width - cw, sx + sw / 2 - cw / 2)) / 2) *
      2,
    y =
      Math.round(Math.max(0, Math.min(height - ch, sy + sh / 2 - ch / 2)) / 2) *
      2;
  if (sx < x || sy < y || sx + sw > x + cw || sy + sh > y + ch) return contain;
  return {
    mode: "crop",
    crop_pixels: [x, y, cw, ch],
    subject_bounds: b,
    filter: `crop=${cw}:${ch}:${x}:${y},scale=1080:1920`,
    reason: "Reviewed union subject bounds fit portrait crop",
  };
}
export function processClip(source, dest, review, duration) {
  const info = probe(source),
    v = info.streams.find((s) => s.codec_type === "video");
  assert(v, "NO_VIDEO");
  assert(
    !["smpte2084", "arib-std-b67"].includes(v.color_transfer),
    "HDR_REQUIRES_SEPARATE_HANDLING",
  );
  assert(
    Number(info.format.duration) >= review.segment.in + duration - 0.02,
    "SOURCE_TOO_SHORT",
  );
  const layout = framing(v.width, v.height, review);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const temp = dest.replace(/\.mp4$/, ".partial.mp4");
  try {
    run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(review.segment.in),
      "-i",
      source,
      "-t",
      String(duration),
      "-map",
      "0:v:0",
      "-an",
      "-vf",
      layout.filter + ",setsar=1,fps=30,format=yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      temp,
    ]);
    const result = probe(temp),
      video = result.streams.find((s) => s.codec_type === "video");
    assert(
      video.width === 1080 &&
        video.height === 1920 &&
        !result.streams.some((s) => s.codec_type === "audio") &&
        Math.abs(Number(result.format.duration) - duration) < 0.12,
      "OUTPUT_QC_FAILED",
    );
    fs.renameSync(temp, dest);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
  return layout;
}
export async function build(work, deps = {}) {
  const planPath = path.join(work, "plan.json"),
    plan = read(planPath),
    catalog = read(path.join(work, "candidates.json"));
  assert(
    catalog.plan_sha256 === sha(planPath),
    "Plan changed: run discover again",
  );
  assert(
    catalog.mode !== "fixture" || deps.testMode,
    "Fixture media cannot enter production manifest",
  );
  const reviews = fs.existsSync(path.join(work, "reviews.json"))
    ? read(path.join(work, "reviews.json")).reviews
    : [];
  const config = providerFor(catalog.provider || "pexels");
  const manifest = {
    schema_version: 1,
    created_at: now(),
    script_sha256: plan.script_sha256,
    plan_sha256: sha(planPath),
    fps: 30,
    duration: plan.duration,
    provider_url: config.url,
    discovery_mode: catalog.mode,
    api_requests: catalog.api_requests,
    entries: [],
    credits: [],
  };
  for (const scene of plan.scenes) {
    const base = {
      scene_id: scene.id,
      timeline: {
        start: scene.start,
        end: scene.end,
        duration: scene.duration,
      },
      claim_kind: scene.claim_kind,
      required_model: scene.required_model,
      ...(scene.display_label ? { display_label: scene.display_label } : {}),
    };
    let selected = null;
    const failures = [];
    for (const r of reviews.filter(
      (r) => r.scene_id === scene.id && r.decision === "approve",
    )) {
      const c = catalog.candidates.find(
        (c) => c.scene_id === scene.id && c.id === r.candidate_id,
      );
      try {
        assert(c, "UNKNOWN_CANDIDATE");
        validateReview(scene, c, r, work);
        const selectedProvider = providerFor(
          c.provider || catalog.provider || "pexels",
        );
        const file = c.full_file;
        assert(/^\d+$/.test(String(file.id)), "Invalid file id");
        const relative = `cache/${c.id}-${file.id}.mp4`,
          source = local(work, relative);
        await download(
          deps.testMode ? file.link : mediaUrl(file.link),
          source,
          deps,
        );
        const output = `clips/${scene.id}-${digest(JSON.stringify([sha(source), r, scene.duration])).slice(0, 16)}.mp4`,
          dest = local(work, output);
        const layout = processClip(source, dest, r, scene.duration);
        const sourceVideo = probe(source).streams.find(
          (s) => s.codec_type === "video",
        );
        selected = {
          ...base,
          status: "selected",
          clip_path: output,
          clip_sha256: sha(dest),
          source: {
            provider: selectedProvider.name,
            id: c.id,
            url: c.source_url,
            author: c.author,
            download_url: file.link,
            source_sha256: sha(source),
            segment: { in: r.segment.in, out: r.segment.in + scene.duration },
          },
          content_kind: r.content_kind,
          label:
            r.content_kind === "generic_illustration"
              ? "Footage minh họa chung · Không phải bằng chứng sản phẩm"
              : `Footage ${r.observed_model} · Không phải benchmark`,
          visual_review: r,
          rights: r.rights,
          processing: {
            layout,
            audio: "removed",
            width: 1080,
            height: 1920,
            fps: 30,
            source_width: sourceVideo.width,
            source_height: sourceVideo.height,
          },
        };
        manifest.credits.push({
          scene_id: scene.id,
          text: `Video by ${c.author.name} via ${selectedProvider.name}`,
          author_url: c.author.url,
          source_url: c.source_url,
          provider_url: selectedProvider.url,
          license_url: selectedProvider.license,
          attribution_required: r.rights.attribution_required,
        });
        break;
      } catch (e) {
        failures.push({
          candidate_id: r.candidate_id,
          reason: /^[A-Z_]+$/.test(e.message) ? e.message : safeError(e),
        });
      }
    }
    manifest.entries.push(
      selected || {
        ...base,
        status: "fallback",
        clip_path: null,
        content_kind: "existing_approved_visual",
        fallback: scene.fallback,
        reason: failures.length
          ? "REVIEW_OR_PROCESSING_REJECTED"
          : scene.claim_kind === "benchmark"
            ? "BENCHMARK_RETAINS_SOURCED_GRAPHICS"
            : [
                ...new Set(
                  catalog.searches
                    .filter((s) => s.scene_id === scene.id)
                    .map((s) => s.reason)
                    .filter(Boolean),
                ),
              ].join(", ") || "NO_VISUALLY_APPROVED_FOOTAGE",
        rejected: failures,
      },
    );
  }
  manifest.providers = [
    ...new Set(
      manifest.entries
        .filter((e) => e.status === "selected")
        .map((e) => e.source.provider),
    ),
  ];
  write(path.join(work, "broll_manifest.json"), manifest);
  fs.writeFileSync(
    path.join(work, "credits.md"),
    (manifest.providers.length > 1
      ? "Videos provided by Pexels and Pixabay."
      : `Videos provided by [${config.name}](${config.url}).`) +
      "\n\n" +
      (manifest.credits
        .map(
          (c) =>
            `- [${c.text}](${c.source_url}) · [author](${c.author_url}) · [license](${c.license_url})`,
        )
        .join("\n") ||
        "No stock footage selected; retain existing episode asset credits.") +
      "\n",
  );
  return manifest;
}
export function stageManifest(file, publicDir) {
  const work = path.dirname(path.resolve(file)),
    manifest = read(file);
  assert(
    manifest.schema_version === 1 && Array.isArray(manifest.entries),
    "Invalid manifest",
  );
  assert(
    manifest.discovery_mode !== "fixture",
    "Fixture manifest is not renderable",
  );
  let end = 0;
  for (const e of manifest.entries) {
    assert(
      finite(e.timeline.start) &&
        finite(e.timeline.end) &&
        e.timeline.start >= end - 0.001 &&
        e.timeline.end > e.timeline.start,
      "Invalid manifest timeline",
    );
    end = e.timeline.end;
    if (e.status === "fallback") continue;
    assert(
      e.status === "selected" &&
        ["Pexels", "Pixabay"].includes(e.source?.provider) &&
        e.rights?.status === "verified" &&
        e.visual_review?.decision === "approve" &&
        e.claim_kind !== "benchmark",
      "Unapproved render input",
    );
    const source = local(work, e.clip_path);
    assert(sha(source) === e.clip_sha256, "Clip changed after approval");
    const info = probe(source);
    assert(
      info.streams.some((s) => s.width === 1080 && s.height === 1920) &&
        !info.streams.some((s) => s.codec_type === "audio"),
      "Invalid staged clip",
    );
    const relative = `broll/${e.clip_sha256.slice(0, 24)}.mp4`,
      dest = local(publicDir, relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(source, dest);
    e.public_path = relative;
  }
  return manifest;
}
export async function main(args = process.argv.slice(2)) {
  const command = args[0],
    options = {};
  for (let i = 1; i < args.length; i += 2) {
    assert(args[i].startsWith("--") && args[i + 1], "Use --option value");
    options[args[i].slice(2)] = args[i + 1];
  }
  if (command === "doctor") {
    console.log(JSON.stringify(doctor(), null, 2));
    return;
  }
  if (command === "plan") {
    assert(options.script && options.out, "Use plan --script file --out work");
    const p = planScript(
      path.resolve(options.script),
      path.resolve(options.out),
    );
    console.log(`Planned ${p.scenes.length} scenes`);
    return;
  }
  assert(options.work, "Use --work directory");
  const work = path.resolve(options.work);
  if (command === "discover") {
    const c = await discover(work, { provider: options.provider || "pexels" });
    console.log(
      `Prepared ${c.candidates.length} candidates. Review ${path.join(work, "review.html")}`,
    );
    return;
  }
  if (command === "build") {
    const m = await build(work);
    console.log(
      `Manifest: ${m.entries.filter((e) => e.status === "selected").length} clips; ${m.entries.filter((e) => e.status === "fallback").length} explicit fallbacks`,
    );
    return;
  }
  throw Error("Commands: doctor, plan, discover, build");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error(
      "B-roll command failed; verify inputs and tools. No credentials logged.",
    );
    process.exitCode = 1;
  });
