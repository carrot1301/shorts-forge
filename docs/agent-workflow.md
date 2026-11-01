# Work with a coding agent

Use the CLI yourself or open this repository in your preferred coding agent. It should read `AGENTS.md` and `.agents/skills/shorts-forge/SKILL.md`. No particular paid agent or model is required by the renderer. The agent supplies research, writing, code changes and visual inspection through its available tools; the repository supplies reproducible production stages.

## Prompt tiếng Việt

```text
Đọc AGENTS.md và .agents/skills/shorts-forge/SKILL.md trong repo này.

Tạo một video short tiếng Việt về: [CHỦ ĐỀ].
Đối tượng: [NGƯỜI XEM]. Tên kênh: [TÊN KÊNH].
Mục tiêu khoảng [60–120] giây; thời lượng cuối theo lời đọc thật.

1. Nghiên cứu nguồn chính thức cho các kết luận kỹ thuật hoặc hiện thời.
2. Viết hook, giải thích bằng ví dụ, chốt điều người xem nên làm.
3. Tạo project mới trong projects/, dùng đúng workflow hiện có.
4. Lời đọc có word offsets thật; phụ đề tối đa hai dòng, dễ đọc trên điện thoại.
5. Chọn 3D tự dựng hoặc footage Pixabay/Pexels phù hợp đã xem và xác minh quyền.
6. Không dùng stock/model khác làm bằng chứng sản phẩm, không bịa benchmark/giá.
7. Render, QC, mở hình từng cảnh và duyệt chuyển động. Ghi rõ nếu chưa nghe được audio.
8. Giao MP4, SRT/VTT, nguồn và hai gợi ý title/mô tả hấp dẫn mà đúng nội dung.

Không tự đăng lên nền tảng hoặc commit API key.
```

## English prompt

```text
Read AGENTS.md and the shorts-forge skill in this repository.
Create an explainer short about [TOPIC] for [AUDIENCE], branded [CHANNEL].
Research primary sources, then create an isolated project and render it with the
existing CLI. Use actual narration word offsets, readable two-line captions and
original concept geometry or visually/license-reviewed stock. Never fabricate
measurements, model identity or citations. Complete technical QC and explicit
scene review, state any audio-review limitation, and provide MP4, captions,
credits and a compelling accurate title/description. Do not publish or commit keys.
```

## Recommended sequence

1. Research and source notes in your private project.
2. Draft `project.json`, validate narration text and on-screen text separately.
3. `voice` to establish the measured timeline before stock planning.
4. Optional stock plan → discover → actual review → build manifest.
5. `build`, or targeted `models` → `plates` → `render` after visual-only changes.
6. Technical `qc`, actual scene/motion/audio review and `verify`.

Changing any part field currently invalidates the full script signature. Run `voice` again to refresh its timeline: unchanged per-segment narration reuses the TTS cache. Branding alone does not change spoken text. After narration/timing changes, re-plan stock; stale approved manifests are rejected.

`review.json` is a statement of inspection, not automatic vision or fact-checking. Never fill it with invented observations. The tool cannot prove a person watched a video.
