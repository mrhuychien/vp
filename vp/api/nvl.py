"""Hồ sơ nguyên vật liệu — list (grouped by Item), save, delete."""

import frappe
from frappe import _

from vp.api.common import _require, _require_login, _like

NVL_FIELDS = [
    "name",
    "item",
    "supplier",
    "loai_ho_so",
    "ten_ho_so",
    "so_hieu",
    "ngay_cap",
    "ngay_het_han",
    "tep",
    "trang_thai",
    "ghi_chu",
]

# Fields the client is allowed to set (guards against mass-assignment).
NVL_WRITABLE = [
    "item",
    "supplier",
    "loai_ho_so",
    "ten_ho_so",
    "so_hieu",
    "ngay_cap",
    "ngay_het_han",
    "ghi_chu",
]

WARN_STATES = ("Sap Het Han", "Het Han")


@frappe.whitelist()
def list_ho_so(item=None, supplier=None, loai_ho_so=None, trang_thai=None, keyword=None):
    """All dossiers grouped by Item. Each group carries a warning badge count
    (dossiers expiring / expired)."""
    _require_login()

    filters = {}
    if item:
        filters["item"] = item
    if supplier:
        filters["supplier"] = supplier
    if loai_ho_so:
        filters["loai_ho_so"] = loai_ho_so
    if trang_thai:
        filters["trang_thai"] = trang_thai

    or_filters = None
    like = _like(keyword)
    if like:
        or_filters = [
            ["ten_ho_so", "like", like],
            ["so_hieu", "like", like],
            ["item", "like", like],
        ]

    rows = frappe.get_all(
        "VP Ho So NVL",
        fields=NVL_FIELDS,
        filters=filters,
        or_filters=or_filters,
        order_by="item asc, ngay_het_han asc",
    )

    # Resolve item display names in one query.
    item_names = {}
    item_ids = list({r.item for r in rows if r.item})
    if item_ids:
        for it in frappe.get_all(
            "Item", filters={"name": ("in", item_ids)}, fields=["name", "item_name"]
        ):
            item_names[it.name] = it.item_name

    groups = {}
    order = []
    for r in rows:
        key = r.item
        if key not in groups:
            groups[key] = {
                "item": key,
                "item_name": item_names.get(key, key),
                "count": 0,
                "canh_bao": 0,
                "ho_so": [],
            }
            order.append(key)
        g = groups[key]
        g["count"] += 1
        if r.trang_thai in WARN_STATES:
            g["canh_bao"] += 1
        g["ho_so"].append(r)

    return {"groups": [groups[k] for k in order], "total": len(rows)}


@frappe.whitelist()
def save_ho_so(name=None, **kwargs):
    """Create (no name) or update (with name) a dossier. VP QC / VP Quan Tri."""
    _require("VP QC")

    values = {k: kwargs.get(k) for k in NVL_WRITABLE if k in kwargs}

    if name:
        doc = frappe.get_doc("VP Ho So NVL", name)
        doc.update(values)
        doc.save()
    else:
        values["doctype"] = "VP Ho So NVL"
        doc = frappe.get_doc(values)
        # File is uploaded by the SPA after insert; relax the mandatory here.
        doc.flags.ignore_mandatory = True
        doc.insert()
    return {"name": doc.name, "trang_thai": doc.trang_thai}


@frappe.whitelist()
def delete_ho_so(name):
    """Delete a dossier. VP Quan Tri only."""
    _require()  # super roles only
    if not frappe.db.exists("VP Ho So NVL", name):
        frappe.throw(_("Hồ sơ không tồn tại."))
    frappe.delete_doc("VP Ho So NVL", name)
    return {"ok": True}
