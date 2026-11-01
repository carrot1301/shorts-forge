# Shorts Forge — Biến kịch bản thành video short

[English](README.md) · [Demo](docs/assets/showcase.mp4) · [Workflow cho agent](docs/agent-workflow.md)

Workflow tách từ quy trình sản xuất video **DNT PC LAB**: lời đọc → mốc từng từ thật → phụ đề → mô hình 3D hoặc footage đã duyệt → MP4 → kiểm tra kỹ thuật và duyệt nội dung.

Bạn có thể dùng agent lập trình đang có để viết kịch bản và sửa hình. Repo không bắt buộc tài khoản AI trả phí, không kèm công cụ tự sinh kịch bản bằng LLM. Bản demo chạy bằng lời đọc mẫu có sẵn, không gọi dịch vụ TTS hoặc API stock.

## Cài và chạy demo

Cần Git, Node.js **22.13 trở lên**, FFmpeg/FFprobe có libx264, libass và drawtext.

```powershell
git clone https://github.com/carrot1301/shorts-forge.git
cd shorts-forge
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run doctor
npm.cmd run demo
```

Mở **`projects/demo/delivery/video.mp4`**. Lần cài đầu cần mạng tải dependency/browser. Sau đó demo dựng cục bộ. Linux/macOS dùng `npm` và `npx`; Linux có thể cần `npx playwright install --with-deps chromium`.

## Tạo video của bạn

```powershell
npm.cmd run forge -- init projects/video-dau-tien --template starter
# Mở và sửa projects/video-dau-tien/project.json
npm.cmd run forge -- build projects/video-dau-tien
```

- `title`, `brand`, `series`, `tagline`: tiêu đề và nhận diện kênh.
- `narration.voice`, `rate`: giọng và tốc độ. Mặc định giọng nam Việt `vi-VN-NamMinhNeural`, +15%.
- `parts[].text`: **chỉ phần này được đọc**. Các trường `heading`, `sub`, `big`, `detail`, `source` là chữ trên hình.
- `model`: `abstract`, `psu`, `tiers`, `flow`, `ssd`, `wear`, `backup`.
- Mẫu `power` và `ssd` có đầy đủ kịch bản hai tập; [nguồn kiểm chứng](examples/SOURCES.md). Không dùng minh họa làm bằng chứng cho linh kiện thật.

Ví dụ tạo tập nguồn:

```powershell
npm.cmd run forge -- init projects/nguon --template power
npm.cmd run forge -- build projects/nguon
```

TTS dùng Edge Read Aloud qua thư viện cộng đồng. Dịch vụ có thể ngắt; script có retry/cache và không nhận audio tải dở. Không bảo đảm dịch vụ luôn hoạt động. Bạn cũng có thể dùng giọng tự thu hoặc TTS khác: đặt `mode: "import"`, thêm audio và mốc từng từ **thật** theo `examples/demo`. Repo không tự nhận dạng giọng hoặc bịa thời gian phụ đề.

## Thêm video thật từ Pixabay/Pexels

Copy `.env.example` thành `.env`, tự điền key riêng. Đừng đưa key vào chat, issue hoặc Git.

```powershell
npm.cmd run forge -- voice projects/nguon
npm.cmd run forge -- broll plan projects/nguon
# Sửa broll/plan.json: từ khóa tiếng Anh và loại cảnh
npm.cmd run forge -- broll discover projects/nguon --provider pixabay
```

Mở `broll/review.html`, xem frame **và chuyển động thực**, đọc trang tài sản và giấy phép hiện tại. Tạo `reviews.json` theo [schema](docs/broll-review-schema.md), ghi nhận đúng những gì đã xem. Không chọn theo tên kết quả và không tự đổi toàn bộ thành approve.

```powershell
npm.cmd run forge -- broll build projects/nguon
npm.cmd run forge -- build projects/nguon
```

Thiếu footage phù hợp hoặc chưa rõ quyền thì giữ 3D. API response cache 24 giờ; lượt tìm có giới hạn, không tải thư viện hàng loạt. Cảnh benchmark không thay bằng stock. Mỗi đoạn stock hiện phủ toàn bộ một scene; muốn cắt ngắn hãy chia nhỏ scene trước khi tạo lời đọc. [Chi tiết](docs/broll.md).

## Thành phẩm và duyệt

`delivery/` gồm `video.mp4`, SRT, VTT, timeline, credits và `qc.json`. Video 1080×1920, 30fps, H.264/AAC; lời đọc khoảng −16 LUFS. Không kéo giãn audio để khớp mốc giả định. Giới hạn mặc định 180 giây lời đọc, thêm khoảng một giây giữ khung cuối.

QC giải mã toàn bộ, kiểm tra khung đen, codec, thời lượng, độ khớp audio và vùng chữ thực của mọi cue. Đây là **QC kỹ thuật**, chưa duyệt nội dung/giấy phép thay người dùng.

Mở `qc/review.html`, xem và nghe toàn bộ video. Copy `review.template.json` thành `review.json`, ghi người duyệt, ngày, nhận xét thật và quyết định từng cảnh. Chạy:

```powershell
npm.cmd run forge -- verify projects/nguon
```

Không có chức năng tự đăng video. Thư mục `projects/`, cache, bản dựng và `.env` đều không được Git theo dõi. Cần chia sẻ project riêng thì tạo gói chọn lọc, không đẩy nguyên cache stock lên repo.

## Nhờ agent làm việc

Mở repo bằng agent bạn đang dùng, bảo nó đọc `AGENTS.md` và `.agents/skills/shorts-forge/SKILL.md`. Dùng [prompt mẫu](docs/agent-workflow.md), ví dụ:

> Dùng workflow Shorts Forge, tạo một video tiếng Việt khoảng 90 giây về chủ đề tôi đưa. Đọc AGENTS.md và skill trong repo. Kiểm chứng nguồn chính thức trước khi viết các kết luận kỹ thuật; tạo project mới trong projects/, giữ phong cách có sẵn, tạo lời đọc với word offsets thật, duyệt hình rồi render và QC. Chỉ dùng footage đã xác minh nội dung/quyền. Không tự đăng.

## Giấy phép

Mã nguồn và mô hình tự dựng: [MIT](LICENSE), **carrot1301 / DNT PC LAB**. Font: [SIL OFL](public/OFL.txt). Remotion và các dependency/dịch vụ có điều kiện riêng; xem [giấy phép Remotion](https://www.remotion.dev/docs/license/pricing) và [thông báo bên thứ ba](THIRD_PARTY.md). MIT không cấp quyền sử dụng mọi footage, nhãn hiệu hoặc dịch vụ TTS.

Nếu bạn tạo được video bằng workflow này, hãy chia sẻ kết quả có nguồn của bạn. Có thể đóng góp thêm model 3D tự dựng, theme, ngôn ngữ và TTS provider. Star repo nếu nó giúp bạn tiết kiệm thời gian.
