import frappe


def execute():
    """Drop the old VP Phien Ban Van Ban doctype — versioning was replaced by the
    simplified cấp-số → ban-hành register.

    Runs in POST-model-sync so the VP Van Ban.phien_ban_hien_hanh link field is
    already gone (otherwise the delete is blocked as 'linked'). Wrapped so a
    failure can never abort `bench migrate`."""
    try:
        if frappe.db.exists("DocType", "VP Phien Ban Van Ban"):
            frappe.delete_doc(
                "DocType",
                "VP Phien Ban Van Ban",
                force=True,
                ignore_missing=True,
                ignore_permissions=True,
            )
            frappe.db.commit()
    except Exception:
        frappe.db.rollback()
        frappe.log_error(frappe.get_traceback(), "vp remove_phien_ban_van_ban patch")
