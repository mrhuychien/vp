import { call } from '../api.js';
import {
  html, raw, escapeHtml, badge, formatDate, skeleton, emptyState,
  toast, showModal, closeModal, showLoading, hideLoading,
} from '../ui.js';

const PAGE_SIZE = 20;

function categoryOptions(danhMuc, selected) {
  const byName = {};
  danhMuc.forEach((d) => { byName[d.name] = d; });
  const depth = (d) => {
    let n = 0, cur = d;
    while (cur && cur.parent_vp_danh_muc) { n++; cur = byName[cur.parent_vp_danh_muc]; if (n > 20) break; }
    return n;
  };
  return danhMuc.map((d) => {
    const pad = '  '.repeat(depth(d));
    const sel = d.name === selected ? ' selected' : '';
    return `<option value="${escapeHtml(d.name)}"${sel}>${pad}${escapeHtml(d.ten_danh_muc)}</option>`;
  }).join('');
}
function options(items, valueKey, labelKey, selected, placeholder) {
  let out = placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : '';
  out += items.map((it) => {
    const v = it[valueKey], l = it[labelKey] || it[valueKey];
    return `<option value="${escapeHtml(v)}"${v === selected ? ' selected' : ''}>${escapeHtml(l)}</option>`;
  }).join('');
  return out;
}

export async function render({ container, query, boot, setTitle }) {
  setTitle('Văn bản');
  const canEdit = boot && boot.can_edit_vanban;

  const state = {
    keyword: query.kw || '',
    danh_muc: query.danh_muc || '',
    loai: query.loai || '',
    trang_thai: query.trang_thai || '',
    page: 1,
  };

  container.innerHTML = html`<div class="vp-view-pad">
    <div class="vp-flex vp-items-center vp-justify-between vp-mb-2">
      <div class="vp-view-banner-title" style="color:var(--vp-oxblood)!important;font-size:1.1rem">Sổ văn bản</div>
      ${canEdit ? raw('<button class="vp-btn-primary vp-btn-sm" id="vp-add">+ Cấp số</button>') : ''}
    </div>

    <form id="vp-search-form" class="vp-search-wrap">
      <span class="vp-search-icon">🔍</span>
      <input class="vp-search" id="vp-kw" placeholder="Số, tên nội dung, nơi nhận, từ khóa…" value="${escapeHtml(state.keyword)}" />
    </form>

    <div class="vp-filters">
      <select class="vp-select" id="vp-f-loai">
        ${raw(options(boot.loai_van_ban, 'name', 'ten_loai', state.loai, '— Tất cả loại —'))}
      </select>
      <select class="vp-select" id="vp-f-danhmuc">
        <option value="">— Tất cả danh mục —</option>
        ${raw(categoryOptions(boot.danh_muc, state.danh_muc))}
      </select>
      <select class="vp-select" id="vp-f-trangthai">
        <option value=""${state.trang_thai === '' ? ' selected' : ''}>Tất cả (trừ hủy)</option>
        <option value="Da Cap So"${state.trang_thai === 'Da Cap So' ? ' selected' : ''}>Đã cấp số</option>
        <option value="Da Ban Hanh"${state.trang_thai === 'Da Ban Hanh' ? ' selected' : ''}>Đã ban hành</option>
        <option value="Huy"${state.trang_thai === 'Huy' ? ' selected' : ''}>Hủy</option>
      </select>
    </div>

    <div id="vp-results">${raw(skeleton(70, 5))}</div>
  </div>`;

  const results = container.querySelector('#vp-results');

  async function load() {
    results.innerHTML = skeleton(70, 5);
    let data;
    try {
      data = await call('vp.api.vanban.search', { ...state, page: state.page });
    } catch (e) {
      results.innerHTML = emptyState({ icon: '⚠️', title: 'Lỗi tra cứu', hint: e.message });
      return;
    }
    if (!data.items.length) {
      results.innerHTML = emptyState({ title: 'Không có văn bản', hint: 'Bấm “+ Cấp số” để lập văn bản mới.' });
      return;
    }
    const rows = data.items.map((r) => html`
      <tr class="vp-row-click" data-name="${r.name}">
        <td data-label="Số"><strong>${r.ma_hieu}</strong></td>
        <td data-label="Tên nội dung">${r.ten_van_ban}</td>
        <td data-label="Loại">${r.loai_van_ban}</td>
        <td data-label="Ngày">${formatDate(r.ngay_ban_hanh)}</td>
        <td data-label="Nơi nhận">${r.nguoi_nhan || '—'}</td>
        <td data-label="">${badge(r.trang_thai)}</td>
      </tr>`);
    const pages = Math.ceil(data.total / (data.page_size || PAGE_SIZE));
    results.innerHTML = html`
      <div class="vp-text-sm vp-text-muted vp-mb-2">${data.total} văn bản</div>
      <table class="vp-table"><thead><tr>
        <th>Số</th><th>Tên nội dung</th><th>Loại</th><th>Ngày</th><th>Nơi nhận</th><th>Trạng thái</th>
      </tr></thead><tbody>${rows}</tbody></table>
      ${pages > 1 ? raw(`
        <div class="vp-flex vp-items-center vp-justify-between vp-mt-3">
          <button class="vp-btn-ghost vp-btn-sm" id="vp-prev" ${state.page <= 1 ? 'disabled' : ''}>‹ Trước</button>
          <span class="vp-text-sm">Trang ${state.page}/${pages}</span>
          <button class="vp-btn-ghost vp-btn-sm" id="vp-next" ${state.page >= pages ? 'disabled' : ''}>Sau ›</button>
        </div>`) : ''}`;
    results.querySelectorAll('tr[data-name]').forEach((tr) => {
      tr.addEventListener('click', () => { location.hash = '#/vanban/' + encodeURIComponent(tr.dataset.name); });
    });
    const prev = results.querySelector('#vp-prev'); const next = results.querySelector('#vp-next');
    if (prev) prev.addEventListener('click', () => { state.page--; load(); });
    if (next) next.addEventListener('click', () => { state.page++; load(); });
  }

  const kw = container.querySelector('#vp-kw');
  container.querySelector('#vp-search-form').addEventListener('submit', (e) => {
    e.preventDefault(); state.keyword = kw.value.trim(); state.page = 1; load();
  });
  const bind = (id, key) => container.querySelector(id).addEventListener('change', (e) => {
    state[key] = e.target.value; state.page = 1; load();
  });
  bind('#vp-f-loai', 'loai');
  bind('#vp-f-danhmuc', 'danh_muc');
  bind('#vp-f-trangthai', 'trang_thai');

  const addBtn = container.querySelector('#vp-add');
  if (addBtn) addBtn.addEventListener('click', () => openCapSoModal(boot));

  await load();
}

// ── Cấp số modal (B1) ────────────────────────────────────────────────────────
function openCapSoModal(boot) {
  showModal({
    title: 'Cấp số văn bản',
    body: html`
      <form id="vp-capso">
        <div class="vp-req-note">Nhập nội dung & loại → hệ thống tự cấp số và ngày. Sau đó vào chi tiết để ban hành (tải scan / dán link).</div>

        <div class="vp-field"><label>Tên nội dung <span class="vp-req">*</span></label>
          <input class="vp-input" name="ten_van_ban" required /></div>
        <div class="vp-field"><label>Loại văn bản <span class="vp-req">*</span></label>
          <select class="vp-select" name="loai_van_ban" required>
            ${raw(options(boot.loai_van_ban, 'name', 'ten_loai', '', '— Chọn loại —'))}
          </select></div>
        <div class="vp-field"><label>Ngày</label>
          <input class="vp-input" type="date" name="ngay_ban_hanh" />
          <span class="vp-hint">Để trống sẽ tự lấy ngày hôm nay.</span></div>
        <div class="vp-field"><label>Người nhận / Cơ quan nhận</label>
          <textarea class="vp-textarea" name="nguoi_nhan" rows="2"></textarea></div>

        <details class="vp-optional">
          <summary>Thông tin bổ sung (tự chọn)</summary>
          <div class="vp-field"><label>Số văn bản</label>
            <input class="vp-input" name="ma_hieu" placeholder="Bỏ trống để tự cấp — VD: 01/2026-CV-HGC" /></div>
          <div class="vp-field"><label>Danh mục</label>
            <select class="vp-select" name="danh_muc"><option value="">— Không chọn —</option>${raw(categoryOptions(boot.danh_muc, ''))}</select></div>
          <div class="vp-field"><label>Phòng ban chủ quản</label>
            <select class="vp-select" name="phong_ban">${raw(options(boot.phong_ban, 'name', 'department_name', '', '— Không chọn —'))}</select></div>
          <div class="vp-field"><label>Từ khóa (tra cứu)</label><input class="vp-input" name="tu_khoa" /></div>
          <div class="vp-field"><label>Mô tả / Trích yếu</label><textarea class="vp-textarea" name="mo_ta"></textarea></div>
        </details>
      </form>`,
    footer: `
      <button class="vp-btn-ghost" data-vp-cancel>Hủy</button>
      <button class="vp-btn-primary" id="vp-capso-ok">Cấp số</button>`,
    onMount(root) {
      root.querySelector('[data-vp-cancel]').addEventListener('click', closeModal);
      root.querySelector('#vp-capso-ok').addEventListener('click', async () => {
        const form = root.querySelector('#vp-capso');
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        showLoading('Đang cấp số…');
        try {
          const res = await call('vp.api.vanban.cap_so', {
            ten_van_ban: fd.get('ten_van_ban'),
            loai_van_ban: fd.get('loai_van_ban'),
            ngay_ban_hanh: fd.get('ngay_ban_hanh') || null,
            nguoi_nhan: fd.get('nguoi_nhan') || null,
            ma_hieu: fd.get('ma_hieu') || null,
            danh_muc: fd.get('danh_muc') || null,
            phong_ban: fd.get('phong_ban') || null,
            tu_khoa: fd.get('tu_khoa') || null,
            mo_ta: fd.get('mo_ta') || null,
          });
          hideLoading();
          closeModal();
          toast('Đã cấp số ' + res.ma_hieu, 'success');
          location.hash = '#/vanban/' + encodeURIComponent(res.name);
        } catch (e) {
          hideLoading();
          toast(e.message || 'Cấp số thất bại', 'error');
        }
      });
    },
  });
}
