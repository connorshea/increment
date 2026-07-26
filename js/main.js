import { BUFFS } from "./data.js";
import {
  applyBuff,
  applyOffline,
  buyAllUpgrades,
  buyGenerator,
  buySpikeUpgrade,
  buyUpgrade,
  checkAchievements,
  computeStats,
  conductorBuy,
  doRegauge,
  haul,
  nextParcelDelay,
  parcelLifetime,
  refreshVisibleGens,
  rollBuff,
  tick,
} from "./engine.js";
import { fmt, fmtTime } from "./format.js";
import { createAudio } from "./audio.js";
import { createBackground } from "./background.js";
import { decodeSave, encodeSave, freshState, load, save, wipe } from "./state.js";
import { initUI } from "./ui.js";

const AUTOSAVE_MS = 20_000;
const RENDER_MS = 66; // ~15fps for the DOM; the simulation itself runs every frame
const PARCELS_AFTER = 500; // no express parcels until the railway is actually moving
const CONDUCTOR_MS = 1500; // how often the conductor signs off one more work

let S = load() || freshState();
refreshVisibleGens(S);

let stats = computeStats(S);
let parcelActive = null;

const background = createBackground(document.getElementById("bg"));
background.start();
background.setEnabled(S.bgOn !== false);

const audio = createAudio();
audio.setEnabled(S.soundOn !== false);

// Browsers won't let a page make noise until it's been interacted with.
function unlockAudio() {
  audio.unlock();
  window.removeEventListener("pointerdown", unlockAudio);
  window.removeEventListener("keydown", unlockAudio);
}
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);

const ui = initUI({
  onHaul: handleHaul,
  onBuyGen: (id, amount) => {
    if (buyGenerator(S, id, amount) > 0) {
      audio.sfx("buy");
      refresh();
    }
  },
  onBuyUpgrade: (id) => {
    if (buyUpgrade(S, id)) {
      audio.sfx("buy");
      ui.forceRefreshLists();
      refresh();
    }
  },
  onBuyAllUpgrades: () => {
    const n = buyAllUpgrades(S);
    if (n > 0) {
      audio.sfx("buy");
      ui.forceRefreshLists();
      refresh();
      ui.toast(`${n} work${n === 1 ? "" : "s"} signed off.`);
    }
  },
  onToggleConductor: () => {
    S.conductorOn = S.conductorOn === false;
    ui.toast(
      S.conductorOn
        ? "🎩 The conductor is back on the platform."
        : "🎩 The conductor stands down. Works are yours to buy.",
    );
  },
  onBuySpike: (id) => {
    if (buySpikeUpgrade(S, id)) {
      audio.sfx("spike");
      ui.toast("Spike driven. The whole railway feels it.");
      refresh();
    }
  },
  onRegauge: handleRegauge,
  onSave: (manual) => {
    const ok = save(S);
    ui.setSaveStatus(ok ? `saved ${new Date().toLocaleTimeString()}` : "save failed");
    if (manual) ui.toast(ok ? "Saved." : "Could not save — is storage blocked?");
  },
  onExport: handleExport,
  onImport: handleImport,
  onWipe: handleWipe,
  onToggleBg: () => {
    S.bgOn = !S.bgOn;
    background.setEnabled(S.bgOn);
  },
  onToggleSound: () => {
    S.soundOn = !S.soundOn;
    audio.setEnabled(S.soundOn);
  },
  onTabChange: () => refresh(),
});

// ---------------------------------------------------------------------------
// Progress made while the tab was closed
// ---------------------------------------------------------------------------

const away = (Date.now() - (S.lastSaved || Date.now())) / 1000;
const offlineGain = applyOffline(S, stats, away);
if (offlineGain > 0) {
  ui.toast(
    `You were away ${fmtTime(Math.min(away, stats.offlineHours * 3600))} — ` +
      `the railway moved ${fmt(offlineGain)} cargo without you.`,
  );
}
// Reloading shouldn't wipe out a parcel you were nearly owed, or hand you one
// the instant the page opens.
S.nextParcel = Math.max(
  Date.now() + 15_000,
  Math.min(S.nextParcel || 0, Date.now() + nextParcelDelay(stats)),
);

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function handleHaul(ev) {
  const gained = haul(S, stats);
  audio.sfx("haul");
  ui.pressLoader();
  ui.floatNumber(ev.clientX, ev.clientY - 14, `+${fmt(gained)}`, S.buff?.type === "rush");
  refresh();
}

function handleRegauge() {
  const result = doRegauge(S, freshState);
  if (!result) return;
  const totalAfter = S.totalSpikes + result.gain;
  const ok = window.confirm(
    "Tear up the network and lay it again?\n\n" +
      `You drive ${result.gain} golden spike${result.gain === 1 ? "" : "s"} ` +
      `(${fmt(totalAfter)} in total, worth ` +
      `${Math.round(totalAfter * stats.spikePower * 100)}% faster running, forever).\n\n` +
      "You lose your cargo, all your rolling stock, and the works you built on this line. " +
      "Spike upgrades and milestones stay.",
  );
  if (!ok) return;

  audio.sfx("regauge");
  S = result.state;
  parcelActive?.();
  parcelActive = null;
  S.nextParcel = Date.now() + 45_000;
  ui.forceRefreshLists();
  refresh();
  save(S);
  ui.toast(
    `Regauged! ${result.gain} golden spike${result.gain === 1 ? "" : "s"} carried to the new line. 🔩`,
    true,
  );
}

function handleExport() {
  save(S);
  openModal({
    title: "Export save",
    copy: "Copy this somewhere safe. Paste it into Import to bring your railway back.",
    value: encodeSave(S),
    okLabel: null,
  });
  document.getElementById("modal-text").select();
}

function handleImport() {
  openModal({
    title: "Import save",
    copy: "Paste an exported save here. This replaces the railway you are running now.",
    value: "",
    okLabel: "Load it",
    onOk: (value) => {
      try {
        S = decodeSave(value);
        refreshVisibleGens(S);
        S.nextParcel = Date.now() + 30_000;
        ui.forceRefreshLists();
        refresh();
        save(S);
        ui.toast("Save loaded.");
      } catch {
        ui.toast("That did not look like a save.");
      }
    },
  });
}

function handleWipe() {
  if (!window.confirm("Scrap the whole railway? Spikes, milestones, everything. There is no undo."))
    return;
  wipe();
  S = freshState();
  refreshVisibleGens(S);
  parcelActive?.();
  parcelActive = null;
  S.nextParcel = Date.now() + 60_000;
  ui.forceRefreshLists();
  refresh();
  ui.toast("Scrapped. One handcar again.");
}

// ---------------------------------------------------------------------------
// Express parcels
// ---------------------------------------------------------------------------

function maybeSpawnParcel(now) {
  if (parcelActive || S.totalEarned < PARCELS_AFTER || now < S.nextParcel) return;
  S.nextParcel = now + nextParcelDelay(stats);
  const dismiss = ui.spawnParcel(parcelLifetime(stats), catchParcel);
  parcelActive = () => {
    dismiss();
    parcelActive = null;
  };
}

function catchParcel() {
  parcelActive = null;
  const type = rollBuff();
  const result = applyBuff(S, type, stats);
  const buff = BUFFS[type];
  audio.sfx("parcel");
  ui.toast(
    type === "windfall"
      ? `${buff.icon} ${buff.toast} +${fmt(result.instant)} cargo.`
      : `${buff.icon} ${buff.toast} (${buff.duration}s)`,
    true,
  );
  refresh();
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

function refresh() {
  stats = computeStats(S);
}

let lastFrame = performance.now();
let lastRender = 0;
let lastSaveAt = performance.now();
let lastConductorAt = performance.now();

function loop(now) {
  const dt = Math.min((now - lastFrame) / 1000, 1);
  lastFrame = now;

  stats = computeStats(S);
  tick(S, dt, stats);

  const unlocked = checkAchievements(S, stats);
  if (unlocked.length) {
    stats = computeStats(S);
    audio.sfx("milestone");
    for (const ach of unlocked) ui.toast(`${ach.icon} Milestone: ${ach.name}`);
  }

  if (now - lastConductorAt > CONDUCTOR_MS) {
    lastConductorAt = now;
    const signed = conductorBuy(S, stats);
    if (signed) {
      audio.sfx("buy");
      ui.forceRefreshLists();
      refresh();
      ui.toast(`🎩 ${signed.icon} ${signed.name} — signed off by the conductor.`);
    }
  }

  maybeSpawnParcel(Date.now());

  if (now - lastRender > RENDER_MS) {
    lastRender = now;
    ui.render(S, stats);
    const busyness = Math.log10(1 + stats.perSec) / 12;
    // The map reaches further the more you have actually built.
    const stock = Object.values(S.gens).reduce((a, b) => a + b, 0);
    background.update({
      growth: S.upgrades.length + Math.min(14, stock / 4),
      busy: busyness,
      regauges: S.regauges,
    });
    audio.setIntensity(busyness);
  }

  if (now - lastSaveAt > AUTOSAVE_MS) {
    lastSaveAt = now;
    if (save(S)) ui.setSaveStatus(`saved ${new Date().toLocaleTimeString()}`);
  }

  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// Modal helper
// ---------------------------------------------------------------------------

function openModal({ title, copy, value, okLabel, onOk }) {
  const modal = document.getElementById("modal");
  const text = document.getElementById("modal-text");
  const okBtn = document.getElementById("modal-ok");
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-copy").textContent = copy;
  text.value = value;
  okBtn.hidden = !okLabel;
  if (okLabel) okBtn.textContent = okLabel;

  const cleanup = () => {
    okBtn.removeEventListener("click", ok);
    modal.close();
  };
  const ok = () => {
    const v = text.value;
    cleanup();
    onOk?.(v);
  };
  okBtn.addEventListener("click", ok);
  document.getElementById("modal-cancel").onclick = cleanup;
  modal.showModal();
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

window.addEventListener("pagehide", () => save(S));
document.addEventListener("visibilitychange", () => {
  audio.setActive(!document.hidden);
  if (document.hidden) save(S);
});

refresh();
ui.render(S, stats);
requestAnimationFrame(loop);

if (S.totalEarned === 0) {
  ui.toast("Push the handcar. Everything starts there.");
  ui.toast("Hold the button down and it keeps loading on its own.");
}
