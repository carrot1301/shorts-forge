---
name: shorts-forge
description: Produce narrated vertical explainer videos from a script using actual word timing, captions, original Three.js geometry or reviewed Pixabay/Pexels B-roll, Remotion plates, FFmpeg and QC. Use for creating or updating Shorts Forge projects, not publishing by default.
---

# Shorts Forge production workflow

Read root `AGENTS.md`, `README.md` and the target `project.json`. Work from the repository root and use its CLI; no personal paths or junctions. Do not migrate frameworks.

## 1. Understand and research

Infer language, audience and scope from the request and nearby projects. For technical/current facts, consult primary sources and retain source links with conditions in the project. Ask only for missing facts that materially block progress; proceed on independent work. Keep example hardware assertions within their stated test voltage/load or SMART definitions. Do not generalize one product to an entire brand.

## 2. Author a project

`npm run forge -- init projects/topic --template starter` creates isolated source. Templates `power` and `ssd` demonstrate seven-part explainers; `demo` is an offline narration import. Change channel name, title, script, model and source labels. Start with a hook, explain one idea, give a concrete example, finish with an actionable takeaway. Write a compelling title without changing the factual claim.

Only `parts[].text` is narrated. Other fields are on-screen text. Keep titles concise and source details in accompanying documents. `model` supports `abstract`, `psu`, `tiers`, `flow`, `ssd`, `wear`, `backup`. Extend original geometry when useful; use image generation only when raster imagery is actually needed and tools allow it. Never present a generic model as measured hardware.

## 3. Narration and timing

`npm run forge -- voice projects/topic` produces or imports audio, verifies actual word offsets, finalizes the timeline and creates captions. Imported `words.json` must match the spoken script and actual audio. Do not derive timing by evenly distributing words. Do not accelerate/stretch existing audio to fit an estimate.

The default Edge Read Aloud client is community maintained; retries are bounded and cached. It rejects incomplete streams. If unavailable, report the service issue and use user-supplied audio/alignment when available; never fabricate voice output.

## 4. Optional stock

Read `docs/broll.md` and `docs/broll-review-schema.md`. Generate plan, then discover with the chosen provider. Inspect actual preview frames and motion, source page, license/terms and third-party rights. Write real observations and hash bindings to `broll/reviews.json`. Unclear rights or inaccessible pages remain needs_review; use original models. Never approve all metadata automatically. Stock is illustrative and silent, not benchmark evidence. Keep downloads private.

## 5. Render and verify

`npm run forge -- build projects/topic` runs voice, captions, models, plates, encoding and technical QC sequentially. Stage commands allow targeted rebuilds. Do not run QC before render completion. `delivery/video.mp4` is 1080×1920/30 fps with captions, plus SRT/VTT, credits and technical report.

Inspect `qc/review.html` and image files with available visual tools. Check every scene and relevant motion. Listen to narration when possible; report limits accurately. Review text/figures, crop, mobile legibility, source identity, rights and audio continuity. Then copy the review template and record explicit decisions/observations in `qc/review.json`; run `verify`. It verifies the record, not whether someone watched.

Deliver links to the video, captions, sources and material limitations. No automatic external publication. If the user explicitly requests publication, finish the concrete reviewable files first and act within that authorized destination/scope.
