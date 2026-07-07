import { call, fileUrl } from '../api.js';
import {
  html, raw, escapeHtml, skeleton, emptyState,
  toast, showModal, closeModal, showLoading, hideLoading,
} from '../ui.js';

export const LOAI_BAO_BI = { 'Hop': 'Hộp', 'Tui': 'Túi', 'Nhan': 'Nhãn', 'Thung': 'Thùng', 'Khac': 'Khác' };
function baoBiOptions(selected) {
  return Object.entries(LOAI_BAO_BI).map(([v, l]) =>
    `<option value="${v}"${v === selected ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('');
}

export async function render({ container, boot, setTitle }) {
  setTitle('Artwork bao bì');
  const canEdit = boot && boot.can_edit_artwork;
  const state = { loai_bao_bi: '', keyword: '' };

  container.innerHTML = html`<div class="vp-view-pad">
    <div class="vp-flex vp-items-center vp-justify-between vp-mb-2">
      <div class="vp-view-banner-title" style="color:var(--vp-oxblood)!important;font-size:1.1rem">Artwork bao bì</div>
      ${canEdit ? raw('<button class="vp-btn-primary vp-btn-sm" id="vp-add">+ Artwork</button>') : ''}
    </div>
    <form id="vp-art-search" class="vp-search-wrap">
      <span class="vp-search-icon">🔍</span>
      <input class="vp-search" id="vp-kw" placeholder="Tên artwork, mã Item…" />
    </form>
    <div class="vp-filters">
      <select class="vp-select" id="vp-f-baobi">
        <option value="">— Tất cả loại bao bì —</option>
        ${raw(baoBiOptions(''))}
      </select>
    </div>
    <div id="vp-art-results">${raw(skeleton(120, 2))}</div>
  </div>`;

  const results = container.querySelector('#vp-art-results');

  async function load() {
    results.innerHTML = skeleton(120, 2);
    let data;
    try {
      data = await call('vp.api.artwork.list_artworks', state);
    } catch (e) {
      results.innerHTML = emptyState({ icon: '⚠️', title: 'Lỗi tải artwork', hint: e.message });
      return;
    }
    if (!data.items.length) {
      results.innerHTML = emptyState({ icon: '🎨', title: 'Chưa có artwork', hint: 'Thêm artwork để bắt đầu.' });
      return;
    }
    results.innerHTML = `<div class="vp-art-grid">` + data.items.map((a) => {
      const bg = a.preview ? `style="background-image:url('${escapeHtml(fileUrl(a.preview))}')"` : '';
      const inner = a.preview ? '' : '🎨';
      return html`
        <a class="vp-art-card" href="#/artwork/${encodeURIComponent(a.name)}">
          <div class="vp-art-img" ${raw(bg)}>${inner}</div>
          <div class="vp-art-body">
            <div class="vp-art-name">${a.ten_artwork}</div>
            <div class="vp-art-sub">${a.item_name || a.item} · ${LOAI_BAO_BI[a.loai_bao_bi] || a.loai_bao_bi || '—'}</div>
            <div class="vp-art-foot">
              ${a.dang_in_so ? raw(`<span class="vp-badge vp-badge-primary">Đang in v${escapeHtml(a.dang_in_so)}</span>`) : raw('<span class="vp-badge vp-badge-muted">Chưa in</span>')}
              <span class="vp-text-sm vp-text-muted">${a.version_count} bản</span>
            </div>
          </div>
        </a>`;
    }).join('') + `</div>`;
  }

  container.querySelector('#vp-art-search').addEventListener('submit', (e) => {
    e.preventDefault(); state.keyword = container.querySelector('#vp-kw').value.trim(); load();
  });
  container.querySelector('#vp-f-baobi').addEventListener('change', (e) => { state.loai_bao_bi = e.target.value; load(); });
  const addBtn = container.querySelector('#vp-add');
  if (addBtn) addBtn.addEventListener('click', () => openSaveModal(load));

  await load();
}

function openSaveModal(onDone) {
  showModal({
    title: 'Thêm artwork',
    body: html`
      <form id="vp-art-form">
        <div class="vp-field"><label>Mã Item (SKU thành phẩm) <span class="vp-req">*</span></label>
          <input class="vp-input" name="item" required /></div>
        <div class="vp-field"><label>Tên artwork <span class="vp-req">*</span></label><input class="vp-input" name="ten_artwork" required /></div>
        <div class="vp-field"><label>Loại bao bì</label>
          <select class="vp-select" name="loai_bao_bi"><option value="">— Không chọn —</option>${raw(baoBiOptions(''))}</select></div>
        <div class="vp-field"><label>Nhà in (mã Supplier)</label><input class="vp-input" name="nha_in" /></div>
        <div class="vp-field"><label>Ghi chú</label><textarea class="vp-textarea" name="ghi_chu"></textarea></div>
      </form>`,
    footer: `<button class="vp-btn-ghost" data-vp-cancel>Hủy</button><button class="vp-btn-primary" id="vp-art-ok">Lưu</button>`,
    onMount(root) {
      root.querySelector('[data-vp-cancel]').addEventListener('click', closeModal);
      root.querySelector('#vp-art-ok').addEventListener('click', async () => {
        const form = root.querySelector('#vp-art-form');
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        showLoading('Đang lưu…');
        try {
          const res = await call('vp.api.artwork.save_artwork', {
            item: fd.get('item'),
            ten_artwork: fd.get('ten_artwork'),
            loai_bao_bi: fd.get('loai_bao_bi') || null,
            nha_in: fd.get('nha_in') || null,
            ghi_chu: fd.get('ghi_chu') || null,
          });
          hideLoading(); closeModal(); toast('Đã lưu artwork', 'success');
          location.hash = '#/artwork/' + encodeURIComponent(res.name);
        } catch (e) { hideLoading(); toast(e.message, 'error'); }
      });
    },
  });
}
