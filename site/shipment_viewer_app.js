const VIEWER_CONFIG = window.SHIPMENT_VIEWER_CONFIG || {};
const WORKER_BASE_URL = VIEWER_CONFIG.workerBaseUrl || '';
const EMBEDDED_DATA = Array.isArray(VIEWER_CONFIG.embeddedData) ? VIEWER_CONFIG.embeddedData : [];
const EMBEDDED_META = VIEWER_CONFIG.embeddedMeta || {};

const now = new Date();
const APP_VERSION = '20260413_1905_sameorigin_bootfix_v1';
const API_BASE_URL = '';
const ENDPOINTS = { login: '/api/auth/login', logout: '/api/auth/logout', me: '/api/auth/me', current: '/api/shipments/current' };
let appData = Array.isArray(EMBEDDED_DATA) ? EMBEDDED_DATA : [];
let pageMeta = EMBEDDED_META || {};
let currentUser = null;
const state = { corp: '전체 법인', mode: '전체', filter: '전체', keyword: '', dateFrom: '', dateTo: '', view: 'list', calendarYear: now.getFullYear(), calendarMonth: now.getMonth(), selectedDate: '', listDate: '', advancedOpen: false };
const $ = id => document.getElementById(id);
const refs = {};
const corpOptions = ['전체 법인', 'PSK', 'PSK Holdings'];
const modeOptions = ['전체', '내수', '항공', '해상', '이관', '기타'];
const viewOptions = [{ label: '캘린더', value: 'calendar' }, { label: '요약', value: 'report' }, { label: '상세내용', value: 'list' }];
const categorySet = new Set(['전체', '본사(HQ)', '2사업장', '기타']);
const reportCorpOrder = ['PSK', 'PSK Holdings'];
const reportDepartOrder = ['PSK HQ', '2사업장', '조립업체', '기타'];

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const badge = (cls, txt) => `<span class="${cls}">${esc(txt)}</span>`;
const pill = txt => `<span class="pill">${esc(txt)}</span>`;
const corpCls = c => c === 'PSK' ? 'corp-badge corp-psk' : 'corp-badge corp-holdings';
const field = (label, val, full) => `<div class="field"${full ? ' style="grid-column:1/-1"' : ''}><div class="field-label">${esc(label)}</div><div class="field-value">${esc(val || '-')}</div></div>`;
const showVal = v => String(v ?? '').trim() || '-';
const getFilterOptions = () => ['전체', '본사(HQ)', '2사업장', '기타', ...[...new Set(appData.map(d => d.vendorName).filter(Boolean))].sort()];

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
  if (refs.modalTitleEl) refs.modalTitleEl.textContent = '출하 상세정보';
  refs.modalBody.innerHTML = renderItemDetail(item);
  refs.detailModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

const closeDetailModal = () => {
  refs.detailModal.classList.add('hidden');
  refs.modalBody.innerHTML = '';
  if (refs.modalTitleEl) refs.modalTitleEl.textContent = '출하 상세정보';
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
    const e = new Error('NETWORK_ERROR: ' + (err && err.message ? err.message : String(err)));
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
    refs.userBar.innerHTML = '<span class="user-chip">미로그인</span>';
    return;
  }
  const role = safeRole(currentUser);
  const roleCls = role === 'ADMIN' ? 'admin' : 'user';
  refs.userBar.innerHTML = `<span class="user-chip"><strong>${esc(safeUserName(currentUser))}</strong><span>${esc(safeUserId(currentUser))}</span><span class="user-role ${roleCls}">${esc(role)}</span></span><button class="user-btn" id="reloadBtn" type="button">새로고침</button><button class="user-btn" id="logoutBtn" type="button">로그아웃</button>`;
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
  console.log('[shipment_viewer_app] version =', APP_VERSION);
  setBusy(true);
  showNotice('인증 상태를 확인하는 중입니다.', 'info');
  try {
    const me = await fetchMe();
    if (me) {
      currentUser = me;
      showAppShell();
      await loadRemoteData(false);
    } else {
      currentUser = null;
      showLoginShell();
      clearNotice();
    }
  } catch (err) {
    console.error('[bootApp] fetchMe failed:', err);
    currentUser = null;
    showLoginShell();
    showNotice('인증 상태를 확인하지 못했습니다. ' + getErrMsg(err), 'error');
  } finally {
    setBusy(false);
  }
}

async function onLoginSubmit(e) {
  e.preventDefault();
  const loginId = (refs.loginId.value || '').trim();
  const password = refs.loginPassword.value || '';
  if (!loginId || !password) {
    showNotice('아이디와 비밀번호를 입력해주세요.', 'error');
    return;
  }
  setBusy(true);
  showNotice('로그인 중입니다.', 'info');
  try {
    const payload = await apiRequest(ENDPOINTS.login, {
      method: 'POST',
      body: JSON.stringify({ username: loginId, loginId: loginId, password: password })
    });
    currentUser = normalizeUser(payload) || await fetchMe();
    if (!currentUser) throw new Error('로그인은 되었지만 사용자 정보를 확인하지 못했습니다.');
    refs.loginPassword.value = '';
    showAppShell();
    showNotice('로그인되었습니다.', 'success');
    await loadRemoteData(false);
  } catch (err) {
    currentUser = null;
    showLoginShell();
    showNotice('로그인 실패: ' + getErrMsg(err), 'error');
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
  state.filter = '전체';
  state.corp = '전체 법인';
  state.mode = '전체';
  state.selectedDate = '';
  state.listDate = '';
  showLoginShell();
  renderAll();
  showNotice('로그아웃되었습니다.', 'success');
  setBusy(false);
}

async function loadRemoteData(showRefreshMessage) {
  if (showRefreshMessage) showNotice('출하 데이터를 다시 불러오는 중입니다.', 'info');
  setBusy(true);
  try {
    const payload = normalizeShipmentPayload(await apiRequest(ENDPOINTS.current, { method: 'GET' }));
    appData = (payload.data || []).map(normalizeShipmentRow);
    pageMeta = Object.assign({}, pageMeta || {}, payload.meta || {}, { source: ENDPOINTS.current, mode: 'remote', itemCount: appData.length, appVersion: APP_VERSION });
    renderAll();
    if (appData.length === 0) {
      showNotice('/api/shipments/current 응답은 정상이나 표시할 데이터가 없습니다.', 'info');
    } else if (showRefreshMessage) {
      showNotice('데이터를 새로고침했습니다.', 'success');
    } else {
      clearNotice();
    }
  } catch (err) {
    if (err && err.status === 401) {
      currentUser = null;
      showLoginShell();
      showNotice('세션이 만료되었습니다. 다시 로그인해주세요.', 'error');
      return;
    }
    appData = [];
    renderAll();
    showNotice('출하 데이터를 불러오지 못했습니다. ' + getErrMsg(err), 'error');
  } finally {
    setBusy(false);
  }
}

const formatStamp = meta => esc((meta && (meta.updatedAt || meta.updatedAtDisplay || meta.updatedAtIso || meta.generatedAt || meta.generatedAtIso)) || '-');

function renderPageMetaBar() {
  refs.pageMetaBarEl.innerHTML = `<span class="page-meta-chip"><strong>앱 버전</strong>${esc(APP_VERSION)}</span><span class="page-meta-chip"><strong>최종 수정</strong>${formatStamp(pageMeta)}</span><span class="page-meta-chip"><strong>데이터 건수</strong>${esc(String(appData.length))}</span><span class="page-meta-chip"><strong>소스</strong>${esc(pageMeta.source || '/api/shipments/current')}</span><button class="page-meta-btn" id="versionHistoryBtn" type="button">이전 버전</button>`;
  const btn = $('versionHistoryBtn');
  if (btn) btn.addEventListener('click', () => showNotice('이전 버전 기능은 인증 연동 버전에서 추후 재구성 예정입니다.', 'info'));
}

function openModalHtml(title, html) {
  if (refs.modalTitleEl) refs.modalTitleEl.textContent = title || '상세정보';
  refs.modalBody.innerHTML = html || '';
  refs.detailModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function getErrMsg(err) {
  if (!err) return '오류';
  if (err.payload && err.payload.message) return err.payload.message;
  if (err.payload && err.payload.error) return err.payload.error;
  return err.message ? err.message : '오류';
}

function filteredData() {
  const kw = (state.keyword || '').trim().toLowerCase();
  return appData.filter(item => {
    if (state.corp !== '전체 법인' && item.corp !== state.corp) return false;
    if (state.mode !== '전체' && item.shipMode !== state.mode) return false;
    if (state.filter !== '전체') {
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
  if (!ymd) return '날짜 미정';
  const base = ymdToDate(ymd);
  if (!base) return ymd;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((base - today) / 86400000);
  const md = `${base.getMonth() + 1}/${base.getDate()}`;
  if (diff === 0) return `오늘 (${md})`;
  if (diff === 1) return `내일 (${md})`;
  if (diff === -1) return `어제 (${md})`;
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
  const isEtc = item.category === '기타';
  const corpLabel = item.corp === 'PSK Holdings' ? 'PSKH' : 'PSK';
  const workDate = item.shipDateText || item.shipDate || '-';
  const workLoc = item.depart === '조립업체' ? (item.vendorName || item.depart) : (isEtc ? (item.locationText || item.depart) : item.depart);
  const customerLine = [item.customer || '', corpLabel, item.shipMode || '기타'].filter(Boolean).join(' · ');
  const workLine = '작업지: ' + (workLoc || '-') + (item.loadTime ? ' · 상차시간: ' + item.loadTime : '');
  return `<div class="badge-row">${badge(corpCls(item.corp), corpLabel)}${badge('mode-badge', item.shipMode || '기타')}</div>` + `<div class="top-row"><div class="summary-main"><div class="summary-line"><span class="summary-wo">${esc(item.wo || '-')}</span></div><div class="summary-subline">${esc(workDate)}</div><div class="summary-model-line">${esc(item.model || '-')}</div><div class="summary-subline">${esc(customerLine || '-')}</div><div class="summary-subline">${esc(workLine)}</div></div><span class="arrow">&#8964;</span></div>`;
}

function renderItemDetail(item) {
  const isEtc = item.category === '기타';
  return `<div class="detail-grid">`
    + field('법인', item.corp)
    + field('구분', item.shipMode)
    + field('출발지', item.depart)
    + field('시트 구분', item.shipType)
    + field('출하일', item.shipDate)
    + field('상차시간', item.loadTime)
    + field('하차시간', item.unloadTime)
    + field('FAB OUT', item.fabOut)
    + field('포장예정', item.packaging)
    + field('사이즈 전달', item.sizeNotice)
    + field('출하의뢰', item.shipRequest)
    + field('통관요청', item.customs)
    + field('TERMS', item.terms)
    + field('PSK배차', item.pskDelivery)
    + field('포워더', item.forwarder)
    + field('W/O', item.wo)
    + field('S/N', item.sn)
    + field('장비명', item.model, true)
    + field('고객사', item.customer, true)
    + (isEtc ? field('업체명', item.vendorName) + field('부분품', item.moduleText, true) : '')
    + field('담당자', item.manager)
    + field('INV', item.inv)
    + field('수출여부 원문', item.exportInfo, true)
    + `</div>`;
}

function renderList(items) {
  if (!items.length) {
    state.listDate = '';
    refs.listEl.innerHTML = '<div class="empty">조건에 맞는 데이터가 없습니다.</div>';
    return;
  }
  const dates = listDateCandidates(items);
  state.listDate = pickInitialListDate(items, state.listDate);
  const currentDate = state.listDate || dates[0] || '';
  const currentIndex = Math.max(dates.indexOf(currentDate), 0);
  const rows = items.filter(item => item.shipDate === currentDate).sort(compareDateTime);
  const title = formatListDateLabel(currentDate);
  const subText = rows.length ? `${rows.length}건` : '';
  const navHtml = `<div class="list-day-nav"><button class="list-day-btn" id="listPrevDate" type="button" ${currentIndex <= 0 ? 'disabled' : ''}>&lt;</button><div class="list-day-nav-main"><div class="list-day-title">${esc(title)}</div><div class="list-day-sub">${esc(subText)}</div></div><button class="list-day-btn" id="listNextDate" type="button" ${currentIndex >= dates.length - 1 ? 'disabled' : ''}>&gt;</button></div>`;
  const bodyHtml = rows.length ? rows.map(item => `<article class="item"><button class="item-head" type="button">${renderItemSummary(item)}</button><div class="detail">${renderItemDetail(item)}</div></article>`).join('') : '<div class="empty">해당 날짜 작업이 없습니다.</div>';
  refs.listEl.innerHTML = navHtml + bodyHtml;
  const prevBtn = $('listPrevDate');
  const nextBtn = $('listNextDate');
  if (prevBtn) prevBtn.addEventListener('click', () => moveListDate(items, -1));
  if (nextBtn) nextBtn.addEventListener('click', () => moveListDate(items, 1));
  refs.listEl.querySelectorAll('.item-head').forEach(h => h.addEventListener('click', () => h.closest('.item').classList.toggle('open')));
}

const calCell = (x, sel) => x ? `<div class="cal-cell ${sel === x.ds ? 'selected' : ''}" data-date="${x.ds}"><div class="cal-day">${x.day}</div>${x.items.length ? `<div class="cal-count">${x.items.length}건</div>` : ''}<div class="cal-items">${x.items.slice(0, 2).map(it => `<div class="cal-item">${esc(it.wo || '-')} - ${esc(it.shipType || '-')} - ${esc(it.shipMode || '-')}</div>`).join('')}</div></div>` : `<div class="cal-cell empty"></div>`;

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
      const cols = ['월', '화', '수', '목', '금', ...(hasSat ? ['토'] : []), ...(hasSun ? ['일'] : [])];
      const map = Object.fromEntries(week.map(x => [x.wd, x]));
      html += `<div class="cal-week-block"><div class="cal-week-grid" style="grid-template-columns:repeat(${cols.length},1fr)">`;
      html += cols.map(n => `<div class="cal-weekday">${n}</div>`).join('');
      [1, 2, 3, 4, 5, ...(hasSat ? [6] : []), ...(hasSun ? [0] : [])].forEach(k => { html += calCell(map[k], state.selectedDate); });
      html += `</div></div>`;
      week = [];
    }
  }
  refs.calEl.innerHTML = html;
  refs.calTitleEl.textContent = `${y}년 ${m + 1}월`;
  refs.calEl.querySelectorAll('.cal-cell[data-date]').forEach(c => c.addEventListener('click', () => { state.selectedDate = c.dataset.date; renderAll(); }));
  renderCalendarDayPanel(items);
}

function renderCalendarDayPanel(items) {
  if (!state.selectedDate) {
    refs.calDayPanel.innerHTML = '<div class="day-panel-title">날짜를 선택하세요</div>';
    return;
  }
  const rows = sortByLoadTime(items.filter(item => item.shipDate === state.selectedDate));
  if (!rows.length) {
    refs.calDayPanel.innerHTML = `<div class="day-panel-title">${esc(state.selectedDate)}</div><div class="empty">선택한 날짜의 데이터가 없습니다.</div>`;
    return;
  }
  refs.calDayPanel.innerHTML = `<div class="day-panel-title">${esc(state.selectedDate)} · ${rows.length}건</div><div class="day-list">${rows.map((item, i) => {
    const workLoc = item.depart === '조립업체' ? (item.vendorName || item.depart) : ((item.category === '기타') ? (item.locationText || item.depart) : item.depart);
    return `<div class="day-card ${item.redAlert === 'Y' ? 'alert' : ''}" data-idx="${i}"><div class="day-card-title">${esc(item.wo || '-')} | ${esc(item.model || '-')}</div><div class="day-card-sub">${esc(item.customer || '-')} · ${esc(item.corp || '-')} · ${esc(item.shipMode || '-')}</div><div class="day-card-sub">작업지: ${esc(workLoc || '-')} · 상차시간: ${esc(item.loadTime || '-')}</div></div>`;
  }).join('')}</div>`;
  refs.calDayPanel.querySelectorAll('.day-card').forEach(c => c.addEventListener('click', () => openDetailModal(rows[+c.dataset.idx])));
}

function getReportColumns(corp) {
  const base = [
    { key: 'depart', label: '출발지' }, { key: 'shipType', label: '구분' },
    { key: 'shipDateText', label: '출하일', cls: 'col-date' },
    { key: 'loadTime', label: '상차시간' }, { key: 'unloadTime', label: '하차시간' },
    { key: 'fabOutText', label: 'FAB OUT' }, { key: 'packagingText', label: '포장예정' }
  ];
  if (corp === 'PSK Holdings') base.push({ key: 'sizeNotice', label: '사이즈 전달' }, { key: 'shipRequest', label: '출하의뢰' });
  base.push({ key: 'customs', label: '통관요청' }, { key: 'terms', label: 'TERMS' }, { key: 'pskDelivery', label: 'PSK배차' }, { key: 'wo', label: 'W/O', cls: 'col-wo' }, { key: 'sn', label: 'S/N' }, { key: 'model', label: '장비명' }, { key: 'exportInfo', label: '수출여부', cls: 'col-export' }, { key: 'forwarder', label: '포워더' }, { key: 'customer', label: '고객사' }, { key: 'manager', label: '담당자' }, { key: 'inv', label: 'INV', cls: 'col-inv' });
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
      if (c.key === 'exportInfo' && item.shipType === '이관') cls += (cls ? ' ' : '') + 'transfer';
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
    refs.reportEl.innerHTML = '<div class="empty">조건에 맞는 데이터가 없습니다.</div>';
    return;
  }
  const corpGroups = items.reduce((a, i) => { (a[i.corp] = a[i.corp] || []).push(i); return a; }, {});
  refs.reportEl.innerHTML = reportCorpOrder.filter(c => corpGroups[c] && corpGroups[c].length).map(corp => {
    const deptGroups = corpGroups[corp].reduce((a, item) => {
      const dep = ((item.depart || '').trim()) || '기타';
      (a[dep] = a[dep] || []).push(item);
      return a;
    }, {});
    const extraDeps = Object.keys(deptGroups).filter(d => !reportDepartOrder.includes(d)).sort();
    const blocks = [...reportDepartOrder, ...extraDeps].filter(d => deptGroups[d] && deptGroups[d].length).map(dep => {
      const sortedRows = [...deptGroups[dep]].sort(compareReportDateTime);
      return `<section class="report-block"><div class="report-block-title">${esc(dep)} · ${sortedRows.length}건</div>${buildReportTable(corp, sortedRows)}</section>`;
    }).join('');
    return `<div class="report-corp"><div class="report-corp-title">${esc(corp)} · ${corpGroups[corp].length}건</div>${blocks}</div>`;
  }).join('') || '<div class="empty">조건에 맞는 데이터가 없습니다.</div>';
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
  const summaryHtml = `<div class="summary-card"><div class="summary-label">전체 예정 건수</div><div class="summary-value">${items.length}</div></div>`;
  refs.summaryEl.innerHTML = '';
  refs.summaryInlineEl.innerHTML = summaryHtml;
  refs.toggleAdvancedFiltersBtn.textContent = state.advancedOpen ? '필터 닫기' : '필터 열기';
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
  console.log('[shipment_viewer_app] DOMContentLoaded');
  initRefs();
  bindStaticEvents();
  renderUserBar();
  bootApp();
});
