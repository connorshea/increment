import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  BUFFS,
  GENERATORS,
  GEN_BY_ID,
  RUSH_BASE,
  SPIKE_BY_ID,
  SPIKE_UPGRADES,
  STEAM_BASE,
  UPGRADES,
  UPGRADE_BY_ID,
} from "../js/data.js";

// Content is hand-written, so these guard against the typos that hand-writing
// invites: a duplicate id, a rate that goes backwards, an effect aimed at a
// generator that does not exist, an effect kind the engine has never heard of.

/** Every `k` engine.js's computeStats() switch knows how to apply. */
const KNOWN_EFFECT_KINDS = new Set([
  "gen",
  "all",
  "click",
  "haulRate",
  "genPer",
  "parcelFreq",
  "parcelDur",
  "steam",
  "spikePower",
  "offline",
  "headStart",
  "conductor",
  "superconductor",
]);

const ALL_EFFECTS = [...UPGRADES, ...SPIKE_UPGRADES].flatMap((u) => u.effects);

describe("generators", () => {
  it("have unique ids and are indexed by them", () => {
    expect(new Set(GENERATORS.map((g) => g.id)).size).toBe(GENERATORS.length);
    for (const g of GENERATORS) expect(GEN_BY_ID[g.id]).toBe(g);
  });

  it("are fully described", () => {
    for (const g of GENERATORS) {
      expect(g.name, g.id).toBeTruthy();
      expect(g.icon, g.id).toBeTruthy();
      expect(g.blurb, g.id).toBeTruthy();
      expect(g.base, g.id).toBeGreaterThan(0);
      expect(g.rate, g.id).toBeGreaterThan(0);
    }
  });

  it("climb in both price and output, so the ladder never goes backwards", () => {
    for (let i = 1; i < GENERATORS.length; i++) {
      expect(GENERATORS[i].base, GENERATORS[i].id).toBeGreaterThan(GENERATORS[i - 1].base);
      expect(GENERATORS[i].rate, GENERATORS[i].id).toBeGreaterThan(GENERATORS[i - 1].rate);
    }
  });

  it("keep the pace between tiers even, so no one step is a wall", () => {
    for (let i = 1; i < GENERATORS.length; i++) {
      const costStep = GENERATORS[i].base / GENERATORS[i - 1].base;
      const rateStep = GENERATORS[i].rate / GENERATORS[i - 1].rate;
      expect(costStep, `${GENERATORS[i].id} cost step`).toBeLessThan(4);
      // Each tier must earn its price: output has to climb at least as fast.
      expect(rateStep, `${GENERATORS[i].id} pays for itself`).toBeGreaterThan(costStep * 0.95);
    }
  });
});

describe("works", () => {
  it("have unique ids and are indexed by them", () => {
    expect(new Set(UPGRADES.map((u) => u.id)).size).toBe(UPGRADES.length);
    for (const u of UPGRADES) expect(UPGRADE_BY_ID[u.id]).toBe(u);
  });

  it("are fully described and cost something", () => {
    for (const u of UPGRADES) {
      expect(u.name, u.id).toBeTruthy();
      expect(u.icon, u.id).toBeTruthy();
      expect(u.desc, u.id).toBeTruthy();
      expect(u.cost, u.id).toBeGreaterThan(0);
      expect(u.effects.length, u.id).toBeGreaterThan(0);
    }
  });

  it("gate themselves on things that exist", () => {
    for (const u of UPGRADES) {
      if (u.req?.gen !== undefined) {
        expect(GEN_BY_ID[u.req.gen], `${u.id} requires ${u.req.gen}`).toBeDefined();
        expect(u.req.owned, u.id).toBeGreaterThan(0);
      }
    }
  });
});

describe("spike upgrades", () => {
  it("have unique ids and are indexed by them", () => {
    expect(new Set(SPIKE_UPGRADES.map((u) => u.id)).size).toBe(SPIKE_UPGRADES.length);
    for (const u of SPIKE_UPGRADES) expect(SPIKE_BY_ID[u.id]).toBe(u);
  });

  it("are listed cheapest first, and cost whole spikes", () => {
    const costs = SPIKE_UPGRADES.map((u) => u.cost);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
    for (const u of SPIKE_UPGRADES) {
      expect(Number.isInteger(u.cost), u.id).toBe(true);
      expect(u.cost, u.id).toBeGreaterThan(0);
    }
  });

  it("include the conductor at five spikes", () => {
    expect(SPIKE_BY_ID.sp_conductor).toBeDefined();
    expect(SPIKE_BY_ID.sp_conductor.cost).toBe(5);
    expect(SPIKE_BY_ID.sp_conductor.effects).toEqual([{ k: "conductor" }]);
  });
});

describe("effects", () => {
  it("only use kinds the engine knows how to apply", () => {
    for (const e of ALL_EFFECTS) expect(KNOWN_EFFECT_KINDS, e.k).toContain(e.k);
  });

  it("point at generators that exist", () => {
    for (const e of ALL_EFFECTS) {
      if (e.target !== undefined) expect(GEN_BY_ID[e.target], e.target).toBeDefined();
      if (e.source !== undefined) expect(GEN_BY_ID[e.source], e.source).toBeDefined();
    }
  });

  it("are worth having: every multiplier is an improvement", () => {
    for (const e of ALL_EFFECTS) {
      if (e.mult !== undefined) expect(e.mult, e.k).toBeGreaterThan(1);
      if (e.pct !== undefined) expect(e.pct, e.k).toBeGreaterThan(0);
      if (e.add !== undefined) expect(e.add, e.k).toBeGreaterThan(0);
    }
  });

  it("start every railway with generators that exist, if they start it at all", () => {
    for (const e of ALL_EFFECTS) {
      if (e.k !== "headStart") continue;
      for (const id of Object.keys(e.gens || {})) expect(GEN_BY_ID[id], id).toBeDefined();
    }
  });
});

describe("buffs", () => {
  it("are weighted, and named", () => {
    for (const [type, b] of Object.entries(BUFFS)) {
      expect(b.name, type).toBeTruthy();
      expect(b.icon, type).toBeTruthy();
      expect(b.toast, type).toBeTruthy();
      expect(b.weight, type).toBeGreaterThan(0);
      expect(b.duration, type).toBeGreaterThanOrEqual(0);
    }
  });

  it("give the timed buffs a duration and the windfall none", () => {
    expect(BUFFS.steam.duration).toBeGreaterThan(0);
    expect(BUFFS.rush.duration).toBeGreaterThan(0);
    expect(BUFFS.windfall.duration).toBe(0);
  });

  it("are worth catching", () => {
    expect(STEAM_BASE).toBeGreaterThan(1);
    expect(RUSH_BASE).toBeGreaterThan(1);
  });
});

describe("milestones", () => {
  it("have unique ids and are fully described", () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.name, a.id).toBeTruthy();
      expect(a.icon, a.id).toBeTruthy();
      expect(a.desc, a.id).toBeTruthy();
      expect(typeof a.check, a.id).toBe("function");
    }
  });

  it("are all unmet on a brand new railway", () => {
    const fresh = {
      gens: {},
      upgrades: [],
      spikeUpgrades: [],
      achievements: [],
      cargo: 0,
      totalEarned: 0,
      runEarned: 0,
      hauls: 0,
      parcels: 0,
      regauges: 0,
      spikes: 0,
      totalSpikes: 0,
      playTime: 0,
      runTime: 0,
      bestPerSec: 0,
      offlineVisits: 0,
    };
    const stats = { perSec: 0, haulValue: 1, allMult: 1 };
    for (const a of ACHIEVEMENTS) expect(a.check(fresh, stats), a.id).toBeFalsy();
  });
});
