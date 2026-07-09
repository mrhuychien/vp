import frappe


def execute():
    """Drop the old VP Phien Ban Van Ban doctype — versioning was replaced by the
    simplified cấp-số → ban-hành register. Idempotent: no-op if it never existed."""
    if frappe.db.exists("DocType", "VP Phien Ban Van Ban"):
        frappe.delete_doc("DocType", "VP Phien Ban Van Ban", force=True, ignore_permissions=True)
        frappe.db.commit()
