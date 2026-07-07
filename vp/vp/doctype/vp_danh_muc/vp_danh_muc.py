import frappe
from frappe import _
from frappe.utils.nestedset import NestedSet


class VPDanhMuc(NestedSet):
    # NestedSet manages lft/rgt/old_parent from this parent link so search by a
    # parent category (via lft/rgt) also returns documents in child categories.
    nsm_parent_field = "parent_vp_danh_muc"

    def on_trash(self):
        # Block deleting a category still holding documents (NestedSet.on_trash
        # already blocks deleting a non-empty group node).
        used = frappe.db.count("VP Van Ban", {"danh_muc": self.name})
        if used:
            frappe.throw(
                _("Không thể xóa danh mục đang gắn với {0} văn bản.").format(used)
            )
        super().on_trash()
