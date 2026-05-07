// ============================================================
// AAHL 2025-26 — 3 Stars of the Night
// ============================================================
//
// HOW IT WORKS:
//
// BACKEND (AGT-002 addition):
//   After processing each night's boxscores, AGT-002 now:
//   1. Calculates each pool player's pool points earned LAST NIGHT
//   2. Ranks them — top 3 become the "3 Stars"
//   3. Stores playerId (NHL numeric ID) from the boxscore on the player doc
//   4. Writes a 'threeStars/{date}' Firestore doc with full star data
//
// FRONTEND:
//   - Home page fetches today's threeStars doc
//   - Renders the 3-star display with headshots, stats, pool pts
//   - Headshot URL: assets.nhle.com/mugs/nhl/{season}/{team}/{playerId}.png
//   - Fallback: cms.nhl.bamgrid.com/images/headshots/current/168x168/{playerId}.jpg
//   - Final fallback: generated initials avatar
//
// ============================================================


// ════════════════════════════════════════════════════════════
// PART 1: AGT-002 ADDITION
// Add this block INSIDE runAGT002(), after all games are processed
// Replace the existing "Write checksum" section with this expanded version
// ════════════════════════════════════════════════════════════

/*

  // ── After processing all games for the night ──
  // Add to the playerNightStats map during boxscore processing (see below)
  // Then call this at the end:

  agt002_computeThreeStars(playerNightStats, yesterday);

*/

// ── Track per-night stats during boxscore loop ──
// Add this to the TOP of runAGT002(), before the games.forEach loop:
/*
  const playerNightStats = {}; // key = normalizedId, value = { name, team, pos, playerId, goals, assists, wins, shutouts, poolPts, isHatTrick }
*/

// ── Inside the skater processing loop, AFTER updating Firestore, ADD: ──
/*
  const docId = normalizeId(fullName);
  const player = fsGet(AAHL.COL.PLAYERS, docId);
  if (player) {
    // Store playerId on player doc if not already there
    if (!player.playerId && skater.playerId) {
      fsPatch(AAHL.COL.PLAYERS, docId, { playerId: skater.playerId });
    }
    // Accumulate night stats
    if (!playerNightStats[docId]) {
      playerNightStats[docId] = {
        name: fullName, team: teamAbbrev,
        position: player.position || 'F',
        playerId: skater.playerId || player.playerId || null,
        goals: 0, assists: 0, wins: 0, shutouts: 0,
        saves: 0, poolPts: 0, isHatTrick: false,
      };
    }
    playerNightStats[docId].goals   += goals;
    playerNightStats[docId].assists += assists;
    playerNightStats[docId].poolPts += poolPts;
    if (isHatTrick) playerNightStats[docId].isHatTrick = true;
  }
*/

// ── Inside the goalie processing loop, AFTER updating Firestore, ADD: ──
/*
  if (player) {
    if (!player.playerId && goalie.playerId) {
      fsPatch(AAHL.COL.PLAYERS, docId, { playerId: goalie.playerId });
    }
    if (!playerNightStats[docId]) {
      playerNightStats[docId] = {
        name: fullName, team: teamAbbrev,
        position: 'G',
        playerId: goalie.playerId || player.playerId || null,
        goals: 0, assists: 0, wins: 0, shutouts: 0,
        saves: 0, poolPts: 0, isHatTrick: false,
      };
    }
    playerNightStats[docId].wins     += wins;
    playerNightStats[docId].shutouts += shutout;
    playerNightStats[docId].saves    += saves;
    playerNightStats[docId].poolPts  += poolPts;
  }
*/

// ════════════════════════════════════════════════════════════
// agt002_computeThreeStars()
// Call at end of runAGT002() with collected playerNightStats
// ════════════════════════════════════════════════════════════

function agt002_computeThreeStars(playerNightStats, date) {
  if (!Object.keys(playerNightStats).length) {
    fsLog('AGT-002', '⏸', `3 Stars: no pool players scored on ${date}`);
    return;
  }

  // Sort by pool pts descending, break ties: goals > assists > wins
  const ranked = Object.values(playerNightStats)
    .filter(p => p.poolPts > 0)
    .sort((a, b) => {
      if (b.poolPts !== a.poolPts) return b.poolPts - a.poolPts;
      if (b.goals   !== a.goals)   return b.goals   - a.goals;
      if (b.assists !== a.assists)  return b.assists  - a.assists;
      return b.wins - a.wins;
    });

  if (!ranked.length) {
    fsLog('AGT-002', '⏸', `3 Stars: no pool players earned points on ${date}`);
    return;
  }

  const stars = ranked.slice(0, 3).map((p, i) => ({
    star:        i + 1,
    name:        p.name,
    team:        p.team,
    position:    p.position,
    playerId:    p.playerId,
    headshotUrl: p.playerId
      ? `https://assets.nhle.com/mugs/nhl/20252026/${p.team}/${p.playerId}.png`
      : null,
    headshotFallback: p.playerId
      ? `https://cms.nhl.bamgrid.com/images/headshots/current/168x168/${p.playerId}.jpg`
      : null,
    stats: {
      goals:    p.goals,
      assists:  p.assists,
      wins:     p.wins,
      shutouts: p.shutouts,
      saves:    p.saves,
      isHatTrick: p.isHatTrick,
    },
    poolPts:     p.poolPts,
    // Which pool entries own this player
    ownedBy:     getEntriesOwning(p.name),
  }));

  // Write to Firestore threeStars/{date}
  fsWrite('threeStars', date, {
    date,
    generatedAt: new Date().toISOString(),
    stars,
    totalPlayersScored: ranked.length,
  });

  const names = stars.map((s, i) => `${['1st','2nd','3rd'][i]}: ${s.name} (${s.poolPts}pts)`).join(' · ');
  fsLog('AGT-002', '✅', `3 Stars computed for ${date}: ${names}`);
}

function getEntriesOwning(playerName) {
  const allEntries = fsQueryAll(AAHL.COL.ENTRIES);
  return allEntries
    .filter(e => {
      const all = [
        ...(e.picks?.forwards || []),
        ...(e.picks?.defence  || []),
        ...(e.picks?.goalies  || []),
      ];
      return all.map(n => n.toLowerCase()).includes(playerName.toLowerCase());
    })
    .map(e => e.teamName);
}


// ════════════════════════════════════════════════════════════
// PART 2: FIRESTORE — threeStars collection schema
// ════════════════════════════════════════════════════════════

/*
Collection: threeStars
Document ID: YYYY-MM-DD (e.g. "2025-10-09")

{
  date:               "2025-10-09",
  generatedAt:        "2025-10-09T07:05:23Z",
  totalPlayersScored: 14,
  stars: [
    {
      star:        1,
      name:        "Connor McDavid",
      team:        "EDM",
      position:    "F",
      playerId:    8478402,
      headshotUrl: "https://assets.nhle.com/mugs/nhl/20252026/EDM/8478402.png",
      headshotFallback: "https://cms.nhl.bamgrid.com/images/headshots/current/168x168/8478402.jpg",
      stats: {
        goals:      2,
        assists:    3,
        wins:       0,
        shutouts:   0,
        saves:      0,
        isHatTrick: false
      },
      poolPts:   5,
      ownedBy:   ["Alpaca Attack", "Fury Road"]
    },
    { star: 2, ... },
    { star: 3, ... }
  ]
}

Firestore security rule to add:
  match /threeStars/{doc} { allow read: if true; allow write: if false; }
*/


// ════════════════════════════════════════════════════════════
// PART 3: FRONTEND — 3 Stars component
// Add to index.html home page, styles.css, and main.js
// ════════════════════════════════════════════════════════════


// ── styles.css additions ─────────────────────────────────────

const THREE_STARS_CSS = `
/* §22 — 3 STARS OF THE NIGHT */
.stars-wrap {
  margin-bottom: 20px;
}

.stars-grid {
  display: grid;
  grid-template-columns: 1fr 1.15fr 1fr;
  gap: 0;
  align-items: end;
}

/* Individual star card */
.star-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 0;
  padding: 20px 16px 16px;
  text-align: center;
  position: relative;
  transition: background 0.15s;
  overflow: hidden;
}

.star-card:first-child {
  border-radius: var(--r2) 0 0 var(--r2);
  border-right: none;
}

.star-card:last-child {
  border-radius: 0 var(--r2) var(--r2) 0;
  border-left: none;
}

/* 1st star is taller / more prominent */
.star-card.star-1 {
  background: var(--panel2);
  border-color: var(--amber);
  border-radius: var(--r2) var(--r2) var(--r2) var(--r2);
  padding-top: 28px;
  z-index: 1;
  box-shadow: 0 0 0 1px var(--amber), 0 8px 32px rgba(255,184,0,0.12);
}

.star-card.star-2 { border-color: rgba(192,200,210,0.3); }
.star-card.star-3 { border-color: rgba(180,120,60,0.3); }

/* Star rank badge */
.star-rank {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 2px;
  white-space: nowrap;
}

.star-card.star-1 .star-rank {
  background: var(--amber);
  color: var(--bg);
}
.star-card.star-2 .star-rank {
  background: rgba(192,200,210,0.15);
  color: #c0c8d4;
  border: 1px solid rgba(192,200,210,0.25);
}
.star-card.star-3 .star-rank {
  background: rgba(180,120,60,0.15);
  color: #cd7f32;
  border: 1px solid rgba(180,120,60,0.25);
}

/* Headshot */
.star-headshot-wrap {
  position: relative;
  width: 80px;
  height: 80px;
  margin: 8px auto 10px;
}

.star-card.star-1 .star-headshot-wrap {
  width: 96px;
  height: 96px;
}

.star-headshot {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  border-radius: 50%;
  border: 2px solid var(--border2);
  background: var(--panel2);
  display: block;
}

.star-card.star-1 .star-headshot { border-color: var(--amber); }
.star-card.star-2 .star-headshot { border-color: rgba(192,200,210,0.4); }
.star-card.star-3 .star-headshot { border-color: rgba(180,120,60,0.4); }

/* Fallback initials avatar */
.star-headshot-fallback {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2px solid var(--border2);
  background: var(--panel2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 24px;
  font-weight: 800;
  color: var(--text3);
}

.star-card.star-1 .star-headshot-fallback {
  border-color: var(--amber);
  font-size: 28px;
  color: var(--amber);
}

/* Hat trick glow on headshot */
.star-headshot-wrap.has-hat-trick::after {
  content: '🎩';
  position: absolute;
  bottom: -4px;
  right: -4px;
  font-size: 18px;
  filter: drop-shadow(0 0 4px rgba(255,184,0,0.8));
}

/* Team logo badge */
.star-team-badge {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 24px;
  height: 24px;
}

/* Name */
.star-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.star-card.star-1 .star-name { font-size: 14px; }

/* Team + position */
.star-meta {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 10px;
  letter-spacing: 0.5px;
  color: var(--text3);
  margin-bottom: 10px;
}

/* Stats row */
.star-stats {
  display: flex;
  justify-content: center;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  margin-bottom: 8px;
}

.star-stat {
  flex: 1;
  padding: 5px 4px;
  border-right: 1px solid var(--border);
  text-align: center;
}
.star-stat:last-child { border-right: none; }

.star-stat-val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  line-height: 1;
}

.star-card.star-1 .star-stat-val { font-size: 16px; }

.star-stat-lbl {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 8px;
  letter-spacing: 1px;
  color: var(--text3);
  margin-top: 2px;
}

/* Pool points badge */
.star-pool-pts {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  font-weight: 700;
  color: var(--ice);
}

.star-card.star-1 .star-pool-pts {
  font-size: 16px;
  color: var(--amber);
}

.star-pool-pts-lbl {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 9px;
  letter-spacing: 1px;
  color: var(--text3);
}

/* Owners */
.star-owners {
  font-size: 10px;
  color: var(--text3);
  margin-top: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.star-owners span { color: var(--ice); }

/* Empty / loading state */
.stars-empty {
  text-align: center;
  padding: 32px 20px;
  color: var(--text3);
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 11px;
  letter-spacing: 1.5px;
}

/* Responsive */
@media (max-width: 500px) {
  .stars-grid { grid-template-columns: 1fr; gap: 8px; }
  .star-card { border-radius: var(--r2) !important; border: 1px solid var(--border) !important; }
  .star-card.star-1 { border-color: var(--amber) !important; }
}
`;


// ── index.html addition ──────────────────────────────────────
// Add this panel ABOVE the home-grid div, replacing or supplementing existing panels

const THREE_STARS_HTML = `
<!-- 3 Stars of the Night -->
<div class="stars-wrap panel">
  <div class="panel-head">
    <div class="panel-title amber">⭐ 3 STARS OF THE NIGHT</div>
    <div id="stars-date" class="label">Loading…</div>
  </div>
  <div id="stars-body">
    <div class="stars-empty">
      <div class="spinner" style="margin:0 auto 8px"></div>
      LOADING
    </div>
  </div>
</div>
`;


// ── main.js addition ─────────────────────────────────────────
// Add fetchThreeStars() call inside initHomePage()
// and add the renderThreeStars() function

async function fetchThreeStars() {
  if (!firebaseReady) return null;

  // Try last 3 days in case no games last night
  for (let daysBack = 1; daysBack <= 3; daysBack++) {
    const d   = new Date(Date.now() - daysBack * 86400000);
    const key = d.toISOString().split('T')[0]; // YYYY-MM-DD
    try {
      const doc = await db.collection('threeStars').doc(key).get();
      if (doc.exists) return { ...doc.data(), _date: key };
    } catch (e) {
      console.error('fetchThreeStars error:', e);
    }
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
    dateEl.textContent = d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  const stars   = data.stars;
  // Render order: 2nd, 1st, 3rd (podium layout — 1st in centre)
  const order   = [stars[1], stars[0], stars[2]].filter(Boolean);
  const classes = stars[1] ? ['star-2', 'star-1', 'star-3'] : ['star-1'];

  body.innerHTML = `<div class="stars-grid">${order.map((s, i) => starCard(s, classes[i])).join('')}</div>`;

  // Load headshots with fallback chain
  body.querySelectorAll('.star-headshot-img').forEach(img => {
    const fallback1 = img.dataset.fallback1;
    const fallback2 = img.dataset.fallback2;

    img.onerror = function() {
      if (this.src !== fallback1 && fallback1) {
        this.src = fallback1;
      } else if (this.src !== fallback2 && fallback2) {
        this.src = fallback2;
        this.onerror = () => showInitialsAvatar(this);
      } else {
        showInitialsAvatar(this);
      }
    };
  });
}

function showInitialsAvatar(imgEl) {
  const name = imgEl.dataset.name || '??';
  const initials = name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  const wrap = imgEl.parentElement;
  imgEl.remove();
  const fallbackDiv = document.createElement('div');
  fallbackDiv.className = 'star-headshot-fallback';
  fallbackDiv.textContent = initials;
  wrap.appendChild(fallbackDiv);
}

function starCard(star, cssClass) {
  const isSkater  = star.position !== 'G';
  const hatTrick  = star.stats?.isHatTrick;
  const owners    = (star.ownedBy || []).join(', ') || 'Unowned';

  // Stats to show — skaters: G / A / PTS, Goalies: W / SO / SV
  const statCells = isSkater
    ? [
        { val: star.stats?.goals   || 0, lbl: 'G'   },
        { val: star.stats?.assists || 0, lbl: 'A'   },
        { val: (star.stats?.goals || 0) + (star.stats?.assists || 0), lbl: 'PTS' },
      ]
    : [
        { val: star.stats?.wins     || 0, lbl: 'W'  },
        { val: star.stats?.shutouts || 0, lbl: 'SO' },
        { val: star.stats?.saves    || 0, lbl: 'SV' },
      ];

  const headshotSrc = star.headshotUrl
    || `https://assets.nhle.com/mugs/nhl/20252026/${star.team}/${star.playerId}.png`;

  const teamLogoUrl = `https://assets.nhle.com/logos/nhl/svg/${star.team}_dark.svg`;

  const rankLabels = { 'star-1': '★ 1ST STAR', 'star-2': '2ND STAR', 'star-3': '3RD STAR' };

  return `
    <div class="star-card ${cssClass}">
      <div class="star-rank">${rankLabels[cssClass] || ''}</div>

      <div class="star-headshot-wrap ${hatTrick ? 'has-hat-trick' : ''}">
        ${star.playerId ? `
          <img
            class="star-headshot star-headshot-img"
            src="${esc(headshotSrc)}"
            data-fallback1="${esc(star.headshotFallback || '')}"
            data-fallback2="https://cms.nhl.bamgrid.com/images/headshots/current/168x168/${star.playerId}.jpg"
            data-name="${esc(star.name)}"
            alt="${esc(star.name)}"
            loading="lazy"
          >
        ` : `
          <div class="star-headshot-fallback">
            ${(star.name || '??').split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase()}
          </div>
        `}
        <img class="star-team-badge" src="${esc(teamLogoUrl)}" alt="${esc(star.team)}" loading="lazy"
          onerror="this.style.display='none'">
      </div>

      <div class="star-name">${esc(star.name)}</div>
      <div class="star-meta">${esc(star.team)} · ${star.position}${hatTrick ? ' · 🎩 HAT TRICK' : ''}</div>

      <div class="star-stats">
        ${statCells.map(s => `
          <div class="star-stat">
            <div class="star-stat-val">${s.val}</div>
            <div class="star-stat-lbl">${s.lbl}</div>
          </div>
        `).join('')}
      </div>

      <div class="star-pool-pts">${star.poolPts}</div>
      <div class="star-pool-pts-lbl">POOL PTS TONIGHT</div>

      <div class="star-owners" title="${esc(owners)}">
        ${(star.ownedBy || []).length
          ? `Owned by <span>${esc((star.ownedBy || []).slice(0,2).join(', '))}${star.ownedBy.length > 2 ? ` +${star.ownedBy.length - 2}` : ''}</span>`
          : `<span style="color:var(--red)">Unowned</span>`
        }
      </div>
    </div>`;
}

// ── Updated initHomePage() ────────────────────────────────────
// Replace existing initHomePage with this version

async function initHomePage_withStars() {
  renderHomeLoading();

  // Fetch all data in parallel
  const [_, starsData] = await Promise.all([
    fetchAllData(),
    fetchThreeStars(),
  ]);

  renderHomeKPIs();
  renderHomeStandings();
  renderHatTrickHall();
  renderTicker();
  renderThreeStars(starsData);

  if (isLiveNow()) {
    state.refreshTimer = setInterval(async () => {
      const [_, starsData] = await Promise.all([
        fetchAllData(),
        fetchThreeStars(),
      ]);
      renderHomeStandings();
      renderTicker();
      renderThreeStars(starsData);
    }, 5 * 60 * 1000);
  }
}


// ════════════════════════════════════════════════════════════
// PART 4: FIRESTORE SECURITY RULES ADDITION
// Add this line to your Firestore rules:
// ════════════════════════════════════════════════════════════

/*
  match /threeStars/{doc} { allow read: if true; allow write: if false; }
*/


// ════════════════════════════════════════════════════════════
// PART 5: BACKFILL HELPER
// If you want to manually test before season starts,
// run this in Apps Script to write a fake 3-stars doc
// ════════════════════════════════════════════════════════════

function backfillTestThreeStars() {
  const date = Utilities.formatDate(
    new Date(Date.now() - 86400000), 'America/Toronto', 'yyyy-MM-dd'
  );

  fsWrite('threeStars', date, {
    date,
    generatedAt: new Date().toISOString(),
    totalPlayersScored: 8,
    stars: [
      {
        star: 1,
        name: 'Connor McDavid',
        team: 'EDM',
        position: 'F',
        playerId: 8478402,
        headshotUrl: 'https://assets.nhle.com/mugs/nhl/20252026/EDM/8478402.png',
        headshotFallback: 'https://cms.nhl.bamgrid.com/images/headshots/current/168x168/8478402.jpg',
        stats: { goals: 2, assists: 3, wins: 0, shutouts: 0, saves: 0, isHatTrick: false },
        poolPts: 5,
        ownedBy: ['Alpaca Attack', 'Furious Pucks'],
      },
      {
        star: 2,
        name: 'Andrei Vasilevskiy',
        team: 'TBL',
        position: 'G',
        playerId: 8476883,
        headshotUrl: 'https://assets.nhle.com/mugs/nhl/20252026/TBL/8476883.png',
        headshotFallback: 'https://cms.nhl.bamgrid.com/images/headshots/current/168x168/8476883.jpg',
        stats: { goals: 0, assists: 0, wins: 1, shutouts: 1, saves: 34, isHatTrick: false },
        poolPts: 3,
        ownedBy: ['Sniper Squad'],
      },
      {
        star: 3,
        name: 'Nathan MacKinnon',
        team: 'COL',
        position: 'F',
        playerId: 8477492,
        headshotUrl: 'https://assets.nhle.com/mugs/nhl/20252026/COL/8477492.png',
        headshotFallback: 'https://cms.nhl.bamgrid.com/images/headshots/current/168x168/8477492.jpg',
        stats: { goals: 1, assists: 1, wins: 0, shutouts: 0, saves: 0, isHatTrick: false },
        poolPts: 2,
        ownedBy: ['Alpaca Attack', 'Furious Pucks', 'The Wrecking Crew'],
      },
    ],
  });

  console.log('✅ Test 3 Stars doc written for', date);
}
