"""Văn bản — sổ cấp số / ban hành.

Flow: cap_so (assign số + ngày) -> upload scan / paste link -> ban_hanh (issue +
public token -> externally accessible link at /vb/<token>).
"""

import frappe
from frappe import _

from vp.api.common import _require, _require_login, _paginate, _like, qr_data_uri

VANBAN_FIELDS = [
    "name",
    "ma_hieu",
    "ten_van_ban",
    "loai_van_ban",
    "ngay_ban_hanh",
    "nguoi_nhan",
    "trang_thai",
    "tep_dinh_kem",
    "lien_ket_ngoai",
    "public_token",
    "so_lan_truy_cap",
    "gioi_han_truy_cap",
    "ngay_cap_so",
    "danh_muc",
    "phong_ban",
    "tu_khoa",
    "mo_ta",
]

# Fields the client may set on cấp số / edit (guards against mass-assignment).
WRITABLE = [
    "ten_van_ban",
    "loai_van_ban",
    "ngay_ban_hanh",
    "nguoi_nhan",
    "ma_hieu",
    "danh_muc",
    "phong_ban",
    "tu_khoa",
    "mo_ta",
    "lien_ket_ngoai",
]


def _public_url(token):
    return "{0}/vb/{1}".format(frappe.utils.get_url(), token) if token else None


def _subtree_names(danh_muc):
    node = frappe.db.get_value("VP Danh Muc", danh_muc, ["lft", "rgt"], as_dict=True)
    if not node:
        return [danh_muc]
    return frappe.get_all(
        "VP Danh Muc",
        filters={"lft": (">=", node.lft), "rgt": ("<=", node.rgt)},
        pluck="name",
    ) or [danh_muc]


@frappe.whitelist()
def search(keyword=None, danh_muc=None, loai=None, phong_ban=None, trang_thai=None, page=1):
    """Search the register. Default shows all non-cancelled documents."""
    _require_login()
    limit, offset = _paginate(page)

    filters = {}
    if trang_thai:
        filters["trang_thai"] = trang_thai
    else:
        filters["trang_thai"] = ("!=", "Huy")
    if loai:
        filters["loai_van_ban"] = loai
    if phong_ban:
        filters["phong_ban"] = phong_ban
    if danh_muc:
        filters["danh_muc"] = ("in", _subtree_names(danh_muc))

    or_filters = None
    like = _like(keyword)
    if like:
        or_filters = [
            ["ma_hieu", "like", like],
            ["ten_van_ban", "like", like],
            ["nguoi_nhan", "like", like],
            ["tu_khoa", "like", like],
        ]

    items = frappe.get_all(
        "VP Van Ban",
        fields=["name", "ma_hieu", "ten_van_ban", "loai_van_ban", "ngay_ban_hanh", "nguoi_nhan", "trang_thai"],
        filters=filters,
        or_filters=or_filters,
        order_by="ngay_ban_hanh desc, modified desc",
        limit_start=offset,
        limit_page_length=limit,
    )
    total = len(frappe.get_all("VP Van Ban", filters=filters, or_filters=or_filters, pluck="name"))
    return {"items": items, "total": total, "page": int(page or 1), "page_size": limit}


@frappe.whitelist()
def get_detail(name):
    _require_login()
    doc = frappe.get_doc("VP Van Ban", name)
    doc.check_permission("read")
    data = doc.as_dict()
    out = {k: data.get(k) for k in VANBAN_FIELDS}
    url = _public_url(data.get("public_token")) if data.get("trang_thai") == "Da Ban Hanh" else None
    out["public_url"] = url
    out["public_qr"] = qr_data_uri(url) if url else None
    limit = data.get("gioi_han_truy_cap") or 0
    used = data.get("so_lan_truy_cap") or 0
    out["con_lai"] = max(0, limit - used) if limit else None
    return {"van_ban": out}


@frappe.whitelist()
def cap_so(ten_van_ban, loai_van_ban, ngay_ban_hanh=None, nguoi_nhan=None,
           ma_hieu=None, danh_muc=None, phong_ban=None, tu_khoa=None, mo_ta=None):
    """Step 1 — assign a number + date. Returns the new record's name + number."""
    _require("VP Bien Tap")
    doc = frappe.get_doc(
        {
            "doctype": "VP Van Ban",
            "ten_van_ban": ten_van_ban,
            "loai_van_ban": loai_van_ban,
            "ngay_ban_hanh": ngay_ban_hanh or None,
            "nguoi_nhan": nguoi_nhan or None,
            "ma_hieu": (ma_hieu or "").strip() or None,
            "danh_muc": danh_muc or None,
            "phong_ban": phong_ban or None,
            "tu_khoa": tu_khoa or None,
            "mo_ta": mo_ta or None,
        }
    ).insert()
    return {"name": doc.name, "ma_hieu": doc.ma_hieu, "ngay_ban_hanh": str(doc.ngay_ban_hanh or "")}


@frappe.whitelist()
def update_van_ban(name, **kwargs):
    """Edit register metadata (does not change trạng thái)."""
    _require("VP Bien Tap")
    doc = frappe.get_doc("VP Van Ban", name)
    doc.update({k: kwargs.get(k) for k in WRITABLE if k in kwargs})
    doc.save()
    return {"name": doc.name, "ma_hieu": doc.ma_hieu}


@frappe.whitelist()
def ban_hanh(name, lien_ket_ngoai=None):
    """Step 2 — issue the document. Requires an uploaded scan (tep_dinh_kem,
    uploaded by the SPA just before this call) or an external link. Mints a
    public token and returns the externally-accessible /vb/<token> URL."""
    _require("VP Bien Tap")
    doc = frappe.get_doc("VP Van Ban", name)
    if lien_ket_ngoai is not None:
        doc.lien_ket_ngoai = (lien_ket_ngoai or "").strip() or None
    if not (doc.tep_dinh_kem or doc.lien_ket_ngoai):
        frappe.throw(_("Cần tải tệp scan đã đóng dấu hoặc dán liên kết ngoài trước khi ban hành."))
    if not doc.ngay_ban_hanh:
        doc.ngay_ban_hanh = frappe.utils.nowdate()
    doc.reset_access()  # ensure token + counter 0 + default limit
    doc.trang_thai = "Da Ban Hanh"
    doc.save()
    url = _public_url(doc.public_token)
    return {"ok": True, "name": doc.name, "public_url": url, "public_qr": qr_data_uri(url)}


@frappe.whitelist()
def cap_lai_link(name):
    """Re-issue the public link: fresh token (old link/QR die) + reset counter."""
    _require("VP Bien Tap")
    doc = frappe.get_doc("VP Van Ban", name)
    if doc.trang_thai != "Da Ban Hanh":
        frappe.throw(_("Chỉ cấp lại link cho văn bản đã ban hành."))
    doc.reset_access(new_token=True)
    doc.save()
    url = _public_url(doc.public_token)
    return {"ok": True, "public_url": url, "public_qr": qr_data_uri(url), "con_lai": doc.gioi_han_truy_cap}


@frappe.whitelist()
def huy(name, ly_do=None):
    """Cancel a document. VP Quan Tri only. Keeps the record (register integrity)."""
    _require()  # super roles only
    doc = frappe.get_doc("VP Van Ban", name)
    if ly_do:
        note = (doc.mo_ta or "").strip()
        stamp = _("[Hủy {0}] {1}").format(frappe.utils.nowdate(), ly_do)
        doc.mo_ta = (note + "\n" + stamp).strip() if note else stamp
    doc.trang_thai = "Huy"
    doc.save()
    return {"ok": True, "name": doc.name}
