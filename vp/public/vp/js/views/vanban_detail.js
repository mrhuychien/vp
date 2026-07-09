import { call, uploadFile, fileUrl } from '../api.js';
import {
  html, raw, escapeHtml, badge, formatDate, statusLabel, skeleton, emptyState,
  toast, showModal, closeModal, confirmDialog, showLoading, hideLoading,
} from '../ui.js';

export async function render({ container, params, boot, setTitle }) {
  const name = params.name;
  setTitle(name);
  const canEdit = boot && boot.can_edit_vanban;
  const isAdmin = boot && boot.is_admin;

  async function load() {
    container.innerHTML = `<div class="vp-view-pad">${skeleton(120, 4)}</div>`;
    let data;
    try {
      data = await call('vp.api.vanban.get_detail', { name });
    } catch (e) {
      container.innerHTML = `<div class="vp-view-pad">${emptyState({ icon: '⚠️', title: 'Không tải được văn bản', hint: e.message })}</div>`;
      return;
    }
    paint(data);
  }

  function paint(data) {
    const vb = data.van_ban;
    const current = data.versions.find((v) => v.name === vb.phien_ban_hien_hanh);
    const dl = current && current.tep_chinh;

    const versionsHtml = data.versions.length ? data.versions.map((v) => {
      const isCur = v.name === vb.phien_ban_hien_hanh;
      const acts = [];
      if (canEdit && !isCur && v.trang_thai !== 'Hien Hanh') {
        acts.push(`<button class="vp-btn-brass vp-btn-sm" data-set="${escapeHtml(v.name)}">Đặt hiện hành</button>`);
      }
      const files = [];
      if (v.tep_chinh) files.push(`<a class="vp-file-link" href="${escapeHtml(fileUrl(v.tep_chinh))}" target="_blank" rel="noopener">📄 Tệp chính</a>`);
      if (v.tep_goc) files.push(`<a class="vp-file-link" href="${escapeHtml(fileUrl(v.tep_goc))}" target="_blank" rel="noopener">📎 Tệp gốc</a>`);
      return html`
        <div class="vp-tl-item ${raw(isCur ? 'vp-current' : '')}">
          <div class="vp-tl-head">
            <span class="vp-tl-ver">v${v.so_phien_ban}</span>
            ${badge(v.trang_thai)}
          </div>
          <dl class="vp-tl-meta">
            <dt>Ban hành</dt><dd>${formatDate(v.ngay_ban_hanh)}</dd>
            ${v.ngay_het_hieu_luc ? raw(`<dt>Hết hiệu lực</dt><dd>${escapeHtml(formatDate(v.ngay_het_hieu_luc))}</dd>`) : ''}
            ${v.ly_do_sua_doi ? raw(`<dt>Lý do sửa đổi</dt><dd>${escapeHtml(v.ly_do_sua_doi)}</dd>`) : ''}
            ${v.nguoi_soan ? raw(`<dt>Người soạn</dt><dd>${escapeHtml(v.nguoi_soan)}</dd>`) : ''}
            ${v.nguoi_duyet ? raw(`<dt>Người duyệt</dt><dd>${escapeHtml(v.nguoi_duyet)}</dd>`) : ''}
          </dl>
          <div class="vp-tl-actions">${raw(files.join(''))}${raw(acts.join(''))}</div>
        </div>`;
    }) : raw(emptyState({ title: 'Chưa có phiên bản' }));

    container.innerHTML = html`<div class="vp-view-pad">
      <div class="vp-view-banner">
        <div>
          <div class="vp-view-banner-title">${vb.ma_hieu}</div>
          <div class="vp-view-banner-subtitle">${vb.ten_van_ban}</div>
        </div>
        <div class="vp-view-banner-badge">${statusLabel(vb.trang_thai)}</div>
      </div>

      ${dl ? raw(`<a class="vp-download-cta" href="${escapeHtml(fileUrl(dl))}" target="_blank" rel="noopener">⬇️ Tải bản hiện hành (v${escapeHtml(current.so_phien_ban)})</a>`) : ''}

      <div class="vp-card vp-mb-3">
        <dl class="vp-detail-list">
          <dt>Loại</dt><dd>${vb.loai_van_ban}</dd>
          <dt>Danh mục</dt><dd>${vb.danh_muc}</dd>
          ${vb.phong_ban ? raw(`<dt>Phòng ban</dt><dd>${escapeHtml(vb.phong_ban)}</dd>`) : ''}
          ${vb.ngay_ban_hanh_dau ? raw(`<dt>Ban hành đầu</dt><dd>${escapeHtml(formatDate(vb.ngay_ban_hanh_dau))}</dd>`) : ''}
          ${vb.tu_khoa ? raw(`<dt>Từ khóa</dt><dd>${escapeHtml(vb.tu_khoa)}</dd>`) : ''}
          ${vb.mo_ta ? raw(`<dt>Mô tả</dt><dd>${escapeHtml(vb.mo_ta)}</dd>`) : ''}
        </dl>
      </div>

      <div class="vp-flex vp-items-center vp-justify-between vp-mb-2">
        <div class="vp-section-title" style="margin:0">Phiên bản</div>
        <div class="vp-btn-row">
          ${canEdit ? raw('<button class="vp-btn-primary vp-btn-sm" id="vp-add-ver">+ Phiên bản</button>') : ''}
          ${isAdmin && vb.trang_thai !== 'Het Hieu Luc' ? raw('<button class="vp-btn-danger vp-btn-sm" id="vp-thuhoi">Thu hồi</button>') : ''}
        </div>
      </div>
      <div class="vp-timeline">${versionsHtml}</div>
    </div>`;

    // bindings
    container.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', async () => {
      showLoading('Đang cập nhật…');
      try {
        await call('vp.api.vanban.set_hien_hanh', { phien_ban: b.dataset.set });
        hideLoading(); toast('Đã đặt hiện hành', 'success'); load();
      } catch (e) { hideLoading(); toast(e.message, 'error'); }
    }));
    const addVer = container.querySelector('#vp-add-ver');
    if (addVer) addVer.addEventListener('click', () => openAddVersion(vb.name, load));
    const thuhoi = container.querySelector('#vp-thuhoi');
    if (thuhoi) thuhoi.addEventListener('click', () => openThuHoi(vb.name));
  }

  function openThuHoi(vanBan) {
    showModal({
      title: 'Thu hồi văn bản',
      body: html`
        <p class="vp-confirm-msg">Toàn bộ phiên bản sẽ chuyển <strong>Hết hiệu lực</strong>. Thao tác này không tự hoàn tác.</p>
        <div class="vp-field"><label>Lý do thu hồi</label><textarea class="vp-textarea" id="vp-thuhoi-lydo"></textarea></div>`,
      footer: `<button class="vp-btn-ghost" data-vp-cancel>Hủy</button><button class="vp-btn-danger" id="vp-thuhoi-ok">Thu hồi</button>`,
      onMount(root) {
        root.querySelector('[data-vp-cancel]').addEventListener('click', closeModal);
        root.querySelector('#vp-thuhoi-ok').addEventListener('click', async () => {
          const lyDo = root.querySelector('#vp-thuhoi-lydo').value.trim();
          closeModal(); showLoading('Đang thu hồi…');
          try {
            await call('vp.api.vanban.thu_hoi', { van_ban: vanBan, ly_do: lyDo });
            hideLoading(); toast('Đã thu hồi văn bản', 'success'); load();
          } catch (e) { hideLoading(); toast(e.message, 'error'); }
        });
      },
    });
  }

  await load();
}

function openAddVersion(vanBan, onDone) {
  showModal({
    title: 'Thêm phiên bản mới',
    body: html`
      <form id="vp-ver-form">
        <div class="vp-req-note">Các trường có dấu <span class="vp-req">*</span> là bắt buộc. Phần còn lại có thể để trống.</div>

        <div class="vp-field"><label>Số phiên bản <span class="vp-req">*</span></label>
          <input class="vp-input" name="so_phien_ban" placeholder="VD: 2.0" required /></div>
        <div class="vp-field"><label>Tệp chính (PDF) <span class="vp-req">*</span></label>
          <input class="vp-input" type="file" name="tep_chinh" accept="application/pdf" required /></div>

        <label class="vp-check-row"><input type="checkbox" name="set_hien_hanh" checked /> Ban hành & đặt hiện hành ngay</label>

        <details class="vp-optional">
          <summary>Thông tin bổ sung (tự chọn)</summary>
          <div class="vp-field"><label>Ngày ban hành</label>
            <input class="vp-input" type="date" name="ngay_ban_hanh" />
            <span class="vp-hint">Để trống sẽ tự lấy ngày hôm nay khi ban hành.</span></div>
          <div class="vp-field"><label>Ngày hết hiệu lực</label><input class="vp-input" type="date" name="ngay_het_hieu_luc" /></div>
          <div class="vp-field"><label>Lý do sửa đổi</label><textarea class="vp-textarea" name="ly_do_sua_doi"></textarea></div>
          <div class="vp-field"><label>Người soạn</label><input class="vp-input" name="nguoi_soan" /></div>
          <div class="vp-field"><label>Người duyệt</label><input class="vp-input" name="nguoi_duyet" /></div>
          <div class="vp-field"><label>Tệp gốc</label><input class="vp-input" type="file" name="tep_goc" /></div>
        </details>
      </form>`,
    footer: `<button class="vp-btn-ghost" data-vp-cancel>Hủy</button><button class="vp-btn-primary" id="vp-ver-ok">Thêm</button>`,
    onMount(root) {
      root.querySelector('[data-vp-cancel]').addEventListener('click', closeModal);
      root.querySelector('#vp-ver-ok').addEventListener('click', async () => {
        const form = root.querySelector('#vp-ver-form');
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        const tepChinh = form.tep_chinh.files[0];
        if (!tepChinh) { toast('Vui lòng chọn tệp chính (PDF).', 'error'); return; }
        const tepGoc = form.tep_goc.files[0];
        showLoading('Đang thêm phiên bản…');
        try {
          const res = await call('vp.api.vanban.add_phien_ban', {
            van_ban: vanBan,
            so_phien_ban: fd.get('so_phien_ban'),
            ngay_ban_hanh: fd.get('ngay_ban_hanh') || null,
            ngay_het_hieu_luc: fd.get('ngay_het_hieu_luc') || null,
            ly_do_sua_doi: fd.get('ly_do_sua_doi') || null,
            nguoi_soan: fd.get('nguoi_soan') || null,
            nguoi_duyet: fd.get('nguoi_duyet') || null,
            set_hien_hanh: form.set_hien_hanh.checked ? 1 : 0,
          });
          await uploadFile({ file: tepChinh, doctype: 'VP Phien Ban Van Ban', docname: res.phien_ban, fieldname: 'tep_chinh' });
          if (tepGoc) await uploadFile({ file: tepGoc, doctype: 'VP Phien Ban Van Ban', docname: res.phien_ban, fieldname: 'tep_goc' });
          hideLoading(); closeModal(); toast('Đã thêm phiên bản', 'success'); onDone();
        } catch (e) { hideLoading(); toast(e.message, 'error'); }
      });
    },
  });
}
