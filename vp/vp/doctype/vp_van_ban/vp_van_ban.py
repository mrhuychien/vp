import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, nowdate

# Company suffix in the document number (e.g. 01/2026-CV-HGC). Change here if the
# organisation code ever changes.
COMPANY_CODE = "HGC"


class VPVanBan(Document):
    def before_insert(self):
        # Auto-assign the document number when left blank. Runs BEFORE
        # set_new_name, so the value set here becomes the document name
        # (autoname = field:ma_hieu). Can be overridden by typing ma_hieu by hand.
        if not self.ma_hieu:
            self.ma_hieu = self._generate_ma_hieu()

    def _generate_ma_hieu(self):
        """Build the next number in the form {seq:02d}/{year}-{prefix}-HGC,
        e.g. 01/2026-CV-HGC. Sequence counts per (loại, năm)."""
        prefix = (
            frappe.db.get_value("VP Loai Van Ban", self.loai_van_ban, "ma_viet_tat")
            or self.loai_van_ban
        )
        year = getdate(nowdate()).year
        suffix = "/{0}-{1}-{2}".format(year, prefix, COMPANY_CODE)

        # Lock matching rows for the duration of this transaction to avoid two
        # concurrent inserts picking the same sequence. The unique index on
        # ma_hieu is the final backstop if a race still slips through.
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

    def on_trash(self):
        # Never leave version records dangling.
        n = frappe.db.count("VP Phien Ban Van Ban", {"van_ban": self.name})
        if n:
            frappe.throw(
                _("Không thể xóa văn bản còn {0} phiên bản. Hãy xóa các phiên bản trước.").format(n)
            )
