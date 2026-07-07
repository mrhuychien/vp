import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, nowdate

HIEN_HANH = "Hien Hanh"
HET_HIEU_LUC = "Het Hieu Luc"


class VPPhienBanVanBan(Document):
    """Core versioning logic of the app: exactly one 'Hien Hanh' version per
    document, with the master record mirroring the current version."""

    def validate(self):
        self._validate_unique_version()
        if self.trang_thai == HIEN_HANH and not self.ngay_ban_hanh:
            self.ngay_ban_hanh = nowdate()

    def _validate_unique_version(self):
        dup = frappe.db.exists(
            "VP Phien Ban Van Ban",
            {
                "van_ban": self.van_ban,
                "so_phien_ban": self.so_phien_ban,
                "name": ("!=", self.name),
            },
        )
        if dup:
            frappe.throw(
                _("Phiên bản {0} của văn bản {1} đã tồn tại.").format(
                    self.so_phien_ban, self.van_ban
                )
            )

    def on_update(self):
        if self.trang_thai == HIEN_HANH:
            self._make_current()

    def _make_current(self):
        # 1) Demote every other version of the same document. Use db.set_value on
        #    the siblings (no full-doc load, no controller recursion) + clear cache.
        siblings = frappe.get_all(
            "VP Phien Ban Van Ban",
            filters={
                "van_ban": self.van_ban,
                "name": ("!=", self.name),
                "trang_thai": HIEN_HANH,
            },
            pluck="name",
        )
        for nm in siblings:
            frappe.db.set_value("VP Phien Ban Van Ban", nm, "trang_thai", HET_HIEU_LUC)
            frappe.clear_document_cache("VP Phien Ban Van Ban", nm)

        # 2) Mirror onto the master: pointer, status, and earliest issue date.
        frappe.db.set_value(
            "VP Van Ban",
            self.van_ban,
            {
                "phien_ban_hien_hanh": self.name,
                "trang_thai": HIEN_HANH,
                "ngay_ban_hanh_dau": self._earliest_issue_date(),
            },
        )
        frappe.clear_document_cache("VP Van Ban", self.van_ban)

    def _earliest_issue_date(self):
        dates = frappe.get_all(
            "VP Phien Ban Van Ban",
            filters={"van_ban": self.van_ban, "ngay_ban_hanh": ("is", "set")},
            pluck="ngay_ban_hanh",
        )
        if self.ngay_ban_hanh:
            dates.append(self.ngay_ban_hanh)
        dates = [getdate(d) for d in dates if d]
        return min(dates) if dates else None

    def on_trash(self):
        if self.trang_thai == HIEN_HANH:
            frappe.throw(
                _("Không thể xóa phiên bản đang Hiện Hành. Hãy đặt một phiên bản khác hiện hành trước.")
            )
