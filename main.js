// ============================================================
// AAHL 2025-26 — main.js
// Handles: routing, Firebase reads, standings render,
//          picks form, live indicator, auto-refresh, toast
// ============================================================

// ── CONFIG — fill these in after setup ────────────────────────
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxixSHzuApsOHAQKN4Qz1nbmKMN-T7vBgwaW0k2b5rlxGuFcaqx7A_8jZL73kwZbM09/exec';

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyD8xMarJLQHsoUm_yY-q63KWVH2nxmB9Co',
  authDomain:        'aahl-2526.firebaseapp.com',
  projectId:         'aahl-2526',
  storageBucket:     'aahl-2526.firebasestorage.app',
  messagingSenderId: '293365274832',
  appId:             '1:293365274832:web:ee3c8dcec5b93dfd83e6d5',
};

// ── SEASON CONSTANTS ──────────────────────────────────────────
const SEASON = {
  CUTOFF:    new Date('2025-10-07T23:59:59-04:00'),
  OPENING:   new Date('2025-10-08T00:00:00-04:00'),
  LIVE_START: 19, // 7 PM ET
  LIVE_END:   23, // 11 PM ET
  MAX_ENTRIES: 3,
};

const SLOTS = { F: 6, D: 4, G: 2 };

const NHL_DIVISIONS = {
  Atlantic:     ['Boston Bruins','Buffalo Sabres','Detroit Red Wings','Florida Panthers','Montreal Canadiens','Ottawa Senators','Tampa Bay Lightning','Toronto Maple Leafs'],
  Metropolitan: ['Carolina Hurricanes','Columbus Blue Jackets','New Jersey Devils','New York Islanders','New York Rangers','Philadelphia Flyers','Pittsburgh Penguins','Washington Capitals'],
  Central:      ['Arizona Coyotes','Chicago Blackhawks','Colorado Avalanche','Dallas Stars','Minnesota Wild','Nashville Predators','St. Louis Blues','Winnipeg Jets'],
  Pacific:      ['Anaheim Ducks','Calgary Flames','Edmonton Oilers','Los Angeles Kings','San Jose Sharks','Seattle Kraken','Utah Hockey Club','Vancouver Canucks'],
};

// ── FIREBASE STATE ────────────────────────────────────────────
let db = null;
let firebaseReady = false;

// ── APP STATE ─────────────────────────────────────────────────
const state = {
  entries:    [],
  players:    [],
  hatTricks:  [],
  irPlayers:  new Set(),
  currentPage: 'home',
  refreshTimer: null,
  entryForms: [newEntryForm()],
  activeFormIdx: 0,
};

// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initFirebase();
  initNav();
  initLiveIndicator();
  routeToPage(getPageFromHash() || 'home');
  window.addEventListener('hashchange', () => routeToPage(getPageFromHash()));
});

function initFirebase() {
  try {
    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK not loaded — data will not be fetched.');
      return;
    }
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    firebaseReady = true;
  } catch (e) {
    console.error('Firebase init failed:', e);
  }
}

// ════════════════════════════════════════════════════════════
// ROUTING
// ════════════════════════════════════════════════════════════

function getPageFromHash() {
  const h = window.location.hash.replace('#', '');
  return ['home','picks','standings','rules','admin'].includes(h) ? h : 'home';
}

function routeToPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const el = document.getElementById(`page-${page}`);
  const nb = document.querySelector(`[data-page="${page}"]`);
  if (el) el.classList.add('on');
  if (nb) nb.classList.add('active');

  state.currentPage = page;
  window.location.hash = page;

  clearInterval(state.refreshTimer);

  switch (page) {
    case 'home':      initHomePage();      break;
    case 'picks':     initPicksPage();     break;
    case 'standings': initStandingsPage(); break;
    case 'rules':     initRulesPage();     break;
    case 'admin':     initAdminPage();     break;
  }
}

function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => routeToPage(btn.dataset.page));
  });
}

// ════════════════════════════════════════════════════════════
// LIVE INDICATOR
// ════════════════════════════════════════════════════════════

function initLiveIndicator() {
  updateLiveIndicator();
  setInterval(updateLiveIndicator, 60000);
}

function isLiveNow() {
  const et = new Date().toLocaleString('en-US', { timeZone: 'America/Toronto' });
  const h  = new Date(et).getHours();
  return h >= SEASON.LIVE_START && h < SEASON.LIVE_END;
}

function updateLiveIndicator() {
  const live    = isLiveNow();
  const dotEl   = document.getElementById('live-dot');
  const textEl  = document.getElementById('live-text');
  if (!dotEl || !textEl) return;

  if (live) {
    dotEl.style.display = 'inline-block';
    textEl.textContent  = 'LIVE';
    textEl.style.color  = 'var(--red)';
  } else {
    dotEl.style.display = 'none';
    textEl.textContent  = 'AAHL';
    textEl.style.color  = '';
  }
}

// ════════════════════════════════════════════════════════════
// FIREBASE DATA FETCH
// ════════════════════════════════════════════════════════════

async function fetchCollection(name) {
  if (!firebaseReady) return [];
  try {
    const snap = await db.collection(name).get();
    return snap.docs.map(d => ({ _id: d.id, ...d.data() }));
  } catch (e) {
    console.error(`fetchCollection(${name}) failed:`, e);
    return [];
  }
}

async function fetchAllData() {
  const [entries, players, hatTricks, irDocs] = await Promise.all([
    fetchCollection('entries'),
    fetchCollection('players'),
    fetchCollection('hatTricks'),
    fetchCollection('ir'),
  ]);

  state.entries   = entries.sort((a,b) => (a.rank||999) - (b.rank||999));
  state.players   = players.sort((a,b) => (b.poolPoints||0) - (a.poolPoints||0));
  state.hatTricks = hatTricks.sort((a,b) => (b.date||'') < (a.date||'') ? 1 : -1);
  state.irPlayers = new Set(irDocs.map(d => (d.player||'').toLowerCase()));
}

// ════════════════════════════════════════════════════════════
// 3 STARS OF THE NIGHT
// ════════════════════════════════════════════════════════════

async function fetchThreeStars() {
  if (!firebaseReady) return null;
  for (let daysBack = 1; daysBack <= 3; daysBack++) {
    const d   = new Date(Date.now() - daysBack * 86400000);
    const key = d.toISOString().split('T')[0];
    try {
      const doc = await db.collection('threeStars').doc(key).get();
      if (doc.exists) return { ...doc.data(), _date: key };
    } catch (e) { console.error('fetchThreeStars:', e); }
  }
  return null;
}

function renderThreeStars(data) {
  const body   = document.getElementById('stars-body');
  const dateEl = document.getElementById('stars-date');
  if (!body) return;

  if (!data || !data.stars?.length) {
    body.innerHTML = `<div class="stars-empty">No games last night</div>`;
    if (dateEl) dateEl.textContent = 'No recent data';
    return;
  }

  if (dateEl) {
    const d = new Date(data._date + 'T12:00:00Z');
    dateEl.textContent = d.toLocaleDateString('en-CA', { weekday:'short', month:'short', day:'numeric' });
  }

  const stars = data.stars;
  // Podium order: 2nd · 1st · 3rd (1st star centred and taller)
  const order   = [stars[1], stars[0], stars[2]].filter(Boolean);
  const classes = stars[1] ? ['star-2','star-1','star-3'] : ['star-1'];
  body.innerHTML = `<div class="stars-grid">${order.map((s,i) => starCard(s, classes[i])).join('')}</div>`;

  // Headshot fallback chain
  body.querySelectorAll('.star-headshot-img').forEach(img => {
    const fb1 = img.dataset.fallback1;
    const fb2 = img.dataset.fallback2;
    img.onerror = function() {
      if (this.src !== fb1 && fb1) { this.src = fb1; }
      else if (this.src !== fb2 && fb2) { this.src = fb2; this.onerror = () => showInitialsAvatar(this); }
      else { showInitialsAvatar(this); }
    };
  });
}

function showInitialsAvatar(imgEl) {
  const name     = imgEl.dataset.name || '??';
  const initials = name.split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();
  const wrap     = imgEl.parentElement;
  imgEl.remove();
  const div = document.createElement('div');
  div.className   = 'star-headshot-fallback';
  div.textContent = initials;
  wrap.appendChild(div);
}

function starCard(star, cssClass) {
  if (!star) return '';
  const isSkater  = star.position !== 'G';
  const hatTrick  = star.stats?.isHatTrick;
  const owners    = (star.ownedBy || []);
  const rankLabel = { 'star-1':'★ 1ST STAR', 'star-2':'2ND STAR', 'star-3':'3RD STAR' }[cssClass] || '';

  const statCells = isSkater
    ? [
        { val: star.stats?.goals   || 0, lbl: 'G'   },
        { val: star.stats?.assists || 0, lbl: 'A'   },
        { val: (star.stats?.goals||0) + (star.stats?.assists||0), lbl: 'PTS' },
      ]
    : [
        { val: star.stats?.wins     || 0, lbl: 'W'  },
        { val: star.stats?.shutouts || 0, lbl: 'SO' },
        { val: star.stats?.saves    || 0, lbl: 'SV' },
      ];

  const headshotSrc  = star.headshotUrl
    || (star.playerId ? `https://assets.nhle.com/mugs/nhl/20252026/${star.team}/${star.playerId}.png` : '');
  const fallback1    = star.headshotFallback || '';
  const fallback2    = star.playerId ? `https://cms.nhl.bamgrid.com/images/headshots/current/168x168/${star.playerId}.jpg` : '';
  const teamLogo     = `https://assets.nhle.com/logos/nhl/svg/${esc(star.team)}_dark.svg`;

  return `
    <div class="star-card ${cssClass}">
      <div class="star-rank">${rankLabel}</div>
      <div class="star-headshot-wrap${hatTrick?' has-hat-trick':''}">
        ${headshotSrc
          ? `<img class="star-headshot star-headshot-img"
               src="${esc(headshotSrc)}"
               data-fallback1="${esc(fallback1)}"
               data-fallback2="${esc(fallback2)}"
               data-name="${esc(star.name)}"
               alt="${esc(star.name)}" loading="lazy">`
          : `<div class="star-headshot-fallback">${esc((star.name||'??').split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase())}</div>`
        }
        <img class="star-team-badge" src="${esc(teamLogo)}" alt="${esc(star.team)}"
          loading="lazy" onerror="this.style.display='none'">
      </div>
      <div class="star-name">${esc(star.name)}</div>
      <div class="star-meta">${esc(star.team)} · ${star.position}${hatTrick?' · 🎩 HAT TRICK':''}</div>
      <div class="star-stats">
        ${statCells.map(s=>`<div class="star-stat"><div class="star-stat-val">${s.val}</div><div class="star-stat-lbl">${s.lbl}</div></div>`).join('')}
      </div>
      <div class="star-pool-pts">${star.poolPts}</div>
      <div class="star-pool-pts-lbl">POOL PTS TONIGHT</div>
      <div class="star-owners" title="${esc(owners.join(', '))}">
        ${owners.length
          ? `Owned by <span>${esc(owners.slice(0,2).join(', '))}${owners.length>2?` +${owners.length-2}`:''}</span>`
          : `<span style="color:var(--red)">Unowned</span>`}
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
// HOME PAGE
// ════════════════════════════════════════════════════════════

async function initHomePage() {
  renderHomeLoading();
  const [_, starsData] = await Promise.all([
    fetchAllData(),
    fetchThreeStars(),
  ]);
  renderHomeKPIs();
  renderThreeStars(starsData);
  renderHomeStandings();
  renderHatTrickHall();
  renderTicker();

  if (isLiveNow()) {
    state.refreshTimer = setInterval(async () => {
      const [_, starsData] = await Promise.all([fetchAllData(), fetchThreeStars()]);
      renderHomeStandings();
      renderTicker();
      renderThreeStars(starsData);
    }, 5 * 60 * 1000);
  }
}

function renderHomeLoading() {
  const el = document.getElementById('home-standings-body');
  if (el) el.innerHTML = loadingRow();
}

function renderHomeKPIs() {
  const paid   = state.entries.filter(e => e.status === 'paid').length;
  const total  = state.entries.length;
  const leader = state.entries[0];
  const pool   = total * 50;

  setKPI('kpi-entries', total, `${paid} paid`);
  setKPI('kpi-pool', `$${pool}`, `${total} × $50`);
  setKPI('kpi-leader', leader ? leader.points?.total || 0 : '—', leader ? leader.teamName : 'TBD');
  setKPI('kpi-days', daysUntilCutoff(), 'days to cutoff');
}

function setKPI(id, val, sub) {
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelector('.kpi-val').textContent = val;
  el.querySelector('.kpi-sub').textContent = sub;
}

function daysUntilCutoff() {
  const diff = SEASON.CUTOFF - new Date();
  if (diff <= 0) return 'LOCKED';
  return Math.ceil(diff / 86400000);
}

function renderHomeStandings() {
  const tbody = document.getElementById('home-standings-body');
  if (!tbody) return;

  const top10 = state.entries.slice(0, 10);
  if (!top10.length) {
    tbody.innerHTML = `<div class="loading-row">No entries yet</div>`;
    return;
  }

  tbody.innerHTML = top10.map(e => standingRow(e)).join('');
  tbody.querySelectorAll('.sc-row').forEach(row => {
    row.addEventListener('click', () => openTeamModal(row.dataset.id));
  });
}

function standingRow(e) {
  const rank     = e.rank || '—';
  const prevRank = e.prevRank;
  const mv       = getRankMove(rank, prevRank);
  const initials = (e.teamName||'?').substring(0,2).toUpperCase();
  const htCount  = state.hatTricks.filter(h =>
    (h.ownedBy||[]).some(o => o.includes(e.teamName))
  ).length;
  const rowClass = rank===1?'r1':rank===2?'r2':rank===3?'r3':rank===state.entries.length?'rl':'';

  return `
    <div class="sc-row ${rowClass}" data-id="${e.entryId||e._id}">
      <div class="sc-rank">${rank}</div>
      <div class="sc-av">${initials}</div>
      <div class="sc-info">
        <div class="sc-name">${esc(e.teamName)}</div>
        <div class="sc-owner">${esc(e.ownerName)}</div>
      </div>
      <div class="sc-ht ${htCount?'has-ht':''}">${htCount?'🎩':'—'}</div>
      <div class="sc-mv ${mv.cls}">${mv.label}</div>
      <div class="sc-pts">${e.points?.total||0}</div>
    </div>`;
}

function getRankMove(rank, prev) {
  if (!prev || prev === rank) return { cls: 'eq', label: '—' };
  if (rank < prev) return { cls: 'up', label: `▲${prev - rank}` };
  return { cls: 'dn', label: `▼${rank - prev}` };
}

function renderHatTrickHall() {
  const el = document.getElementById('ht-hall-body');
  if (!el) return;

  const recent = state.hatTricks.slice(0, 5);
  if (!recent.length) {
    el.innerHTML = `<div class="loading-row" style="padding:20px">No hat tricks yet this season</div>`;
    return;
  }

  el.innerHTML = recent.map(h => `
    <div class="ht-item">
      <div class="ht-icon">🎩</div>
      <div class="ht-info">
        <div class="ht-player">${esc(h.player)}</div>
        <div class="ht-detail">${esc(h.team)} · ${h.goals} goals · ${formatDate(h.date)}</div>
        <div class="ht-detail" style="color:var(--ice);margin-top:2px">${(h.ownedBy||[]).join(', ')||'Unowned'}</div>
      </div>
      <div class="ht-bonus">+${h.bonusPts}pts</div>
    </div>
  `).join('');
}

function renderTicker() {
  const inner = document.getElementById('ticker-inner');
  if (!inner || !state.entries.length) return;

  const items = state.entries.slice(0, 20).map(e =>
    `<span class="ticker-item">
       <span class="ti-name">${esc(e.teamName)}</span>
       <span class="ti-sep">·</span>
       <span class="ti-pts">${e.points?.total||0} PTS</span>
       <span class="ti-sep">#${e.rank||'?'}</span>
     </span>`
  ).join('');

  // Double for seamless loop
  inner.innerHTML = items + items;
}

// ════════════════════════════════════════════════════════════
// TEAM MODAL
// ════════════════════════════════════════════════════════════

function openTeamModal(entryId) {
  const entry = state.entries.find(e => (e.entryId||e._id) === entryId);
  if (!entry) return;

  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;

  // Build player points lookup
  const playerPts = {};
  state.players.forEach(p => { playerPts[(p.name||'').toLowerCase()] = p.poolPoints || 0; });

  const initials = (entry.teamName||'?').substring(0,2).toUpperCase();
  const total     = entry.points?.total || 0;
  const htCount   = state.hatTricks.filter(h =>
    (h.ownedBy||[]).some(o => o.includes(entry.teamName))
  ).length;

  document.getElementById('modal-av').textContent        = initials;
  document.getElementById('modal-team-name').textContent = entry.teamName || '';
  document.getElementById('modal-owner').textContent     = `${entry.ownerName} · Entry #${entry.entryNumber}`;
  document.getElementById('modal-total-pts').textContent = total;
  document.getElementById('modal-hat-tricks').textContent = htCount;
  document.getElementById('modal-status').textContent    = (entry.status||'pending').toUpperCase();

  // Picks
  const allPicks = [
    ...(entry.picks?.forwards||[]).map((p,i) => ({pos:`F${i+1}`,name:p})),
    ...(entry.picks?.defence||[]).map((p,i)  => ({pos:`D${i+1}`,name:p})),
    ...(entry.picks?.goalies||[]).map((p,i)  => ({pos:`G${i+1}`,name:p})),
  ];

  document.getElementById('modal-picks').innerHTML = allPicks.map(p => {
    const pts   = playerPts[p.name.toLowerCase()] || 0;
    const onIR  = state.irPlayers.has(p.name.toLowerCase());
    return `
      <div class="pick-item ${onIR?'on-ir':''}">
        <div class="pick-pos">${p.pos}</div>
        <div class="pick-name">${esc(p.name)}${onIR?' <span style="color:var(--red);font-size:9px">IR</span>':''}</div>
        <div class="pick-pts">${pts}</div>
      </div>`;
  }).join('');

  // Division picks
  const divs = entry.divisions || {};
  document.getElementById('modal-divisions').innerHTML = [
    ['Atlantic', divs.atlantic],
    ['Metropolitan', divs.metropolitan],
    ['Central', divs.central],
    ['Pacific', divs.pacific],
  ].map(([d, pick]) => `
    <div class="div-item">
      <div class="div-name">${d}</div>
      <div class="div-pick">${esc(pick||'—')}</div>
    </div>`
  ).join('');

  overlay.classList.add('open');
  overlay.onclick = e => { if (e.target === overlay) closeModal(); };
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.remove('open');
}

// ════════════════════════════════════════════════════════════
// STANDINGS PAGE
// ════════════════════════════════════════════════════════════

async function initStandingsPage() {
  renderStandingsLoading();
  await fetchAllData();
  renderFullStandings();
  renderSkaterStats();

  if (isLiveNow()) {
    state.refreshTimer = setInterval(async () => {
      await fetchAllData();
      renderFullStandings();
      renderSkaterStats();
    }, 5 * 60 * 1000);
  }
}

function renderStandingsLoading() {
  const el = document.getElementById('standings-body');
  if (el) el.innerHTML = loadingRow();
}

function renderFullStandings() {
  const tbody = document.getElementById('standings-body');
  if (!tbody) return;

  if (!state.entries.length) {
    tbody.innerHTML = `<div class="loading-row">No entries yet</div>`;
    return;
  }

  tbody.innerHTML = state.entries.map(e => standingRow(e)).join('');
  tbody.querySelectorAll('.sc-row').forEach(row => {
    row.addEventListener('click', () => openTeamModal(row.dataset.id));
  });
}

function renderSkaterStats() {
  const tbody = document.getElementById('skater-stats-body');
  if (!tbody) return;

  const skaters = state.players.filter(p => p.position !== 'G').slice(0, 30);
  tbody.innerHTML = skaters.map((p, i) => `
    <tr>
      <td>${esc(p.name||'')}</td>
      <td>${esc(p.team||'')}</td>
      <td>${p.stats?.goals   || 0}</td>
      <td>${p.stats?.assists || 0}</td>
      <td>${p.stats?.hatTricks || 0}</td>
      <td class="pts-col">${p.poolPoints || 0}</td>
      <td>${p.ownershipPct || '0%'}</td>
    </tr>`).join('');
}

function renderGoalieStats() {
  const tbody = document.getElementById('goalie-stats-body');
  if (!tbody) return;

  const goalies = state.players.filter(p => p.position === 'G').slice(0, 20);
  tbody.innerHTML = goalies.map(p => `
    <tr>
      <td>${esc(p.name||'')}</td>
      <td>${esc(p.team||'')}</td>
      <td>${p.stats?.wins     || 0}</td>
      <td>${p.stats?.shutouts || 0}</td>
      <td class="pts-col">${p.poolPoints || 0}</td>
      <td>${p.ownershipPct || '0%'}</td>
    </tr>`).join('');
}

// Stat tab toggle
function initStatTabs() {
  document.querySelectorAll('.stat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.stat-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.stat-panel').forEach(p => p.style.display = 'none');
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.target);
      if (target) { target.style.display = ''; renderGoalieStats(); }
    });
  });
}

// ════════════════════════════════════════════════════════════
// PICKS PAGE
// ════════════════════════════════════════════════════════════

async function initPicksPage() {
  // Check if pool is locked
  if (new Date() > SEASON.CUTOFF) {
    document.getElementById('picks-locked-msg')?.style.removeProperty('display');
    document.getElementById('picks-form-wrap')?.style.setProperty('display', 'none');
    return;
  }

  await fetchAllData();
  renderEntryTabs();
  renderCurrentForm();
  initDivisionPickers();
}

function newEntryForm() {
  return {
    ownerName: '', email: '', teamName: '',
    forwards: Array(SLOTS.F).fill(null),
    defence:  Array(SLOTS.D).fill(null),
    goalies:  Array(SLOTS.G).fill(null),
    divAtlantic: '', divMetropolitan: '', divCentral: '', divPacific: '',
  };
}

function renderEntryTabs() {
  const container = document.getElementById('entry-tabs');
  if (!container) return;

  container.innerHTML = state.entryForms.map((_, i) =>
    `<button class="entry-tab ${i===state.activeFormIdx?'active':''}" onclick="switchEntry(${i})">Entry ${i+1}</button>`
  ).join('');

  if (state.entryForms.length < SEASON.MAX_ENTRIES) {
    container.innerHTML += `<button class="add-entry-btn" onclick="addEntry()">+ Add Entry</button>`;
  }
}

function switchEntry(idx) {
  state.activeFormIdx = idx;
  renderEntryTabs();
  renderCurrentForm();
}

function addEntry() {
  if (state.entryForms.length >= SEASON.MAX_ENTRIES) return;
  state.entryForms.push(newEntryForm());
  state.activeFormIdx = state.entryForms.length - 1;
  renderEntryTabs();
  renderCurrentForm();
}

function renderCurrentForm() {
  const form = state.entryForms[state.activeFormIdx];
  if (!form) return;

  // Populate info fields
  ['ownerName','email','teamName'].forEach(field => {
    const el = document.getElementById(`f-${field}`);
    if (el) { el.value = form[field]; el.oninput = () => { form[field] = el.value; }; }
  });

  renderDraftSection('forwards', 'F', form);
  renderDraftSection('defence',  'D', form);
  renderDraftSection('goalies',  'G', form);
}

function renderDraftSection(key, posCode, form) {
  const container = document.getElementById(`draft-${key}`);
  if (!container) return;

  const slots = form[key];
  container.innerHTML = slots.map((player, i) => {
    if (player) {
      return `
        <div class="player-slot filled ${posCode.toLowerCase()}-pos" data-idx="${i}" data-key="${key}">
          <div class="slot-num">${posCode}${i+1}</div>
          <div class="slot-filled">
            <div class="slot-player-name">${esc(player.name)}</div>
            <div class="slot-player-team">${esc(player.team||'')}</div>
          </div>
          <button class="slot-remove" onclick="removePlayer('${key}',${i})">×</button>
        </div>`;
    }
    return `
      <div class="player-slot" data-idx="${i}" data-key="${key}" onclick="openPlayerSearch('${key}',${i},'${posCode}')">
        <div class="slot-num">${posCode}${i+1}</div>
        <div class="slot-empty">
          <div class="slot-empty-icon">+</div>
          <div class="slot-empty-lbl">Select ${posCode==='G'?'Goalie':posCode==='D'?'Defence':'Forward'}</div>
        </div>
      </div>`;
  }).join('');
}

function openPlayerSearch(key, idx, posCode) {
  const existing = document.getElementById('player-search-modal');
  if (existing) existing.remove();

  const posFilter = posCode; // F, D, or G
  const allPicked = getAllPickedNames();

  const modal = document.createElement('div');
  modal.id = 'player-search-modal';
  modal.style.cssText = `position:fixed;inset:0;z-index:700;background:rgba(8,10,12,0.9);
    display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px)`;

  modal.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border2);border-top:2px solid var(--ice);
      border-radius:var(--r2);width:100%;max-width:480px;overflow:hidden;
      box-shadow:0 24px 80px rgba(0,0,0,0.8)">
      <div style="padding:14px 16px;background:var(--bg2);border-bottom:1px solid var(--border);
        display:flex;align-items:center;justify-content:space-between">
        <div class="panel-title ice">SELECT ${posCode==='G'?'GOALIE':posCode==='D'?'DEFENCE':'FORWARD'}</div>
        <button onclick="document.getElementById('player-search-modal').remove()"
          style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:18px;line-height:1">×</button>
      </div>
      <div style="padding:12px 14px;border-bottom:1px solid var(--border)">
        <input id="ps-input" class="player-search-input" placeholder="Search player name..."
          autocomplete="off" spellcheck="false">
      </div>
      <div id="ps-results" style="max-height:320px;overflow-y:auto"></div>
    </div>`;

  document.body.appendChild(modal);
  modal.onclick = e => { if (e.target === modal) modal.remove(); };

  const input   = document.getElementById('ps-input');
  const results = document.getElementById('ps-results');

  function renderResults(query) {
    const filtered = state.players
      .filter(p => p.position === posCode)
      .filter(p => !allPicked.has((p.name||'').toLowerCase()))
      .filter(p => !query || (p.name||'').toLowerCase().includes(query.toLowerCase()))
      .slice(0, 30);

    if (!filtered.length) {
      results.innerHTML = `<div class="loading-row" style="padding:20px;font-size:12px">No players found</div>`;
      return;
    }

    results.innerHTML = filtered.map(p => `
      <div class="player-opt" onclick="selectPlayer('${key}',${idx},${JSON.stringify(p).replace(/"/g,'&quot;')})">
        <div class="po-name">${esc(p.name)}</div>
        <div class="po-team">${esc(p.team||'')}</div>
        <div class="po-own">${p.ownershipPct||'0%'}</div>
        <div style="flex:1">
          <div class="own-bar"><div class="own-fill" style="width:${parseFloat(p.ownershipPct)||0}%"></div></div>
        </div>
      </div>`).join('');
  }

  renderResults('');
  input.addEventListener('input', () => renderResults(input.value));
  input.focus();
}

function selectPlayer(key, idx, player) {
  const form = state.entryForms[state.activeFormIdx];
  form[key][idx] = player;
  document.getElementById('player-search-modal')?.remove();
  renderDraftSection(key, key==='forwards'?'F':key==='defence'?'D':'G', form);
  updateProgress();
}

function removePlayer(key, idx) {
  const form = state.entryForms[state.activeFormIdx];
  form[key][idx] = null;
  renderDraftSection(key, key==='forwards'?'F':key==='defence'?'D':'G', form);
  updateProgress();
}

function getAllPickedNames() {
  const form  = state.entryForms[state.activeFormIdx];
  const names = new Set();
  [...form.forwards, ...form.defence, ...form.goalies]
    .filter(Boolean)
    .forEach(p => names.add((p.name||'').toLowerCase()));
  return names;
}

function updateProgress() {
  const form  = state.entryForms[state.activeFormIdx];
  const steps = document.querySelectorAll('.pp-step');
  const allPicks = [...form.forwards, ...form.defence, ...form.goalies];
  const filled   = allPicks.filter(Boolean).length;
  const total    = allPicks.length;

  steps.forEach((step, i) => {
    step.classList.remove('done','error');
    if (i < filled) step.classList.add('done');
  });
}

function initDivisionPickers() {
  const form = state.entryForms[state.activeFormIdx];

  Object.entries(NHL_DIVISIONS).forEach(([div, teams]) => {
    const key = `div${div}`;
    const sel = document.getElementById(`f-${key}`);
    if (!sel) return;

    sel.innerHTML = `<option value="">Select ${div} winner…</option>` +
      teams.map(t => `<option value="${t}" ${form[key]===t?'selected':''}>${t}</option>`).join('');

    sel.onchange = () => { form[key] = sel.value; };
  });
}

// Submit
async function submitEntry(e) {
  e.preventDefault();
  const form    = state.entryForms[state.activeFormIdx];
  const errs    = validateForm(form);

  if (errs.length) {
    showToast(errs[0], 'error');
    return;
  }

  const btn = document.getElementById('submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'SUBMITTING…'; }

  try {
    const payload = {
      ownerName: form.ownerName.trim(),
      email:     form.email.trim(),
      teamName:  form.teamName.trim(),
      f1: form.forwards[0]?.name, f2: form.forwards[1]?.name,
      f3: form.forwards[2]?.name, f4: form.forwards[3]?.name,
      f5: form.forwards[4]?.name, f6: form.forwards[5]?.name,
      d1: form.defence[0]?.name,  d2: form.defence[1]?.name,
      d3: form.defence[2]?.name,  d4: form.defence[3]?.name,
      g1: form.goalies[0]?.name,  g2: form.goalies[1]?.name,
      divAtlantic:     form.divAtlantic,
      divMetropolitan: form.divMetropolitan,
      divCentral:      form.divCentral,
      divPacific:      form.divPacific,
    };

    const resp = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    if (data.success) {
      showConfirmScreen(data.entryId, data.entryNumber, form.teamName);
    } else {
      showToast(data.message || 'Submission failed', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'SUBMIT ENTRY'; }
    }
  } catch (err) {
    showToast('Network error — please try again', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'SUBMIT ENTRY'; }
  }
}

function validateForm(form) {
  const errs = [];
  if (!form.ownerName?.trim()) errs.push('Owner name is required');
  if (!form.email?.trim() || !form.email.includes('@')) errs.push('Valid email required');
  if (!form.teamName?.trim()) errs.push('Team name is required');
  if (form.forwards.some(f => !f)) errs.push('All 6 forward slots must be filled');
  if (form.defence.some(d => !d))  errs.push('All 4 defence slots must be filled');
  if (form.goalies.some(g => !g))  errs.push('Both goalie slots must be filled');
  if (!form.divAtlantic || !form.divMetropolitan || !form.divCentral || !form.divPacific)
    errs.push('All 4 division winner picks are required');
  return errs;
}

function showConfirmScreen(entryId, entryNumber, teamName) {
  const wrap = document.getElementById('picks-form-wrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="confirm-screen">
      <div class="confirm-icon">✅</div>
      <h2>Entry Received</h2>
      <p>"${esc(teamName)}" — Entry #${entryNumber} is in.</p>
      <p style="margin-top:8px">Check your email for confirmation. Send $50 via e-transfer to <strong style="color:var(--ice)">matt.hope@rocketmail.com</strong> to lock in your spot.</p>
      <div class="entry-id">${entryId}</div>
      <div style="margin-top:24px;display:flex;gap:10px;justify-content:center">
        ${state.entryForms.length < SEASON.MAX_ENTRIES
          ? `<button class="btn btn-ghost" onclick="addEntryAfterSubmit()">+ Submit Another Entry</button>`
          : ''}
        <button class="btn btn-ice" onclick="routeToPage('standings')">VIEW STANDINGS</button>
      </div>
    </div>`;
}

function addEntryAfterSubmit() {
  addEntry();
  initPicksPage();
}

// ════════════════════════════════════════════════════════════
// RULES PAGE
// ════════════════════════════════════════════════════════════

function initRulesPage() {
  // Static content — nothing to load
}

// ════════════════════════════════════════════════════════════
// ADMIN PAGE
// ════════════════════════════════════════════════════════════

async function initAdminPage() {
  await loadAgentStatus();
  initStatTabs();
}

async function loadAgentStatus() {
  const docs    = await fetchCollection('agentStatus');
  const agentIds = ['AGT-001','AGT-002','AGT-003','AGT-004','AGT-005'];

  agentIds.forEach(id => {
    const card    = document.getElementById(`agent-card-${id}`);
    if (!card) return;

    const myLogs  = docs.filter(d => d.agentId === id).sort((a,b) => (b.timestamp||'').localeCompare(a.timestamp||''));
    const latest  = myLogs[0];
    const statusEl = card.querySelector('.agent-status');

    card.className = 'agent-card';
    if (!latest) {
      card.classList.add('idle');
      if (statusEl) statusEl.textContent = 'No runs yet';
      return;
    }

    if (latest.status === '✅') card.classList.add('ok');
    else if (latest.status === '⚠️') card.classList.add('warn');
    else if (latest.status === '❌') card.classList.add('error');
    else card.classList.add('idle');

    if (statusEl) statusEl.textContent = `${latest.status} ${formatDateTime(latest.timestamp)} — ${(latest.message||'').substring(0,60)}`;
  });
}

function copyCode() {
  const pre = document.querySelector('pre.agent-code');
  if (!pre) return;
  navigator.clipboard.writeText(pre.textContent).then(() => showToast('Code copied!', 'info'));
}

// ════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════

function showToast(msg, type = 'info') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className   = `toast ${type}`;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function loadingRow() {
  return `<div class="loading-row"><div class="spinner"></div>LOADING</div>`;
}

function esc(str) {
  return (str||'').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

function formatDateTime(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ts; }
}

// Expose globals needed by inline onclick handlers
window.routeToPage         = routeToPage;
window.openTeamModal       = openTeamModal;
window.closeModal          = closeModal;
window.switchEntry         = switchEntry;
window.addEntry            = addEntry;
window.removePlayer        = removePlayer;
window.selectPlayer        = selectPlayer;
window.submitEntry         = submitEntry;
window.addEntryAfterSubmit = addEntryAfterSubmit;
window.copyCode            = copyCode;
window.renderGoalieStats   = renderGoalieStats;
window.initStandingsPage   = initStandingsPage;   // BUG-2 FIX: refresh btn in standings page
