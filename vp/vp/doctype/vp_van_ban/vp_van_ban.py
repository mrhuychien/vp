import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, nowdate


class VPVanBan(Document):
    def before_insert(self):
        # Auto-generate ma_hieu when left blank. Runs BEFORE set_new_name, so the
        # value we set here becomes the document name (autoname = field:ma_hieu).
        if not self.ma_hieu:
            self.ma_hieu = self._generate_ma_hieu()

    def _generate_ma_hieu(self):
        prefix = (
            frappe.db.get_value("VP Loai Van Ban", self.loai_van_ban, "ma_viet_tat")
            or self.loai_van_ban
        )
        year = getdate(nowdate()).year
        like = "{0}-{1}-%".format(prefix, year)

        # Lock matching rows for the duration of this transaction to avoid two
        # concurrent inserts picking the same sequence. The unique index on
        # ma_hieu is the final backstop if a race still slips through.
        rows = frappe.db.sql(
            """
            SELECT ma_hieu FROM `tabVP Van Ban`
            WHERE ma_hieu LIKE %(like)s
            FOR UPDATE
            """,
            {"like": like},
            as_dict=True,
        )
        max_seq = 0
        for r in rows:
            tail = (r.ma_hieu or "").rsplit("-", 1)[-1]
            if tail.isdigit():
                max_seq = max(max_seq, int(tail))
        return "{0}-{1}-{2:03d}".format(prefix, year, max_seq + 1)

    def on_trash(self):
        # Never leave version records dangling.
        n = frappe.db.count("VP Phien Ban Van Ban", {"van_ban": self.name})
        if n:
            frappe.throw(
                _("Không thể xóa văn bản còn {0} phiên bản. Hãy xóa các phiên bản trước.").format(n)
            )
