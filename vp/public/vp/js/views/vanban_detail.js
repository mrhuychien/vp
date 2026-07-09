import { call, uploadFile, fileUrl } from '../api.js';
import {
  html, raw, escapeHtml, badge, formatDate, statusLabel, skeleton, emptyState,
  toast, showModal, closeModal, showLoading, hideLoading,
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
    paint(data.van_ban);
  }

  function paint(vb) {
    const issued = vb.trang_thai === 'Da Ban Hanh';
    const fileHref = vb.tep_dinh_kem || vb.lien_ket_ngoai;

    const publicBlock = issued && vb.public_url ? html`
      <div class="vp-card vp-mb-3">
        <div class="vp-kpi-label vp-mb-2">Link công khai (gửi nơi nhận)</div>
        <div class="vp-copy-row">
          <input class="vp-input" id="vp-pub" readonly value="${vb.public_url}" />
          <button class="vp-btn-brass vp-btn-sm" id="vp-copy">Sao chép</button>
        </div>
        ${fileHref ? raw(`<a class="vp-download-cta" href="${escapeHtml(fileUrl(fileHref))}" target="_blank" rel="noopener">⬇️ Xem / Tải văn bản</a>`) : ''}
      </div>` : '';

    const capSoBlock = !issued && vb.trang_thai !== 'Huy' ? html`
      <div class="vp-card vp-alert-card vp-mb-3">
        <div class="vp-font-bold vp-mb-2">Đã cấp số — chưa ban hành</div>
        <div class="vp-text-sm vp-text-muted vp-mb-3">Tải bản scan đã đóng dấu, hoặc dán liên kết ngoài, rồi ban hành để tạo link truy cập từ bên ngoài.</div>
        ${canEdit ? raw('<button class="vp-btn-primary vp-btn-block" id="vp-banhanh">Ban hành</button>') : ''}
      </div>` : '';

    container.innerHTML = html`<div class="vp-view-pad">
      <div class="vp-view-banner">
        <div>
          <div class="vp-view-banner-title">${vb.ma_hieu}</div>
          <div class="vp-view-banner-subtitle">${vb.ten_van_ban}</div>
        </div>
        <div class="vp-view-banner-badge">${statusLabel(vb.trang_thai)}</div>
      </div>

      ${publicBlock}
      ${capSoBlock}

      <div class="vp-card vp-mb-3">
        <dl class="vp-detail-list">
          <dt>Loại</dt><dd>${vb.loai_van_ban}</dd>
          <dt>Ngày</dt><dd>${formatDate(vb.ngay_ban_hanh)}</dd>
          ${vb.nguoi_nhan ? raw(`<dt>Nơi nhận</dt><dd>${escapeHtml(vb.nguoi_nhan)}</dd>`) : ''}
          ${vb.danh_muc ? raw(`<dt>Danh mục</dt><dd>${escapeHtml(vb.danh_muc)}</dd>`) : ''}
          ${vb.phong_ban ? raw(`<dt>Phòng ban</dt><dd>${escapeHtml(vb.phong_ban)}</dd>`) : ''}
          ${vb.ngay_cap_so ? raw(`<dt>Ngày cấp số</dt><dd>${escapeHtml(formatDate(vb.ngay_cap_so))}</dd>`) : ''}
          ${vb.tu_khoa ? raw(`<dt>Từ khóa</dt><dd>${escapeHtml(vb.tu_khoa)}</dd>`) : ''}
          ${vb.mo_ta ? raw(`<dt>Trích yếu</dt><dd style="white-space:pre-line">${escapeHtml(vb.mo_ta)}</dd>`) : ''}
        </dl>
      </div>

      <div class="vp-btn-row">
        ${canEdit ? raw('<button class="vp-btn-ghost vp-btn-sm" id="vp-edit">Sửa thông tin</button>') : ''}
        ${isAdmin && vb.trang_thai !== 'Huy' ? raw('<button class="vp-btn-danger vp-btn-sm" id="vp-huy">Hủy</button>') : ''}
      </div>
    </div>`;

    const copyBtn = container.querySelector('#vp-copy');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const inp = container.querySelector('#vp-pub');
      inp.select();
      const done = () => toast('Đã sao chép link', 'success');
      if (navigator.clipboard) navigator.clipboard.writeText(inp.value).then(done, () => { document.execCommand('copy'); done(); });
      else { document.execCommand('copy'); done(); }
    });
    const bh = container.querySelector('#vp-banhanh');
    if (bh) bh.addEventListener('click', () => openBanHanh(vb, load));
    const ed = container.querySelector('#vp-edit');
    if (ed) ed.addEventListener('click', () => openEdit(vb, boot, load));
    const huy = container.querySelector('#vp-huy');
    if (huy) huy.addEventListener('click', () => openHuy(vb.name, load));
  }

  await load();
}

// ── Ban hành (B2): upload scan OR paste link ─────────────────────────────────
function openBanHanh(vb, onDone) {
  showModal({
    title: 'Ban hành ' + vb.ma_hieu,
    body: html`
      <form id="vp-bh">
        <div class="vp-req-note">Chọn <b>một</b> trong hai: tải tệp scan đã đóng dấu, hoặc dán liên kết ngoài. Ban hành sẽ tạo link truy cập từ bên ngoài.</div>
        <div class="vp-field"><label>Tệp scan đã đóng dấu (PDF/ảnh)</label>
          <input class="vp-input" type="file" name="tep" accept="application/pdf,image/*" /></div>
        <div class="vp-field"><label>Hoặc dán liên kết ngoài</label>
          <input class="vp-input" name="lien_ket_ngoai" placeholder="https://…" value="${escapeHtml(vb.lien_ket_ngoai || '')}" /></div>
      </form>`,
    footer: `<button class="vp-btn-ghost" data-vp-cancel>Hủy</button><button class="vp-btn-primary" id="vp-bh-ok">Ban hành</button>`,
    onMount(root) {
      root.querySelector('[data-vp-cancel]').addEventListener('click', closeModal);
      root.querySelector('#vp-bh-ok').addEventListener('click', async () => {
        const form = root.querySelector('#vp-bh');
        const file = form.tep.files[0];
        const link = form.lien_ket_ngoai.value.trim();
        if (!file && !link) { toast('Cần tải tệp hoặc dán liên kết.', 'error'); return; }
        showLoading('Đang ban hành…');
        try {
          if (file) {
            // Public file so the /vb/<token> link works for external recipients.
            await uploadFile({ file, doctype: 'VP Van Ban', docname: vb.name, fieldname: 'tep_dinh_kem', isPrivate: 0 });
          }
          await call('vp.api.vanban.ban_hanh', { name: vb.name, lien_ket_ngoai: link || null });
          hideLoading(); closeModal(); toast('Đã ban hành ' + vb.ma_hieu, 'success'); onDone();
        } catch (e) { hideLoading(); toast(e.message, 'error'); }
      });
    },
  });
}

// ── Edit metadata ────────────────────────────────────────────────────────────
function openEdit(vb, boot, onDone) {
  const catOpts = boot.danh_muc.map((d) =>
    `<option value="${escapeHtml(d.name)}"${d.name === vb.danh_muc ? ' selected' : ''}>${escapeHtml(d.ten_danh_muc)}</option>`).join('');
  const loaiOpts = boot.loai_van_ban.map((l) =>
    `<option value="${escapeHtml(l.name)}"${l.name === vb.loai_van_ban ? ' selected' : ''}>${escapeHtml(l.ten_loai)}</option>`).join('');
  showModal({
    title: 'Sửa thông tin',
    body: html`
      <form id="vp-ed">
        <div class="vp-field"><label>Tên nội dung <span class="vp-req">*</span></label>
          <input class="vp-input" name="ten_van_ban" required value="${escapeHtml(vb.ten_van_ban || '')}" /></div>
        <div class="vp-field"><label>Loại văn bản</label><select class="vp-select" name="loai_van_ban">${raw(loaiOpts)}</select></div>
        <div class="vp-field"><label>Số văn bản</label><input class="vp-input" name="ma_hieu" value="${escapeHtml(vb.ma_hieu || '')}" /></div>
        <div class="vp-field"><label>Ngày</label><input class="vp-input" type="date" name="ngay_ban_hanh" value="${escapeHtml((vb.ngay_ban_hanh || '').slice(0, 10))}" /></div>
        <div class="vp-field"><label>Người nhận / Cơ quan nhận</label><textarea class="vp-textarea" name="nguoi_nhan" rows="2">${escapeHtml(vb.nguoi_nhan || '')}</textarea></div>
        <div class="vp-field"><label>Danh mục</label><select class="vp-select" name="danh_muc"><option value="">— Không chọn —</option>${raw(catOpts)}</select></div>
        <div class="vp-field"><label>Từ khóa</label><input class="vp-input" name="tu_khoa" value="${escapeHtml(vb.tu_khoa || '')}" /></div>
        <div class="vp-field"><label>Trích yếu</label><textarea class="vp-textarea" name="mo_ta">${escapeHtml(vb.mo_ta || '')}</textarea></div>
      </form>`,
    footer: `<button class="vp-btn-ghost" data-vp-cancel>Hủy</button><button class="vp-btn-primary" id="vp-ed-ok">Lưu</button>`,
    onMount(root) {
      root.querySelector('[data-vp-cancel]').addEventListener('click', closeModal);
      root.querySelector('#vp-ed-ok').addEventListener('click', async () => {
        const form = root.querySelector('#vp-ed');
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        showLoading('Đang lưu…');
        try {
          await call('vp.api.vanban.update_van_ban', {
            name: vb.name,
            ten_van_ban: fd.get('ten_van_ban'),
            loai_van_ban: fd.get('loai_van_ban'),
            ma_hieu: fd.get('ma_hieu') || null,
            ngay_ban_hanh: fd.get('ngay_ban_hanh') || null,
            nguoi_nhan: fd.get('nguoi_nhan') || null,
            danh_muc: fd.get('danh_muc') || null,
            tu_khoa: fd.get('tu_khoa') || null,
            mo_ta: fd.get('mo_ta') || null,
          });
          hideLoading(); closeModal(); toast('Đã lưu', 'success'); onDone();
        } catch (e) { hideLoading(); toast(e.message, 'error'); }
      });
    },
  });
}

// ── Hủy ──────────────────────────────────────────────────────────────────────
function openHuy(name, onDone) {
  showModal({
    title: 'Hủy văn bản',
    body: html`
      <p class="vp-confirm-msg">Văn bản sẽ chuyển trạng thái <strong>Hủy</strong> (vẫn lưu trong sổ). Link công khai sẽ ngừng truy cập.</p>
      <div class="vp-field"><label>Lý do hủy</label><textarea class="vp-textarea" id="vp-huy-lydo"></textarea></div>`,
    footer: `<button class="vp-btn-ghost" data-vp-cancel>Đóng</button><button class="vp-btn-danger" id="vp-huy-ok">Hủy văn bản</button>`,
    onMount(root) {
      root.querySelector('[data-vp-cancel]').addEventListener('click', closeModal);
      root.querySelector('#vp-huy-ok').addEventListener('click', async () => {
        const lyDo = root.querySelector('#vp-huy-lydo').value.trim();
        closeModal(); showLoading('Đang hủy…');
        try {
          await call('vp.api.vanban.huy', { name, ly_do: lyDo });
          hideLoading(); toast('Đã hủy văn bản', 'success'); onDone();
        } catch (e) { hideLoading(); toast(e.message, 'error'); }
      });
    },
  });
}
