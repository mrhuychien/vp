import frappe

from vp.api.common import qr_data_uri

# Public landing page for an issued document. Reachable at /vb/<token> without
# login (route rule in hooks.py). We read via frappe.db.get_value (no permission
# check) so a Guest can see exactly the one document the secret token unlocks.
# Viewing this metadata page is free; the actual file is served (and counted) by
# vp.api.public.tai.
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
                "so_lan_truy_cap", "gioi_han_truy_cap",
            ],
            as_dict=True,
        )
        if row:
            row["loai_ten"] = (
                frappe.db.get_value("VP Loai Van Ban", row.loai_van_ban, "ten_loai")
                or row.loai_van_ban
            )
            row["ngay_str"] = (
                frappe.utils.formatdate(row.ngay_ban_hanh, "dd/MM/yyyy")
                if row.ngay_ban_hanh else ""
            )
            limit = row.gioi_han_truy_cap or 0
            used = row.so_lan_truy_cap or 0
            row["limit"] = limit
            row["con_lai"] = max(0, limit - used) if limit else None
            row["het_luot"] = bool(limit) and used >= limit
            row["has_file"] = bool(row.tep_dinh_kem or row.lien_ket_ngoai)
            # Counted serve endpoint (view/download goes through here).
            row["tai_url"] = "/api/method/vp.api.public.tai?token=" + token
            row["qr"] = qr_data_uri("{0}/vb/{1}".format(frappe.utils.get_url(), token))
            context.doc = row

    return context
