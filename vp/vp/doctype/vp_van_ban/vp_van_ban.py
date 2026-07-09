import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, nowdate

# Company suffix in the document number (e.g. 01/2026-CV-HGC). Change here if the
# organisation code ever changes.
COMPANY_CODE = "HGC"

DA_CAP_SO = "Da Cap So"
DA_BAN_HANH = "Da Ban Hanh"
HUY = "Huy"


class VPVanBan(Document):
    """Simplified issuance register: cấp số (assign number + date) -> ban hành
    (attach scan / external link -> public link). One record per document, no
    version sub-documents."""

    def before_insert(self):
        # Step 1 "cấp số": assign the number + date the moment the record is
        # created. ma_hieu can be overridden by typing it by hand.
        if not self.ma_hieu:
            self.ma_hieu = self._generate_ma_hieu()
        if not self.ngay_cap_so:
            self.ngay_cap_so = nowdate()
        if not self.ngay_ban_hanh:
            self.ngay_ban_hanh = self.ngay_cap_so
        if not self.trang_thai:
            self.trang_thai = DA_CAP_SO

    def _generate_ma_hieu(self):
        """Next number in the form {seq:02d}/{year}-{prefix}-HGC (per loại, năm)."""
        prefix = (
            frappe.db.get_value("VP Loai Van Ban", self.loai_van_ban, "ma_viet_tat")
            or self.loai_van_ban
        )
        year = getdate(self.ngay_ban_hanh or nowdate()).year
        suffix = "/{0}-{1}-{2}".format(year, prefix, COMPANY_CODE)

        # Row-lock matching numbers for this transaction; unique index backstops.
        rows = frappe.db.sql(
            """
            SELECT ma_hieu FROM `tabVP Van Ban`
            WHERE ma_hieu LIKE %(like)s
            FOR UPDATE
            """,
            {"like": "%" + suffix},
            as_dict=True,
        )
        max_seq = 0
        for r in rows:
            head = (r.ma_hieu or "").split("/", 1)[0]
            if head.isdigit():
                max_seq = max(max_seq, int(head))
        return "{0:02d}{1}".format(max_seq + 1, suffix)

    def ensure_public_token(self):
        if not self.public_token:
            self.public_token = frappe.generate_hash(length=24)
        return self.public_token

    def public_url(self):
        if not self.public_token:
            return None
        return "{0}/vb/{1}".format(frappe.utils.get_url(), self.public_token)

    def on_trash(self):
        # Keep the register intact: an issued document is cancelled ("Hủy"),
        # not silently deleted.
        if self.trang_thai == DA_BAN_HANH:
            frappe.throw(
                _("Văn bản đã ban hành — hãy dùng 'Hủy' thay vì xóa để giữ sổ văn bản.")
            )
