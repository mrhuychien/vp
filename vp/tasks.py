import frappe
from frappe.utils import getdate, nowdate, date_diff

# Selectable statuses on VP Ho So NVL (kept in sync with the DocType JSON).
NVL_CON_HIEU_LUC = "Con Hieu Luc"
NVL_SAP_HET_HAN = "Sap Het Han"
NVL_HET_HAN = "Het Han"

# Days-before-expiry threshold that flips a dossier to "Sap Het Han".
NVL_WARN_DAYS = 30


def compute_nvl_status(ngay_het_han):
    """Pure status rule, shared by controller (on save) and scheduler (daily).

    No expiry date -> always valid. Otherwise: <=0 days left = expired,
    <=NVL_WARN_DAYS = expiring soon, else valid.
    """
    if not ngay_het_han:
        return NVL_CON_HIEU_LUC
    days_left = date_diff(getdate(ngay_het_han), getdate(nowdate()))
    if days_left <= 0:
        return NVL_HET_HAN
    if days_left <= NVL_WARN_DAYS:
        return NVL_SAP_HET_HAN
    return NVL_CON_HIEU_LUC


def update_nvl_status():
    """Daily scheduler: re-evaluate trang_thai for every NVL dossier.

    Runs even when no user opens the record so list/filter/dashboard stay correct
    as time passes. Only writes rows whose status actually changed.
    """
    rows = frappe.get_all(
        "VP Ho So NVL",
        fields=["name", "ngay_het_han", "trang_thai"],
    )
    changed = 0
    for row in rows:
        new_status = compute_nvl_status(row.ngay_het_han)
        if new_status != row.trang_thai:
            frappe.db.set_value(
                "VP Ho So NVL", row.name, "trang_thai", new_status, update_modified=False
            )
            changed += 1
    if changed:
        frappe.db.commit()
    return {"scanned": len(rows), "changed": changed}


def notify_expiring():
    """Stub for future AKASHIC/Telegram notification of expiring dossiers.

    Intentionally does nothing in v1 — kept so downstream integrations have a
    stable entry point to call.
    """
    pass
