# BUILD BRIEF — App `vp` (Văn Phòng): Quản lý văn bản ban hành, hồ sơ NVL, artwork bao bì

> Dành cho Claude Code. Đọc kèm skill: `nextcode-build`, `frappe-portal-spa`, `frappe-app-shipping-gotchas`.
> Môi trường: Frappe/ERPNext **v16**, site a.rongvanghoanggia.com. 1 dev. Build offline trước, cài lên site sau.

---

## 0. Thông tin app

| Mục | Giá trị |
|---|---|
| App name | `vp` |
| Module | `VP` (một module duy nhất) |
| Route SPA | `/vp` (www page) |
| CSS prefix | `vp-` (BẮT BUỘC — ERPNext dùng Bootstrap, cấm class trần `.modal .container .badge .btn .card .overlay`) |
| Fieldname | ASCII không dấu, snake_case. Label tiếng Việt có dấu. |
| Backend | Controller + whitelisted method trong `vp/api/`. KHÔNG Server Script, KHÔNG Client Script rời. |
| Permissions | Định nghĩa TRONG DocType JSON. KHÔNG dùng fixture Custom DocPerm (đã dính bug thiếu `name`). Nếu cần bổ sung → hàm idempotent `_setup_core_permissions()` trong `install.py`. |
| patches.txt | Phải có header `[pre_model_sync]` ngay cả khi rỗng. |
| Mọi thư mục Python | Phải có `__init__.py` (kể cả `vp/api/`, `vp/vp/doctype/...`) — tránh ModuleNotFoundError khi `bench install-app`. |

---

## 1. Mục đích nghiệp vụ (tóm tắt)

RVHG (nhà máy bánh đậu xanh, ISO 22000:2018) đang quản lý rời rạc 3 nhóm tài sản văn bản:

1. **Văn bản ban hành toàn công ty**: QĐ, TB, quy chế, quy trình, SOP, biểu mẫu, TCCS — cần mã hiệu thống nhất, kiểm soát phiên bản (chỉ 1 bản hiện hành), tra cứu nhanh, truy vết lịch sử. Đáp ứng ISO 22000 §7.5.
2. **Hồ sơ nguyên vật liệu** theo Item + Supplier: tự công bố, CoA, kiểm nghiệm định kỳ, hợp đồng — có ngày hết hạn, cần cảnh báo trước 30 ngày.
3. **Artwork bao bì/nhãn** theo SKU: phiên bản nào đang in, file gốc AI/PDF, lịch sử thay đổi, liên kết TCCS.

Quy mô nhỏ (~15–30 user, vài văn bản/tuần, ~50–100 SKU). App là kho tra cứu + kiểm soát phiên bản, không phải hệ thống giao dịch. Duyệt ban hành thực tế trên giấy → app chỉ ghi nhận kết quả bằng status field, KHÔNG dùng Workflow doctype ở v1.

**Ranh giới**: app `iso22000_fsms` quản lý *biểu mẫu vận hành* (record điền hàng ngày); app `vp` quản lý *file văn bản đã ký đóng dấu* (document). Không trùng scope.

---

## 2. Data model — 7 DocTypes

Quan hệ:

```
VP Loai Van Ban ──┐
VP Danh Muc(tree)─┼─< VP Van Ban 1──< VP Phien Ban Van Ban
Department ───────┘        (phien_ban_hien_hanh ─→ 1 bản)

Item ──< VP Ho So NVL >── Supplier

Item ──< VP Artwork 1──< VP Phien Ban Artwork ──→ VP Van Ban (TCCS, optional)
              (phien_ban_dang_in ─→ 1 bản)
```

### 2.1 VP Loai Van Ban (master nhỏ)
- autoname: `field:ma_viet_tat`
- Fields: `ma_viet_tat` (Data, reqd, unique — VD "QD"), `ten_loai` (Data, reqd — "Quyết định"), `mo_ta` (Small Text)
- Seed qua fixtures: QD/Quyết định, TB/Thông báo, QC/Quy chế, QT/Quy trình, SOP/SOP, BM/Biểu mẫu, TCCS/Tiêu chuẩn cơ sở, HD/Hướng dẫn, CV/Công văn

### 2.2 VP Danh Muc (Tree)
- `is_tree: 1`, autoname: `field:ten_danh_muc`
- Fields: `ten_danh_muc` (Data, reqd), `parent_vp_danh_muc`, `is_group`, `thu_tu` (Int, default 0), `mo_ta` (Small Text)
- Seed fixtures (nhóm gốc): Hành chính – Nhân sự, Sản xuất, QC – ATTP, Kinh doanh, Tài chính – Kế toán

### 2.3 VP Van Ban (master văn bản)
- autoname: `field:ma_hieu`
- Fields:
  - `ma_hieu` (Data, unique) — nếu bỏ trống, controller tự sinh `{ma_viet_tat}-{YYYY}-{seq 3 số}` (VD `QD-2026-015`), seq đếm theo loại + năm, query MAX + lock để tránh trùng. Cho phép nhập tay (văn bản cũ nhập lại).
  - `ten_van_ban` (Data, reqd, in_list_view)
  - `loai_van_ban` (Link VP Loai Van Ban, reqd)
  - `danh_muc` (Link VP Danh Muc, reqd)
  - `phong_ban` (Link Department) — phòng chủ quản
  - `trang_thai` (Select: `Du Thao\nHien Hanh\nHet Hieu Luc`, default Du Thao, read_only=1 — controller quản)
  - `phien_ban_hien_hanh` (Link VP Phien Ban Van Ban, read_only=1)
  - `ngay_ban_hanh_dau` (Date, read_only=1)
  - `tu_khoa` (Small Text — phục vụ search)
  - `mo_ta` (Small Text)
- Controller `vp_van_ban.py`:
  - `before_insert`: sinh `ma_hieu` nếu trống (theo quy tắc trên).
  - `on_trash`: chặn xóa nếu còn VP Phien Ban Van Ban trỏ tới (frappe.throw).

### 2.4 VP Phien Ban Van Ban (mỗi phiên bản 1 record — KHÔNG dùng child table vì cần attach file + vòng đời riêng)
- autoname: `format:{van_ban}-v{so_phien_ban}`
- Fields:
  - `van_ban` (Link VP Van Ban, reqd)
  - `so_phien_ban` (Data, reqd — "1.0", "2.0")
  - `trang_thai` (Select: `Du Thao\nHien Hanh\nHet Hieu Luc`, default Du Thao)
  - `ngay_ban_hanh` (Date)
  - `ngay_het_hieu_luc` (Date, optional — để báo "văn bản sắp hết hiệu lực" trên dashboard)
  - `ly_do_sua_doi` (Small Text)
  - `nguoi_soan` (Data), `nguoi_duyet` (Data) — ghi tên, vì duyệt trên giấy
  - `tep_chinh` (Attach, reqd — PDF đã ký đóng dấu), `tep_goc` (Attach, optional — Word/nguồn)
  - `ghi_chu` (Small Text)
- Controller `vp_phien_ban_van_ban.py` — **logic lõi của app**:
  - `validate`: nếu `trang_thai == "Hien Hanh"` và `ngay_ban_hanh` trống → set today. Unique (van_ban, so_phien_ban).
  - `on_update`: nếu `trang_thai == "Hien Hanh"`:
    1. `frappe.db.set_value` tất cả phiên bản khác cùng `van_ban` → `Het Hieu Luc`
    2. Cập nhật master: `phien_ban_hien_hanh = self.name`, `trang_thai = "Hien Hanh"`, `ngay_ban_hanh_dau` = min hiện có hoặc `ngay_ban_hanh`
  - `on_trash`: chặn xóa phiên bản đang Hien Hanh.
- Lưu ý v16: dùng `frappe.db.set_value` cho các bản khác (không load full doc) + `frappe.clear_document_cache`.

### 2.5 VP Ho So NVL
- autoname: `format:NVL-{YYYY}-{####}`
- Fields:
  - `item` (Link Item, reqd), `supplier` (Link Supplier)
  - `loai_ho_so` (Select: `Tu Cong Bo\nCoA\nKiem Nghiem Dinh Ky\nHop Dong\nChung Nhan NCC\nKhac`, reqd)
  - `ten_ho_so` (Data, reqd), `so_hieu` (Data)
  - `ngay_cap` (Date), `ngay_het_han` (Date)
  - `tep` (Attach, reqd)
  - `trang_thai` (Select: `Con Hieu Luc\nSap Het Han\nHet Han`, read_only=1, default Con Hieu Luc)
  - `ghi_chu` (Small Text)
- Controller: `validate` — `ngay_het_han > ngay_cap` nếu cả hai có; tính `trang_thai` ngay khi save (≤0 ngày: Het Han; ≤30 ngày: Sap Het Han; còn lại/không có hạn: Con Hieu Luc).
- Scheduler daily `vp.tasks.update_nvl_status`: quét lại toàn bộ, cập nhật `trang_thai` (để list/filter đúng dù không ai mở record). Chừa stub `notify_expiring()` (pass) — sau này AKASHIC gọi.

### 2.6 VP Artwork
- autoname: `format:AW-{####}`
- Fields: `item` (Link Item, reqd — SKU thành phẩm), `ten_artwork` (Data, reqd), `loai_bao_bi` (Select: `Hop\nTui\nNhan\nThung\nKhac`), `phien_ban_dang_in` (Link VP Phien Ban Artwork, read_only=1), `nha_in` (Link Supplier), `ghi_chu` (Small Text)

### 2.7 VP Phien Ban Artwork
- autoname: `format:{artwork}-v{so_phien_ban}`
- Fields: `artwork` (Link VP Artwork, reqd), `so_phien_ban` (Data, reqd), `trang_thai` (Select: `Thiet Ke\nDang In\nNgung In`, default Thiet Ke), `ngay_duyet_in` (Date), `tep_goc` (Attach — AI/PDF), `tep_preview` (Attach Image — ảnh xem nhanh cho grid), `lien_ket_tccs` (Link VP Van Ban), `ly_do_thay_doi` (Small Text)
- Controller: khi `trang_thai == "Dang In"` → các phiên bản khác cùng artwork đang "Dang In" chuyển `Ngung In`, cập nhật `artwork.phien_ban_dang_in`. Chặn xóa bản Dang In.

**File đính kèm**: tất cả upload là **private file**, dùng endpoint chuẩn `/api/method/upload_file` với `doctype` + `docname` + `is_private=1`. Frappe kiểm quyền File theo quyền read của doctype đính kèm → VP Xem tải được là đúng thiết kế.

---

## 3. Roles & Permission matrix (định nghĩa trong DocType JSON)

Roles (fixtures): `VP Quan Tri`, `VP Bien Tap`, `VP QC`, `VP Marketing`, `VP Xem`

| DocType | VP Quan Tri | VP Bien Tap | VP QC | VP Marketing | VP Xem |
|---|---|---|---|---|---|
| VP Loai Van Ban | CRUD | R | R | R | R |
| VP Danh Muc | CRUD | R | R | R | R |
| VP Van Ban | CRUD | CRU | R | R | R |
| VP Phien Ban Van Ban | CRUD | CRU | R | R | R |
| VP Ho So NVL | CRUD | R | CRU | R | R |
| VP Artwork | CRUD | R | R | CRU | R |
| VP Phien Ban Artwork | CRUD | R | R | CRU | R |

- Delete chỉ VP Quan Tri. System Manager mặc nhiên full.
- API mutation phải gate role bằng helper (mục 4), không dựa mỗi DocPerm.

---

## 4. Backend API — `vp/api/` (package, có `__init__.py`)

Chia module: `common.py`, `vanban.py`, `nvl.py`, `artwork.py`, `dashboard.py`. Tất cả `@frappe.whitelist()` (KHÔNG `allow_guest`). Quy ước chung:

- Helper trong `common.py`:
  - `_require(*roles)` — throw `frappe.PermissionError` nếu user không có role nào trong danh sách (VP Quan Tri luôn pass).
  - `_paginate(page, page_size=20)` → limit/offset.
  - Query LIKE dùng tham số hóa `%(kw)s` — cấm f-string ghép SQL.
- Trả về dict JSON thuần (không trả Document object).

| # | Method | Role gate | Mô tả |
|---|---|---|---|
| 1 | `vp.api.common.get_boot` | login | user, roles VP, đếm nhanh (văn bản hiện hành, NVL sắp hết hạn, artwork), tree danh mục, list loại văn bản, list phòng ban — 1 call cho lần load đầu SPA |
| 2 | `vp.api.vanban.search` | login | params: `keyword` (LIKE trên ma_hieu/ten_van_ban/tu_khoa), `danh_muc` (gồm cả con — dùng lft/rgt của tree), `loai`, `phong_ban`, `trang_thai` (default `Hien Hanh`), `page`. Trả list + total. |
| 3 | `vp.api.vanban.get_detail` | login | 1 văn bản + toàn bộ phiên bản (sort mới→cũ) + file url |
| 4 | `vp.api.vanban.create_van_ban` | Quan Tri, Bien Tap | payload văn bản + phiên bản đầu tiên (gộp 1 call): tạo VP Van Ban → tạo VP Phien Ban Van Ban v1.0. `set_hien_hanh=1` thì đặt Hien Hanh luôn. Trả name để SPA upload file attach vào phiên bản. |
| 5 | `vp.api.vanban.add_phien_ban` | Quan Tri, Bien Tap | thêm phiên bản mới cho văn bản có sẵn |
| 6 | `vp.api.vanban.set_hien_hanh` | Quan Tri, Bien Tap | đặt 1 phiên bản thành Hien Hanh (controller lo phần còn lại) |
| 7 | `vp.api.vanban.thu_hoi` | Quan Tri | thu hồi toàn bộ: mọi phiên bản → Het Hieu Luc, master → Het Hieu Luc, ghi lý do vào ghi_chu |
| 8 | `vp.api.nvl.list_ho_so` | login | filters: item, supplier, loai_ho_so, trang_thai, keyword; group theo item; badge đếm sắp hết hạn |
| 9 | `vp.api.nvl.save_ho_so` | Quan Tri, QC | create/update (có `name` thì update) |
| 10 | `vp.api.nvl.delete_ho_so` | Quan Tri | xóa |
| 11 | `vp.api.artwork.list_artworks` | login | grid: mỗi artwork + preview + số phiên bản + bản đang in; filter item/loai_bao_bi/keyword |
| 12 | `vp.api.artwork.get_detail` | login | artwork + versions |
| 13 | `vp.api.artwork.save_artwork` | Quan Tri, Marketing | create/update artwork |
| 14 | `vp.api.artwork.add_phien_ban` | Quan Tri, Marketing | thêm phiên bản artwork |
| 15 | `vp.api.artwork.set_dang_in` | Quan Tri, Marketing | đặt phiên bản Dang In |
| 16 | `vp.api.dashboard.get_dashboard` | login | NVL hết hạn / sắp hết hạn (30–60 ngày), văn bản có `ngay_het_hieu_luc` trong 30 ngày, văn bản ban hành 30 ngày gần nhất, tổng hợp đếm theo danh mục |

Upload file từ SPA: POST `FormData` → `/api/method/upload_file` với headers `X-Frappe-CSRF-Token`, fields: `file`, `doctype`, `docname`, `fieldname` (tep_chinh/tep/tep_goc/tep_preview), `is_private=1`. Sau khi upload xong, gọi API set field nếu upload_file chưa tự set (v16 tự set khi truyền fieldname — verify khi test).

---

## 5. SPA — route `/vp` (theo skill `frappe-portal-spa`)

### 5.1 Cấu trúc file

```
vp/
├── vp/www/vp.html          # Jinja shell: import map, csrf, mount #vp-app
├── vp/www/vp.py            # context: chặn Guest (redirect /login?redirect-to=/vp),
│                           #   csrf_token, build_version (đọc vp.__version__)
└── vp/public/vp/
    ├── css/vp.css          # toàn bộ style, prefix vp-
    └── js/
        ├── main.js         # boot: gọi get_boot, khởi tạo router, render shell
        ├── router.js       # hash router, lazy import view theo route
        ├── api.js          # fetch wrapper: /api/method/*, CSRF header, xử lý lỗi chung
        ├── ui.js           # toast, modal (vp-modal), skeleton, format ngày, badge helper
        └── views/
            ├── dashboard.js
            ├── vanban_list.js
            ├── vanban_detail.js
            ├── nvl.js
            ├── artwork_grid.js
            └── artwork_detail.js
```

- `vp.html`: `no_cache = 1`; mọi `<script type="module">`/CSS đều gắn `?v={{ build_version }}` (cache-bust — assets Frappe cache 1 năm); import map trỏ `/assets/vp/vp/js/...`.
- KHÔNG bundler, KHÔNG framework. ES modules thuần. Chart không cần ở v1 (không load Chart.js).

### 5.2 Routes & màn hình

| Route | Màn hình | Nội dung chính |
|---|---|---|
| `#/` | Dashboard | 3 nhóm card cảnh báo: NVL sắp hết hạn/hết hạn (đỏ/cam), văn bản sắp hết hiệu lực, văn bản mới ban hành. Ô search nhanh nhảy sang `#/vanban?kw=` |
| `#/vanban` | Tra cứu văn bản | Desktop: sidebar cây danh mục trái + list phải. Mobile: nút mở drawer lọc (danh mục/loại/phòng ban/trạng thái). Mặc định chỉ hiện **Hien Hanh**. Row: mã hiệu, tên, loại, ngày ban hành, badge trạng thái. Nút "+ Ban hành" (chỉ hiện với Quan Tri/Bien Tap) mở modal tạo (US-01). |
| `#/vanban/:name` | Chi tiết văn bản | Header: mã hiệu + tên + badge. Nút tải PDF bản hiện hành (to, rõ). Timeline phiên bản (mới→cũ): số bản, ngày, lý do sửa đổi, người duyệt, link tải. Actions theo role: "+ Phiên bản mới", "Đặt hiện hành", "Thu hồi" (confirm). |
| `#/nvl` | Hồ sơ NVL | Group theo Item (accordion): tên NVL + badge số hồ sơ sắp hết hạn. Mở ra: bảng hồ sơ (loại, số hiệu, NCC, ngày hết hạn + badge màu, tải file). Filter: trạng thái, loại hồ sơ, NCC. Nút "+ Hồ sơ" (QC/Quan Tri). |
| `#/artwork` | Artwork grid | Card grid ảnh preview: SKU, tên, loại bao bì, badge "Đang in vX.X". Filter theo Item/loại. Nút "+ Artwork" (Marketing/Quan Tri). |
| `#/artwork/:name` | Chi tiết artwork | Preview lớn + list phiên bản (trạng thái, ngày duyệt in, TCCS liên kết, tải file gốc). Actions: "+ Phiên bản", "Đặt đang in". |

Form tạo/sửa = modal (`vp-modal`, tự dựng, không dùng Bootstrap modal). Upload có progress + validate loại file (PDF cho tep_chinh; ảnh cho tep_preview).

### 5.3 Design

- Mobile-first. Font **Be Vietnam Pro** (Google Fonts). Nền sáng sạch, accent **oxblood #7A1F1F** + brass nhạt cho badge — theo RVHG-design-tokens (heritage nhà máy). Badge trạng thái: Hien Hanh = xanh lá, Du Thao = xám, Het Hieu Luc = đỏ nhạt gạch ngang, Sap Het Han = cam, Het Han = đỏ, Dang In = xanh dương.
- Danh sách skeleton loading, empty state có hướng dẫn. Mọi action mutation có toast xác nhận.

---

## 6. hooks.py, fixtures, scheduler

```python
app_name = "vp"
fixtures = [
    {"dt": "Role", "filters": [["name", "in", [
        "VP Quan Tri", "VP Bien Tap", "VP QC", "VP Marketing", "VP Xem"]]]},
    {"dt": "VP Loai Van Ban"},
    {"dt": "VP Danh Muc"},
]
scheduler_events = {"daily": ["vp.tasks.update_nvl_status"]}
```

- `install.py`: `after_install` gọi `_setup_core_permissions()` idempotent (nếu cần perm ngoài JSON) + tạo seed nếu fixtures chưa có.
- `patches.txt`: header `[pre_model_sync]`.

---

## 7. Thứ tự build (cho Claude Code)

1. **Scaffold**: `bench new-app vp` (offline: tạo tay đúng cấu trúc), kiểm tra mọi `__init__.py`.
2. **DocTypes**: 7 JSON theo mục 2 (đúng thứ tự: Loai → Danh Muc → Van Ban → Phien Ban Van Ban → Ho So NVL → Artwork → Phien Ban Artwork) + controllers.
3. **Fixtures + install.py + patches.txt + hooks.py + tasks.py**.
4. **API**: common → vanban → nvl → artwork → dashboard. Mỗi module xong tự review security (role gate + SQL tham số hóa).
5. **SPA**: shell + router + api.js + ui.js → dashboard → vanban_list/detail → nvl → artwork.
6. **Verify checklist** (bắt buộc chạy trước khi báo xong):
   - [ ] `bench --site {site} install-app vp` sạch, không ModuleNotFoundError
   - [ ] `bench migrate && bench build && bench restart` — mở `/vp` hard-refresh không lỗi console
   - [ ] Tạo văn bản QD tự sinh mã `QD-2026-001`; thêm v2.0 đặt Hien Hanh → v1.0 tự chuyển Het Hieu Luc, master trỏ đúng
   - [ ] Không xóa được phiên bản Hien Hanh; thu hồi hoạt động
   - [ ] Hồ sơ NVL `ngay_het_han` = today+10 → trang_thai Sap Het Han; chạy tay `update_nvl_status` OK
   - [ ] Artwork set Dang In → bản cũ Ngung In, pointer đúng
   - [ ] User chỉ có VP Xem: đọc + tải file OK, mọi API mutation bị chặn (403), nút tạo/sửa ẩn trên SPA
   - [ ] Upload private file qua SPA gắn đúng fieldname, tải lại được
   - [ ] Search: từ khóa + lọc danh mục cha ra cả văn bản danh mục con

## 8. Ngoài phạm vi v1 (ghi để khỏi lạc scope)

- Workflow duyệt online, ký số
- OCR/full-text search nội dung PDF
- Portal cho NPP/bên ngoài, quyền theo phòng ban (User Permission)
- Telegram/AKASHIC notify (đã chừa stub `notify_expiring`)
- Quản lý bản in phân phối controlled copy
