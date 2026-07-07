import frappe
from frappe import _
from frappe.model.document import Document


class VPArtwork(Document):
    def on_trash(self):
        n = frappe.db.count("VP Phien Ban Artwork", {"artwork": self.name})
        if n:
            frappe.throw(
                _("Không thể xóa artwork còn {0} phiên bản. Hãy xóa các phiên bản trước.").format(n)
            )
