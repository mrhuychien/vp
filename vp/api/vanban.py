"""Văn bản ban hành — search, detail, create, versioning, thu hồi."""

import frappe
from frappe import _

from vp.api.common import _require, _require_login, _paginate, _like

VANBAN_FIELDS = [
    "name",
    "ma_hieu",
    "ten_van_ban",
    "loai_van_ban",
    "danh_muc",
    "phong_ban",
    "trang_thai",
    "phien_ban_hien_hanh",
    "ngay_ban_hanh_dau",
    "mo_ta",
]

PHIENBAN_FIELDS = [
    "name",
    "so_phien_ban",
    "trang_thai",
    "ngay_ban_hanh",
    "ngay_het_hieu_luc",
    "ly_do_sua_doi",
    "nguoi_soan",
    "nguoi_duyet",
    "tep_chinh",
    "tep_goc",
    "ghi_chu",
]


def _subtree_names(danh_muc):
    """All category names within the subtree rooted at `danh_muc` (inclusive),
    so filtering by a parent category also returns child-category documents."""
    node = frappe.db.get_value("VP Danh Muc", danh_muc, ["lft", "rgt"], as_dict=True)
    if not node:
        return [danh_muc]
    return frappe.get_all(
        "VP Danh Muc",
        filters={"lft": (">=", node.lft), "rgt": ("<=", node.rgt)},
        pluck="name",
    ) or [danh_muc]


@frappe.whitelist()
def search(keyword=None, danh_muc=None, loai=None, phong_ban=None, trang_thai="Hien Hanh", page=1):
    """Search documents. Defaults to only 'Hien Hanh'. Category filter includes
    the whole subtree. Returns {items, total, page}."""
    _require_login()
    limit, offset = _paginate(page)

    filters = {}
    if trang_thai:
        filters["trang_thai"] = trang_thai
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
            ["tu_khoa", "like", like],
        ]

    items = frappe.get_all(
        "VP Van Ban",
        fields=VANBAN_FIELDS,
        filters=filters,
        or_filters=or_filters,
        order_by="ngay_ban_hanh_dau desc, modified desc",
        limit_start=offset,
        limit_page_length=limit,
    )
    total = len(
        frappe.get_all("VP Van Ban", filters=filters, or_filters=or_filters, pluck="name")
    )
    return {"items": items, "total": total, "page": int(page or 1), "page_size": limit}


@frappe.whitelist()
def get_detail(name):
    """One document + all its versions (newest first) with file URLs."""
    _require_login()
    doc = frappe.get_doc("VP Van Ban", name)
    doc.check_permission("read")
    data = doc.as_dict()

    versions = frappe.get_all(
        "VP Phien Ban Van Ban",
        fields=PHIENBAN_FIELDS,
        filters={"van_ban": name},
        order_by="creation desc",
    )
    van_ban = {k: data.get(k) for k in VANBAN_FIELDS + ["tu_khoa"]}
    return {"van_ban": van_ban, "versions": versions}


@frappe.whitelist()
def create_van_ban(
    ten_van_ban,
    loai_van_ban,
    danh_muc,
    phong_ban=None,
    ma_hieu=None,
    tu_khoa=None,
    mo_ta=None,
    so_phien_ban="1.0",
    ngay_ban_hanh=None,
    ngay_het_hieu_luc=None,
    ly_do_sua_doi=None,
    nguoi_soan=None,
    nguoi_duyet=None,
    ghi_chu=None,
    set_hien_hanh=0,
):
    """Create a document + its first version in one call. Returns both names so
    the SPA can then upload the attachment onto the version."""
    _require("VP Bien Tap")

    van_ban = frappe.get_doc(
        {
            "doctype": "VP Van Ban",
            "ma_hieu": (ma_hieu or "").strip() or None,
            "ten_van_ban": ten_van_ban,
            "loai_van_ban": loai_van_ban,
            "danh_muc": danh_muc,
            "phong_ban": phong_ban or None,
            "tu_khoa": tu_khoa,
            "mo_ta": mo_ta,
        }
    ).insert()

    phien_ban = _insert_phien_ban(
        van_ban.name,
        so_phien_ban=so_phien_ban or "1.0",
        ngay_ban_hanh=ngay_ban_hanh,
        ngay_het_hieu_luc=ngay_het_hieu_luc,
        ly_do_sua_doi=ly_do_sua_doi,
        nguoi_soan=nguoi_soan,
        nguoi_duyet=nguoi_duyet,
        ghi_chu=ghi_chu,
        set_hien_hanh=set_hien_hanh,
    )
    return {"van_ban": van_ban.name, "phien_ban": phien_ban.name}


@frappe.whitelist()
def add_phien_ban(
    van_ban,
    so_phien_ban,
    ngay_ban_hanh=None,
    ngay_het_hieu_luc=None,
    ly_do_sua_doi=None,
    nguoi_soan=None,
    nguoi_duyet=None,
    ghi_chu=None,
    set_hien_hanh=0,
):
    """Add a new version to an existing document."""
    _require("VP Bien Tap")
    if not frappe.db.exists("VP Van Ban", van_ban):
        frappe.throw(_("Văn bản không tồn tại."))
    phien_ban = _insert_phien_ban(
        van_ban,
        so_phien_ban=so_phien_ban,
        ngay_ban_hanh=ngay_ban_hanh,
        ngay_het_hieu_luc=ngay_het_hieu_luc,
        ly_do_sua_doi=ly_do_sua_doi,
        nguoi_soan=nguoi_soan,
        nguoi_duyet=nguoi_duyet,
        ghi_chu=ghi_chu,
        set_hien_hanh=set_hien_hanh,
    )
    return {"phien_ban": phien_ban.name}


def _insert_phien_ban(van_ban, so_phien_ban, ngay_ban_hanh, ngay_het_hieu_luc,
                      ly_do_sua_doi, nguoi_soan, nguoi_duyet, ghi_chu, set_hien_hanh):
    doc = frappe.get_doc(
        {
            "doctype": "VP Phien Ban Van Ban",
            "van_ban": van_ban,
            "so_phien_ban": so_phien_ban,
            "trang_thai": "Hien Hanh" if int(set_hien_hanh or 0) else "Du Thao",
            "ngay_ban_hanh": ngay_ban_hanh or None,
            "ngay_het_hieu_luc": ngay_het_hieu_luc or None,
            "ly_do_sua_doi": ly_do_sua_doi,
            "nguoi_soan": nguoi_soan,
            "nguoi_duyet": nguoi_duyet,
            "ghi_chu": ghi_chu,
        }
    )
    # tep_chinh is reqd on the doctype, but the SPA uploads the file AFTER this
    # insert (it needs the docname to attach to). Allow the mandatory to be
    # satisfied later within the same flow.
    doc.flags.ignore_mandatory = True
    doc.insert()
    return doc


@frappe.whitelist()
def set_hien_hanh(phien_ban):
    """Make one version current; the controller demotes siblings + updates master."""
    _require("VP Bien Tap")
    doc = frappe.get_doc("VP Phien Ban Van Ban", phien_ban)
    doc.trang_thai = "Hien Hanh"
    doc.save()
    return {"ok": True, "van_ban": doc.van_ban, "phien_ban": doc.name}


@frappe.whitelist()
def thu_hoi(van_ban, ly_do=None):
    """Retire a whole document: every version -> Het Hieu Luc, master -> Het Hieu
    Luc, reason appended to master mo_ta. VP Quan Tri only."""
    _require()  # super roles only
    if not frappe.db.exists("VP Van Ban", van_ban):
        frappe.throw(_("Văn bản không tồn tại."))

    versions = frappe.get_all("VP Phien Ban Van Ban", filters={"van_ban": van_ban}, pluck="name")
    for nm in versions:
        frappe.db.set_value("VP Phien Ban Van Ban", nm, "trang_thai", "Het Hieu Luc")
        frappe.clear_document_cache("VP Phien Ban Van Ban", nm)

    note = (frappe.db.get_value("VP Van Ban", van_ban, "mo_ta") or "").strip()
    if ly_do:
        stamp = _("[Thu hồi {0}] {1}").format(frappe.utils.nowdate(), ly_do)
        note = (note + "\n" + stamp).strip() if note else stamp

    frappe.db.set_value(
        "VP Van Ban",
        van_ban,
        {"trang_thai": "Het Hieu Luc", "mo_ta": note},
    )
    frappe.clear_document_cache("VP Van Ban", van_ban)
    return {"ok": True, "van_ban": van_ban, "versions": len(versions)}
