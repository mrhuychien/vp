import { call, uploadFile, fileUrl } from '../api.js';
import {
  html, raw, escapeHtml, badge, formatDate, skeleton, emptyState,
  toast, showModal, closeModal, showLoading, hideLoading,
} from '../ui.js';

// Kept local so each view stays a self-contained leaf (no view -> view static
// imports, which would bypass the ?v= cache-bust / import map). Mirror of the
// map in artwork_grid.js.
const LOAI_BAO_BI = { 'Hop': 'Hộp', 'Tui': 'Túi', 'Nhan': 'Nhãn', 'Thung': 'Thùng', 'Khac': 'Khác' };

export async function render({ container, params, boot, setTitle }) {
  const name = params.name;
  setTitle(name);
  const canEdit = boot && boot.can_edit_artwork;

  async function load() {
    container.innerHTML = `<div class="vp-view-pad">${skeleton(160, 3)}</div>`;
    let data;
    try {
      data = await call('vp.api.artwork.get_detail', { name });
    } catch (e) {
      container.innerHTML = `<div class="vp-view-pad">${emptyState({ icon: '⚠️', title: 'Không tải được artwork', hint: e.message })}</div>`;
      return;
    }
    paint(data);
  }

  function paint(data) {
    const a = data.artwork;
    const printing = data.versions.find((v) => v.name === a.phien_ban_dang_in);
    const previewUrl = printing && printing.tep_preview
      ? printing.tep_preview
      : (data.versions.find((v) => v.tep_preview) || {}).tep_preview;

    const versionsHtml = data.versions.length ? data.versions.map((v) => {
      const isPrinting = v.name === a.phien_ban_dang_in;
      const acts = [];
      if (canEdit && v.trang_thai !== 'Dang In') {
        acts.push(`<button class="vp-btn-brass vp-btn-sm" data-print="${escapeHtml(v.name)}">Đặt đang in</button>`);
      }
      const files = [];
      if (v.tep_goc) files.push(`<a class="vp-file-link" href="${escapeHtml(fileUrl(v.tep_goc))}" target="_blank" rel="noopener">📎 Tệp gốc</a>`);
      if (v.tep_preview) files.push(`<a class="vp-file-link" href="${escapeHtml(fileUrl(v.tep_preview))}" target="_blank" rel="noopener">🖼️ Preview</a>`);
      return html`
        <div class="vp-tl-item ${raw(isPrinting ? 'vp-current' : '')}">
          <div class="vp-tl-head"><span class="vp-tl-ver">v${v.so_phien_ban}</span>${badge(v.trang_thai)}</div>
          <dl class="vp-tl-meta">
            ${v.ngay_duyet_in ? raw(`<dt>Duyệt in</dt><dd>${escapeHtml(formatDate(v.ngay_duyet_in))}</dd>`) : ''}
            ${v.lien_ket_tccs ? raw(`<dt>TCCS</dt><dd><a class="vp-file-link" href="#/vanban/${encodeURIComponent(v.lien_ket_tccs)}">${escapeHtml(v.lien_ket_tccs)}</a></dd>`) : ''}
            ${v.ly_do_thay_doi ? raw(`<dt>Lý do</dt><dd>${escapeHtml(v.ly_do_thay_doi)}</dd>`) : ''}
          </dl>
          <div class="vp-tl-actions">${raw(files.join(''))}${raw(acts.join(''))}</div>
        </div>`;
    }) : raw(emptyState({ title: 'Chưa có phiên bản' }));

    const bg = previewUrl ? `style="background-image:url('${escapeHtml(fileUrl(previewUrl))}')"` : '';

    container.innerHTML = html`<div class="vp-view-pad">
      <div class="vp-view-banner">
        <div>
          <div class="vp-view-banner-title">${a.ten_artwork}</div>
          <div class="vp-view-banner-subtitle">${a.item_name || a.item} · ${LOAI_BAO_BI[a.loai_bao_bi] || a.loai_bao_bi || '—'}</div>
        </div>
        <div class="vp-view-banner-badge">${a.version_count || data.versions.length} bản</div>
      </div>

      <div class="vp-art-preview" ${raw(bg)}>${previewUrl ? '' : '🎨'}</div>

      <div class="vp-card vp-mb-3">
        <dl class="vp-detail-list">
          <dt>SKU</dt><dd>${a.item}</dd>
          ${a.nha_in ? raw(`<dt>Nhà in</dt><dd>${escapeHtml(a.nha_in)}</dd>`) : ''}
          ${printing ? raw(`<dt>Đang in</dt><dd>v${escapeHtml(printing.so_phien_ban)}</dd>`) : ''}
          ${a.ghi_chu ? raw(`<dt>Ghi chú</dt><dd>${escapeHtml(a.ghi_chu)}</dd>`) : ''}
        </dl>
      </div>

      <div class="vp-flex vp-items-center vp-justify-between vp-mb-2">
        <div class="vp-section-title" style="margin:0">Phiên bản</div>
        ${canEdit ? raw('<button class="vp-btn-primary vp-btn-sm" id="vp-add-ver">+ Phiên bản</button>') : ''}
      </div>
      <div class="vp-timeline">${versionsHtml}</div>
    </div>`;

    container.querySelectorAll('[data-print]').forEach((b) => b.addEventListener('click', async () => {
      showLoading('Đang cập nhật…');
      try { await call('vp.api.artwork.set_dang_in', { phien_ban: b.dataset.print }); hideLoading(); toast('Đã đặt đang in', 'success'); load(); }
      catch (e) { hideLoading(); toast(e.message, 'error'); }
    }));
    const addVer = container.querySelector('#vp-add-ver');
    if (addVer) addVer.addEventListener('click', () => openAddVersion(a.name, load));
  }

  await load();
}

function openAddVersion(artwork, onDone) {
  showModal({
    title: 'Thêm phiên bản artwork',
    body: html`
      <form id="vp-aw-form">
        <div class="vp-field"><label>Số phiên bản <span class="vp-req">*</span></label>
          <input class="vp-input" name="so_phien_ban" placeholder="VD: 2.0" required /></div>
        <div class="vp-field"><label>Ngày duyệt in</label><input class="vp-input" type="date" name="ngay_duyet_in" /></div>
        <div class="vp-field"><label>Liên kết TCCS (mã hiệu văn bản)</label><input class="vp-input" name="lien_ket_tccs" placeholder="VD: TCCS-2026-001" /></div>
        <div class="vp-field"><label>Lý do thay đổi</label><textarea class="vp-textarea" name="ly_do_thay_doi"></textarea></div>
        <div class="vp-field"><label>Tệp gốc (AI/PDF)</label><input class="vp-input" type="file" name="tep_goc" /></div>
        <div class="vp-field"><label>Tệp preview (ảnh)</label><input class="vp-input" type="file" name="tep_preview" accept="image/*" /></div>
        <label class="vp-flex vp-items-center vp-gap-2" style="font-weight:600">
          <input type="checkbox" name="set_dang_in" /> Đặt đang in ngay</label>
      </form>`,
    footer: `<button class="vp-btn-ghost" data-vp-cancel>Hủy</button><button class="vp-btn-primary" id="vp-aw-ok">Thêm</button>`,
    onMount(root) {
      root.querySelector('[data-vp-cancel]').addEventListener('click', closeModal);
      root.querySelector('#vp-aw-ok').addEventListener('click', async () => {
        const form = root.querySelector('#vp-aw-form');
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        showLoading('Đang thêm phiên bản…');
        try {
          const res = await call('vp.api.artwork.add_phien_ban', {
            artwork,
            so_phien_ban: fd.get('so_phien_ban'),
            ngay_duyet_in: fd.get('ngay_duyet_in') || null,
            lien_ket_tccs: fd.get('lien_ket_tccs') || null,
            ly_do_thay_doi: fd.get('ly_do_thay_doi') || null,
            set_dang_in: form.set_dang_in.checked ? 1 : 0,
          });
          const tepGoc = form.tep_goc.files[0];
          const tepPreview = form.tep_preview.files[0];
          if (tepGoc) await uploadFile({ file: tepGoc, doctype: 'VP Phien Ban Artwork', docname: res.phien_ban, fieldname: 'tep_goc' });
          if (tepPreview) await uploadFile({ file: tepPreview, doctype: 'VP Phien Ban Artwork', docname: res.phien_ban, fieldname: 'tep_preview' });
          hideLoading(); closeModal(); toast('Đã thêm phiên bản', 'success'); onDone();
        } catch (e) { hideLoading(); toast(e.message, 'error'); }
      });
    },
  });
}
