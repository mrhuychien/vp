import { call, uploadFile, fileUrl } from '../api.js';
import {
  html, raw, escapeHtml, badge, formatDate, skeleton, emptyState,
  toast, showModal, closeModal, confirmDialog, showLoading, hideLoading,
} from '../ui.js';

const LOAI = {
  'Tu Cong Bo': 'Tự công bố',
  'CoA': 'CoA',
  'Kiem Nghiem Dinh Ky': 'Kiểm nghiệm định kỳ',
  'Hop Dong': 'Hợp đồng',
  'Chung Nhan NCC': 'Chứng nhận NCC',
  'Khac': 'Khác',
};
function loaiOptions(selected) {
  return Object.entries(LOAI).map(([v, l]) =>
    `<option value="${v}"${v === selected ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('');
}

export async function render({ container, boot, setTitle }) {
  setTitle('Hồ sơ NVL');
  const canEdit = boot && boot.can_edit_nvl;
  const isAdmin = boot && boot.is_admin;

  const state = { trang_thai: '', loai_ho_so: '', keyword: '' };

  container.innerHTML = html`<div class="vp-view-pad">
    <div class="vp-flex vp-items-center vp-justify-between vp-mb-2">
      <div class="vp-view-banner-title" style="color:var(--vp-oxblood)!important;font-size:1.1rem">Hồ sơ nguyên vật liệu</div>
      ${canEdit ? raw('<button class="vp-btn-primary vp-btn-sm" id="vp-add">+ Hồ sơ</button>') : ''}
    </div>

    <form id="vp-nvl-search" class="vp-search-wrap">
      <span class="vp-search-icon">🔍</span>
      <input class="vp-search" id="vp-kw" placeholder="Item, tên hồ sơ, số hiệu…" />
    </form>
    <div class="vp-filters">
      <select class="vp-select" id="vp-f-trangthai">
        <option value="">— Tất cả trạng thái —</option>
        <option value="Con Hieu Luc">Còn hiệu lực</option>
        <option value="Sap Het Han">Sắp hết hạn</option>
        <option value="Het Han">Hết hạn</option>
      </select>
      <select class="vp-select" id="vp-f-loai">
        <option value="">— Tất cả loại —</option>
        ${raw(loaiOptions(''))}
      </select>
    </div>
    <div id="vp-nvl-results">${raw(skeleton(70, 4))}</div>
  </div>`;

  const results = container.querySelector('#vp-nvl-results');

  async function load() {
    results.innerHTML = skeleton(70, 4);
    let data;
    try {
      data = await call('vp.api.nvl.list_ho_so', state);
    } catch (e) {
      results.innerHTML = emptyState({ icon: '⚠️', title: 'Lỗi tải hồ sơ', hint: e.message });
      return;
    }
    if (!data.groups.length) {
      results.innerHTML = emptyState({ title: 'Không có hồ sơ', hint: 'Thử đổi bộ lọc, hoặc thêm hồ sơ mới.' });
      return;
    }
    results.innerHTML = data.groups.map((g) => html`
      <div class="vp-acc" data-item="${g.item}">
        <div class="vp-acc-head">
          <span class="vp-acc-caret">›</span>
          <div class="vp-grow">
            <div class="vp-acc-title">${g.item_name || g.item}</div>
            <div class="vp-acc-sub">${g.count} hồ sơ</div>
          </div>
          ${g.canh_bao ? raw(`<span class="vp-count-badge">${g.canh_bao}</span>`) : ''}
        </div>
        <div class="vp-acc-body">
          <table class="vp-table"><thead><tr>
            <th>Loại</th><th>Số hiệu</th><th>NCC</th><th>Hết hạn</th><th>TT</th><th>Tệp</th>${isAdmin ? '<th></th>' : ''}
          </tr></thead><tbody>
            ${g.ho_so.map((h) => html`
              <tr>
                <td data-label="Loại">${LOAI[h.loai_ho_so] || h.loai_ho_so}</td>
                <td data-label="Số hiệu">${h.so_hieu || '—'}</td>
                <td data-label="NCC">${h.supplier || '—'}</td>
                <td data-label="Hết hạn">${formatDate(h.ngay_het_han)}</td>
                <td data-label="">${badge(h.trang_thai)}</td>
                <td data-label="Tệp">${h.tep ? raw(`<a class="vp-file-link" href="${escapeHtml(fileUrl(h.tep))}" target="_blank" rel="noopener">📄 Tải</a>`) : raw('—')}</td>
                ${isAdmin ? raw(`<td data-label=""><button class="vp-btn-ghost vp-btn-sm" data-del="${escapeHtml(h.name)}">Xóa</button></td>`) : ''}
              </tr>`)}
          </tbody></table>
        </div>
      </div>`).join('');

    results.querySelectorAll('.vp-acc-head').forEach((head) => {
      head.addEventListener('click', () => head.parentElement.classList.toggle('vp-open'));
    });
    results.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDialog({
        title: 'Xóa hồ sơ', message: 'Xóa hồ sơ này? Không thể hoàn tác.', danger: true, confirmText: 'Xóa',
        onConfirm: async () => {
          showLoading('Đang xóa…');
          try { await call('vp.api.nvl.delete_ho_so', { name: b.dataset.del }); hideLoading(); toast('Đã xóa', 'success'); load(); }
          catch (e2) { hideLoading(); toast(e2.message, 'error'); }
        },
      });
    }));
  }

  container.querySelector('#vp-nvl-search').addEventListener('submit', (e) => {
    e.preventDefault(); state.keyword = container.querySelector('#vp-kw').value.trim(); load();
  });
  container.querySelector('#vp-f-trangthai').addEventListener('change', (e) => { state.trang_thai = e.target.value; load(); });
  container.querySelector('#vp-f-loai').addEventListener('change', (e) => { state.loai_ho_so = e.target.value; load(); });
  const addBtn = container.querySelector('#vp-add');
  if (addBtn) addBtn.addEventListener('click', () => openSaveModal(load));

  await load();
}

function openSaveModal(onDone) {
  showModal({
    title: 'Thêm hồ sơ NVL',
    body: html`
      <form id="vp-nvl-form">
        <div class="vp-field"><label>Mã Item (NVL) <span class="vp-req">*</span></label>
          <input class="vp-input" name="item" placeholder="Mã Item chính xác" required /></div>
        <div class="vp-field"><label>Nhà cung cấp (mã Supplier)</label><input class="vp-input" name="supplier" /></div>
        <div class="vp-field"><label>Loại hồ sơ <span class="vp-req">*</span></label>
          <select class="vp-select" name="loai_ho_so" required><option value="">— Chọn loại —</option>${raw(loaiOptions(''))}</select></div>
        <div class="vp-field"><label>Tên hồ sơ <span class="vp-req">*</span></label><input class="vp-input" name="ten_ho_so" required /></div>
        <div class="vp-field"><label>Số hiệu</label><input class="vp-input" name="so_hieu" /></div>
        <div class="vp-field"><label>Ngày cấp</label><input class="vp-input" type="date" name="ngay_cap" /></div>
        <div class="vp-field"><label>Ngày hết hạn</label><input class="vp-input" type="date" name="ngay_het_han" /></div>
        <div class="vp-field"><label>Tệp <span class="vp-req">*</span></label><input class="vp-input" type="file" name="tep" required /></div>
        <div class="vp-field"><label>Ghi chú</label><textarea class="vp-textarea" name="ghi_chu"></textarea></div>
      </form>`,
    footer: `<button class="vp-btn-ghost" data-vp-cancel>Hủy</button><button class="vp-btn-primary" id="vp-nvl-ok">Lưu</button>`,
    onMount(root) {
      root.querySelector('[data-vp-cancel]').addEventListener('click', closeModal);
      root.querySelector('#vp-nvl-ok').addEventListener('click', async () => {
        const form = root.querySelector('#vp-nvl-form');
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        const tep = form.tep.files[0];
        if (!tep) { toast('Vui lòng chọn tệp.', 'error'); return; }
        showLoading('Đang lưu…');
        try {
          const res = await call('vp.api.nvl.save_ho_so', {
            item: fd.get('item'),
            supplier: fd.get('supplier') || null,
            loai_ho_so: fd.get('loai_ho_so'),
            ten_ho_so: fd.get('ten_ho_so'),
            so_hieu: fd.get('so_hieu') || null,
            ngay_cap: fd.get('ngay_cap') || null,
            ngay_het_han: fd.get('ngay_het_han') || null,
            ghi_chu: fd.get('ghi_chu') || null,
          });
          await uploadFile({ file: tep, doctype: 'VP Ho So NVL', docname: res.name, fieldname: 'tep' });
          hideLoading(); closeModal(); toast('Đã lưu hồ sơ', 'success'); onDone();
        } catch (e) { hideLoading(); toast(e.message, 'error'); }
      });
    },
  });
}
