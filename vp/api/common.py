"""Shared helpers + boot endpoint for the VP portal.

Security model (see brief §4): every mutation endpoint gates on role via
`_require()` on its FIRST line. Reads rely on Frappe's own permission filtering
(get_all / get_doc). VP Quan Tri and System Manager always pass the gate.
"""

import frappe
from frappe import _

# Roles that may do anything in the app.
SUPER_ROLES = {"VP Quan Tri", "System Manager"}


def _roles():
    return set(frappe.get_roles())


def _has_any(*roles):
    """True if the session user holds any of `roles` (super roles always count)."""
    ur = _roles()
    return bool(ur & SUPER_ROLES) or bool(ur & set(roles))


def _require(*roles):
    """Throw PermissionError unless the user holds one of `roles` (or is super)."""
    if not _has_any(*roles):
        frappe.throw(
            _("Bạn không có quyền thực hiện thao tác này."),
            frappe.PermissionError,
        )


def _require_login():
    if frappe.session.user == "Guest":
        frappe.throw(_("Vui lòng đăng nhập."), frappe.PermissionError)


def _paginate(page=1, page_size=20):
    """Return (limit, offset) from a 1-based page + page size, clamped."""
    try:
        page = max(1, int(page or 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(100, max(1, int(page_size or 20)))
    except (TypeError, ValueError):
        page_size = 20
    return page_size, (page - 1) * page_size


def _like(keyword):
    """Build a safe LIKE value; escape SQL wildcards inside the user's keyword."""
    kw = (keyword or "").strip()
    if not kw:
        return None
    kw = kw.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return "%{0}%".format(kw)


@frappe.whitelist()
def get_boot():
    """One call for the SPA's first load: identity, capability flags, quick
    counts, category tree, document types, departments."""
    _require_login()
    user = frappe.session.user
    roles = sorted(r for r in frappe.get_roles() if r.startswith("VP "))

    counts = {
        "van_ban_da_ban_hanh": frappe.db.count("VP Van Ban", {"trang_thai": "Da Ban Hanh"}),
        "van_ban_cho_ban_hanh": frappe.db.count("VP Van Ban", {"trang_thai": "Da Cap So"}),
        "nvl_canh_bao": frappe.db.count(
            "VP Ho So NVL", {"trang_thai": ("in", ["Sap Het Han", "Het Han"])}
        ),
        "artwork": frappe.db.count("VP Artwork"),
    }

    danh_muc = frappe.get_all(
        "VP Danh Muc",
        fields=["name", "ten_danh_muc", "parent_vp_danh_muc", "is_group", "thu_tu", "lft", "rgt"],
        order_by="lft asc",
    )
    loai_van_ban = frappe.get_all(
        "VP Loai Van Ban",
        fields=["name", "ma_viet_tat", "ten_loai"],
        order_by="ma_viet_tat asc",
    )
    phong_ban = frappe.get_all(
        "Department", fields=["name", "department_name"], order_by="department_name asc"
    )

    return {
        "user": user,
        "full_name": frappe.utils.get_fullname(user),
        "roles": roles,
        "is_admin": _has_any(),  # super roles only
        "can_edit_vanban": _has_any("VP Bien Tap"),
        "can_edit_nvl": _has_any("VP QC"),
        "can_edit_artwork": _has_any("VP Marketing"),
        "counts": counts,
        "danh_muc": danh_muc,
        "loai_van_ban": loai_van_ban,
        "phong_ban": phong_ban,
    }
