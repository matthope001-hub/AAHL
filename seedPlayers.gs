// ============================================================
// AAHL 2025-26 — Player Seed Script
// File: seedPlayers.gs — paste into Apps Script, run once
//
// Run: seedPlayers() in Apps Script editor
//
// What this does:
//   - Writes all pool-eligible players to Firestore 'players' collection
//   - Tiers players by 2025-26 actual production (used for pick form display)
//   - Flags retired players so they appear as unavailable in the pick form
//   - Flags players with uncertain status (retiring, unconfirmed return)
//
// TIERS (based on 2025-26 regular season pool points):
//   S — Elite (projected 80+ pool pts)
//   A — Star (projected 55–79 pool pts)
//   B — Solid (projected 35–54 pool pts)
//   C — Depth (projected 15–34 pool pts)
//
// RETIREMENT FLAGS:
//   retired: true     → excluded from pick form entirely
//   status: 'watch'   → shown with ⚠️ warning (uncertain return)
//   status: 'active'  → normal
// ============================================================

function seedPlayers() {
  const players = getPlayerList();
  const total   = players.length;
  let written   = 0;

  console.log(`Seeding ${total} players to Firestore...`);

  players.forEach((p, i) => {
    try {
      const docId = normalizeId(p.name);
      fsWrite('players', docId, {
        name:           p.name,
        team:           p.team,
        position:       p.position,  // F, D, or G
        tier:           p.tier,      // S, A, B, C
        retired:        p.retired || false,
        status:         p.status || 'active', // active | watch | retired
        statusNote:     p.statusNote || '',
        stats: {
          goals:    0,
          assists:  0,
          wins:     0,
          shutouts: 0,
          hatTricks:0,
        },
        poolPoints:     0,
        bonusPoints:    0,
        ownershipCount: 0,
        ownershipPct:   '0.0%',
        onIR:           false,
        lastUpdated:    new Date().toISOString(),
      });
      written++;
      if (written % 20 === 0) console.log(`  ${written}/${total} written...`);
    } catch (e) {
      console.error(`Failed to write ${p.name}: ${e.message}`);
    }
  });

  console.log(`✅ Seed complete. ${written}/${total} players written.`);
  fsLog('SEED', '✅', `Player seed complete: ${written}/${total} players`);
}

// ============================================================
// PLAYER LIST
// Sorted by tier, then alphabetically within tier
// Production estimates based on 2025-26 actual regular season
// ============================================================

function getPlayerList() {
  return [

    // ════════════════════════════════════════════════════════
    // FORWARDS — TIER S (Elite — 80+ projected pool pts)
    // ════════════════════════════════════════════════════════
    { name: 'Connor McDavid',       team: 'EDM', position: 'F', tier: 'S' }, // 2025-26 points leader: 138pts
    { name: 'Nathan MacKinnon',     team: 'COL', position: 'F', tier: 'S' }, // Top 3 pts, goals leader
    { name: 'Nikita Kucherov',      team: 'TBL', position: 'F', tier: 'S' }, // Top 3 pts
    { name: 'Leon Draisaitl',       team: 'EDM', position: 'F', tier: 'S' },
    { name: 'Auston Matthews',      team: 'TOR', position: 'F', tier: 'S' },
    { name: 'David Pastrnak',       team: 'BOS', position: 'F', tier: 'S' }, // 110pts in 2025 calendar yr
    { name: 'Cole Caufield',        team: 'MTL', position: 'F', tier: 'S' }, // Goals leader contender

    // ════════════════════════════════════════════════════════
    // FORWARDS — TIER A (Star — 55–79 projected pool pts)
    // ════════════════════════════════════════════════════════
    { name: 'Brayden Point',        team: 'TBL', position: 'F', tier: 'A' },
    { name: 'William Nylander',     team: 'TOR', position: 'F', tier: 'A' },
    { name: 'Jason Robertson',      team: 'DAL', position: 'F', tier: 'A' }, // 49 goals in 2025
    { name: 'Artemi Panarin',       team: 'NYR', position: 'F', tier: 'A' },
    { name: 'Jesper Bratt',         team: 'NJD', position: 'F', tier: 'A' },
    { name: 'Sidney Crosby',        team: 'PIT', position: 'F', tier: 'A', status: 'watch', statusNote: '38 yrs old — 1yr left on contract, indicated return for 2026-27' },
    { name: 'Elias Pettersson',     team: 'VAN', position: 'F', tier: 'A' },
    { name: 'Sebastian Aho',        team: 'CAR', position: 'F', tier: 'A' },
    { name: 'Mitch Marner',         team: 'TOR', position: 'F', tier: 'A' },
    { name: 'Dylan Guenther',       team: 'UTA', position: 'F', tier: 'A' },
    { name: 'Macklin Celebrini',    team: 'SJS', position: 'F', tier: 'A' }, // 98pts as teenager in 2025
    { name: 'Nick Suzuki',          team: 'MTL', position: 'F', tier: 'A' }, // 97pts in 2025
    { name: 'Matt Geekie',          team: 'BOS', position: 'F', tier: 'A' }, // Breakout — tied 2nd goals at midseason
    { name: 'Steven Stamkos',       team: 'NSH', position: 'F', tier: 'A' },
    { name: 'Aleksander Barkov',    team: 'FLA', position: 'F', tier: 'A' },
    { name: 'Sam Reinhart',         team: 'FLA', position: 'F', tier: 'A' },
    { name: 'Kirill Kaprizov',      team: 'MIN', position: 'F', tier: 'A' },
    { name: 'Brady Tkachuk',        team: 'OTT', position: 'F', tier: 'A' },
    { name: 'Timo Meier',           team: 'NJD', position: 'F', tier: 'A' },
    { name: 'J.T. Miller',          team: 'VAN', position: 'F', tier: 'A' },

    // ════════════════════════════════════════════════════════
    // FORWARDS — TIER B (Solid — 35–54 projected pool pts)
    // ════════════════════════════════════════════════════════
    { name: 'Alex Ovechkin',        team: 'WSH', position: 'F', tier: 'B', status: 'watch', statusNote: 'Contract expired after 2025-26 — retirement undecided as of May 2026' },
    { name: 'Evgeni Malkin',        team: 'PIT', position: 'F', tier: 'B', status: 'watch', statusNote: 'Contract year in 2025-26 — future undecided, said wants to stay in Pittsburgh' },
    { name: 'Anze Kopitar',         team: 'LAK', position: 'F', tier: 'B', retired: true, status: 'retired', statusNote: 'Retired — announced before 2025-26 season, Kings eliminated Apr 26 2026' },
    { name: 'Mark Scheifele',       team: 'WPG', position: 'F', tier: 'B' },
    { name: 'Elias Lindholm',       team: 'BOS', position: 'F', tier: 'B' },
    { name: 'Tyler Seguin',         team: 'DAL', position: 'F', tier: 'B' },
    { name: 'Gabriel Landeskog',    team: 'COL', position: 'F', tier: 'B' },
    { name: 'Mikael Backlund',      team: 'CGY', position: 'F', tier: 'B' },
    { name: 'Jake Guentzel',        team: 'TBL', position: 'F', tier: 'B' },
    { name: 'Nico Hischier',        team: 'NJD', position: 'F', tier: 'B' },
    { name: 'Rickard Rakell',       team: 'PIT', position: 'F', tier: 'B' },
    { name: 'Dylan Larkin',         team: 'DET', position: 'F', tier: 'B' },
    { name: 'Patrick Kane',         team: 'DET', position: 'F', tier: 'B' },
    { name: 'Joe Pavelski',         team: 'DAL', position: 'F', tier: 'B' },
    { name: 'Matt Duchene',         team: 'NSH', position: 'F', tier: 'B' },
    { name: 'Pierre-Luc Dubois',    team: 'LAK', position: 'F', tier: 'B' },
    { name: 'Claude Giroux',        team: 'OTT', position: 'F', tier: 'B' },
    { name: 'Jonathan Huberdeau',   team: 'CGY', position: 'F', tier: 'B' },
    { name: 'Roope Hintz',          team: 'DAL', position: 'F', tier: 'B' },
    { name: 'Nazem Kadri',          team: 'CGY', position: 'F', tier: 'B' },
    { name: 'Alex DeBrincat',       team: 'DET', position: 'F', tier: 'B' },
    { name: 'Bo Horvat',            team: 'NYI', position: 'F', tier: 'B' },
    { name: 'Mikko Rantanen',       team: 'CAR', position: 'F', tier: 'B' },
    { name: 'Jack Hughes',          team: 'NJD', position: 'F', tier: 'B' },
    { name: 'Trevor Zegras',        team: 'ANA', position: 'F', tier: 'B' },
    { name: 'Tim Stutzle',          team: 'OTT', position: 'F', tier: 'B' },
    { name: 'Matt Boldy',           team: 'MIN', position: 'F', tier: 'B' },
    { name: 'Ryan O\'Reilly',       team: 'NSH', position: 'F', tier: 'B' },
    { name: 'Jordan Kyrou',         team: 'STL', position: 'F', tier: 'B' },
    { name: 'Brock Boeser',         team: 'VAN', position: 'F', tier: 'B' },
    { name: 'Pavel Buchnevich',     team: 'STL', position: 'F', tier: 'B' },
    { name: 'Evander Kane',         team: 'EDM', position: 'F', tier: 'B' },
    { name: 'Tanner Jeannot',       team: 'TBL', position: 'F', tier: 'B' },
    { name: 'Tyler Toffoli',        team: 'CGY', position: 'F', tier: 'B' },
    { name: 'Ryan Nugent-Hopkins',  team: 'EDM', position: 'F', tier: 'B' },
    { name: 'Anthony Duclair',      team: 'TOR', position: 'F', tier: 'B' },
    { name: 'Conor Garland',        team: 'VAN', position: 'F', tier: 'B' },

    // ════════════════════════════════════════════════════════
    // FORWARDS — TIER C (Depth — 15–34 projected pool pts)
    // ════════════════════════════════════════════════════════
    { name: 'Ryan Reaves',          team: 'TOR', position: 'F', tier: 'C' },
    { name: 'Valeri Nichushkin',    team: 'COL', position: 'F', tier: 'C' },
    { name: 'Warren Foegele',       team: 'EDM', position: 'F', tier: 'C' },
    { name: 'Zach Hyman',           team: 'EDM', position: 'F', tier: 'C' },
    { name: 'Nino Niederreiter',    team: 'WPG', position: 'F', tier: 'C' },
    { name: 'Dawson Mercer',        team: 'NJD', position: 'F', tier: 'C' },
    { name: 'William Karlsson',     team: 'VGK', position: 'F', tier: 'C' },
    { name: 'Calle Jarnkrok',       team: 'TOR', position: 'F', tier: 'C' },
    { name: 'Max Domi',             team: 'DAL', position: 'F', tier: 'C' },
    { name: 'Rickard Rakell',       team: 'PIT', position: 'F', tier: 'C' },
    { name: 'Tage Thompson',        team: 'BUF', position: 'F', tier: 'C' },
    { name: 'Kevin Fiala',          team: 'LAK', position: 'F', tier: 'C' },
    { name: 'Brendan Gallagher',    team: 'MTL', position: 'F', tier: 'C' },
    { name: 'Michael Bunting',      team: 'CAR', position: 'F', tier: 'C' },
    { name: 'Logan Couture',        team: 'SJS', position: 'F', tier: 'C' },
    { name: 'Ondrej Palat',         team: 'NJD', position: 'F', tier: 'C' },

    // ════════════════════════════════════════════════════════
    // DEFENCE — TIER S
    // ════════════════════════════════════════════════════════
    { name: 'Cale Makar',           team: 'COL', position: 'D', tier: 'S' }, // Led D in pts, 45pts at midseason
    { name: 'Quinn Hughes',         team: 'VAN', position: 'D', tier: 'S' },
    { name: 'Lane Hutson',          team: 'MTL', position: 'D', tier: 'S' }, // 78pts in 2025, led D in assists

    // ════════════════════════════════════════════════════════
    // DEFENCE — TIER A
    // ════════════════════════════════════════════════════════
    { name: 'Victor Hedman',        team: 'TBL', position: 'D', tier: 'A' },
    { name: 'Roman Josi',           team: 'NSH', position: 'D', tier: 'A' },
    { name: 'Rasmus Dahlin',        team: 'BUF', position: 'D', tier: 'A' },
    { name: 'Adam Fox',             team: 'NYR', position: 'D', tier: 'A' },
    { name: 'Dougie Hamilton',      team: 'NJD', position: 'D', tier: 'A' },
    { name: 'Evan Bouchard',        team: 'EDM', position: 'D', tier: 'A' },
    { name: 'Mikhail Sergachev',    team: 'TBL', position: 'D', tier: 'A' },
    { name: 'Noah Dobson',          team: 'NYI', position: 'D', tier: 'A' }, // Blocks leader
    { name: 'Jake Sanderson',       team: 'OTT', position: 'D', tier: 'A' },
    { name: 'Brent Burns',          team: 'COL', position: 'D', tier: 'A' },

    // ════════════════════════════════════════════════════════
    // DEFENCE — TIER B
    // ════════════════════════════════════════════════════════
    { name: 'Drew Doughty',         team: 'LAK', position: 'D', tier: 'B' },
    { name: 'Seth Jones',           team: 'CHI', position: 'D', tier: 'B' },
    { name: 'Shea Theodore',        team: 'VGK', position: 'D', tier: 'B' },
    { name: 'Moritz Seider',        team: 'DET', position: 'D', tier: 'B' },
    { name: 'Miro Heiskanen',       team: 'DAL', position: 'D', tier: 'B' },
    { name: 'Ivan Provorov',        team: 'CBJ', position: 'D', tier: 'B' },
    { name: 'Devon Toews',          team: 'COL', position: 'D', tier: 'B' },
    { name: 'Jake McCabe',          team: 'TOR', position: 'D', tier: 'B' },
    { name: 'Josh Morrissey',       team: 'WPG', position: 'D', tier: 'B' },
    { name: 'Travis Hamonic',       team: 'VAN', position: 'D', tier: 'B' },
    { name: 'Morgan Rielly',        team: 'TOR', position: 'D', tier: 'B' },
    { name: 'Charlie McAvoy',       team: 'BOS', position: 'D', tier: 'B' },
    { name: 'Jaccob Slavin',        team: 'CAR', position: 'D', tier: 'B' },
    { name: 'Ryan McDonagh',        team: 'NSH', position: 'D', tier: 'B' },
    { name: 'Mark Giordano',        team: 'SEA', position: 'D', tier: 'B' },
    { name: 'Kris Letang',          team: 'PIT', position: 'D', tier: 'B' },

    // ════════════════════════════════════════════════════════
    // DEFENCE — TIER C
    // ════════════════════════════════════════════════════════
    { name: 'Darnell Nurse',        team: 'EDM', position: 'D', tier: 'C' },
    { name: 'Alex Pietrangelo',     team: 'VGK', position: 'D', tier: 'C', status: 'watch', statusNote: 'Returned from hip injury in 2025-26 — availability uncertain' },
    { name: 'Brandon Montour',      team: 'SEA', position: 'D', tier: 'C' },
    { name: 'Zach Werenski',        team: 'CBJ', position: 'D', tier: 'C' },
    { name: 'Justin Schultz',       team: 'SEA', position: 'D', tier: 'C' },
    { name: 'Travis Sanheim',       team: 'PHI', position: 'D', tier: 'C' },
    { name: 'Matt Grzelcyk',        team: 'MTL', position: 'D', tier: 'C' },

    // ════════════════════════════════════════════════════════
    // GOALIES — TIER S
    // ════════════════════════════════════════════════════════
    { name: 'Andrei Vasilevskiy',   team: 'TBL', position: 'G', tier: 'S' }, // Wins leader
    { name: 'Connor Hellebuyck',    team: 'WPG', position: 'G', tier: 'S' },
    { name: 'Igor Shesterkin',      team: 'NYR', position: 'G', tier: 'S' },

    // ════════════════════════════════════════════════════════
    // GOALIES — TIER A
    // ════════════════════════════════════════════════════════
    { name: 'Jake Oettinger',       team: 'DAL', position: 'G', tier: 'A' }, // Top 3 wins
    { name: 'Juuse Saros',          team: 'NSH', position: 'G', tier: 'A' },
    { name: 'Ilya Sorokin',         team: 'NYI', position: 'G', tier: 'A' },
    { name: 'Vitek Vanecek',        team: 'NJD', position: 'G', tier: 'A' },
    { name: 'Filip Gustavsson',     team: 'MIN', position: 'G', tier: 'A' },
    { name: 'Lukas Dostal',         team: 'ANA', position: 'G', tier: 'A' },
    { name: 'Tristan Jarry',        team: 'PIT', position: 'G', tier: 'A' },
    { name: 'Thatcher Demko',       team: 'VAN', position: 'G', tier: 'A' },
    { name: 'Linus Ullmark',        team: 'OTT', position: 'G', tier: 'A' },
    { name: 'Jonas Johansson',      team: 'COL', position: 'G', tier: 'A' },
    { name: 'Jesper Wallstedt',     team: 'MIN', position: 'G', tier: 'A' }, // Save% leader contender

    // ════════════════════════════════════════════════════════
    // GOALIES — TIER B
    // ════════════════════════════════════════════════════════
    { name: 'Cam Talbot',           team: 'OTT', position: 'G', tier: 'B' },
    { name: 'Alexandar Georgiev',   team: 'COL', position: 'G', tier: 'B' },
    { name: 'Kevin Lankinen',       team: 'NSH', position: 'G', tier: 'B' },
    { name: 'Adin Hill',            team: 'VGK', position: 'G', tier: 'B' },
    { name: 'Spencer Knight',       team: 'FLA', position: 'G', tier: 'B' },
    { name: 'Stuart Skinner',       team: 'EDM', position: 'G', tier: 'B' },
    { name: 'Samuel Montembeault',  team: 'MTL', position: 'G', tier: 'B' },
    { name: 'Semyon Varlamov',      team: 'NYI', position: 'G', tier: 'B' },
    { name: 'Jordan Binnington',    team: 'STL', position: 'G', tier: 'B' },
    { name: 'Sergei Bobrovsky',     team: 'FLA', position: 'G', tier: 'B' },
    { name: 'Marc-Andre Fleury',    team: 'PIT', position: 'G', tier: 'B', retired: true, status: 'retired', statusNote: 'Retired Sep 27 2025 — played one preseason game as farewell with Pittsburgh' },
    { name: 'Jonathan Quick',       team: 'NYR', position: 'G', tier: 'B', retired: true, status: 'retired', statusNote: 'Retired Apr 13 2026 — final start with New York Rangers' },

    // ════════════════════════════════════════════════════════
    // GOALIES — TIER C
    // ════════════════════════════════════════════════════════
    { name: 'Calvin Pickard',       team: 'ARI', position: 'G', tier: 'C' },
    { name: 'Akira Schmid',         team: 'NJD', position: 'G', tier: 'C' },
    { name: 'Pheonix Copley',       team: 'LAK', position: 'G', tier: 'C' },
    { name: 'Pyotr Kochetkov',      team: 'CAR', position: 'G', tier: 'C' },
    { name: 'Casey DeSmith',        team: 'VAN', position: 'G', tier: 'C' },
    { name: 'Mackenzie Blackwood',  team: 'COL', position: 'G', tier: 'C' },
    { name: 'Scott Wedgewood',      team: 'COL', position: 'G', tier: 'C' }, // Save% and GAA leader
    { name: 'Yaroslav Askarov',     team: 'NSH', position: 'G', tier: 'C' },

  ];
}

// ════════════════════════════════════════════════════════════
// VERIFY — run this after seeding to spot-check
// ════════════════════════════════════════════════════════════
function verifyPlayerSeed() {
  const all    = fsQueryAll('players');
  const byPos  = { F: 0, D: 0, G: 0 };
  const byTier = { S: 0, A: 0, B: 0, C: 0 };
  const retired = [];
  const watch   = [];

  all.forEach(p => {
    byPos[p.position]  = (byPos[p.position]  || 0) + 1;
    byTier[p.tier]     = (byTier[p.tier]     || 0) + 1;
    if (p.retired)         retired.push(p.name);
    if (p.status === 'watch') watch.push(p.name);
  });

  console.log('=== PLAYER SEED VERIFICATION ===');
  console.log(`Total: ${all.length}`);
  console.log(`By position — F: ${byPos.F} · D: ${byPos.D} · G: ${byPos.G}`);
  console.log(`By tier     — S: ${byTier.S} · A: ${byTier.A} · B: ${byTier.B} · C: ${byTier.C}`);
  console.log(`Retired (excluded from picks): ${retired.join(', ')}`);
  console.log(`⚠ Watch list (shown with warning): ${watch.join(', ')}`);
  console.log('================================');
}

// ════════════════════════════════════════════════════════════
// SHARED HELPERS (copy from AAHL-2526-Agents.gs or include here)
// ════════════════════════════════════════════════════════════

function normalizeId(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// NOTE: fsWrite, fsQueryAll, fsLog, getAccessToken, getProjectId, toFsFields, toFsVal
// are defined in AAHL-2526-Agents.gs — this file shares the same Apps Script project.
// If running standalone, paste those functions here too.
