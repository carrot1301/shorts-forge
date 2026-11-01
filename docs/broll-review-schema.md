# Review records

`discover` writes `candidates.json` and `reviews.template.json`. Copy the template to `reviews.json` only after opening the extracted frames. Rejected records can remain in reviews with `decision: reject` and observations. Select at most one candidate per planned scene; split the plan into shorter scenes for a montage.

Example structure (values below are placeholders, not an approval):

```json
{
  "reviews": [
    {
      "scene_id": "hook",
      "candidate_id": "pexels-123",
      "decision": "approve",
      "reviewer": "agent-name",
      "reviewed_at": "ISO date/time",
      "preview_sha256": "copy actual candidate preview hash",
      "frames_seen": ["copy every extracted frame SHA-256"],
      "observations": "Describe actual visible subject, action, cuts, markings and fit with this narration.",
      "segment": { "in": 1, "out": 6 },
      "content_kind": "generic_illustration",
      "observed_model": null,
      "model_evidence": null,
      "layout": "contain",
      "subject_bounds": null,
      "bounds_cover_entire_segment": false,
      "rights": {
        "status": "verified",
        "checked_at": "ISO date/time",
        "checked_by": "agent-name",
        "source_page": "actual candidate Pexels video URL",
        "license_url": "https://www.pexels.com/license/",
        "terms_url": "https://www.pexels.com/terms-of-service/",
        "evidence": "What was checked on these pages, applicable license and intended editorial use.",
        "third_party_clearance": "not_needed",
        "third_party_notes": "Describe visible people/logos/works and reasoning; unknown means needs_review.",
        "attribution_required": false,
        "attribution_notes": "Pexels license does not require credit; API guidance asks provider/contributor links. Credits are always exported."
      }
    }
  ]
}
```

`third_party_clearance`: `not_needed`, `cleared`, or `needs_review`. Use `cleared` only with real permission evidence in the notes. `layout: crop` requires normalized `[x,y,width,height]` bounds within `[0,1]`, union of subject positions across the entire segment, plus `bounds_cover_entire_segment: true`. If the subject does not fit a safe crop the processor automatically switches to contain, and records the reason. Contain preserves all edges with a solid navy background. For moving subjects, inspect more frames or watch the preview before asserting full-segment bounds.

`exact_model` requires `observed_model` matching the scene's model and `model_evidence` describing legible markings plus a source URL. Specification scenes also require `requires_exact_model: true`. Search queries and titles are never identity evidence. Footage cannot replace any benchmark chart, even for the exact model.

Official sources checked 2026-10-31:

- https://www.pexels.com/api/documentation/ — Authorization header; current `/v1/videos/search`; provider and contributor links; rate limits.
- https://www.pexels.com/license/ — free use and modification, attribution optional under content license; endorsement and redistribution restrictions.
- https://www.pexels.com/terms-of-service/ — third-party rights are separate; no standalone resale or competing stock service.

These references are workflow guidance, not a permanent per-asset rights approval. Recheck actual pages before approving a new asset; store the findings with that asset.

For Pixabay, use the same review schema with the actual candidate/source URL, `license_url: https://pixabay.com/service/license-summary/`, and `terms_url: https://pixabay.com/service/terms/`. Check the full terms and original asset page; the source-specific published date/license is needed before claiming CC0. API author/source metadata is provenance, not a license review. If browser access returns a challenge or 403, keep `needs_review` and render the original fallback. Do not work around the challenge. Store per-asset findings in your own project's private `broll/` directory.
