// ============================================================
// AAHL 2025-26 — Full Agent System
// File: AAHL-2526-Agents.gs
// Agents: AGT-001 through AGT-005
// Database: Firebase Firestore (REST API via service account)
// Version: 2.0.0 | Season: 2526
// ============================================================
//
// SCRIPT PROPERTIES REQUIRED (Extensions → Project Settings → Script Properties):
//   FIREBASE_PROJECT_ID  → your Firebase project ID
//   SERVICE_ACCOUNT_KEY  → full JSON of service account key (one line)
//
// TIME TRIGGERS (set in Apps Script → Triggers):
//   runAGT002        → Daily, 6:00–7:00 AM ET
//   runAGT004        → Daily, 6:15–7:15 AM ET
//   runAGT003        → Daily, 6:30–7:30 AM ET
//   runAGT005Digest  → Weekly, Monday, 9:00–10:00 AM ET
//   runAGT005Poll    → Every 5 minutes (processes pending confirmations)
// ============================================================


// ════════════════════════════════════════════════════════════
// SHARED CONFIG
// ════════════════════════════════════════════════════════════

const AAHL = {
  SEASON:       '2526',
  CUTOFF:       '2025-10-07',
  OPENING:      '2025-10-08',
  MAX_ENTRIES:  3,
  ENTRY_FEE:    50,
  ETRANSFER:    'matt.hope@rocketmail.com',
  SITE_URL:     'https://matthope001-hub.github.io/AAHL---Angry-Alpaha-Hockey-League/',
  NHL_API:      'https://api-web.nhle.com/v1',
  COMMISSIONER: 'matt.hope@rocketmail.com',

  SCORING: {
    GOAL:          1,
    ASSIST:        1,
    WIN:           1,
    SHUTOUT:       2,
    HAT_TRICK:     3,   // bonus on top of goals
    DIV_WINNER:    5,   // per correct division pick at season end
  },

  // Sanity bounds — values outside these trigger AGT-004 flag
  BOUNDS: {
    MAX_GOALS_GAME:  6,
    MAX_ASSISTS_GAME:6,
    MAX_SAVES_GAME:  65,
    MAX_WINS_GAME:   1,
    MAX_SHUTOUTS_GAME:1,
  },

  COL: {
    ENTRIES:         'entries',
    PLAYERS:         'players',
    GAMES:           'processedGames',
    HAT_TRICKS:      'hatTricks',
    STATUS:          'agentStatus',
    IR:              'ir',
    CONFIG:          'config',
    THREE_STARS:     'threeStars',
    CHECKSUMS:       'agentChecksums',
  },
};


// ════════════════════════════════════════════════════════════
// AGT-001 — ENTRY RECEIVER
// Trigger: HTTP POST (doPost) from picks.html
// ════════════════════════════════════════════════════════════

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const raw = e.postData ? e.postData.contents : null;
    if (!raw) return jsonResponse(false, 'No payload received.');

    const p = JSON.parse(raw);
    fsLog('AGT-001', '⏳', `Entry received — ${p.email || 'unknown'}`);

    // ── 1. Validate input ──
    const v = agt001_validate(p);
    if (!v.ok) {
      fsLog('AGT-001', '⚠️', `Validation failed: ${v.error}`);
      return jsonResponse(false, v.error);
    }

    // ── 2. Cutoff check ──
    if (agt001_isPastCutoff()) {
      fsLog('AGT-001', '⚠️', `Rejected — past cutoff: ${p.email}`);
      return jsonResponse(false, 'Entry deadline has passed. Pool is locked.');
    }

    // ── 3. Max entries per email ──
    const email        = p.email.trim().toLowerCase();
    const existingCount = fsCountWhere(AAHL.COL.ENTRIES, 'email', email);
    if (existingCount >= AAHL.MAX_ENTRIES) {
      fsLog('AGT-001', '⚠️', `Max entries reached: ${email}`);
      return jsonResponse(false, `Maximum ${AAHL.MAX_ENTRIES} entries allowed per person.`);
    }

    // ── 4. Duplicate picks check (same email + identical roster) ──
    const pickHash = agt001_hashPicks(p);
    const isDupe   = agt001_isDuplicateRoster(email, pickHash);
    if (isDupe) {
      fsLog('AGT-001', '⚠️', `Duplicate roster detected: ${email}`);
      return jsonResponse(false, 'This exact roster was already submitted under your email.');
    }

    // ── 5. Write entry ──
    const entryNumber = existingCount + 1;
    const entryId     = agt001_generateId(p, entryNumber);
    const entryDoc    = agt001_buildDoc(p, entryNumber, entryId, pickHash);
    fsWrite(AAHL.COL.ENTRIES, entryId, entryDoc);

    // ── 6. Verify write succeeded (read-back check) ──
    const written = fsGet(AAHL.COL.ENTRIES, entryId);
    if (!written) {
      throw new Error('Write verification failed — entry not found in Firestore after write.');
    }

    // ── 7. Update player ownership ──
    agt001_updateOwnership(p);

    // ── 8. Queue confirmation email ──
    fsLog('AGT-001→AGT-005', '📧',
      'CONFIRM:' + JSON.stringify({
        to: email, ownerName: p.ownerName.trim(),
        teamName: p.teamName.trim(), entryNumber, entryId,
        picks: {
          forwards: [p.f1,p.f2,p.f3,p.f4,p.f5,p.f6],
          defence:  [p.d1,p.d2,p.d3,p.d4],
          goalies:  [p.g1,p.g2],
        },
        divisions: {
          atlantic: p.divAtlantic, metropolitan: p.divMetropolitan,
          central: p.divCentral, pacific: p.divPacific,
        },
      })
    );

    fsLog('AGT-001', '✅', `Entry saved: ${entryId} | ${p.ownerName} | #${entryNumber}`);
    return jsonResponse(true, 'Entry received! Check your email for confirmation.', { entryId, entryNumber });

  } catch (err) {
    fsLog('AGT-001', '❌', `Fatal: ${err.message}`, true);
    alertCommissioner('AGT-001 Fatal Error', err.message);
    return jsonResponse(false, 'Server error — please try again or contact the commissioner.');
  } finally {
    lock.releaseLock();
  }
}

function agt001_validate(p) {
  if (!p.ownerName || p.ownerName.trim().length < 2) return fail('Owner name required.');
  if (!p.email || !p.email.includes('@'))             return fail('Valid email required.');
  if (!p.teamName || p.teamName.trim().length < 2)    return fail('Team name required.');

  const forwards = [p.f1,p.f2,p.f3,p.f4,p.f5,p.f6];
  const defence  = [p.d1,p.d2,p.d3,p.d4];
  const goalies  = [p.g1,p.g2];

  if (forwards.some(f => !f?.trim())) return fail('All 6 forward slots required.');
  if (defence.some(d => !d?.trim()))  return fail('All 4 defence slots required.');
  if (goalies.some(g => !g?.trim()))  return fail('Both goalie slots required.');
  if (!p.divAtlantic || !p.divMetropolitan || !p.divCentral || !p.divPacific)
    return fail('All 4 division picks required.');

  const all    = [...forwards, ...defence, ...goalies].map(n => n.trim().toLowerCase());
  const unique = new Set(all);
  if (unique.size !== all.length) return fail('Duplicate player detected in roster.');

  return { ok: true };
}

function agt001_isPastCutoff() {
  return new Date() > new Date(AAHL.CUTOFF + 'T23:59:59-04:00');
}

function agt001_hashPicks(p) {
  const sorted = [p.f1,p.f2,p.f3,p.f4,p.f5,p.f6,p.d1,p.d2,p.d3,p.d4,p.g1,p.g2]
    .map(n => n.trim().toLowerCase()).sort().join('|');
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    sorted,
    Utilities.Charset.UTF_8
  ).map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function agt001_isDuplicateRoster(email, pickHash) {
  const results = fsQuery(AAHL.COL.ENTRIES, 'email', email);
  return results.some(doc => doc.pickHash === pickHash);
}

function agt001_generateId(p, entryNumber) {
  const initials = p.ownerName.trim().split(' ').map(w => w[0]).join('').toUpperCase();
  const stamp    = Utilities.formatDate(new Date(), 'America/Toronto', 'MMddHHmm');
  return `AAHL-2526-${initials}${entryNumber}-${stamp}`;
}

function agt001_buildDoc(p, entryNumber, entryId, pickHash) {
  return {
    entryId, entryNumber, pickHash,
    ownerName:   p.ownerName.trim(),
    email:       p.email.trim().toLowerCase(),
    teamName:    p.teamName.trim(),
    timestamp:   new Date().toISOString(),
    status:      'pending',
    picks: {
      forwards: [p.f1,p.f2,p.f3,p.f4,p.f5,p.f6].map(s => s.trim()),
      defence:  [p.d1,p.d2,p.d3,p.d4].map(s => s.trim()),
      goalies:  [p.g1,p.g2].map(s => s.trim()),
    },
    divisions: {
      atlantic:     p.divAtlantic.trim(),
      metropolitan: p.divMetropolitan.trim(),
      central:      p.divCentral.trim(),
      pacific:      p.divPacific.trim(),
    },
    points: { skaterPts:0, goaliePts:0, bonusPts:0, divisionPts:0, total:0 },
    rank: null, prevRank: null,
  };
}

function agt001_updateOwnership(p) {
  const picks = [p.f1,p.f2,p.f3,p.f4,p.f5,p.f6,p.d1,p.d2,p.d3,p.d4,p.g1,p.g2];
  const totalEntries = fsCount(AAHL.COL.ENTRIES);

  picks.forEach(name => {
    const id  = normalizeId(name);
    const doc = fsGet(AAHL.COL.PLAYERS, id);
    if (!doc) return; // AGT-002 creates player docs; skip unknown

    const newCount = (doc.ownershipCount || 0) + 1;
    fsPatch(AAHL.COL.PLAYERS, id, {
      ownershipCount: newCount,
      ownershipPct:   ((newCount / Math.max(totalEntries, 1)) * 100).toFixed(1) + '%',
    });
  });
}


// ════════════════════════════════════════════════════════════
// AGT-002 — NHL STAT FETCHER
// Trigger: Daily 6:00 AM ET
// ════════════════════════════════════════════════════════════

function runAGT002() {
  const agentId = 'AGT-002';
  fsLog(agentId, '⏳', 'Stat fetch starting');

  // ── REDUNDANCY GATE: already ran successfully today? ──
  if (agentRanSuccessfullyToday(agentId)) {
    fsLog(agentId, '⏸', 'Already completed successfully today — skipping');
    return;
  }

  const today     = Utilities.formatDate(new Date(), 'America/Toronto', 'yyyy-MM-dd');
  const yesterday = Utilities.formatDate(new Date(Date.now() - 86400000), 'America/Toronto', 'yyyy-MM-dd');

  try {
    // ── Fetch schedule ──
    const schedResp = UrlFetchApp.fetch(`${AAHL.NHL_API}/schedule/${yesterday}`, { muteHttpExceptions: true });
    if (schedResp.getResponseCode() !== 200)
      throw new Error(`NHL schedule API error: ${schedResp.getResponseCode()}`);

    const sched = JSON.parse(schedResp.getContentText());
    const games = (sched.gameWeek || []).flatMap(w => w.games || []);

    if (!games.length) {
      fsLog(agentId, '✅', `No games on ${yesterday} — nothing to process`, false);
      agt002_writeChecksum(agentId, 0, 0, 0);
      return;
    }

    let processed = 0, skipped = 0, anomalies = 0;
    let checksumGoals = 0, checksumAssists = 0, checksumWins = 0;

    // ── 3 Stars: accumulate per-night pool pts per player ──
    // key = normalizeId(name), value = { name, team, position, playerId, goals, assists, wins, shutouts, saves, poolPts, isHatTrick }
    const playerNightStats = {};

    games.forEach(game => {
      const gameId = String(game.id);

      // ── Per-game dupe guard ──
      if (fsGet(AAHL.COL.GAMES, gameId)) {
        skipped++;
        return;
      }

      // ── Fetch boxscore ──
      const boxResp = UrlFetchApp.fetch(`${AAHL.NHL_API}/gamecenter/${gameId}/boxscore`, { muteHttpExceptions: true });
      if (boxResp.getResponseCode() !== 200) {
        fsLog(agentId, '⚠️', `Boxscore fetch failed for game ${gameId}: ${boxResp.getResponseCode()}`);
        return;
      }

      const box = JSON.parse(boxResp.getContentText());
      const homeWon = (box.homeTeam?.score || 0) > (box.awayTeam?.score || 0);
      const isOT    = ['OT','SO'].includes(box.periodDescriptor?.periodType || '');

      // ── Process skaters ──
      ['homeTeam','awayTeam'].forEach(side => {
        const teamAbbrev = box[side]?.abbrev || '';
        const teamWon    = (side === 'homeTeam') ? homeWon : !homeWon;

        (box[side]?.forwards || []).concat(box[side]?.defense || []).forEach(skater => {
          const fullName  = `${skater.firstName?.default || ''} ${skater.lastName?.default || ''}`.trim();
          const goals     = skater.goals   || 0;
          const assists   = skater.assists || 0;
          const playerId  = skater.playerId || null;

          // ── Bounds check ──
          const anom = agt002_checkBounds({ goals, assists }, fullName, gameId);
          if (anom) anomalies++;

          checksumGoals   += goals;
          checksumAssists += assists;

          const docId  = normalizeId(fullName);
          const player = fsGet(AAHL.COL.PLAYERS, docId);
          if (!player) return; // not in pool

          // Store playerId on player doc if not already there
          if (!player.playerId && playerId) {
            fsPatch(AAHL.COL.PLAYERS, docId, { playerId });
          }

          // Hat trick detection
          const isHatTrick = goals >= 3;
          const bonusPts   = isHatTrick ? AAHL.SCORING.HAT_TRICK : 0;

          if (isHatTrick) agt002_recordHatTrick(fullName, teamAbbrev, goals, gameId, yesterday);

          const poolPts = (goals * AAHL.SCORING.GOAL) +
                          (assists * AAHL.SCORING.ASSIST) +
                          bonusPts;

          // Write full stats map — avoids dot-notation Firestore bug
          fsPatch(AAHL.COL.PLAYERS, docId, {
            stats: {
              goals:     (player.stats?.goals     || 0) + goals,
              assists:   (player.stats?.assists   || 0) + assists,
              wins:      (player.stats?.wins      || 0),
              shutouts:  (player.stats?.shutouts  || 0),
              hatTricks: (player.stats?.hatTricks || 0) + (isHatTrick ? 1 : 0),
            },
            poolPoints:  (player.poolPoints  || 0) + poolPts,
            bonusPoints: (player.bonusPoints || 0) + bonusPts,
            lastUpdated: new Date().toISOString(),
          });

          // ── Accumulate for 3 Stars ──
          if (poolPts > 0) {
            if (!playerNightStats[docId]) {
              playerNightStats[docId] = {
                name: fullName, team: teamAbbrev, position: player.position || 'F',
                playerId: playerId || player.playerId || null,
                goals: 0, assists: 0, wins: 0, shutouts: 0, saves: 0,
                poolPts: 0, isHatTrick: false,
              };
            }
            playerNightStats[docId].goals      += goals;
            playerNightStats[docId].assists    += assists;
            playerNightStats[docId].poolPts    += poolPts;
            if (isHatTrick) playerNightStats[docId].isHatTrick = true;
          }
        });

        // ── Process goalies ──
        (box[side]?.goalies || []).forEach(goalie => {
          const fullName = `${goalie.firstName?.default || ''} ${goalie.lastName?.default || ''}`.trim();
          const toi      = goalie.toi || '00:00';
          if (toi === '00:00') return; // didn't play

          const wins     = (teamWon && !isOT) ? 1 : 0;
          const saves    = goalie.saves || 0;
          const shutout  = (goalie.goalsAgainst === 0 && toi !== '00:00') ? 1 : 0;
          const playerId = goalie.playerId || null;

          // Bounds check
          const anom = agt002_checkBounds({ saves, wins, shutouts: shutout }, fullName, gameId);
          if (anom) anomalies++;

          checksumWins += wins;

          const docId  = normalizeId(fullName);
          const player = fsGet(AAHL.COL.PLAYERS, docId);
          if (!player) return;

          // Store playerId on player doc if not already there
          if (!player.playerId && playerId) {
            fsPatch(AAHL.COL.PLAYERS, docId, { playerId });
          }

          const poolPts = (wins * AAHL.SCORING.WIN) + (shutout * AAHL.SCORING.SHUTOUT);

          // Write full stats map — avoids dot-notation Firestore bug
          fsPatch(AAHL.COL.PLAYERS, docId, {
            stats: {
              goals:     (player.stats?.goals     || 0),
              assists:   (player.stats?.assists   || 0),
              wins:      (player.stats?.wins      || 0) + wins,
              shutouts:  (player.stats?.shutouts  || 0) + shutout,
              hatTricks: (player.stats?.hatTricks || 0),
            },
            poolPoints:  (player.poolPoints || 0) + poolPts,
            lastUpdated: new Date().toISOString(),
          });

          // ── Accumulate for 3 Stars ──
          if (poolPts > 0) {
            if (!playerNightStats[docId]) {
              playerNightStats[docId] = {
                name: fullName, team: teamAbbrev, position: 'G',
                playerId: playerId || player.playerId || null,
                goals: 0, assists: 0, wins: 0, shutouts: 0, saves: 0,
                poolPts: 0, isHatTrick: false,
              };
            }
            playerNightStats[docId].wins     += wins;
            playerNightStats[docId].shutouts += shutout;
            playerNightStats[docId].saves    += saves;
            playerNightStats[docId].poolPts  += poolPts;
          }
        });
      });

      // ── Mark game processed ──
      fsWrite(AAHL.COL.GAMES, gameId, {
        gameId, gameDate: yesterday,
        homeTeam: box.homeTeam?.abbrev, awayTeam: box.awayTeam?.abbrev,
        processedAt: new Date().toISOString(),
      });
      processed++;
    });

    // ── Compute and write 3 Stars of the Night ──
    agt002_computeThreeStars(playerNightStats, yesterday);

    agt002_writeChecksum(agentId, checksumGoals, checksumAssists, checksumWins);

    const summary = `Processed: ${processed} games | Skipped: ${skipped} | Anomalies: ${anomalies} | Goals: ${checksumGoals} | Assists: ${checksumAssists}`;
    fsLog(agentId, '✅', summary);

    if (anomalies > 0) alertCommissioner('AAHL ⚠️ Stat Anomalies', `${anomalies} anomaly flag(s) on ${yesterday}. Check agentStatus in Firestore.`);

  } catch (err) {
    fsLog(agentId, '❌', `Fatal: ${err.message}`, true);
    alertCommissioner('AGT-002 Failed', err.message);
  }
}

function agt002_checkBounds(stats, playerName, gameId) {
  let flagged = false;
  const flags = [];

  if ((stats.goals   || 0) > AAHL.BOUNDS.MAX_GOALS_GAME)    { flags.push(`goals=${stats.goals}`);   flagged = true; }
  if ((stats.assists || 0) > AAHL.BOUNDS.MAX_ASSISTS_GAME)   { flags.push(`assists=${stats.assists}`);flagged = true; }
  if ((stats.saves   || 0) > AAHL.BOUNDS.MAX_SAVES_GAME)     { flags.push(`saves=${stats.saves}`);   flagged = true; }
  if ((stats.wins    || 0) > AAHL.BOUNDS.MAX_WINS_GAME)      { flags.push(`wins=${stats.wins}`);     flagged = true; }
  if ((stats.shutouts|| 0) > AAHL.BOUNDS.MAX_SHUTOUTS_GAME)  { flags.push(`shutouts=${stats.shutouts}`); flagged = true; }

  if (flagged) {
    fsLog('AGT-002', '⚠️', `Bounds exceeded — ${playerName} | game ${gameId} | ${flags.join(', ')}`, true);
  }
  return flagged;
}

function agt002_recordHatTrick(playerName, team, goals, gameId, date) {
  // Find all entries that have this player
  const allEntries = fsQueryAll(AAHL.COL.ENTRIES);
  const ownedBy    = allEntries
    .filter(e => {
      const all = [...(e.picks?.forwards||[]), ...(e.picks?.defence||[]), ...(e.picks?.goalies||[])];
      return all.map(n => n.toLowerCase()).includes(playerName.toLowerCase());
    })
    .map(e => `${e.teamName} (${e.ownerName})`);

  fsWrite(AAHL.COL.HAT_TRICKS, `${normalizeId(playerName)}-${gameId}`, {
    date, player: playerName, team, goals, gameId,
    bonusPts: AAHL.SCORING.HAT_TRICK,
    ownedBy,
    recordedAt: new Date().toISOString(),
  });
}

function agt002_writeChecksum(agentId, goals, assists, wins) {
  const dateKey = Utilities.formatDate(new Date(), 'America/Toronto', 'yyyyMMdd');
  fsWrite(AAHL.COL.CHECKSUMS, `AGT-002-${dateKey}`, {
    agentId, date: dateKey,
    checksumGoals: goals, checksumAssists: assists, checksumWins: wins,
    writtenAt: new Date().toISOString(),
  });
}


// ════════════════════════════════════════════════════════════
// AGT-003 — STANDINGS CALCULATOR
// Trigger: Daily 6:30 AM ET
// Redundancy: Verifies AGT-002 ran. Full recalc from scratch (not incremental).
// ════════════════════════════════════════════════════════════

function runAGT003() {
  const agentId = 'AGT-003';
  fsLog(agentId, '⏳', 'Standings calculation starting');

  // ── GATE: confirm AGT-002 ran today ──
  if (!agentRanSuccessfullyToday('AGT-002')) {
    const msg = 'AGT-002 has not completed successfully today — aborting standings calc';
    fsLog(agentId, '⚠️', msg, true);
    alertCommissioner('AGT-003 Aborted', msg);
    return;
  }

  // ── IDEMPOTENCY: already ran today? ──
  if (agentRanSuccessfullyToday(agentId)) {
    fsLog(agentId, '⏸', 'Already ran successfully today — skipping');
    return;
  }

  try {
    // ── Load all players into memory map ──
    const allPlayers = fsQueryAll(AAHL.COL.PLAYERS);
    const playerMap  = {};
    allPlayers.forEach(p => { playerMap[p.name?.toLowerCase()] = p; });

    // ── Load all entries ──
    const allEntries = fsQueryAll(AAHL.COL.ENTRIES);
    if (!allEntries.length) {
      fsLog(agentId, '⚠️', 'No entries found in Firestore');
      return;
    }

    // ── Recalculate every entry from scratch ──
    const scored = allEntries.map(entry => {
      let skaterPts = 0, goaliePts = 0, bonusPts = 0;

      const allPicks = [
        ...(entry.picks?.forwards || []),
        ...(entry.picks?.defence  || []),
        ...(entry.picks?.goalies  || []),
      ];

      allPicks.forEach(name => {
        const player = playerMap[name.toLowerCase()];
        if (!player) return;

        const pos = player.position;
        if (pos === 'G') {
          goaliePts += (player.stats?.wins     || 0) * AAHL.SCORING.WIN;
          goaliePts += (player.stats?.shutouts || 0) * AAHL.SCORING.SHUTOUT;
        } else {
          skaterPts += (player.stats?.goals   || 0) * AAHL.SCORING.GOAL;
          skaterPts += (player.stats?.assists || 0) * AAHL.SCORING.ASSIST;
        }
        bonusPts += player.bonusPoints || 0;
      });

      // Division bonus — only calculated at season end (flag in config)
      const divisionPts = 0; // AGT-003 will add these when config/season has divisionsClosed=true

      const total = skaterPts + goaliePts + bonusPts + divisionPts;

      return {
        ...entry,
        points: { skaterPts, goaliePts, bonusPts, divisionPts, total },
        prevRank: entry.rank,
      };
    });

    // ── Sort and assign ranks ──
    scored.sort((a, b) => b.points.total - a.points.total);
    scored.forEach((entry, i) => { entry.rank = i + 1; });

    // ── Cross-check: total goals in player map vs AGT-002 checksum ──
    const dateKey    = Utilities.formatDate(new Date(), 'America/Toronto', 'yyyyMMdd');
    const checksum   = fsGet(AAHL.COL.CHECKSUMS, `AGT-002-${dateKey}`);
    const actualGoals = allPlayers.reduce((sum, p) => sum + (p.stats?.goals || 0), 0);

    if (checksum && Math.abs(actualGoals - checksum.checksumGoals) > 10) {
      fsLog(agentId, '⚠️',
        `Checksum mismatch: AGT-002 wrote ${checksum.checksumGoals} goals, players sum to ${actualGoals}`,
        true
      );
      alertCommissioner('AGT-003 Checksum Mismatch',
        `Expected ~${checksum.checksumGoals} goals, found ${actualGoals}. Manual review recommended.`
      );
      // Proceed with warning — don't abort standings
    }

    // ── Write all updated entries back to Firestore ──
    scored.forEach(entry => {
      fsPatch(AAHL.COL.ENTRIES, entry.entryId, {
        'points.skaterPts':   entry.points.skaterPts,
        'points.goaliePts':   entry.points.goaliePts,
        'points.bonusPts':    entry.points.bonusPts,
        'points.divisionPts': entry.points.divisionPts,
        'points.total':       entry.points.total,
        rank:                 entry.rank,
        prevRank:             entry.prevRank,
      });
    });

    // ── Zero-point entry check (warn after week 2) ──
    const daysSinceOpen = Math.floor((new Date() - new Date(AAHL.OPENING)) / 86400000);
    if (daysSinceOpen > 14) {
      const zeroEntries = scored.filter(e => e.points.total === 0);
      if (zeroEntries.length) {
        fsLog(agentId, '⚠️',
          `${zeroEntries.length} entries with 0 pts after ${daysSinceOpen} days: ${zeroEntries.map(e=>e.teamName).join(', ')}`,
          true
        );
      }
    }

    const top = scored[0];
    const summary = `${scored.length} entries ranked | Leader: ${top?.teamName || '?'} (${top?.points?.total || 0} pts)`;
    fsLog(agentId, '✅', summary);

  } catch (err) {
    fsLog(agentId, '❌', `Fatal: ${err.message}`, true);
    alertCommissioner('AGT-003 Failed', err.message);
  }
}


// ════════════════════════════════════════════════════════════
// AGT-004 — ANOMALY DETECTOR
// Trigger: Daily 6:15 AM ET (between AGT-002 and AGT-003)
// ════════════════════════════════════════════════════════════

function runAGT004() {
  const agentId = 'AGT-004';
  fsLog(agentId, '⏳', 'Anomaly detection starting');

  if (!agentRanSuccessfullyToday('AGT-002')) {
    fsLog(agentId, '⚠️', 'AGT-002 not complete — anomaly check deferred');
    return;
  }

  try {
    const flags = [];

    // ── CHECK 1: Players in entries not in players collection ──
    const allEntries = fsQueryAll(AAHL.COL.ENTRIES);
    const allPlayers = fsQueryAll(AAHL.COL.PLAYERS);
    const playerNames = new Set(allPlayers.map(p => p.name?.toLowerCase()));

    const allPickedNames = new Set();
    allEntries.forEach(entry => {
      [...(entry.picks?.forwards||[]), ...(entry.picks?.defence||[]), ...(entry.picks?.goalies||[])]
        .forEach(n => allPickedNames.add(n.toLowerCase()));
    });

    allPickedNames.forEach(name => {
      if (!playerNames.has(name)) {
        flags.push(`Orphan player: "${name}" — in entries but missing from players collection`);
      }
    });

    // ── CHECK 2: Entry count vs yesterday (sudden drop) ──
    const todayCount = allEntries.length;
    const prevCountDoc = fsGet(AAHL.COL.CHECKSUMS, 'entryCount-prev');
    if (prevCountDoc && prevCountDoc.count > todayCount) {
      flags.push(`Entry count dropped: was ${prevCountDoc.count}, now ${todayCount} — possible data loss`);
    }
    fsWrite(AAHL.COL.CHECKSUMS, 'entryCount-prev', { count: todayCount, date: new Date().toISOString() });

    // ── CHECK 3: Stat values in plausible season range ──
    allPlayers.forEach(p => {
      const g = p.stats?.goals || 0;
      const a = p.stats?.assists || 0;
      const w = p.stats?.wins || 0;

      // Season maximums — nothing real is beating these
      if (g > 100) flags.push(`Implausible goals: ${p.name} has ${g} goals (season total)`);
      if (a > 150) flags.push(`Implausible assists: ${p.name} has ${a} assists (season total)`);
      if (w > 60)  flags.push(`Implausible wins: ${p.name} has ${w} wins (season total)`);
    });

    // ── CHECK 4: Duplicate entryIds ──
    const entryIds = allEntries.map(e => e.entryId);
    const dupeIds  = entryIds.filter((id, i) => entryIds.indexOf(id) !== i);
    if (dupeIds.length) flags.push(`Duplicate entryIds detected: ${dupeIds.join(', ')}`);

    // ── CHECK 5: Top standings plausibility ──
    const daysSinceOpen = Math.floor((new Date() - new Date(AAHL.OPENING)) / 86400000);
    const maxPlausiblePts = daysSinceOpen * 5; // rough upper bound
    const topEntry = allEntries.reduce((top, e) => (!top || (e.points?.total||0) > top.points?.total) ? e : top, null);
    if (topEntry && (topEntry.points?.total || 0) > maxPlausiblePts) {
      flags.push(`Top entry has ${topEntry.points.total} pts after ${daysSinceOpen} days — exceeds plausible max of ${maxPlausiblePts}`);
    }

    // ── REPORT ──
    if (flags.length) {
      const report = flags.join('\n');
      fsLog(agentId, '⚠️', `${flags.length} anomaly flag(s):\n${report}`, true);
      alertCommissioner(`AAHL AGT-004: ${flags.length} Anomaly Flag(s)`, report);
    } else {
      fsLog(agentId, '✅', 'No anomalies detected');
    }

  } catch (err) {
    fsLog(agentId, '❌', `Fatal: ${err.message}`, true);
    alertCommissioner('AGT-004 Failed', err.message);
  }
}


// ════════════════════════════════════════════════════════════
// AGT-005 — COMMS AGENT
// Triggers:
//   runAGT005Poll   → Every 5 min (polls agentStatus for CONFIRM: messages)
//   runAGT005Digest → Weekly, Monday 9 AM ET
// ════════════════════════════════════════════════════════════

function runAGT005Poll() {
  const agentId = 'AGT-005';

  // ── Read unprocessed CONFIRM: messages from agentStatus ──
  const pending = fsQueryAll(AAHL.COL.STATUS).filter(doc =>
    doc.agentId === 'AGT-001→AGT-005' &&
    doc.status === '📧' &&
    doc.message?.startsWith('CONFIRM:') &&
    !doc.processed
  );

  if (!pending.length) return;

  pending.forEach(doc => {
    try {
      const data = JSON.parse(doc.message.replace('CONFIRM:', ''));
      agt005_sendConfirmation(data);

      // Mark as processed
      fsPatch(AAHL.COL.STATUS, doc._id, { processed: true, processedAt: new Date().toISOString() });
      fsLog(agentId, '✅', `Confirmation sent to ${data.to}`);

    } catch (err) {
      fsLog(agentId, '❌', `Confirmation failed for doc ${doc._id}: ${err.message}`, true);
    }
  });
}

function runAGT005Digest() {
  const agentId = 'AGT-005';
  fsLog(agentId, '⏳', 'Weekly digest starting');

  // ── GATE: AGT-003 must have run this week ──
  if (!agentRanSuccessfullyThisWeek('AGT-003')) {
    const msg = 'AGT-003 has not run successfully this week — digest deferred';
    fsLog(agentId, '⚠️', msg, true);
    alertCommissioner('AGT-005 Digest Deferred', msg);
    return;
  }

  try {
    const allEntries = fsQueryAll(AAHL.COL.ENTRIES);
    const allPlayers = fsQueryAll(AAHL.COL.PLAYERS);
    const hatTricks  = fsQueryAll(AAHL.COL.HAT_TRICKS);

    // Sort by total points
    const ranked = [...allEntries].sort((a,b) => (b.points?.total||0) - (a.points?.total||0));

    // Top 5 scorers this week (by poolPoints — approximation)
    const topPlayers = [...allPlayers]
      .sort((a,b) => (b.poolPoints||0) - (a.poolPoints||0))
      .slice(0, 5);

    // Hat tricks this week
    const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const weekHatTricks = hatTricks.filter(h => h.date >= oneWeekAgo);

    // Get unique participant emails
    const emailsSeen = new Set();
    allEntries.forEach(entry => {
      if (!entry.email || emailsSeen.has(entry.email)) return;
      emailsSeen.add(entry.email);

      // Get this person's entries
      const myEntries = ranked
        .filter(e => e.email === entry.email)
        .map(e => `#${e.rank} — ${e.teamName} (${e.points?.total||0} pts)`);

      agt005_sendDigest(entry.email, entry.ownerName, ranked, topPlayers, weekHatTricks, myEntries);
    });

    fsLog(agentId, '✅', `Digest sent to ${emailsSeen.size} participants`);

  } catch (err) {
    fsLog(agentId, '❌', `Digest failed: ${err.message}`, true);
    alertCommissioner('AGT-005 Digest Failed', err.message);
  }
}

function agt005_sendConfirmation(data) {
  const { to, ownerName, teamName, entryNumber, entryId, picks, divisions } = data;

  const picksTable = `
    <table style="border-collapse:collapse;width:100%;font-family:monospace;font-size:13px">
      <tr style="background:#0a0a0a;color:#00D4FF">
        <th style="padding:8px 12px;text-align:left;border:1px solid #333">POS</th>
        <th style="padding:8px 12px;text-align:left;border:1px solid #333">PLAYER</th>
      </tr>
      ${picks.forwards.map((p,i) => `<tr style="background:${i%2?'#111':'#0d0d0d'}"><td style="padding:7px 12px;border:1px solid #222;color:#888">F${i+1}</td><td style="padding:7px 12px;border:1px solid #222;color:#fff">${p}</td></tr>`).join('')}
      ${picks.defence.map((p,i)  => `<tr style="background:${i%2?'#111':'#0d0d0d'}"><td style="padding:7px 12px;border:1px solid #222;color:#888">D${i+1}</td><td style="padding:7px 12px;border:1px solid #222;color:#fff">${p}</td></tr>`).join('')}
      ${picks.goalies.map((p,i)  => `<tr style="background:${i%2?'#111':'#0d0d0d'}"><td style="padding:7px 12px;border:1px solid #222;color:#888">G${i+1}</td><td style="padding:7px 12px;border:1px solid #222;color:#fff">${p}</td></tr>`).join('')}
    </table>`;

  const divTable = `
    <table style="border-collapse:collapse;width:100%;font-family:monospace;font-size:13px;margin-top:12px">
      <tr style="background:#0a0a0a;color:#FFB800">
        <th style="padding:8px 12px;text-align:left;border:1px solid #333">DIVISION</th>
        <th style="padding:8px 12px;text-align:left;border:1px solid #333">PICK</th>
      </tr>
      ${[['Atlantic',divisions.atlantic],['Metropolitan',divisions.metropolitan],['Central',divisions.central],['Pacific',divisions.pacific]]
        .map(([div,pick],i) => `<tr style="background:${i%2?'#111':'#0d0d0d'}"><td style="padding:7px 12px;border:1px solid #222;color:#888">${div}</td><td style="padding:7px 12px;border:1px solid #222;color:#fff">${pick}</td></tr>`)
        .join('')}
    </table>`;

  const html = `
    <div style="background:#0a0a0a;color:#fff;font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
      <div style="border-left:4px solid #00D4FF;padding-left:16px;margin-bottom:24px">
        <div style="font-size:11px;color:#00D4FF;letter-spacing:2px;text-transform:uppercase">Angry Alpaca Hockey League — 2025-26</div>
        <div style="font-size:24px;font-weight:900;margin-top:4px">Entry Confirmed</div>
      </div>
      <p style="color:#aaa">Hey ${ownerName}, your entry <strong style="color:#fff">"${teamName}"</strong> (Entry #${entryNumber}) has been received.</p>
      <div style="background:#111;border:1px solid #222;border-radius:6px;padding:16px;margin:20px 0">
        <div style="font-size:10px;color:#00D4FF;letter-spacing:2px;margin-bottom:12px">YOUR PICKS</div>
        ${picksTable}
        <div style="font-size:10px;color:#FFB800;letter-spacing:2px;margin-top:16px;margin-bottom:12px">DIVISION WINNERS</div>
        ${divTable}
      </div>
      <div style="background:#1a1000;border:1px solid #FFB800;border-radius:6px;padding:16px;margin:20px 0">
        <div style="font-size:10px;color:#FFB800;letter-spacing:2px;margin-bottom:8px">⚠️ PAYMENT REQUIRED</div>
        <p style="color:#ccc;margin:0">Send <strong style="color:#FFB800">$${AAHL.ENTRY_FEE}</strong> via e-transfer to <strong style="color:#fff">${AAHL.ETRANSFER}</strong> to confirm your spot. Your entry is <strong>pending</strong> until payment is received.</p>
      </div>
      <p style="color:#666;font-size:12px">Entry ID: ${entryId} | <a href="${AAHL.SITE_URL}" style="color:#00D4FF">View Standings</a></p>
    </div>`;

  MailApp.sendEmail({
    to:       to,
    subject:  `AAHL 2025-26 — Entry Confirmed: ${teamName} (#${entryNumber})`,
    htmlBody: html,
  });
}

function agt005_sendDigest(to, ownerName, ranked, topPlayers, weekHatTricks, myEntries) {
  const standingsRows = ranked.slice(0, 10).map((e, i) =>
    `<tr style="background:${i%2?'#111':'#0d0d0d'}">
       <td style="padding:7px 12px;border:1px solid #222;color:${i<3?'#FFB800':'#888'}">#${e.rank}</td>
       <td style="padding:7px 12px;border:1px solid #222;color:#fff">${e.teamName}</td>
       <td style="padding:7px 12px;border:1px solid #222;color:#aaa">${e.ownerName}</td>
       <td style="padding:7px 12px;border:1px solid #222;color:#00D4FF;text-align:right">${e.points?.total||0}</td>
     </tr>`
  ).join('');

  const html = `
    <div style="background:#0a0a0a;color:#fff;font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
      <div style="border-left:4px solid #00D4FF;padding-left:16px;margin-bottom:24px">
        <div style="font-size:11px;color:#00D4FF;letter-spacing:2px">AAHL 2025-26 — WEEKLY DIGEST</div>
        <div style="font-size:22px;font-weight:900">Week in Review</div>
      </div>
      <p style="color:#aaa">Hey ${ownerName}. Here's where things stand:</p>
      ${myEntries.length ? `<div style="background:#111;border:1px solid #00D4FF;border-radius:6px;padding:14px;margin-bottom:20px"><div style="font-size:10px;color:#00D4FF;letter-spacing:2px;margin-bottom:8px">YOUR ENTRIES</div>${myEntries.map(e=>`<div style="color:#fff;padding:4px 0">${e}</div>`).join('')}</div>` : ''}
      <div style="font-size:10px;color:#aaa;letter-spacing:2px;margin-bottom:8px">TOP 10 STANDINGS</div>
      <table style="border-collapse:collapse;width:100%;font-family:monospace;font-size:13px">
        <tr style="background:#0a0a0a;color:#00D4FF">
          <th style="padding:8px 12px;text-align:left;border:1px solid #333">#</th>
          <th style="padding:8px 12px;text-align:left;border:1px solid #333">TEAM</th>
          <th style="padding:8px 12px;text-align:left;border:1px solid #333">OWNER</th>
          <th style="padding:8px 12px;text-align:right;border:1px solid #333">PTS</th>
        </tr>
        ${standingsRows}
      </table>
      ${weekHatTricks.length ? `
      <div style="margin-top:20px;background:#1a000a;border:1px solid #6F263D;border-radius:6px;padding:14px">
        <div style="font-size:10px;color:#ff6b8a;letter-spacing:2px;margin-bottom:8px">🎩 HAT TRICKS THIS WEEK</div>
        ${weekHatTricks.map(h=>`<div style="color:#fff;padding:3px 0">${h.player} — ${h.goals} goals | Owned by: ${(h.ownedBy||[]).join(', ')||'nobody'}</div>`).join('')}
      </div>` : ''}
      <p style="color:#555;font-size:11px;margin-top:24px"><a href="${AAHL.SITE_URL}" style="color:#00D4FF">View full standings →</a></p>
    </div>`;

  MailApp.sendEmail({
    to:       to,
    subject:  'AAHL 2025-26 — Weekly Digest',
    htmlBody: html,
  });
}


// ════════════════════════════════════════════════════════════
// SHARED REDUNDANCY HELPERS
// ════════════════════════════════════════════════════════════

function agentRanSuccessfullyToday(agentId) {
  const today  = Utilities.formatDate(new Date(), 'America/Toronto', 'yyyy-MM-dd');
  const docs   = fsQueryAll(AAHL.COL.STATUS);
  return docs.some(doc => {
    const docDate = (doc.timestamp || '').split('T')[0];
    return doc.agentId === agentId && doc.status === '✅' && docDate === today;
  });
}

function agentRanSuccessfullyThisWeek(agentId) {
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const docs       = fsQueryAll(AAHL.COL.STATUS);
  return docs.some(doc =>
    doc.agentId === agentId && doc.status === '✅' && (doc.timestamp||'') >= oneWeekAgo
  );
}

function alertCommissioner(subject, body) {
  MailApp.sendEmail({ to: AAHL.COMMISSIONER, subject: `AAHL ALERT: ${subject}`, body });
}

function fail(msg) { return { ok: false, error: msg }; }

function jsonResponse(success, message, data = {}) {
  return ContentService
    .createTextOutput(JSON.stringify({ success, message, ...data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeId(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}


// ════════════════════════════════════════════════════════════
// FIRESTORE REST HELPERS
// ════════════════════════════════════════════════════════════

function getProjectId() {
  return PropertiesService.getScriptProperties().getProperty('FIREBASE_PROJECT_ID');
}

function getAccessToken() {
  const keyJson = PropertiesService.getScriptProperties().getProperty('SERVICE_ACCOUNT_KEY');
  if (!keyJson) throw new Error('SERVICE_ACCOUNT_KEY not set.');

  const key      = JSON.parse(keyJson);
  const now      = Math.floor(Date.now() / 1000);
  const header   = Utilities.base64EncodeWebSafe(JSON.stringify({ alg:'RS256', typ:'JWT' }));
  const claims   = Utilities.base64EncodeWebSafe(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud:  'https://oauth2.googleapis.com/token',
    exp:  now + 3600, iat: now,
  }));
  const sig = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(`${header}.${claims}`, key.private_key)
  );
  const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${sig}` },
  });
  return JSON.parse(resp.getContentText()).access_token;
}

function fsBaseUrl() {
  return `https://firestore.googleapis.com/v1/projects/${getProjectId()}/databases/(default)/documents`;
}

function fsWrite(collection, docId, data) {
  const token = getAccessToken();
  const url   = `${fsBaseUrl()}/${collection}/${docId}`;
  const resp  = UrlFetchApp.fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    payload: JSON.stringify({ fields: toFsFields(data) }),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() >= 400) throw new Error(`fsWrite failed [${resp.getResponseCode()}]: ${resp.getContentText().slice(0,200)}`);
}

function fsPatch(collection, docId, fields) {
  // Patch specific fields only (uses updateMask)
  const token      = getAccessToken();
  const fieldPaths = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const url        = `${fsBaseUrl()}/${collection}/${docId}?${fieldPaths}`;
  const resp       = UrlFetchApp.fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    payload: JSON.stringify({ fields: toFsFields(fields) }),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() >= 400) throw new Error(`fsPatch failed [${resp.getResponseCode()}]: ${resp.getContentText().slice(0,200)}`);
}

function fsGet(collection, docId) {
  const token = getAccessToken();
  const url   = `${fsBaseUrl()}/${collection}/${docId}`;
  const resp  = UrlFetchApp.fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() === 404) return null;
  if (resp.getResponseCode() >= 400) throw new Error(`fsGet failed [${resp.getResponseCode()}]`);
  return fromFsFields(JSON.parse(resp.getContentText()).fields || {});
}

function fsQueryAll(collection) {
  const token   = getAccessToken();
  const results = [];
  let   pageToken = null;

  do {
    const url  = `${fsBaseUrl()}/${collection}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const resp = UrlFetchApp.fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() >= 400) break;

    const body = JSON.parse(resp.getContentText());
    (body.documents || []).forEach(doc => {
      const data  = fromFsFields(doc.fields || {});
      const parts = doc.name.split('/');
      data._id    = parts[parts.length - 1]; // inject doc ID
      results.push(data);
    });
    pageToken = body.nextPageToken || null;
  } while (pageToken);

  return results;
}

function fsCount(collection) {
  return fsQueryAll(collection).length;
}

function fsCountWhere(collection, field, value) {
  return fsQueryAll(collection).filter(doc => doc[field] === value).length;
}

function fsQuery(collection, field, value) {
  return fsQueryAll(collection).filter(doc => doc[field] === value);
}

function fsLog(agentId, status, message, requiresAction = false) {
  try {
    const docId = `${agentId}-${Date.now()}`;
    fsWrite(AAHL.COL.STATUS, docId, {
      timestamp: new Date().toISOString(),
      agentId, status, message,
      requiresAction: !!requiresAction,
      processed: false,
    });
  } catch (e) {
    console.error('fsLog failed:', e.message);
  }
}

// Firestore field type conversion
function toFsFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFsVal(v);
  return fields;
}

function toFsVal(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean')        return { booleanValue: v };
  if (typeof v === 'number')         return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string')         return { stringValue: v };
  if (Array.isArray(v))              return { arrayValue: { values: v.map(toFsVal) } };
  if (typeof v === 'object')         return { mapValue: { fields: toFsFields(v) } };
  return { stringValue: String(v) };
}

function fromFsFields(fields) {
  const obj = {};
  for (const [k, v] of Object.entries(fields)) obj[k] = fromFsVal(v);
  return obj;
}

function fromFsVal(v) {
  if ('nullValue'    in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue'  in v) return v.doubleValue;
  if ('stringValue'  in v) return v.stringValue;
  if ('arrayValue'   in v) return (v.arrayValue.values || []).map(fromFsVal);
  if ('mapValue'     in v) return fromFsFields(v.mapValue.fields || {});
  return null;
}


// ════════════════════════════════════════════════════════════
// TEST / DEBUG HELPERS (run manually in Apps Script editor)
// ════════════════════════════════════════════════════════════

function testFirestoreConnection() {
  try {
    const token = getAccessToken();
    console.log('Token acquired ✅');
    const doc = fsGet(AAHL.COL.CONFIG, 'season');
    console.log('Config doc:', JSON.stringify(doc));
    console.log('Connection OK ✅');
  } catch (e) {
    console.error('Connection FAILED:', e.message);
  }
}

function testAGT001Entry() {
  const dummy = {
    ownerName:'Test User', email:'test@example.com', teamName:'Test Alpacas',
    f1:'Connor McDavid',   f2:'Nathan MacKinnon', f3:'Auston Matthews',
    f4:'Leon Draisaitl',   f5:'Nikita Kucherov',  f6:'David Pastrnak',
    d1:'Cale Makar',       d2:'Victor Hedman',    d3:'Quinn Hughes', d4:'Roman Josi',
    g1:'Andrei Vasilevskiy', g2:'Igor Shesterkin',
    divAtlantic:'Boston Bruins', divMetropolitan:'New York Rangers',
    divCentral:'Colorado Avalanche', divPacific:'Edmonton Oilers',
  };
  const v = agt001_validate(dummy);
  console.log('Validation:', JSON.stringify(v));
  const id  = agt001_generateId(dummy, 1);
  const doc = agt001_buildDoc(dummy, 1, id, agt001_hashPicks(dummy));
  console.log('Entry ID:', id);
  console.log('Doc:', JSON.stringify(doc, null, 2));
  // Uncomment to write: fsWrite(AAHL.COL.ENTRIES, id, doc);
}

function forceRunAGT002() { runAGT002(); }
function forceRunAGT003() { runAGT003(); }
function forceRunAGT004() { runAGT004(); }
function forceRunAGT005Digest() { runAGT005Digest(); }
