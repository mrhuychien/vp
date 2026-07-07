import frappe
from frappe import _
from frappe.model.document import Document

DANG_IN = "Dang In"
NGUNG_IN = "Ngung In"


class VPPhienBanArtwork(Document):
    def validate(self):
        dup = frappe.db.exists(
            "VP Phien Ban Artwork",
            {
                "artwork": self.artwork,
                "so_phien_ban": self.so_phien_ban,
                "name": ("!=", self.name),
            },
        )
        if dup:
            frappe.throw(
                _("Phiên bản {0} của artwork {1} đã tồn tại.").format(
                    self.so_phien_ban, self.artwork
                )
            )

    def on_update(self):
        if self.trang_thai == DANG_IN:
            self._make_printing()

    def _make_printing(self):
        # Only one printing version per artwork: stop the others, then point the
        # master at this one.
        siblings = frappe.get_all(
            "VP Phien Ban Artwork",
            filters={
                "artwork": self.artwork,
                "name": ("!=", self.name),
                "trang_thai": DANG_IN,
            },
            pluck="name",
        )
        for nm in siblings:
            frappe.db.set_value("VP Phien Ban Artwork", nm, "trang_thai", NGUNG_IN)
            frappe.clear_document_cache("VP Phien Ban Artwork", nm)

        frappe.db.set_value("VP Artwork", self.artwork, "phien_ban_dang_in", self.name)
        frappe.clear_document_cache("VP Artwork", self.artwork)

    def on_trash(self):
        if self.trang_thai == DANG_IN:
            frappe.throw(
                _("Không thể xóa phiên bản artwork đang in. Hãy đặt phiên bản khác đang in trước.")
            )
