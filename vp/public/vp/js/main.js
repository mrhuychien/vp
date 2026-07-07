import { call, ctx } from './api.js';
import { escapeHtml, skeleton, toast } from './ui.js';
import { defineRoutes, initRouter, navigate } from './router.js';

// Cache-bust dynamically imported view modules (import map covers shared libs).
const withV = (p) => `${p}?v=${ctx.assetVersion || ''}`;

const VIEWS = [
  { pattern: '/',              nav: 'home',    back: false, load: () => import(withV('./views/dashboard.js')) },
  { pattern: '/vanban',        nav: 'vanban',  back: false, load: () => import(withV('./views/vanban_list.js')) },
  { pattern: '/vanban/:name',  nav: 'vanban',  back: true,  load: () => import(withV('./views/vanban_detail.js')) },
  { pattern: '/nvl',           nav: 'nvl',     back: false, load: () => import(withV('./views/nvl.js')) },
  { pattern: '/artwork',       nav: 'artwork', back: false, load: () => import(withV('./views/artwork_grid.js')) },
  { pattern: '/artwork/:name', nav: 'artwork', back: true,  load: () => import(withV('./views/artwork_detail.js')) },
];

const NAV = [
  { key: 'home',    hash: '#/',        icon: '🏠', label: 'Trang chủ' },
  { key: 'vanban',  hash: '#/vanban',  icon: '📄', label: 'Văn bản' },
  { key: 'nvl',     hash: '#/nvl',     icon: '🧪', label: 'Hồ sơ NVL' },
  { key: 'artwork', hash: '#/artwork', icon: '🎨', label: 'Artwork' },
];

let BOOT = null;
export function getBoot() { return BOOT; }

function renderShell() {
  const app = document.getElementById('vp-app');
  app.removeAttribute('data-booting');
  app.innerHTML = `
    <header class="vp-header"><div class="vp-header-inner">
      <button class="vp-icon-btn" id="vp-back" aria-label="Quay lại" hidden>←</button>
      <div class="vp-header-title" id="vp-title">Văn Phòng</div>
      <div class="vp-header-actions">
        <button class="vp-icon-btn" id="vp-refresh" aria-label="Làm mới">↻</button>
        <button class="vp-icon-btn" id="vp-account" aria-label="Tài khoản">👤</button>
      </div>
    </div></header>
    <main class="vp-main" id="vp-view"></main>
    <nav class="vp-bottom-nav" id="vp-nav">
      ${NAV.map((n) => `
        <a href="${n.hash}" class="vp-nav-item" data-nav="${n.key}">
          <span class="vp-nav-icon">${n.icon}</span>
          <span class="vp-nav-label">${escapeHtml(n.label)}</span>
        </a>`).join('')}
    </nav>
    <div id="vp-toast-mount" class="vp-toast-mount"></div>
    <div id="vp-modal-mount" class="vp-modal-mount"></div>
    <div id="vp-loading-mount" class="vp-loading-mount" hidden>
      <div class="vp-loading-spinner"></div>
      <div class="vp-loading-text">Đang xử lý…</div>
    </div>
    <div id="vp-acct-menu" class="vp-acct-menu" hidden></div>`;

  document.getElementById('vp-refresh').addEventListener('click', () => reRoute());
  document.getElementById('vp-back').addEventListener('click', () => history.back());
  document.getElementById('vp-account').addEventListener('click', toggleAccount);
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('vp-acct-menu');
    if (menu && !menu.hidden && !menu.contains(e.target) && e.target.id !== 'vp-account') {
      menu.hidden = true;
    }
  });
}

function toggleAccount() {
  const menu = document.getElementById('vp-acct-menu');
  if (!menu) return;
  if (!menu.hidden) { menu.hidden = true; return; }
  const roles = (BOOT && BOOT.roles || []).join(', ') || '—';
  menu.innerHTML = `
    <div class="vp-acct-name">${escapeHtml(BOOT ? BOOT.full_name : ctx.fullName || '')}</div>
    <div class="vp-acct-sub">${escapeHtml(BOOT ? BOOT.user : ctx.user || '')}</div>
    <div class="vp-acct-roles">${escapeHtml(roles)}</div>
    <button class="vp-acct-logout" id="vp-logout">Đăng xuất</button>`;
  menu.hidden = false;
  menu.querySelector('#vp-logout').addEventListener('click', async () => {
    try { await fetch('/api/method/logout', { headers: { 'X-Frappe-CSRF-Token': ctx.csrfToken || '' } }); } catch (e) { /* ignore */ }
    location.href = '/login';
  });
}

function setActiveNav(key) {
  document.querySelectorAll('#vp-nav .vp-nav-item').forEach((a) => {
    a.classList.toggle('vp-active', a.dataset.nav === key);
  });
}
function setTitle(t) { const el = document.getElementById('vp-title'); if (el) el.textContent = t || 'Văn Phòng'; }
function setBack(show) { const b = document.getElementById('vp-back'); if (b) b.hidden = !show; }

async function onRoute({ path, query, found }) {
  const view = document.getElementById('vp-view');
  if (!found) {
    // Self-heal unknown route (e.g. stale link) -> home.
    navigate('#/');
    return;
  }
  const { route, params } = found;
  setActiveNav(route.nav);
  setBack(!!route.back);
  const menu = document.getElementById('vp-acct-menu');
  if (menu) menu.hidden = true;

  view.scrollTop = 0;
  window.scrollTo(0, 0);
  view.innerHTML = `<div class="vp-view-pad">${skeleton(90, 4)}</div>`;
  try {
    const mod = await route.load();
    await mod.render({ container: view, params, query, boot: BOOT, setTitle, navigate });
  } catch (e) {
    console.error('[vp] view error', e);
    view.innerHTML = `
      <div class="vp-view-pad">
        <div class="vp-empty">
          <div class="vp-empty-icon">⚠️</div>
          <div class="vp-empty-title">Không tải được màn hình</div>
          <div class="vp-empty-hint">${escapeHtml(e.message || String(e))}</div>
        </div>
      </div>`;
  }
}

function reRoute() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

async function boot() {
  try {
    BOOT = await call('vp.api.common.get_boot');
  } catch (e) {
    const app = document.getElementById('vp-app');
    app.innerHTML = `
      <div class="vp-boot vp-boot-error">
        <div class="vp-empty-icon">🔒</div>
        <div class="vp-boot-text">Không thể tải Văn Phòng.<br>${escapeHtml(e.message || String(e))}</div>
      </div>`;
    return;
  }
  renderShell();
  defineRoutes(VIEWS.map((v) => ({ pattern: v.pattern, nav: v.nav, back: v.back, load: v.load })));
  initRouter(onRoute);
}

// Expose a tiny surface for views that want to force a refresh.
window.VP = { reRoute, getBoot };

boot();
