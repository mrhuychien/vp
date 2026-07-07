import frappe
from frappe import _
from frappe.model.document import Document


class VPLoaiVanBan(Document):
    def on_trash(self):
        # Do not orphan documents that reference this type.
        used = frappe.db.count("VP Van Ban", {"loai_van_ban": self.name})
        if used:
            frappe.throw(
                _("Không thể xóa loại văn bản đang được {0} văn bản sử dụng.").format(used)
            )
