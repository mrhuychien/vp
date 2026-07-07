import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate

from vp.tasks import compute_nvl_status


class VPHoSoNVL(Document):
    def validate(self):
        if (
            self.ngay_cap
            and self.ngay_het_han
            and getdate(self.ngay_het_han) <= getdate(self.ngay_cap)
        ):
            frappe.throw(_("Ngày hết hạn phải sau ngày cấp."))
        # Compute status on every save so a freshly-saved record is already correct
        # without waiting for the daily scheduler.
        self.trang_thai = compute_nvl_status(self.ngay_het_han)
