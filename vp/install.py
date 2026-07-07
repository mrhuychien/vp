import frappe

# Roles owned by this app. Kept in one place so seeding + permission setup agree.
VP_ROLES = [
    "VP Quan Tri",
    "VP Bien Tap",
    "VP QC",
    "VP Marketing",
    "VP Xem",
]


def after_install():
    """Idempotent post-install setup.

    Every seed step is wrapped in try/except + log_error so a seeding hiccup can
    never kill `bench install-app` (see nextcode-build fixtures rule).
    """
    try:
        _ensure_roles()
    except Exception:
        frappe.log_error(frappe.get_traceback(), "vp after_install: ensure_roles")

    try:
        _setup_core_permissions()
    except Exception:
        frappe.log_error(frappe.get_traceback(), "vp after_install: core_permissions")

    frappe.db.commit()


def _ensure_roles():
    """Create the 5 VP roles if fixtures haven't already (safety net)."""
    for role_name in VP_ROLES:
        if not frappe.db.exists("Role", role_name):
            frappe.get_doc(
                {
                    "doctype": "Role",
                    "role_name": role_name,
                    "desk_access": 1,
                    "is_custom": 1,
                }
            ).insert(ignore_permissions=True)


def _setup_core_permissions():
    """Idempotent permission top-ups NOT expressible in DocType JSON.

    Permissions for the 7 VP DocTypes are defined inside their JSON. This hook is
    the escape hatch for anything JSON can't carry (e.g. granting System Manager
    is implicit). Currently a no-op placeholder kept for future grants — it must
    stay idempotent (guard every add_permission with a read-back).
    """
    # Example pattern for future use (kept intentionally inert):
    #
    #   from frappe.permissions import add_permission, update_permission_property
    #   if not _has_perm("VP Van Ban", "VP Bien Tap"):
    #       add_permission("VP Van Ban", "VP Bien Tap", 0)
    #       update_permission_property("VP Van Ban", "VP Bien Tap", 0, "write", 1)
    #
    return
