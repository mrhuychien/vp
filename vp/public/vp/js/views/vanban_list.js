import { call, uploadFile } from '../api.js';
import {
  html, raw, escapeHtml, badge, formatDate, skeleton, emptyState,
  toast, showModal, closeModal, showLoading, hideLoading,
} from '../ui.js';

const PAGE_SIZE = 20;

// Build indented <option>s for the category tree (boot.danh_muc ordered by lft).
function categoryOptions(danhMuc, selected) {
  const byName = {};
  danhMuc.forEach((d) => { byName[d.name] = d; });
  const depth = (d) => {
    let n = 0, cur = d;
    while (cur && cur.parent_vp_danh_muc) { n++; cur = byName[cur.parent_vp_danh_muc]; if (n > 20) break; }
    return n;
  };
  return danhMuc.map((d) => {
    const pad = '  '.repeat(depth(d));
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
  setTitle('Tra cứu văn bản');
  const canEdit = boot && boot.can_edit_vanban;

  const state = {
    keyword: query.kw || '',
    danh_muc: query.danh_muc || '',
    loai: query.loai || '',
    phong_ban: query.phong_ban || '',
    trang_thai: query.trang_thai || 'Hien Hanh',
    page: 1,
  };

  container.innerHTML = html`<div class="vp-view-pad">
    <div class="vp-flex vp-items-center vp-justify-between vp-mb-2">
      <div class="vp-view-banner-title" style="color:var(--vp-oxblood)!important;font-size:1.1rem">Tra cứu văn bản</div>
      ${canEdit ? raw('<button class="vp-btn-primary vp-btn-sm" id="vp-add">+ Ban hành</button>') : ''}
    </div>

    <form id="vp-search-form" class="vp-search-wrap">
      <span class="vp-search-icon">🔍</span>
      <input class="vp-search" id="vp-kw" placeholder="Mã hiệu, tên văn bản, từ khóa…" value="${escapeHtml(state.keyword)}" />
    </form>

    <div class="vp-filters">
      <select class="vp-select" id="vp-f-danhmuc">
        <option value="">— Tất cả danh mục —</option>
        ${raw(categoryOptions(boot.danh_muc, state.danh_muc))}
      </select>
      <select class="vp-select" id="vp-f-loai">
        ${raw(options(boot.loai_van_ban, 'name', 'ten_loai', state.loai, '— Tất cả loại —'))}
      </select>
      <select class="vp-select" id="vp-f-phongban">
        ${raw(options(boot.phong_ban, 'name', 'department_name', state.phong_ban, '— Tất cả phòng —'))}
      </select>
      <select class="vp-select" id="vp-f-trangthai">
        <option value="Hien Hanh"${state.trang_thai === 'Hien Hanh' ? ' selected' : ''}>Hiện hành</option>
        <option value="Du Thao"${state.trang_thai === 'Du Thao' ? ' selected' : ''}>Dự thảo</option>
        <option value="Het Hieu Luc"${state.trang_thai === 'Het Hieu Luc' ? ' selected' : ''}>Hết hiệu lực</option>
        <option value=""${state.trang_thai === '' ? ' selected' : ''}>Tất cả</option>
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
      results.innerHTML = emptyState({ title: 'Không tìm thấy văn bản', hint: 'Thử đổi bộ lọc hoặc từ khóa.' });
      return;
    }
    const rows = data.items.map((r) => html`
      <tr class="vp-row-click" data-name="${r.name}">
        <td data-label="Mã hiệu"><strong>${r.ma_hieu}</strong></td>
        <td data-label="Tên văn bản">${r.ten_van_ban}</td>
        <td data-label="Loại">${r.loai_van_ban}</td>
        <td data-label="Ban hành">${formatDate(r.ngay_ban_hanh_dau)}</td>
        <td data-label="">${badge(r.trang_thai)}</td>
      </tr>`);
    const pages = Math.ceil(data.total / (data.page_size || PAGE_SIZE));
    results.innerHTML = html`
      <div class="vp-text-sm vp-text-muted vp-mb-2">${data.total} văn bản</div>
      <table class="vp-table"><thead><tr>
        <th>Mã hiệu</th><th>Tên văn bản</th><th>Loại</th><th>Ban hành</th><th>Trạng thái</th>
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

  // Filter bindings.
  const kw = container.querySelector('#vp-kw');
  container.querySelector('#vp-search-form').addEventListener('submit', (e) => {
    e.preventDefault(); state.keyword = kw.value.trim(); state.page = 1; load();
  });
  const bind = (id, key) => container.querySelector(id).addEventListener('change', (e) => {
    state[key] = e.target.value; state.page = 1; load();
  });
  bind('#vp-f-danhmuc', 'danh_muc');
  bind('#vp-f-loai', 'loai');
  bind('#vp-f-phongban', 'phong_ban');
  bind('#vp-f-trangthai', 'trang_thai');

  const addBtn = container.querySelector('#vp-add');
  if (addBtn) addBtn.addEventListener('click', () => openCreateModal(boot));

  await load();
}

// ── Create-document modal (US-01) ────────────────────────────────────────────
function openCreateModal(boot) {
  showModal({
    title: 'Ban hành văn bản',
    body: html`
      <form id="vp-create">
        <div class="vp-field"><label>Tên văn bản <span class="vp-req">*</span></label>
          <input class="vp-input" name="ten_van_ban" required /></div>
        <div class="vp-field"><label>Loại văn bản <span class="vp-req">*</span></label>
          <select class="vp-select" name="loai_van_ban" required>
            ${raw(options(boot.loai_van_ban, 'name', 'ten_loai', '', '— Chọn loại —'))}
          </select></div>
        <div class="vp-field"><label>Danh mục <span class="vp-req">*</span></label>
          <select class="vp-select" name="danh_muc" required>
            <option value="">— Chọn danh mục —</option>
            ${raw(categoryOptions(boot.danh_muc, ''))}
          </select></div>
        <div class="vp-field"><label>Phòng ban chủ quản</label>
          <select class="vp-select" name="phong_ban">
            ${raw(options(boot.phong_ban, 'name', 'department_name', '', '— Không chọn —'))}
          </select></div>
        <div class="vp-field"><label>Mã hiệu (bỏ trống để tự sinh)</label>
          <input class="vp-input" name="ma_hieu" placeholder="VD: QD-2026-001" /></div>
        <div class="vp-field"><label>Số phiên bản đầu</label>
          <input class="vp-input" name="so_phien_ban" value="1.0" /></div>
        <div class="vp-field"><label>Ngày ban hành</label>
          <input class="vp-input" type="date" name="ngay_ban_hanh" /></div>
        <div class="vp-field"><label>Người soạn</label><input class="vp-input" name="nguoi_soan" /></div>
        <div class="vp-field"><label>Người duyệt</label><input class="vp-input" name="nguoi_duyet" /></div>
        <div class="vp-field"><label>Từ khóa (tra cứu)</label><input class="vp-input" name="tu_khoa" /></div>
        <div class="vp-field"><label>Mô tả</label><textarea class="vp-textarea" name="mo_ta"></textarea></div>
        <div class="vp-field"><label>Tệp chính (PDF đã ký) <span class="vp-req">*</span></label>
          <input class="vp-input" type="file" name="tep_chinh" accept="application/pdf" required /></div>
        <div class="vp-field"><label>Tệp gốc (Word/nguồn)</label>
          <input class="vp-input" type="file" name="tep_goc" /></div>
        <label class="vp-flex vp-items-center vp-gap-2" style="font-weight:600">
          <input type="checkbox" name="set_hien_hanh" /> Đặt hiện hành ngay
        </label>
      </form>`,
    footer: `
      <button class="vp-btn-ghost" data-vp-cancel>Hủy</button>
      <button class="vp-btn-primary" id="vp-create-submit">Ban hành</button>`,
    size: '',
    onMount(root) {
      root.querySelector('[data-vp-cancel]').addEventListener('click', closeModal);
      root.querySelector('#vp-create-submit').addEventListener('click', async () => {
        const form = root.querySelector('#vp-create');
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        const tepChinh = form.tep_chinh.files[0];
        if (!tepChinh) { toast('Vui lòng chọn tệp chính (PDF).', 'error'); return; }
        const tepGoc = form.tep_goc.files[0];

        showLoading('Đang ban hành…');
        try {
          const payload = {
            ten_van_ban: fd.get('ten_van_ban'),
            loai_van_ban: fd.get('loai_van_ban'),
            danh_muc: fd.get('danh_muc'),
            phong_ban: fd.get('phong_ban') || null,
            ma_hieu: fd.get('ma_hieu') || null,
            so_phien_ban: fd.get('so_phien_ban') || '1.0',
            ngay_ban_hanh: fd.get('ngay_ban_hanh') || null,
            nguoi_soan: fd.get('nguoi_soan') || null,
            nguoi_duyet: fd.get('nguoi_duyet') || null,
            tu_khoa: fd.get('tu_khoa') || null,
            mo_ta: fd.get('mo_ta') || null,
            set_hien_hanh: form.set_hien_hanh.checked ? 1 : 0,
          };
          const res = await call('vp.api.vanban.create_van_ban', payload);
          await uploadFile({ file: tepChinh, doctype: 'VP Phien Ban Van Ban', docname: res.phien_ban, fieldname: 'tep_chinh' });
          if (tepGoc) {
            await uploadFile({ file: tepGoc, doctype: 'VP Phien Ban Van Ban', docname: res.phien_ban, fieldname: 'tep_goc' });
          }
          hideLoading();
          closeModal();
          toast('Đã ban hành ' + res.van_ban, 'success');
          location.hash = '#/vanban/' + encodeURIComponent(res.van_ban);
        } catch (e) {
          hideLoading();
          toast(e.message || 'Ban hành thất bại', 'error');
        }
      });
    },
  });
}
