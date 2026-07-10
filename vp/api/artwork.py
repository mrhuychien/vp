"""Artwork bao bì — grid list, detail, save, versioning, set đang in."""

import frappe
from frappe import _

from vp.api.common import _require, _require_login, _like

ARTWORK_FIELDS = [
    "name",
    "item",
    "ten_artwork",
    "loai_bao_bi",
    "phien_ban_dang_in",
    "nha_in",
    "ghi_chu",
]

PBAW_FIELDS = [
    "name",
    "so_phien_ban",
    "trang_thai",
    "ngay_duyet_in",
    "tep_goc",
    "tep_preview",
    "lien_ket_tccs",
    "ly_do_thay_doi",
]

ARTWORK_WRITABLE = ["item", "ten_artwork", "loai_bao_bi", "nha_in", "ghi_chu"]
PBAW_WRITABLE = ["so_phien_ban", "ngay_duyet_in", "lien_ket_tccs", "ly_do_thay_doi"]


@frappe.whitelist()
def list_artworks(item=None, loai_bao_bi=None, keyword=None):
    """Grid: each artwork with its preview image, version count, and the
    currently-printing version label."""
    _require_login()

    filters = {}
    if item:
        filters["item"] = item
    if loai_bao_bi:
        filters["loai_bao_bi"] = loai_bao_bi

    or_filters = None
    like = _like(keyword)
    if like:
        or_filters = [["ten_artwork", "like", like], ["item", "like", like]]

    arts = frappe.get_all(
        "VP Artwork",
        fields=ARTWORK_FIELDS,
        filters=filters,
        or_filters=or_filters,
        order_by="modified desc",
    )
    if not arts:
        return {"items": []}

    names = [a.name for a in arts]

    # Version counts per artwork (one query). Raw SQL: frappe.get_all (v16)
    # rejects aggregate functions passed as field strings.
    counts = {}
    for row in frappe.db.sql(
        """
        SELECT artwork, COUNT(name) AS n
        FROM `tabVP Phien Ban Artwork`
        WHERE artwork IN %(names)s
        GROUP BY artwork
        """,
        {"names": tuple(names)},
        as_dict=True,
    ):
        counts[row.artwork] = row.n

    # Preview + label from the printing version (one query).
    dang_in_ids = [a.phien_ban_dang_in for a in arts if a.phien_ban_dang_in]
    printing = {}
    if dang_in_ids:
        for v in frappe.get_all(
            "VP Phien Ban Artwork",
            filters={"name": ("in", dang_in_ids)},
            fields=["name", "so_phien_ban", "tep_preview"],
        ):
            printing[v.name] = v

    # Item display names.
    item_names = {}
    item_ids = list({a.item for a in arts if a.item})
    if item_ids:
        for it in frappe.get_all(
            "Item", filters={"name": ("in", item_ids)}, fields=["name", "item_name"]
        ):
            item_names[it.name] = it.item_name

    items = []
    for a in arts:
        pv = printing.get(a.phien_ban_dang_in) if a.phien_ban_dang_in else None
        items.append(
            {
                "name": a.name,
                "item": a.item,
                "item_name": item_names.get(a.item, a.item),
                "ten_artwork": a.ten_artwork,
                "loai_bao_bi": a.loai_bao_bi,
                "nha_in": a.nha_in,
                "version_count": counts.get(a.name, 0),
                "dang_in_so": pv.so_phien_ban if pv else None,
                "preview": pv.tep_preview if pv else None,
            }
        )
    return {"items": items}


@frappe.whitelist()
def get_detail(name):
    """Artwork + all its versions (newest first)."""
    _require_login()
    doc = frappe.get_doc("VP Artwork", name)
    doc.check_permission("read")
    data = doc.as_dict()
    versions = frappe.get_all(
        "VP Phien Ban Artwork",
        fields=PBAW_FIELDS,
        filters={"artwork": name},
        order_by="creation desc",
    )
    art = {k: data.get(k) for k in ARTWORK_FIELDS}
    art["item_name"] = frappe.db.get_value("Item", data.get("item"), "item_name") if data.get("item") else None
    return {"artwork": art, "versions": versions}


@frappe.whitelist()
def save_artwork(name=None, **kwargs):
    """Create/update an artwork master. VP Marketing / VP Quan Tri."""
    _require("VP Marketing")
    values = {k: kwargs.get(k) for k in ARTWORK_WRITABLE if k in kwargs}
    if name:
        doc = frappe.get_doc("VP Artwork", name)
        doc.update(values)
        doc.save()
    else:
        values["doctype"] = "VP Artwork"
        doc = frappe.get_doc(values)
        doc.insert()
    return {"name": doc.name}


@frappe.whitelist()
def add_phien_ban(artwork, so_phien_ban, ngay_duyet_in=None, lien_ket_tccs=None,
                  ly_do_thay_doi=None, set_dang_in=0):
    """Add a new artwork version. Files uploaded by the SPA afterwards."""
    _require("VP Marketing")
    if not frappe.db.exists("VP Artwork", artwork):
        frappe.throw(_("Artwork không tồn tại."))
    doc = frappe.get_doc(
        {
            "doctype": "VP Phien Ban Artwork",
            "artwork": artwork,
            "so_phien_ban": so_phien_ban,
            "trang_thai": "Dang In" if int(set_dang_in or 0) else "Thiet Ke",
            "ngay_duyet_in": ngay_duyet_in or None,
            "lien_ket_tccs": lien_ket_tccs or None,
            "ly_do_thay_doi": ly_do_thay_doi,
        }
    )
    doc.insert()
    return {"phien_ban": doc.name}


@frappe.whitelist()
def set_dang_in(phien_ban):
    """Mark a version as printing; controller stops the others + updates master."""
    _require("VP Marketing")
    doc = frappe.get_doc("VP Phien Ban Artwork", phien_ban)
    doc.trang_thai = "Dang In"
    doc.save()
    return {"ok": True, "artwork": doc.artwork, "phien_ban": doc.name}
