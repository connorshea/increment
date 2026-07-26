import { GENERATORS } from "./data.js";

export const SAVE_KEY = "railhead.save.v1";
export const SAVE_VERSION = 1;

export function freshState(carry = {}) {
  const now = Date.now();
  return {
    v: SAVE_VERSION,
    cargo: 0,
    runEarned: 0,
    totalEarned: 0,
    gens: Object.fromEntries(GENERATORS.map((g) => [g.id, 0])),
    upgrades: [],

    // Everything below survives a regauge.
    spikes: carry.spikes ?? 0,
    totalSpikes: carry.totalSpikes ?? 0,
    spikeUpgrades: carry.spikeUpgrades ?? [],
    achievements: carry.achievements ?? [],
    regauges: carry.regauges ?? 0,
    hauls: carry.hauls ?? 0,
    parcels: carry.parcels ?? 0,
    playTime: carry.playTime ?? 0,
    bestPerSec: carry.bestPerSec ?? 0,
    offlineVisits: carry.offlineVisits ?? 0,
    seenGens: carry.seenGens ?? [GENERATORS[0].id],
    startedAt: carry.startedAt ?? now,

    runTime: 0,
    runStartedAt: now,
    buff: null,
    nextParcel: now + 60_000,
    lastSaved: now,
    bgOn: carry.bgOn ?? true,
    soundOn: carry.soundOn ?? true,
    conductorOn: carry.conductorOn ?? true,
    superconductorOn: carry.superconductorOn ?? true,
  };
}

/** Fill in anything a save from an older build is missing. */
export function normalize(raw) {
  const base = freshState();
  const S = { ...base, ...raw };
  S.gens = { ...base.gens, ...raw.gens };
  for (const key of ["upgrades", "spikeUpgrades", "achievements", "seenGens"]) {
    if (!Array.isArray(S[key])) S[key] = [];
  }
  for (const key of [
    "cargo",
    "runEarned",
    "totalEarned",
    "spikes",
    "totalSpikes",
    "regauges",
    "hauls",
    "parcels",
    "playTime",
    "runTime",
    "bestPerSec",
    "offlineVisits",
  ]) {
    S[key] = Number.isFinite(S[key]) ? S[key] : 0;
  }
  for (const g of GENERATORS) {
    S.gens[g.id] = Number.isFinite(S.gens[g.id]) ? Math.max(0, Math.floor(S.gens[g.id])) : 0;
  }
  if (S.buff && (!S.buff.endsAt || S.buff.endsAt < Date.now())) S.buff = null;
  return S;
}

export function save(S) {
  S.lastSaved = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(S));
    return true;
  } catch (err) {
    console.warn("Could not save:", err);
    return false;
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch (err) {
    console.warn("Could not read save:", err);
    return null;
  }
}

export function wipe() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    console.warn("Could not wipe save:", err);
  }
}

/** Save data as a paste-able string. */
export function encodeSave(S) {
  const bytes = new TextEncoder().encode(JSON.stringify(S));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeSave(text) {
  const json = new TextDecoder().decode(Uint8Array.from(atob(text.trim()), (c) => c.charCodeAt(0)));
  return normalize(JSON.parse(json));
}
