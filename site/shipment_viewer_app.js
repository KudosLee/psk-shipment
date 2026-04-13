const VIEWER_CONFIG = window.SHIPMENT_VIEWER_CONFIG || {};
const WORKER_BASE_URL = VIEWER_CONFIG.workerBaseUrl || '';
const EMBEDDED_DATA = Array.isArray(VIEWER_CONFIG.embeddedData) ? VIEWER_CONFIG.embeddedData : [];
const EMBEDDED_META = VIEWER_CONFIG.embeddedMeta || {};

const now = new Date();
const API_BASE_URL = '';
const ENDPOINTS = { login: '/api/auth/login', logout: '/api/auth/logout', me: '/api/auth/me', current: '/api/shipments/current' };
let appData = Array.isArray(EMBEDDED_DATA) ? EMBEDDED_DATA : [];
let pageMeta = EMBEDDED_META || {};
let currentUser = null;
const state = { corp: '\uC804\uCCB4 \uBC95\uC778', mode: '\uC804\uCCB4', filter: '\uC804\uCCB4', keyword: '', dateFrom: '', dateTo: '', view: 'list', calendarYear: now.getFullYear(), calendarMonth: now.getMonth(), selectedDate: '', listDate: '', advancedOpen: false };
const $ = id => document.getElementById(id);
const refs = {};
const corpOptions = ['\uC804\uCCB4 \uBC95\uC778', 'PSK', 'PSK Holdings'];
const modeOptions = ['\uC804\uCCB4', '\uB0B4\uC218', '\uD56D\uACF5', '\uD574\uC0C1', '\uC774\uAD00', '\uAE30\uD0C0'];
const viewOptions = [{ label: '\uCE98\uB9B0\uB354', value: 'calendar' }, { label: '\uC694\uC57D', value: 'report' }, { label: '\uC0C1\uC138\uB0B4\uC6A9', value: 'list' }];
const categorySet = new Set(['\uC804\uCCB4', '\uBCF8\uC0AC(HQ)', '2\uC0AC\uC5C5\uC7A5', '\uAE30\uD0C0']);
const reportCorpOrder = ['PSK', 'PSK Holdings'];
const reportDepartOrder = ['PSK HQ', '2\uC0AC\uC5C5\uC7A5', '\uC870\uB9BD\uC5C5\uCCB4', '\uAE30\uD0C0'];

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const badge = (cls, txt) => `<span class="${cls}">${esc(txt)}</span>`;
const pill = txt => `<span class="pill">${esc(txt)}</span>`;
const corpCls = c => c === 'PSK' ? 'corp-badge corp-psk' : 'corp-badge corp-holdings';
const field = (label, val, full) => `<div class="field"${full ? ' style="grid-column:1/-1"' : ''}><div class="field-label">${esc(label)}</div><div class="field-value">${esc(val || '-')}</div></div>`;
const showVal = v => String(v ?? '').trim() || '-';
const getFilterOptions = () => ['\uC804\uCCB4', '\uBCF8\uC0AC(HQ)', '2\uC0AC\uC5C5\uC7A5', '\uAE30\uD0C0', ...[...new Set(appData.map(d => d.vendorName).filter(Boolean))].sort()];

const compareDateTime = (a, b) => {
  const da = (a.shipDate || '9999-99-99').trim() || '9999-99-99';
  const db = (b.shipDate || '9999-99-99').trim() || '9999-99-99';
  if (da !== db) return da.localeCompare(db);
  const ta = (a.loadTime || '').trim() || '99:99';
  const tb = (b.loadTime || '').trim() || '99:99';
  if (ta !== tb) return ta.localeCompare(tb);
  if ((a.corp || '') !== (b.corp || '')) return (a.corp || '').localeCompare(b.corp || '');
  if ((a.depart || '') !== (b.depart || '')) return (a.depart || '').localeCompare(b.depart || '');
  return (a.wo || '').localeCompare(b.wo || '');
};

const compareReportDateTime = (a, b) => {
  const da = (a.shipDate || '9999-99-99').trim() || '9999-99-99';
  const db = (b.shipDate || '9999-99-99').trim() || '9999-99-99';
  if (da !== db) return da.localeCompare(db);
  const ta = (a.loadTime || '').trim() || '99:99';
  const tb = (b.loadTime || '').trim() || '99:99';
  if (ta !== tb) return ta.localeCompare(tb);
  return (a.wo || '').localeCompare(b.wo || '');
};

const sortByLoadTime = rows => [...rows].sort((a, b) => {
  const ta = (a.loadTime || '').trim() || '99:99';
  const tb = (b.loadTime || '').trim() || '99:99';
  return ta !== tb ? ta.localeCompare(tb) : (a.corp || '') !== (b.corp || '') ? (a.corp || '').localeCompare(b.corp || '') : (a.depart || '').localeCompare(b.depart || '') || (a.wo || '').localeCompare(b.wo || '');
});

const openDetailModal = item => {
  if (refs.modalTitleEl) refs.modalTitleEl.textContent = '\uCD9C\uD558 \uC0C1\uC138\uC815\uBCF4';
  refs.modalBody.innerHTML = renderItemDetail(item);
  refs.detailModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

const closeDetailModal = () => {
  refs.detailModal.classList.add('hidden');
  refs.modalBody.innerHTML = '';
  if (refs.modalTitleEl) refs.modalTitleEl.textContent = '\uCD9C\uD558 \uC0C1\uC138\uC815\uBCF4';
  document.body.style.overflow = '';
};

function initRefs() {
  refs.viewTabs = $('viewTabs');
  refs.corpTabs = $('corpTabs');
  refs.modeTabs = $('modeTabs');
  refs.filterTabs = $('filterTabs');
  refs.listEl = $('list');
  refs.summaryEl = $('summary');
  refs.summaryInlineEl = $('summaryInline');
  refs.searchInput = $('searchInput');
  refs.dateFromEl = $('dateFrom');
  refs.dateToEl = $('dateTo');
  refs.dateResetEl = $('dateReset');
  refs.toggleAdvancedFiltersBtn = $('toggleAdvancedFilters');
  refs.advancedFiltersEl = $('advancedFilters');
  refs.calToolbar = $('calendarToolbar');
  refs.calWrap = $('calendarWrap');
  refs.calEl = $('calendar');
  refs.calTitleEl = $('calendarTitle');
  refs.calDayPanel = $('calendarDayPanel');
  refs.reportEl = $('reportView');
  refs.pageMetaBarEl = $('pageMetaBar');
  refs.detailModal = $('detailModal');
  refs.modalBackdrop = $('modalBackdrop');
  refs.modalClose = $('modalClose');
  refs.modalBody = $('modalBody');
  refs.modalTitleEl = $('modalTitle');
  refs.noticeBar = $('noticeBar');
  refs.userBar = $('userBar');
  refs.authPanel = $('authPanel');
  refs.appPanel = $('appPanel');
  refs.loginForm = $('loginForm');
  refs.loginId = $('loginId');
  refs.loginPassword = $('loginPassword');
  refs.loginBtn = $('loginBtn');
}

function showNotice(message, type) {
  if (!refs.noticeBar) return;
  refs.noticeBar.textContent = message || '';
  refs.noticeBar.className = 'notice-bar ' + (type || 'info');
  refs.noticeBar.classList.toggle('hidden', !message);
}

function clearNotice() {
  if (!refs.noticeBar) return;
  refs.noticeBar.textContent = '';
  refs.noticeBar.className = 'notice-bar hidden';
}

function setBusy(flag) {
  if (refs.loginBtn) refs.loginBtn.disabled = !!flag;
}

function safeUserId(user) {
  return String((user && (user.loginId || user.userId || user.username || user.id || user.email)) || '-');
}

function safeUserName(user) {
  return String((user && (user.name || user.displayName || user.fullName || user.loginId || user.userId || user.username || user.id)) || '-');
}

function safeRole(user) {
  const r = String((user && (user.role || user.userRole || user.authRole)) || 'USER').toUpperCase();
  return r || 'USER';
}

function buildApiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return path;
}

async function apiRequest(path, options, allow401) {
  const init = Object.assign(
    { credentials: 'include', cache: 'no-store', headers: {} },
    options || {}
  );

  init.headers = Object.assign({}, init.headers || {});
  if (init.body && !init.headers['Content-Type']) {
    init.headers['Content-Type'] = 'application/json';
  }

  let res;
  try {
    res = await fetch(buildApiUrl(path), init);
  } catch (err) {
    const e = new Error('FETCH_ERROR: ' + (err && err.message ? err.message : String(err)));
    e.original = err;
    throw e;
  }

  let payload = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (_) {
      payload = { raw: text };
    }
  }

  if (res.status === 401 && allow401) return null;

  if (!res.ok) {
    const msg =
      (payload && payload.error) ||
      (payload && payload.message) ||
      (`${res.status} ${res.statusText}`);
    const err = new Error(msg);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

async function fetchMe() {
  const payload = await apiRequest(ENDPOINTS.me, { method: 'GET' }, true);
  return normalizeUser(payload);
}

function normalizeUser(payload) {
  if (!payload) return null;
  if (payload.user) return normalizeUser(payload.user);
  if (payload.data && payload.data.user) return normalizeUser(payload.data.user);
  if (payload.authenticated === false || payload.ok === false) return null;
  if (payload.loginId || payload.userId || payload.username || payload.id || payload.email || payload.role) return payload;
  return null;
}

function renderUserBar() {
  if (!refs.userBar) return;
  if (!currentUser) {
    refs.userBar.innerHTML = '<span class="user-chip">\uBBF8\uB85C\uADF8\uC778</span>';
    return;
  }
  const role = safeRole(currentUser);
  const roleCls = role === 'ADMIN' ? 'admin' : 'user';
  refs.userBar.innerHTML = `<span class="user-chip"><strong>${esc(safeUserName(currentUser))}</strong><span>${esc(safeUserId(currentUser))}</span><span class="user-role ${roleCls}">${esc(role)}</span></span><button class="user-btn" id="reloadBtn" type="button">\uC0C8\uB85C\uACE0\uCE68</button><button class="user-btn" id="logoutBtn" type="button">\uB85C\uADF8\uC544\uC6C3</button>`;
  const reloadBtn = $('reloadBtn');
  const logoutBtn = $('logoutBtn');
  if (reloadBtn) reloadBtn.addEventListener('click', () => loadRemoteData(true));
  if (logoutBtn) logoutBtn.addEventListener('click', onLogout);
}

function showLoginShell() {
  refs.authPanel.classList.remove('hidden');
  refs.appPanel.classList.add('hidden');
  renderUserBar();
}

function showAppShell() {
  refs.authPanel.classList.add('hidden');
  refs.appPanel.classList.remove('hidden');
  renderUserBar();
}

function normalizeShipmentPayload(payload) {
  if (Array.isArray(payload)) return { meta: { itemCount: payload.length }, data: payload };
  if (payload && Array.isArray(payload.data)) return { meta: payload.meta || {}, data: payload.data };
  if (payload && Array.isArray(payload.items)) return { meta: payload.meta || {}, data: payload.items };
  if (payload && Array.isArray(payload.shipments)) return { meta: payload.meta || {}, data: payload.shipments };
  return { meta: {}, data: [] };
}

function normalizeShipmentRow(item) {
  const defaults = { corp: '', category: '', depart: '', shipType: '', shipDate: '', shipDateRaw: '', shipDateText: '', loadTime: '', unloadTime: '', fabOut: '', fabOutText: '', packaging: '', packagingText: '', sizeNotice: '', shipRequest: '', customs: '', terms: '', pskDelivery: '', wo: '', sn: '', model: '', exportInfo: '', shipMode: '', forwarder: '', customer: '', manager: '', inv: '', invGreen: 'N', redAlert: 'N', vendorName: '', moduleText: '', locationText: '' };
  const out = Object.assign({}, defaults, item || {});
  Object.keys(out).forEach(k => { if (out[k] === null || out[k] === undefined) out[k] = ''; });
  return out;
}

async function bootApp() {
  setBusy(true);
  showNotice('\uC778\uC99D \uC0C1\uD0DC\uB97C \uD655\uC778\uD558\uB294 \uC911\uC785\uB2C8\uB2E4.', 'info');
  try {
    const me = await fetchMe();
    if (me) {
      currentUser = me;
      showAppShell();
      await loadRemoteData(false);
    } else {
      showLoginShell();
      clearNotice();
    }
  } catch (err) {
    showLoginShell();
    showNotice('\uC778\uC99D \uC0C1\uD0DC\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. ' + getErrMsg(err), 'error');
  } finally {
    setBusy(false);
  }
}

async function onLoginSubmit(e) {
  e.preventDefault();
  const loginId = (refs.loginId.value || '').trim();
  const password = refs.loginPassword.value || '';
  if (!loginId || !password) {
    showNotice('\uC544\uC774\uB514\uC640 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.', 'error');
    return;
  }
  setBusy(true);
  showNotice('\uB85C\uADF8\uC778 \uC911\uC785\uB2C8\uB2E4.', 'info');
  try {
    const payload = await apiRequest(ENDPOINTS.login, {
      method: 'POST',
      body: JSON.stringify({ username: loginId, loginId: loginId, password: password })
    });
    currentUser = normalizeUser(payload) || await fetchMe();
    if (!currentUser) throw new Error('\uB85C\uADF8\uC778\uC740 \uB418\uC5C8\uC9C0\uB9CC \uC0AC\uC6A9\uC790 \uC815\uBCF4\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.');
    refs.loginPassword.value = '';
    showAppShell();
    showNotice('\uB85C\uADF8\uC778\uB418\uC5C8\uC2B5\uB2C8\uB2E4.', 'success');
    await loadRemoteData(false);
  } catch (err) {
    currentUser = null;
    showLoginShell();
    showNotice('\uB85C\uADF8\uC778 \uC2E4\uD328: ' + getErrMsg(err), 'error');
  } finally {
    setBusy(false);
  }
}

async function onLogout() {
  setBusy(true);
  try {
    await apiRequest(ENDPOINTS.logout, { method: 'POST' }, true);
  } catch (_) {}
  currentUser = null;
  appData = [];
  pageMeta = Object.assign({}, EMBEDDED_META || {});
  state.keyword = '';
  state.dateFrom = '';
  state.dateTo = '';
  state.filter = '\uC804\uCCB4';
  state.corp = '\uC804\uCCB4 \uBC95\uC778';
  state.mode = '\uC804\uCCB4';
  state.selectedDate = '';
  state.listDate = '';
  showLoginShell();
  renderAll();
  showNotice('\uB85C\uADF8\uC544\uC6C3\uB418\uC5C8\uC2B5\uB2C8\uB2E4.', 'success');
  setBusy(false);
}

async function loadRemoteData(showRefreshMessage) {
  if (showRefreshMessage) showNotice('\uCD9C\uD558 \uB370\uC774\uD130\uB97C \uB2E4\uC2DC \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.', 'info');
  setBusy(true);
  try {
    const payload = normalizeShipmentPayload(await apiRequest(ENDPOINTS.current, { method: 'GET' }));
    appData = (payload.data || []).map(normalizeShipmentRow);
    pageMeta = Object.assign({}, pageMeta || {}, payload.meta || {}, { source: ENDPOINTS.current, mode: 'remote', itemCount: appData.length });
    renderAll();
    if (appData.length === 0) {
      showNotice('/api/shipments/current \uC751\uB2F5\uC740 \uC815\uC0C1\uC774\uB098 \uD45C\uC2DC\uD560 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.', 'info');
    } else if (showRefreshMessage) {
      showNotice('\uB370\uC774\uD130\uB97C \uC0C8\uB85C\uACE0\uCE68\uD588\uC2B5\uB2C8\uB2E4.', 'success');
    } else {
      clearNotice();
    }
  } catch (err) {
    if (err && err.status === 401) {
      currentUser = null;
      showLoginShell();
      showNotice('\uC138\uC158\uC774 \uB9CC\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uB85C\uADF8\uC778\uD574\uC8FC\uC138\uC694.', 'error');
      return;
    }
    appData = [];
    renderAll();
    showNotice('\uCD9C\uD558 \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. ' + getErrMsg(err), 'error');
  } finally {
    setBusy(false);
  }
}

const formatStamp = meta => esc((meta && (meta.updatedAt || meta.updatedAtDisplay || meta.updatedAtIso || meta.generatedAt || meta.generatedAtIso)) || '-');

function renderPageMetaBar() {
  refs.pageMetaBarEl.innerHTML = `<span class="page-meta-chip"><strong>\uCD5C\uC885 \uC218\uC815</strong>${formatStamp(pageMeta)}</span><span class="page-meta-chip"><strong>\uB370\uC774\uD130 \uAC74\uC218</strong>${esc(String(appData.length))}</span><span class="page-meta-chip"><strong>\uC18C\uC2A4</strong>${esc(pageMeta.source || '/api/shipments/current')}</span><button class="page-meta-btn" id="versionHistoryBtn" type="button">\uC774\uC804 \uBC84\uC804</button>`;
  const btn = $('versionHistoryBtn');
  if (btn) btn.addEventListener('click', () => showNotice('\uC774\uC804 \uBC84\uC804 \uAE30\uB2A5\uC740 \uC778\uC99D \uC5F0\uB3D9 \uBC84\uC804\uC5D0\uC11C \uCD94\uD6C4 \uC7AC\uAD6C\uC131 \uC608\uC815\uC785\uB2C8\uB2E4.', 'info'));
}

function openModalHtml(title, html) {
  if (refs.modalTitleEl) refs.modalTitleEl.textContent = title || '\uC0C1\uC138\uC815\uBCF4';
  refs.modalBody.innerHTML = html || '';
  refs.detailModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function getErrMsg(err) {
  if (!err) return '\uC624\uB958';
  if (err.payload && err.payload.message) return err.payload.message;
  if (err.payload && err.payload.error) return err.payload.error;
  return err.message ? err.message : '\uC624\uB958';
}

function filteredData() {
  const kw = (state.keyword || '').trim().toLowerCase();
  return appData.filter(item => {
    if (state.corp !== '\uC804\uCCB4 \uBC95\uC778' && item.corp !== state.corp) return false;
    if (state.mode !== '\uC804\uCCB4' && item.shipMode !== state.mode) return false;
    if (state.filter !== '\uC804\uCCB4') {
      if (categorySet.has(state.filter) ? item.category !== state.filter : item.vendorName !== state.filter) return false;
    }
    const d = item.shipDate;
    if (state.dateFrom && d && d < state.dateFrom) return false;
    if (state.dateTo && d && d > state.dateTo) return false;
    if (kw && ![item.wo, item.vendorName, item.customer, item.model, item.sn, item.inv, item.exportInfo, item.shipType, item.shipMode, item.depart].join(' ').toLowerCase().includes(kw)) return false;
    return true;
  }).sort(compareDateTime);
}

const ymdToDate = ymd => { if (!ymd) return null; const d = new Date(ymd + 'T00:00:00'); return Number.isNaN(d.getTime()) ? null : d; };
const listDateCandidates = items => [...new Set(items.map(item => item.shipDate).filter(Boolean))].sort();

function pickInitialListDate(items, current) {
  const dates = listDateCandidates(items);
  if (!dates.length) return '';
  if (current && dates.includes(current)) return current;
  const todayKey = new Date().toISOString().slice(0, 10);
  if (dates.includes(todayKey)) return todayKey;
  const future = dates.find(d => d >= todayKey);
  return future || dates[dates.length - 1];
}

function formatListDateLabel(ymd) {
  if (!ymd) return '\uB0A0\uC9DC \uBBF8\uC815';
  const base = ymdToDate(ymd);
  if (!base) return ymd;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((base - today) / 86400000);
  const md = `${base.getMonth() + 1}/${base.getDate()}`;
  if (diff === 0) return `\uC624\uB298 (${md})`;
  if (diff === 1) return `\uB0B4\uC77C (${md})`;
  if (diff === -1) return `\uC5B4\uC81C (${md})`;
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')} (${md})`;
}

function moveListDate(items, step) {
  const dates = listDateCandidates(items);
  if (!dates.length) return;
  const current = pickInitialListDate(items, state.listDate);
  const idx = Math.max(dates.indexOf(current), 0);
  const nextIdx = Math.min(Math.max(idx + step, 0), dates.length - 1);
  state.listDate = dates[nextIdx];
  renderAll();
}

function renderTabs(el, options, key, onChange) {
  el.innerHTML = options.map(v => `<button class="tab ${state[key] === v ? 'active' : ''}" data-v="${esc(v)}" type="button">${esc(v)}</button>`).join('');
  el.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => { onChange(btn.dataset.v); renderAll(); }));
}

const renderViewTabs = () => {
  refs.viewTabs.innerHTML = viewOptions.map(o => `<button class="tab ${state.view === o.value ? 'active' : ''}" data-v="${o.value}" type="button">${esc(o.label)}</button>`).join('');
  refs.viewTabs.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => { state.view = btn.dataset.v; renderAll(); }));
};

const renderCorpTabs = () => renderTabs(refs.corpTabs, corpOptions, 'corp', v => state.corp = v);
const renderModeTabs = () => renderTabs(refs.modeTabs, modeOptions, 'mode', v => state.mode = v);
const renderFilterTabs = () => renderTabs(refs.filterTabs, getFilterOptions(), 'filter', v => state.filter = v);

function renderItemSummary(item) {
  const isEtc = item.category === '\uAE30\uD0C0';
  const corpLabel = item.corp === 'PSK Holdings' ? 'PSKH' : 'PSK';
  const workDate = item.shipDateText || item.shipDate || '-';
  const workLoc = item.depart === '\uC870\uB9BD\uC5C5\uCCB4' ? (item.vendorName || item.depart) : (isEtc ? (item.locationText || item.depart) : item.depart);
  const customerLine = [item.customer || '', corpLabel, item.shipMode || '\uAE30\uD0C0'].filter(Boolean).join(' \u00B7 ');
  const workLine = '\uC791\uC5C5\uC9C0: ' + (workLoc || '-') + (item.loadTime ? ' \u00B7 \uC0C1\uCC28\uC2DC\uAC04: ' + item.loadTime : '');
  return `<div class="badge-row">${badge(corpCls(item.corp), corpLabel)}${badge('mode-badge', item.shipMode || '\uAE30\uD0C0')}</div>` + `<div class="top-row"><div class="summary-main"><div class="summary-line"><span class="summary-wo">${esc(item.wo || '-')}</span></div><div class="summary-subline">${esc(workDate)}</div><div class="summary-model-line">${esc(item.model || '-')}</div><div class="summary-subline">${esc(customerLine || '-')}</div><div class="summary-subline">${esc(workLine)}</div></div><span class="arrow">&#8964;</span></div>`;
}

function renderItemDetail(item) {
  const isEtc = item.category === '\uAE30\uD0C0';
  return `<div class="detail-grid">`
    + field('\uBC95\uC778', item.corp)
    + field('\uAD6C\uBD84', item.shipMode)
    + field('\uCD9C\uBC1C\uC9C0', item.depart)
    + field('\uC2DC\uD2B8 \uAD6C\uBD84', item.shipType)
    + field('\uCD9C\uD558\uC77C', item.shipDate)
    + field('\uC0C1\uCC28\uC2DC\uAC04', item.loadTime)
    + field('\uD558\uCC28\uC2DC\uAC04', item.unloadTime)
    + field('FAB OUT', item.fabOut)
    + field('\uD3EC\uC7A5\uC608\uC815', item.packaging)
    + field('\uC0AC\uC774\uC988 \uC804\uB2EC', item.sizeNotice)
    + field('\uCD9C\uD558\uC758\uB8B0', item.shipRequest)
    + field('\uD1B5\uAD00\uC694\uCCAD', item.customs)
    + field('TERMS', item.terms)
    + field('PSK\uBC30\uCC28', item.pskDelivery)
    + field('\uD3EC\uC6CC\uB354', item.forwarder)
    + field('W/O', item.wo)
    + field('S/N', item.sn)
    + field('\uC7A5\uBE44\uBA85', item.model, true)
    + field('\uACE0\uAC1D\uC0AC', item.customer, true)
    + (isEtc ? field('\uC5C5\uCCB4\uBA85', item.vendorName) + field('\uBD80\uBD84\uD488', item.moduleText, true) : '')
    + field('\uB2F4\uB2F9\uC790', item.manager)
    + field('INV', item.inv)
    + field('\uC218\uCD9C\uC5EC\uBD80 \uC6D0\uBB38', item.exportInfo, true)
    + `</div>`;
}

function renderList(items) {
  if (!items.length) {
    state.listDate = '';
    refs.listEl.innerHTML = '<div class="empty">\uC870\uAC74\uC5D0 \uB9DE\uB294 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</div>';
    return;
  }
  const dates = listDateCandidates(items);
  state.listDate = pickInitialListDate(items, state.listDate);
  const currentDate = state.listDate || dates[0] || '';
  const currentIndex = Math.max(dates.indexOf(currentDate), 0);
  const rows = items.filter(item => item.shipDate === currentDate).sort(compareDateTime);
  const title = formatListDateLabel(currentDate);
  const subText = rows.length ? `${rows.length}\uAC74` : '';
  const navHtml = `<div class="list-day-nav"><button class="list-day-btn" id="listPrevDate" type="button" ${currentIndex <= 0 ? 'disabled' : ''}>&lt;</button><div class="list-day-nav-main"><div class="list-day-title">${esc(title)}</div><div class="list-day-sub">${esc(subText)}</div></div><button class="list-day-btn" id="listNextDate" type="button" ${currentIndex >= dates.length - 1 ? 'disabled' : ''}>&gt;</button></div>`;
  const bodyHtml = rows.length ? rows.map(item => `<article class="item"><button class="item-head" type="button">${renderItemSummary(item)}</button><div class="detail">${renderItemDetail(item)}</div></article>`).join('') : '<div class="empty">\uD574\uB2F9 \uB0A0\uC9DC \uC791\uC5C5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>';
  refs.listEl.innerHTML = navHtml + bodyHtml;
  const prevBtn = $('listPrevDate');
  const nextBtn = $('listNextDate');
  if (prevBtn) prevBtn.addEventListener('click', () => moveListDate(items, -1));
  if (nextBtn) nextBtn.addEventListener('click', () => moveListDate(items, 1));
  refs.listEl.querySelectorAll('.item-head').forEach(h => h.addEventListener('click', () => h.closest('.item').classList.toggle('open')));
}

const calCell = (x, sel) => x ? `<div class="cal-cell ${sel === x.ds ? 'selected' : ''}" data-date="${x.ds}"><div class="cal-day">${x.day}</div>${x.items.length ? `<div class="cal-count">${x.items.length}\uAC74</div>` : ''}<div class="cal-items">${x.items.slice(0, 2).map(it => `<div class="cal-item">${esc(it.wo || '-')} - ${esc(it.shipType || '-')} - ${esc(it.shipMode || '-')}</div>`).join('')}</div></div>` : `<div class="cal-cell empty"></div>`;

function renderCalendar(items) {
  const y = state.calendarYear;
  const m = state.calendarMonth;
  const last = new Date(y, m + 1, 0).getDate();
  const byDate = items.reduce((a, item) => {
    if (item.shipDate) (a[item.shipDate] = a[item.shipDate] || []).push(item);
    return a;
  }, {});
  const pad = n => String(n).padStart(2, '0');
  let html = '';
  let week = [];
  for (let day = 1; day <= last; day++) {
    const ds = `${y}-${pad(m + 1)}-${pad(day)}`;
    const wd = new Date(ds + 'T00:00:00').getDay();
    week.push({ day, ds, wd, items: byDate[ds] || [] });
    if (wd === 0 || day === last) {
      const hasSat = week.some(x => x.wd === 6 && x.items.length > 0);
      const hasSun = week.some(x => x.wd === 0 && x.items.length > 0);
      const cols = ['\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08', ...(hasSat ? ['\uD1A0'] : []), ...(hasSun ? ['\uC77C'] : [])];
      const map = Object.fromEntries(week.map(x => [x.wd, x]));
      html += `<div class="cal-week-block"><div class="cal-week-grid" style="grid-template-columns:repeat(${cols.length},1fr)">`;
      html += cols.map(n => `<div class="cal-weekday">${n}</div>`).join('');
      [1, 2, 3, 4, 5, ...(hasSat ? [6] : []), ...(hasSun ? [0] : [])].forEach(k => { html += calCell(map[k], state.selectedDate); });
      html += `</div></div>`;
      week = [];
    }
  }
  refs.calEl.innerHTML = html;
  refs.calTitleEl.textContent = `${y}\uB144 ${m + 1}\uC6D4`;
  refs.calEl.querySelectorAll('.cal-cell[data-date]').forEach(c => c.addEventListener('click', () => { state.selectedDate = c.dataset.date; renderAll(); }));
  renderCalendarDayPanel(items);
}

function renderCalendarDayPanel(items) {
  if (!state.selectedDate) {
    refs.calDayPanel.innerHTML = '<div class="day-panel-title">\uB0A0\uC9DC\uB97C \uC120\uD0DD\uD558\uC138\uC694</div>';
    return;
  }
  const rows = sortByLoadTime(items.filter(item => item.shipDate === state.selectedDate));
  if (!rows.length) {
    refs.calDayPanel.innerHTML = `<div class="day-panel-title">${esc(state.selectedDate)}</div><div class="empty">\uC120\uD0DD\uD55C \uB0A0\uC9DC\uC758 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</div>`;
    return;
  }
  refs.calDayPanel.innerHTML = `<div class="day-panel-title">${esc(state.selectedDate)} \u00B7 ${rows.length}\uAC74</div><div class="day-list">${rows.map((item, i) => {
    const workLoc = item.depart === '\uC870\uB9BD\uC5C5\uCCB4' ? (item.vendorName || item.depart) : ((item.category === '\uAE30\uD0C0') ? (item.locationText || item.depart) : item.depart);
    return `<div class="day-card ${item.redAlert === 'Y' ? 'alert' : ''}" data-idx="${i}"><div class="day-card-title">${esc(item.wo || '-')} | ${esc(item.model || '-')}</div><div class="day-card-sub">${esc(item.customer || '-')} \u00B7 ${esc(item.corp || '-')} \u00B7 ${esc(item.shipMode || '-')}</div><div class="day-card-sub">\uC791\uC5C5\uC9C0: ${esc(workLoc || '-')} \u00B7 \uC0C1\uCC28\uC2DC\uAC04: ${esc(item.loadTime || '-')}</div></div>`;
  }).join('')}</div>`;
  refs.calDayPanel.querySelectorAll('.day-card').forEach(c => c.addEventListener('click', () => openDetailModal(rows[+c.dataset.idx])));
}

function getReportColumns(corp) {
  const base = [
    { key: 'depart', label: '\uCD9C\uBC1C\uC9C0' }, { key: 'shipType', label: '\uAD6C\uBD84' },
    { key: 'shipDateText', label: '\uCD9C\uD558\uC77C', cls: 'col-date' },
    { key: 'loadTime', label: '\uC0C1\uCC28\uC2DC\uAC04' }, { key: 'unloadTime', label: '\uD558\uCC28\uC2DC\uAC04' },
    { key: 'fabOutText', label: 'FAB OUT' }, { key: 'packagingText', label: '\uD3EC\uC7A5\uC608\uC815' }
  ];
  if (corp === 'PSK Holdings') base.push({ key: 'sizeNotice', label: '\uC0AC\uC774\uC988 \uC804\uB2EC' }, { key: 'shipRequest', label: '\uCD9C\uD558\uC758\uB8B0' });
  base.push({ key: 'customs', label: '\uD1B5\uAD00\uC694\uCCAD' }, { key: 'terms', label: 'TERMS' }, { key: 'pskDelivery', label: 'PSK\uBC30\uCC28' }, { key: 'wo', label: 'W/O', cls: 'col-wo' }, { key: 'sn', label: 'S/N' }, { key: 'model', label: '\uC7A5\uBE44\uBA85' }, { key: 'exportInfo', label: '\uC218\uCD9C\uC5EC\uBD80', cls: 'col-export' }, { key: 'forwarder', label: '\uD3EC\uC6CC\uB354' }, { key: 'customer', label: '\uACE0\uAC1D\uC0AC' }, { key: 'manager', label: '\uB2F4\uB2F9\uC790' }, { key: 'inv', label: 'INV', cls: 'col-inv' });
  return base;
}

function buildReportTable(corp, rows) {
  const cols = getReportColumns(corp);
  const dateKey = 'shipDateText';
  const dateCounts = {};
  rows.forEach(item => {
    const k = String(item[dateKey] || '');
    dateCounts[k] = (dateCounts[k] || 0) + 1;
  });
  const datePrinted = {};
  let body = '';
  rows.forEach(item => {
    const rowCls = item.redAlert === 'Y' ? 'row-alert' : '';
    body += `<tr class="${rowCls}">`;
    cols.forEach(c => {
      let cls = c.cls || '';
      if (c.key === 'exportInfo' && item.shipType === '\uC774\uAD00') cls += (cls ? ' ' : '') + 'transfer';
      if (c.key === 'inv' && item.invGreen === 'Y') cls += (cls ? ' ' : '') + 'has-inv';
      if (c.key === dateKey) {
        const k = String(item[dateKey] || '');
        if (!datePrinted[k]) {
          datePrinted[k] = 1;
          const rowspan = Math.max(dateCounts[k] || 1, 1);
          const mergedCls = (cls ? cls + ' ' : '') + 'merged';
          body += `<td class="${esc(mergedCls)}" rowspan="${rowspan}">${esc(showVal(item[c.key]))}</td>`;
        }
      } else {
        body += `<td class="${esc(cls)}">${esc(showVal(item[c.key]))}</td>`;
      }
    });
    body += '</tr>';
  });
  const thead = `<thead><tr>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>`;
  return `<div class="report-table-wrap"><table class="report-table">${thead}<tbody>${body}</tbody></table></div>`;
}

function renderReport(items) {
  if (!items.length) {
    refs.reportEl.innerHTML = '<div class="empty">\uC870\uAC74\uC5D0 \uB9DE\uB294 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</div>';
    return;
  }
  const corpGroups = items.reduce((a, i) => { (a[i.corp] = a[i.corp] || []).push(i); return a; }, {});
  refs.reportEl.innerHTML = reportCorpOrder.filter(c => corpGroups[c] && corpGroups[c].length).map(corp => {
    const deptGroups = corpGroups[corp].reduce((a, item) => {
      const dep = ((item.depart || '').trim()) || '\uAE30\uD0C0';
      (a[dep] = a[dep] || []).push(item);
      return a;
    }, {});
    const extraDeps = Object.keys(deptGroups).filter(d => !reportDepartOrder.includes(d)).sort();
    const blocks = [...reportDepartOrder, ...extraDeps].filter(d => deptGroups[d] && deptGroups[d].length).map(dep => {
      const sortedRows = [...deptGroups[dep]].sort(compareReportDateTime);
      return `<section class="report-block"><div class="report-block-title">${esc(dep)} \u00B7 ${sortedRows.length}\uAC74</div>${buildReportTable(corp, sortedRows)}</section>`;
    }).join('');
    return `<div class="report-corp"><div class="report-corp-title">${esc(corp)} \u00B7 ${corpGroups[corp].length}\uAC74</div>${blocks}</div>`;
  }).join('') || '<div class="empty">\uC870\uAC74\uC5D0 \uB9DE\uB294 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</div>';
}

function renderMainView(items) {
  const isCalendar = state.view === 'calendar';
  const isReport = state.view === 'report';
  refs.listEl.classList.toggle('hidden', isCalendar || isReport);
  refs.reportEl.classList.toggle('hidden', !isReport);
  refs.calToolbar.classList.toggle('hidden', !isCalendar);
  refs.calWrap.classList.toggle('hidden', !isCalendar);
  if (isCalendar) renderCalendar(items); else if (isReport) renderReport(items); else renderList(items);
}

function renderAll() {
  renderUserBar();
  renderViewTabs();
  renderCorpTabs();
  renderModeTabs();
  renderFilterTabs();
  renderPageMetaBar();
  const items = filteredData();
  state.listDate = pickInitialListDate(items, state.listDate);
  const summaryHtml = `<div class="summary-card"><div class="summary-label">\uC804\uCCB4 \uC608\uC815 \uAC74\uC218</div><div class="summary-value">${items.length}</div></div>`;
  refs.summaryEl.innerHTML = '';
  refs.summaryInlineEl.innerHTML = summaryHtml;
  refs.toggleAdvancedFiltersBtn.textContent = state.advancedOpen ? '\uD544\uD130 \uB2EB\uAE30' : '\uD544\uD130 \uC5F4\uAE30';
  refs.advancedFiltersEl.classList.toggle('hidden', !state.advancedOpen);
  renderMainView(items);
}

function bindStaticEvents() {
  refs.loginForm.addEventListener('submit', onLoginSubmit);
  refs.searchInput.addEventListener('input', e => { state.keyword = e.target.value; renderAll(); });
  refs.dateFromEl.addEventListener('change', e => { state.dateFrom = e.target.value; renderAll(); });
  refs.dateToEl.addEventListener('change', e => { state.dateTo = e.target.value; renderAll(); });
  refs.dateResetEl.addEventListener('click', () => {
    state.dateFrom = '';
    state.dateTo = '';
    refs.dateFromEl.value = '';
    refs.dateToEl.value = '';
    renderAll();
  });
  refs.toggleAdvancedFiltersBtn.addEventListener('click', () => {
    state.advancedOpen = !state.advancedOpen;
    renderAll();
  });
  $('prevMonth').addEventListener('click', () => {
    state.calendarMonth--;
    if (state.calendarMonth < 0) {
      state.calendarMonth = 11;
      state.calendarYear--;
    }
    state.selectedDate = '';
    renderAll();
  });
  $('nextMonth').addEventListener('click', () => {
    state.calendarMonth++;
    if (state.calendarMonth > 11) {
      state.calendarMonth = 0;
      state.calendarYear++;
    }
    state.selectedDate = '';
    renderAll();
  });
  refs.modalBackdrop.addEventListener('click', closeDetailModal);
  refs.modalClose.addEventListener('click', closeDetailModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !refs.detailModal.classList.contains('hidden')) closeDetailModal();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initRefs();
  bindStaticEvents();
  renderUserBar();
  bootApp();
});
