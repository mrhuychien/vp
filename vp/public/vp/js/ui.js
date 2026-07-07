// UI toolkit: safe templating, status badges, toast, modal, loading, skeleton.

export function escapeHtml(v) {
  if (v == null) return '';
  return String(v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Tagged template that auto-escapes interpolations. It returns a raw-marked
// object (with toString) so that html`` results — and arrays of them — nest
// inside other html`` templates WITHOUT being re-escaped, while `el.innerHTML =
// html`...`` still coerces to the string via toString. Plain strings/numbers
// interpolated into html`` ARE escaped; wrap trusted fragments in raw(...).
export function raw(s) {
  const value = s == null ? '' : String(s);
  return { __raw: true, value, toString() { return value; } };
}
function renderVal(v) {
  if (v == null || v === false) return '';
  if (typeof v === 'object' && v.__raw) return v.value;
  if (Array.isArray(v)) return v.map(renderVal).join('');
  return escapeHtml(v);
}
export function html(strings, ...vals) {
  const s = strings.reduce((acc, str, i) => acc + str + (i < vals.length ? renderVal(vals[i]) : ''), '');
  return raw(s);
}

// ── Status badge mapping (brief §5.3) ──────────────────────────────────────
const STATUS = {
  'Hien Hanh':    ['vp-badge-success', 'Hiện hành'],
  'Du Thao':      ['vp-badge-muted', 'Dự thảo'],
  'Het Hieu Luc': ['vp-badge-danger vp-badge-strike', 'Hết hiệu lực'],
  'Con Hieu Luc': ['vp-badge-success', 'Còn hiệu lực'],
  'Sap Het Han':  ['vp-badge-warning', 'Sắp hết hạn'],
  'Het Han':      ['vp-badge-danger', 'Hết hạn'],
  'Thiet Ke':     ['vp-badge-muted', 'Thiết kế'],
  'Dang In':      ['vp-badge-primary', 'Đang in'],
  'Ngung In':     ['vp-badge-muted', 'Ngừng in'],
};
export function badge(status) {
  const [cls, label] = STATUS[status] || ['vp-badge-muted', status || ''];
  return raw(`<span class="vp-badge ${cls}">${escapeHtml(label)}</span>`);
}
export function statusLabel(status) {
  return (STATUS[status] || [null, status || ''])[1];
}

// ── Formatting (vi-VN) ─────────────────────────────────────────────────────
export function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00');
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('vi-VN');
}
export function formatDateTime(d) {
  if (!d) return '—';
  const dt = new Date(String(d).replace(' ', 'T'));
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString('vi-VN');
}

// ── Skeleton + empty state ─────────────────────────────────────────────────
export function skeleton(height = 80, count = 1) {
  let out = '';
  for (let i = 0; i < count; i++) {
    out += `<div class="vp-skeleton" style="height:${height}px;margin-bottom:.5rem"></div>`;
  }
  return out;
}
export function emptyState({ icon = '📭', title = 'Chưa có dữ liệu', hint = '' } = {}) {
  return html`
    <div class="vp-empty">
      <div class="vp-empty-icon">${icon}</div>
      <div class="vp-empty-title">${title}</div>
      ${hint ? raw(`<div class="vp-empty-hint">${escapeHtml(hint)}</div>`) : ''}
    </div>`;
}

// ── Mount points (created by main.js) ──────────────────────────────────────
function mount(id) { return document.getElementById(id); }

// ── Toast ──────────────────────────────────────────────────────────────────
export function toast(msg, type = 'info', ms = 3500) {
  const m = mount('vp-toast-mount');
  if (!m) return;
  const el = document.createElement('div');
  el.className = `vp-toast vp-${type}`;
  el.textContent = msg;
  m.appendChild(el);
  const kill = () => {
    el.style.animation = 'vpToastOut .25s ease forwards';
    setTimeout(() => el.remove(), 250);
  };
  el.addEventListener('click', kill);
  setTimeout(kill, ms);
}

// ── Loading overlay (blocking actions) ─────────────────────────────────────
export function showLoading(text = 'Đang xử lý…') {
  const m = mount('vp-loading-mount');
  if (!m) return;
  m.querySelector('.vp-loading-text').textContent = text;
  m.removeAttribute('hidden');
}
export function hideLoading() {
  const m = mount('vp-loading-mount');
  if (m) m.setAttribute('hidden', '');
}

// ── Modal (bottom-sheet on mobile, centered on desktop) ────────────────────
let modalCloseHandler = null;
export function showModal({ title, body = '', footer = '', onMount, size = '' }) {
  const m = mount('vp-modal-mount');
  if (!m) return;
  m.innerHTML = html`
    <div class="vp-modal-content ${raw(size)}" role="dialog" aria-modal="true">
      <div class="vp-modal-head">
        <div class="vp-modal-title">${title || ''}</div>
        <button class="vp-icon-btn" data-vp-close aria-label="Đóng">✕</button>
      </div>
      <div class="vp-modal-body">${raw(body)}</div>
      ${footer ? raw(`<div class="vp-modal-foot">${footer}</div>`) : ''}
    </div>`;
  m.classList.add('vp-show');
  const content = m.querySelector('.vp-modal-content');
  m.querySelectorAll('[data-vp-close]').forEach((b) => b.addEventListener('click', closeModal));
  m.onclick = (e) => { if (e.target === m) closeModal(); };
  if (onMount) onMount(content);
}
export function setModalCloseHandler(fn) { modalCloseHandler = fn; }
export function closeModal() {
  const m = mount('vp-modal-mount');
  if (!m) return;
  m.classList.remove('vp-show');
  m.innerHTML = '';
  m.onclick = null;
  if (modalCloseHandler) { const fn = modalCloseHandler; modalCloseHandler = null; fn(); }
}

// ── Confirm dialog ─────────────────────────────────────────────────────────
export function confirmDialog({ title = 'Xác nhận', message = '', danger = false, confirmText = 'Đồng ý', onConfirm }) {
  showModal({
    title,
    body: `<p class="vp-confirm-msg">${escapeHtml(message)}</p>`,
    footer: `
      <button class="vp-btn-ghost" data-vp-cancel>Hủy</button>
      <button class="${danger ? 'vp-btn-danger' : 'vp-btn-primary'}" data-vp-ok>${escapeHtml(confirmText)}</button>`,
    onMount(root) {
      root.querySelector('[data-vp-cancel]').addEventListener('click', closeModal);
      root.querySelector('[data-vp-ok]').addEventListener('click', async () => {
        closeModal();
        if (onConfirm) await onConfirm();
      });
    },
  });
}

// Small helper to bind delegated click handlers by [data-action].
export function onClick(root, action, handler) {
  root.querySelectorAll(`[data-action="${action}"]`).forEach((el) => {
    el.addEventListener('click', (e) => handler(el, e));
  });
}
