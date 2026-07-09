"""Guest-facing endpoint for issued documents, gated by a per-document limit.

The scan is kept PRIVATE and only ever reaches an external viewer through here,
so every view/download is counted. When the limit is hit, access is blocked
until an editor issues a fresh link ('cấp lại')."""

import frappe
from frappe import _


@frappe.whitelist(allow_guest=True)
def tai(token=None):
    """Serve (view/download) the document for a valid public token, counting the
    access. Serves the private scan, or redirects to the external link."""
    if not token:
        frappe.throw(_("Liên kết không hợp lệ."), frappe.PermissionError)

    row = frappe.db.get_value(
        "VP Van Ban",
        {"public_token": token, "trang_thai": "Da Ban Hanh"},
        ["name", "so_lan_truy_cap", "gioi_han_truy_cap", "tep_dinh_kem", "lien_ket_ngoai"],
        as_dict=True,
    )
    if not row:
        frappe.throw(_("Không tìm thấy văn bản hoặc đã ngừng chia sẻ."), frappe.DoesNotExistError)

    limit = row.gioi_han_truy_cap or 0
    used = row.so_lan_truy_cap or 0
    if limit and used >= limit:
        frappe.throw(
            _("Đã hết lượt xem/tải ({0}/{0}). Vui lòng liên hệ văn phòng để được cấp lại link.").format(limit)
        )

    # Count this access before serving.
    frappe.db.set_value("VP Van Ban", row.name, "so_lan_truy_cap", used + 1, update_modified=False)
    frappe.db.commit()

    if row.tep_dinh_kem:
        from frappe.utils.file_manager import get_file

        fname, content = get_file(row.tep_dinh_kem)
        frappe.local.response.filename = fname
        frappe.local.response.filecontent = content
        frappe.local.response.type = "download"
        return

    if row.lien_ket_ngoai:
        frappe.local.response["type"] = "redirect"
        frappe.local.response["location"] = row.lien_ket_ngoai
        return

    frappe.throw(_("Văn bản chưa có tệp đính kèm."))
