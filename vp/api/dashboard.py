"""Dashboard — warning buckets across the three asset groups."""

import frappe
from frappe.utils import getdate, nowdate, add_days, date_diff

from vp.api.common import _require_login

NVL_FIELDS = ["name", "item", "loai_ho_so", "ten_ho_so", "ngay_het_han", "trang_thai", "tep"]


def _attach_item_names(rows):
    ids = list({r.item for r in rows if r.get("item")})
    names = {}
    if ids:
        for it in frappe.get_all("Item", filters={"name": ("in", ids)}, fields=["name", "item_name"]):
            names[it.name] = it.item_name
    for r in rows:
        r["item_name"] = names.get(r.get("item"), r.get("item"))
    return rows


def _with_days_left(rows, today):
    for r in rows:
        r["days_left"] = date_diff(getdate(r["ngay_het_han"]), today) if r.get("ngay_het_han") else None
    return rows


@frappe.whitelist()
def get_dashboard():
    _require_login()
    today = getdate(nowdate())

    # ── NVL: expired + expiring (the scheduler keeps trang_thai current) ──
    nvl_het_han = frappe.get_all(
        "VP Ho So NVL",
        filters={"trang_thai": "Het Han"},
        fields=NVL_FIELDS,
        order_by="ngay_het_han asc",
        limit_page_length=50,
    )
    nvl_sap_het = frappe.get_all(
        "VP Ho So NVL",
        filters={"trang_thai": "Sap Het Han"},
        fields=NVL_FIELDS,
        order_by="ngay_het_han asc",
        limit_page_length=50,
    )
    _with_days_left(_attach_item_names(nvl_het_han), today)
    _with_days_left(_attach_item_names(nvl_sap_het), today)

    # ── Documents with a number but not yet issued (need a scan / link) ──
    vb_cho_ban_hanh = frappe.get_all(
        "VP Van Ban",
        filters={"trang_thai": "Da Cap So"},
        fields=["name", "ma_hieu", "ten_van_ban", "loai_van_ban", "nguoi_nhan", "ngay_ban_hanh", "trang_thai"],
        order_by="ngay_cap_so desc, modified desc",
        limit_page_length=30,
    )

    # ── Recently issued documents (last 30 days) ──
    vb_moi = frappe.get_all(
        "VP Van Ban",
        filters={"trang_thai": "Da Ban Hanh", "ngay_ban_hanh": (">=", str(add_days(today, -30)))},
        fields=["name", "ma_hieu", "ten_van_ban", "loai_van_ban", "nguoi_nhan", "ngay_ban_hanh", "trang_thai"],
        order_by="ngay_ban_hanh desc",
        limit_page_length=30,
    )

    # ── Issued-document counts per category ──
    theo_danh_muc = frappe.get_all(
        "VP Van Ban",
        filters={"trang_thai": "Da Ban Hanh"},
        fields=["danh_muc", "count(name) as n"],
        group_by="danh_muc",
        order_by="n desc",
    )

    return {
        "nvl_het_han": nvl_het_han,
        "nvl_sap_het_han": nvl_sap_het,
        "van_ban_cho_ban_hanh": vb_cho_ban_hanh,
        "van_ban_moi": vb_moi,
        "theo_danh_muc": theo_danh_muc,
    }
