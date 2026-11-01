# Reviewed B-roll, not automatic search-and-paste

The curator supports **Pixabay** and **Pexels** video APIs. Get your own key from the provider. Copy `.env.example` to `.env`, fill `PIXABAY_API_KEY` or `PEXELS_API_KEY`, and leave the file untracked. The CLI loads `.env` without printing credentials. Provider responses are cached for 24 hours and searches are bounded; no systematic mass downloads.

```bash
npm run forge -- voice projects/my-short
npm run forge -- broll plan projects/my-short
npm run forge -- broll discover projects/my-short --provider pixabay
```

The narration timeline must already exist. Edit `broll/plan.json` before discovery: English queries, illustration/specification/benchmark classification and required model identity. Built-in query vocabulary is PC-oriented, so supply explicit English queries for other subjects. A benchmark scene always keeps sourced graphics; product specification scenes require exact-model evidence. General illustration must be visibly labeled.

Open `broll/review.html`. Inspect actual frames, full motion around the proposed segment, cropping/occlusion and source identity. Read the actual asset page and current provider terms/license; assess people, logos and other third-party works for your intended use. A provider name or API hit is not sufficient evidence. If access is blocked or rights unclear, leave `needs_review` and use original geometry.

Create `broll/reviews.json` using [the schema](broll-review-schema.md). Record only observations you actually made, hash bindings to all sampled preview frames, a reviewed segment, layout and specific source/license evidence. The tool creates an unapproved template; it does not inspect images with AI or approve decisions itself.

```bash
npm run forge -- broll build projects/my-short
npm run forge -- build projects/my-short
```

The stock gate rechecks plan, timeline, source, clip and review hashes, exact-model requirements, rights and silent media. Unapproved/stale input fails or remains fallback. Prepared portrait clips are contained in the illustration panel with attribution. No blind crop is added during integration. The normal one-second video end hold may freeze the final selected frame after narration; source motion is never silently looped to cover a short clip.

**Current scope:** one selected stock cut per whole narration scene. Split the source script into smaller scenes and regenerate narration before planning shorter cuts. For mixed providers, review each source under its own terms. Downloaded clips stay private in `projects/.../broll/`; publish your edited output and credits, not a stock library.

Official references: [Pixabay API](https://pixabay.com/api/docs/), [Pixabay license summary](https://pixabay.com/service/license-summary/), [Pixabay terms](https://pixabay.com/service/terms/), [Pexels API](https://www.pexels.com/api/), [Pexels license](https://www.pexels.com/license/), [Pexels terms](https://www.pexels.com/terms-of-service/). Availability and terms can change; check at use time.
