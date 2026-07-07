app_name = "vp"
app_title = "Văn Phòng"
app_publisher = "RVHG"
app_description = "Quản lý văn bản ban hành, hồ sơ NVL, artwork bao bì"
app_email = "it@rongvanghoanggia.com"
app_license = "Proprietary"

# ---------------------------------------------------------------------------
# Assets (SPA loads its own assets via www/vp.html import map; nothing global)
# ---------------------------------------------------------------------------
# We intentionally do NOT inject app_include_js/css globally into Desk —
# the portal at /vp is a self-contained www page.

# ---------------------------------------------------------------------------
# Installation
# ---------------------------------------------------------------------------
after_install = "vp.install.after_install"

# ---------------------------------------------------------------------------
# Fixtures — roles + master seed data.
# Custom DocPerm is intentionally NOT shipped as a fixture (hash name changes
# between sites → broken import). Permissions live in each DocType JSON, and
# any extra grants are applied idempotently in install._setup_core_permissions.
# ---------------------------------------------------------------------------
fixtures = [
    {
        "dt": "Role",
        "filters": [
            [
                "name",
                "in",
                [
                    "VP Quan Tri",
                    "VP Bien Tap",
                    "VP QC",
                    "VP Marketing",
                    "VP Xem",
                ],
            ]
        ],
    },
    {"dt": "VP Loai Van Ban"},
    {"dt": "VP Danh Muc"},
]

# ---------------------------------------------------------------------------
# Scheduler — refresh NVL dossier status daily so list/filter stay correct
# even when nobody opens the record.
# ---------------------------------------------------------------------------
scheduler_events = {
    "daily": [
        "vp.tasks.update_nvl_status",
    ],
}
