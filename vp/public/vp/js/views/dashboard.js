import { call } from '../api.js';
import { html, raw, escapeHtml, badge, formatDate, emptyState, skeleton } from '../ui.js';

function statCard(label, value, cls = '') {
  return html`
    <div class="vp-kpi-card">
      <div class="vp-kpi-label">${label}</div>
      <div class="vp-kpi-value ${raw(cls)}">${value}</div>
    </div>`;
}

function nvlRow(r) {
  const days = r.days_left == null ? '' :
    (r.days_left <= 0 ? `Quá hạn ${Math.abs(r.days_left)} ngày` : `Còn ${r.days_left} ngày`);
  return html`
    <a class="vp-list-row" href="#/nvl">
      <div class="vp-list-main">
        <div class="vp-list-title">${r.item_name || r.item}</div>
        <div class="vp-list-sub">${r.ten_ho_so} · ${formatDate(r.ngay_het_han)}</div>
      </div>
      <div class="vp-list-end">${badge(r.trang_thai)}<div class="vp-text-sm vp-text-muted vp-mt-1">${days}</div></div>
    </a>`;
}

function vbRow(r) {
  return html`
    <a class="vp-list-row" href="#/vanban/${encodeURIComponent(r.name)}">
      <div class="vp-list-main">
        <div class="vp-list-title">${r.ma_hieu} — ${r.ten_van_ban}</div>
        <div class="vp-list-sub">${r.loai_van_ban || ''} · ${formatDate(r.ngay_ban_hanh)}${r.nguoi_nhan ? ' · ' + r.nguoi_nhan : ''}</div>
      </div>
      <div class="vp-list-end">${badge(r.trang_thai)}</div>
    </a>`;
}

function section(title, rows, renderRow, emptyHint) {
  const body = rows && rows.length
    ? rows.map(renderRow)
    : raw(`<div class="vp-text-sm vp-text-muted" style="padding:.5rem .25rem">${escapeHtml(emptyHint)}</div>`);
  return html`
    <div class="vp-section-title">${title}</div>
    <div class="vp-card"><div class="vp-list">${body}</div></div>`;
}

export async function render({ container, boot, setTitle }) {
  setTitle('Văn Phòng');
  const c = boot ? boot.counts : {};

  container.innerHTML = html`<div class="vp-view-pad" id="vp-dash">
    <div class="vp-view-banner">
      <div>
        <div class="vp-view-banner-title">Xin chào${boot ? ', ' + escapeHtml(boot.full_name) : ''}</div>
        <div class="vp-view-banner-subtitle">Sổ văn bản, hồ sơ NVL & artwork — RVHG</div>
      </div>
      <div class="vp-view-banner-badge">ISO 22000</div>
    </div>

    <form id="vp-quick" class="vp-search-wrap">
      <span class="vp-search-icon">🔍</span>
      <input class="vp-search" name="kw" placeholder="Tra cứu văn bản theo số, tên nội dung, nơi nhận…" />
    </form>

    <div class="vp-kpi-grid vp-mb-3">
      ${statCard('VB đã ban hành', c.van_ban_da_ban_hanh || 0, 'vp-brass')}
      ${statCard('Chờ ban hành', c.van_ban_cho_ban_hanh || 0, (c.van_ban_cho_ban_hanh ? 'vp-warning' : ''))}
      ${statCard('NVL cảnh báo', c.nvl_canh_bao || 0, (c.nvl_canh_bao ? 'vp-warning' : ''))}
      ${statCard('Artwork', c.artwork || 0)}
    </div>
    <div id="vp-dash-body">${raw(skeleton(90, 3))}</div>
  </div>`;

  container.querySelector('#vp-quick').addEventListener('submit', (e) => {
    e.preventDefault();
    const kw = e.target.kw.value.trim();
    location.hash = '#/vanban' + (kw ? '?kw=' + encodeURIComponent(kw) : '');
  });

  let data;
  try {
    data = await call('vp.api.dashboard.get_dashboard');
  } catch (e) {
    container.querySelector('#vp-dash-body').innerHTML = emptyState({ icon: '⚠️', title: 'Không tải được dữ liệu', hint: e.message });
    return;
  }

  container.querySelector('#vp-dash-body').innerHTML =
    section('🔴 NVL đã hết hạn', data.nvl_het_han, nvlRow, 'Không có hồ sơ hết hạn.') +
    section('🟠 NVL sắp hết hạn (30 ngày)', data.nvl_sap_het_han, nvlRow, 'Không có hồ sơ sắp hết hạn.') +
    section('📝 Văn bản chờ ban hành', data.van_ban_cho_ban_hanh, vbRow, 'Không có văn bản chờ ban hành.') +
    section('🆕 Văn bản mới ban hành (30 ngày)', data.van_ban_moi, vbRow, 'Chưa có văn bản mới.');
}
