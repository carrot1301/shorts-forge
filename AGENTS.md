# Shorts Forge — agent instructions

Read README.md (or README.vi.md) and `.agents/skills/shorts-forge/SKILL.md` before producing a video. Use the existing Remotion + Three.js + FFmpeg pipeline. Do not replace it or make a separate web app to avoid fixing a render.

Work in a new `projects/<name>/` directory. Preserve other projects and example source files. Use `npm run forge -- init`, then edit `project.json`. Keep scripts and headings short enough for a phone. Only `parts[].text` is spoken.

Research current or technical claims using primary sources before writing assertions; record links and conditions. Distinguish illustration, specification and measurement. Never invent benchmarks, SMART screens, prices, exact-model identity, product quality conclusions or remaining device lifetimes. Original 3D is a concept diagram unless based on a documented model; label it accordingly.

Use actual TTS word offsets or imported aligned word records. Never invent caption timing, stretch audio or change voice rate just to hit a planned duration. Regenerate dependent timeline/captions after narration changes. Use approved stock only; inspect actual frames and motion, source page, license and third-party rights. A matching search result is not approval. Benchmarks keep sourced charts. Do not bypass access challenges; retain original models as fallback.

Use `.env` or process environment for keys. Do not print keys, headers, credential-bearing URLs or raw API error bodies. Never commit `.env`, project files, media caches or stock downloads. No automatic social posting. A user's explicit request is required before publishing anything outside the local project.

`build` runs dependent stages sequentially. Wait for renders to finish before QC. Render writes a temporary final and holds a per-project lock. If a crashed process left a lock, verify it has stopped before removing that exact lock file. Do not run simultaneous model builders against the same shared cache.

Run relevant tests for code changes. For delivered video, run technical QC, open review frames, inspect motion and listen to the whole narration when tools permit. Do not claim real-time audio review when only timing/metadata was checked. Technical PASS is distinct from visual/editorial approval. `qc/review.template.json` starts unapproved; only write `qc/review.json` after actual inspection, with explicit observations and current hashes. Never use test fixtures as production stock.

Main commands: `npm run doctor`, `npm run demo`, `npm run forge -- build projects/name`, `npm test`. Keep dependency lockfile. Respect bundled font and dependency licenses; MIT here does not relicense Remotion or stock.
