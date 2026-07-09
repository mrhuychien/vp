import frappe

# Public landing page for an issued document. Reachable at /vb/<token> without
# login (route rule in hooks.py). We read via frappe.db.get_value (no permission
# check) so a Guest can see exactly the one document the secret token unlocks.
no_cache = 1


def get_context(context):
    token = frappe.form_dict.get("token") or frappe.form_dict.get("t")
    context.doc = None
    context.no_cache = 1

    if token:
        row = frappe.db.get_value(
            "VP Van Ban",
            {"public_token": token, "trang_thai": "Da Ban Hanh"},
            [
                "name", "ma_hieu", "ten_van_ban", "loai_van_ban",
                "ngay_ban_hanh", "nguoi_nhan", "tep_dinh_kem", "lien_ket_ngoai", "mo_ta",
            ],
            as_dict=True,
        )
        if row:
            row["loai_ten"] = (
                frappe.db.get_value("VP Loai Van Ban", row.loai_van_ban, "ten_loai")
                or row.loai_van_ban
            )
            # Prefer the uploaded (public) scan; fall back to the external link.
            row["file_url"] = row.tep_dinh_kem or row.lien_ket_ngoai
            row["ngay_str"] = (
                frappe.utils.formatdate(row.ngay_ban_hanh, "dd/MM/yyyy")
                if row.ngay_ban_hanh else ""
            )
            context.doc = row

    return context
