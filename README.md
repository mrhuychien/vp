# vp — Văn Phòng (RVHG)

App Frappe/ERPNext **v16** cho Công ty Rồng Vàng Hoàng Gia (nhà máy bánh đậu xanh,
ISO 22000:2018). Là **kho tra cứu + kiểm soát phiên bản** cho 3 nhóm tài sản văn bản:

1. **Sổ văn bản** — cấp số tự động ({số}/{năm}-{loại}-HGC) → tải scan đã đóng dấu
   hoặc dán liên kết ngoài → ban hành thành **link công khai** `/vb/<token>` gửi
   cho nơi nhận. Mỗi văn bản 1 record (không phiên bản).
2. **Hồ sơ nguyên vật liệu** theo Item + Supplier — tự công bố, CoA, kiểm nghiệm,
   hợp đồng, cảnh báo trước 30 ngày hết hạn.
3. **Artwork bao bì/nhãn** theo SKU — phiên bản đang in, file gốc AI/PDF, lịch sử.

Không phải hệ thống giao dịch: duyệt ban hành trên giấy, app ghi nhận kết quả bằng
status field (không dùng Workflow doctype ở v1).

## Cài đặt

```bash
cd ~/frappe-bench
bench get-app vp <repo-url>
bench --site <site> install-app vp
bench --site <site> migrate
bench build --app vp
bench restart
```

Mở portal tra cứu tại `/vp`.

## Cấu trúc

- `vp/vp/doctype/` — 6 DocType + controller
- `vp/www/vb.{py,html}` — trang công khai `/vb/<token>` (không cần đăng nhập)
- `vp/api/` — whitelisted methods (common, vanban, nvl, artwork, dashboard)
- `vp/www/vp.{html,py}` + `vp/public/vp/` — SPA `/vp` (vanilla ES modules)
- `vp/fixtures/` — 5 role + seed Loại văn bản / Danh mục
- `vp/tasks.py` — scheduler daily cập nhật trạng thái hồ sơ NVL

Xem `vp_build_brief.md` cho đặc tả đầy đủ.
