import frappe

# Never cache the shell HTML — it carries a fresh asset_version each render so
# the browser always fetches the newest JS/CSS (Frappe caches /assets 1 year).
no_cache = 1


def get_context(context):
    # Portal requires a logged-in user; bounce Guest to login and back.
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/login?redirect-to=/vp"
        raise frappe.Redirect

    try:
        from vp import __version__ as build_version
    except Exception:
        build_version = "0.0.0"

    context.no_cache = 1
    context.build_version = build_version
    # Sanitised timestamp used to cache-bust every asset URL on each full load.
    context.asset_version = (
        frappe.utils.now().replace(" ", "T").replace(":", "-").replace(".", "-")
    )
    context.csrf_token = frappe.sessions.get_csrf_token()
    context.vp_user = frappe.session.user
    context.vp_full_name = frappe.utils.get_fullname(frappe.session.user)
    return context
