import {
  ACHIEVEMENTS,
  BUFFS,
  COST_GROWTH,
  GENERATORS,
  GEN_BY_ID,
  RUSH_BASE,
  SPIKE_BY_ID,
  STEAM_BASE,
  UPGRADE_BY_ID,
} from "./data.js";

export const REGAUGE_DIVISOR = 1e8;
export const BASE_HAUL = 1;

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------

/** Cost of buying `count` more of `gen` when you already own `owned`. */
export function genCost(gen, owned, count = 1) {
  const first = gen.base * Math.pow(COST_GROWTH, owned);
  if (count <= 1) return first;
  return (first * (Math.pow(COST_GROWTH, count) - 1)) / (COST_GROWTH - 1);
}

export function maxAffordable(gen, owned, money) {
  const first = gen.base * Math.pow(COST_GROWTH, owned);
  if (money < first) return 0;
  const n = Math.log(1 + (money * (COST_GROWTH - 1)) / first) / Math.log(COST_GROWTH);
  return Math.max(0, Math.floor(n + 1e-9));
}

// ---------------------------------------------------------------------------
// Requirements & visibility
// ---------------------------------------------------------------------------

export function meetsReq(S, req) {
  if (!req) return true;
  if (req.gen !== undefined && (S.gens[req.gen] || 0) < req.owned) return false;
  if (req.total !== undefined && S.totalEarned < req.total) return false;
  if (req.hauls !== undefined && S.hauls < req.hauls) return false;
  if (req.parcels !== undefined && S.parcels < req.parcels) return false;
  if (req.regauges !== undefined && S.regauges < req.regauges) return false;
  return true;
}

/** The roster is revealed one step ahead of your progress, and stays revealed. */
export function refreshVisibleGens(S) {
  const seen = new Set(S.seenGens);
  seen.add(GENERATORS[0].id);
  for (let i = 1; i < GENERATORS.length; i++) {
    if ((S.gens[GENERATORS[i - 1].id] || 0) >= 1) seen.add(GENERATORS[i].id);
  }
  S.seenGens = GENERATORS.filter((g) => seen.has(g.id)).map((g) => g.id);
  return S.seenGens;
}

export function availableUpgrades(S) {
  const bought = new Set(S.upgrades);
  return Object.values(UPGRADE_BY_ID)
    .filter((u) => !bought.has(u.id) && meetsReq(S, u.req))
    .sort((a, b) => a.cost - b.cost);
}

// ---------------------------------------------------------------------------
// Multipliers
// ---------------------------------------------------------------------------

export function computeStats(S) {
  const genMult = {};
  for (const g of GENERATORS) genMult[g.id] = 1;

  let allMult = 1;
  let haulMult = 1;
  let haulRatePct = 0;
  let parcelFreq = 1;
  let parcelDur = 1;
  let steamMult = 1;
  let spikePower = 0.05;
  let offlineHours = 8;
  let offlineRate = 0.5;
  let headStart = null;
  const synergies = [];

  const effects = [];
  for (const id of S.upgrades) if (UPGRADE_BY_ID[id]) effects.push(...UPGRADE_BY_ID[id].effects);
  for (const id of S.spikeUpgrades) if (SPIKE_BY_ID[id]) effects.push(...SPIKE_BY_ID[id].effects);

  for (const e of effects) {
    switch (e.k) {
      case "gen":
        genMult[e.target] *= e.mult;
        break;
      case "all":
        allMult *= e.mult;
        break;
      case "click":
        haulMult *= e.mult;
        break;
      case "haulRate":
        haulRatePct += e.pct;
        break;
      case "genPer":
        synergies.push(e);
        break;
      case "parcelFreq":
        parcelFreq *= e.mult;
        break;
      case "parcelDur":
        parcelDur *= e.mult;
        break;
      case "steam":
        steamMult *= e.mult;
        break;
      case "spikePower":
        spikePower += e.add;
        break;
      case "offline":
        offlineHours = Math.max(offlineHours, e.hours);
        offlineRate = Math.max(offlineRate, e.rate);
        break;
      case "headStart":
        headStart = e;
        break;
      default:
        break;
    }
  }

  for (const s of synergies) {
    genMult[s.target] *= 1 + s.pct * (S.gens[s.source] || 0);
  }

  const milestoneBonus = 0.01 * S.achievements.length;
  const spikeBonus = spikePower * S.totalSpikes;
  allMult *= 1 + milestoneBonus + spikeBonus;

  let buffMult = 1;
  if (S.buff && S.buff.type === "steam") buffMult = STEAM_BASE * steamMult;

  const perGen = {};
  let perSec = 0;
  for (const g of GENERATORS) {
    const owned = S.gens[g.id] || 0;
    const each = g.rate * genMult[g.id] * allMult * buffMult;
    perGen[g.id] = { each, total: each * owned, mult: genMult[g.id] };
    perSec += perGen[g.id].total;
  }

  let haulValue = BASE_HAUL * haulMult * allMult * buffMult + perSec * haulRatePct;
  if (S.buff && S.buff.type === "rush") haulValue *= RUSH_BASE;

  return {
    perSec,
    perGen,
    haulValue,
    haulRatePct,
    allMult,
    buffMult,
    milestoneBonus,
    spikeBonus,
    spikePower,
    parcelFreq,
    parcelDur,
    steamMult,
    offlineHours,
    offlineRate,
    headStart,
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function addCargo(S, amount) {
  if (!(amount > 0)) return;
  S.cargo += amount;
  S.runEarned += amount;
  S.totalEarned += amount;
}

export function buyGenerator(S, genId, amount) {
  const gen = GEN_BY_ID[genId];
  if (!gen) return 0;
  const owned = S.gens[genId] || 0;
  const count = amount === "max" ? maxAffordable(gen, owned, S.cargo) : amount;
  if (count < 1) return 0;
  const cost = genCost(gen, owned, count);
  if (cost > S.cargo) return 0;
  S.cargo -= cost;
  S.gens[genId] = owned + count;
  refreshVisibleGens(S);
  return count;
}

export function buyUpgrade(S, id) {
  const upg = UPGRADE_BY_ID[id];
  if (!upg || S.upgrades.includes(id) || !meetsReq(S, upg.req) || S.cargo < upg.cost) return false;
  S.cargo -= upg.cost;
  S.upgrades.push(id);
  return true;
}

export function buySpikeUpgrade(S, id) {
  const upg = SPIKE_BY_ID[id];
  if (!upg || S.spikeUpgrades.includes(id) || S.spikes < upg.cost) return false;
  S.spikes -= upg.cost;
  S.spikeUpgrades.push(id);
  return true;
}

export function haul(S, stats) {
  S.hauls += 1;
  addCargo(S, stats.haulValue);
  return stats.haulValue;
}

// ---------------------------------------------------------------------------
// Regauge (prestige)
// ---------------------------------------------------------------------------

export function potentialSpikes(S) {
  return Math.floor(Math.sqrt(Math.max(0, S.totalEarned) / REGAUGE_DIVISOR));
}

export function spikeGain(S) {
  return Math.max(0, potentialSpikes(S) - S.totalSpikes);
}

/** All-time cargo needed before the next spike becomes available. */
export function nextSpikeAt(S) {
  const n = Math.max(potentialSpikes(S), S.totalSpikes) + 1;
  return n * n * REGAUGE_DIVISOR;
}

export function doRegauge(S, freshState) {
  const gain = spikeGain(S);
  if (gain < 1) return null;

  const carried = freshState({
    spikes: S.spikes + gain,
    totalSpikes: S.totalSpikes + gain,
    spikeUpgrades: S.spikeUpgrades,
    achievements: S.achievements,
    regauges: S.regauges + 1,
    hauls: S.hauls,
    parcels: S.parcels,
    playTime: S.playTime,
    bestPerSec: S.bestPerSec,
    offlineVisits: S.offlineVisits,
    startedAt: S.startedAt,
    seenGens: S.seenGens,
    bgOn: S.bgOn,
    soundOn: S.soundOn,
  });

  // Advance Funding opens the new railway with something already running.
  const stats = computeStats(carried);
  if (stats.headStart) {
    carried.cargo = stats.headStart.cargo || 0;
    for (const [id, n] of Object.entries(stats.headStart.gens || {})) {
      carried.gens[id] = (carried.gens[id] || 0) + n;
    }
  }
  carried.totalEarned = S.totalEarned;
  refreshVisibleGens(carried);
  return { state: carried, gain };
}

// ---------------------------------------------------------------------------
// Express parcels
// ---------------------------------------------------------------------------

export function nextParcelDelay(stats, random = Math.random) {
  const base = 95_000 + random() * 115_000;
  return base / Math.max(0.1, stats.parcelFreq);
}

export function parcelLifetime(stats) {
  return 13_000 * stats.parcelDur;
}

export function rollBuff(random = Math.random) {
  const entries = Object.entries(BUFFS);
  const total = entries.reduce((sum, [, b]) => sum + b.weight, 0);
  let roll = random() * total;
  for (const [type, buff] of entries) {
    roll -= buff.weight;
    if (roll <= 0) return type;
  }
  return entries[0][0];
}

/** Applies a caught parcel. Returns { type, buff, instant }. */
export function applyBuff(S, type, stats) {
  const buff = BUFFS[type];
  S.parcels += 1;
  if (type === "windfall") {
    const instant = Math.max(stats.perSec * 900, S.cargo * 0.15, stats.haulValue * 25);
    addCargo(S, instant);
    return { type, buff, instant };
  }
  S.buff = { type, endsAt: Date.now() + buff.duration * 1000 };
  return { type, buff, instant: 0 };
}

export function buffRemaining(S) {
  if (!S.buff) return 0;
  return Math.max(0, (S.buff.endsAt - Date.now()) / 1000);
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

export function tick(S, dt, stats) {
  addCargo(S, stats.perSec * dt);
  S.playTime += dt;
  S.runTime += dt;
  if (stats.perSec > S.bestPerSec) S.bestPerSec = stats.perSec;
  if (S.buff && S.buff.endsAt <= Date.now()) S.buff = null;
}

/** Returns newly unlocked milestones (and records them). */
export function checkAchievements(S, stats) {
  const got = new Set(S.achievements);
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (got.has(a.id)) continue;
    let ok = false;
    try {
      ok = a.check(S, stats);
    } catch {
      ok = false;
    }
    if (ok) {
      S.achievements.push(a.id);
      fresh.push(a);
    }
  }
  return fresh;
}

/** Cargo moved while the tab was closed. */
export function applyOffline(S, stats, elapsedSeconds) {
  const cap = stats.offlineHours * 3600;
  const seconds = Math.min(Math.max(0, elapsedSeconds), cap);
  if (seconds < 30 || stats.perSec <= 0) return 0;
  const gained = stats.perSec * seconds * stats.offlineRate;
  addCargo(S, gained);
  S.offlineVisits += 1;
  return gained;
}
