# Setup and troubleshooting

## Dependencies

- Node.js 22.13 or newer; `npm ci` uses the committed lockfile.
- Git to clone the repository.
- FFmpeg and FFprobe on PATH, with libx264, libass/subtitles and drawtext support.
- Chromium via Playwright, or an existing Chrome/Chromium/Edge executable.

Install FFmpeg using the [official download guidance](https://ffmpeg.org/download.html) or your platform's package manager. On Windows the workflow was tested with a Gyan full build. On Ubuntu, `sudo apt-get install ffmpeg` supplies the expected tools. On macOS, `brew install ffmpeg` is a common option.

```bash
npm ci
npx playwright install chromium
npm run doctor
npm run demo
```

On Linux, `npx playwright install --with-deps chromium` installs browser system dependencies. In PowerShell, use `npm.cmd` and `npx.cmd` if execution policy blocks npm.ps1; no policy change is necessary.

`.npmrc` disables automatic npm lifecycle scripts. One upstream TTS package includes a package-manager enforcement hook. This repo does not need it; esbuild uses its installed platform package and browser installation is explicit. Do not remove this setting just to make an installation look quieter. CI validates the install and demo separately.

## Browser selection

The workflow first checks `SHORTS_FORGE_BROWSER`, then Playwright Chromium, then common system browser locations. Put your preferred executable path in `.env` when necessary. Never commit a personal path in source code. Doctor reports availability, not the key values.

## Voices

The default `vi-VN-NamMinhNeural` voice uses the community [msedge-tts client](https://github.com/Migushthe2nd/MsEdgeTTS) for Edge Read Aloud. It is not a guaranteed production speech API. Requests can close before completion; bounded retries retain only complete turns with real word offsets. The repository caches successful segments by text, voice and rate.

Use `narration.mode: "import"` for another TTS service or your own recording. Supply audio plus actual word offsets with scene IDs. Transcript mismatches, overlaps or words beyond the audio duration fail validation. The importer normalizes loudness without changing timing. The project does not bundle a transcription model.

## Render interrupted / stale lock

If the process crashed, verify no render is still running for that project. Only then remove that project's `.render.lock` and retry. Intermediate visual chunks are reused only when their content hashes match. The final video is replaced after successful encoding. Keep a separate backup if you want versioned published videos.

Run only one model builder at a time: the `cache/models` directory is shared by projects. Per-project render locks do not lock this shared cache.

## Caption or text overflow

QC measures actual subtitle pixels inside the intended caption box. Split very long words/phrases or paragraphs when it reports overflow. Inspect headings and source text visually too; the pixel check covers captions, not arbitrary page typography. Shorter headings are often better than shrinking all text.

## Service/API missing or blocked

Keys belong in `.env` or the process environment. Stock requests have timeouts, bounded retries and 24-hour response cache. Missing keys or unapproved footage produce explicit fallbacks. Do not bypass provider access challenges or label an unread source page as verified.

## Rendering cost and license

Rendering uses local CPU/GPU resources and disk space. The pipeline has no bundled paid AI client. Remotion's own license eligibility still applies; check the [official page](https://www.remotion.dev/docs/license/pricing). Stock/TTS service access and rights are separate.
