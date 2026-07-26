import { beforeEach, describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  COST_GROWTH,
  GENERATORS,
  GEN_BY_ID,
  RUSH_BASE,
  STEAM_BASE,
  UPGRADE_BY_ID,
} from "../js/data.js";
import {
  BASE_HAUL,
  REGAUGE_DIVISOR,
  addCargo,
  applyBuff,
  applyOffline,
  availableUpgrades,
  buffRemaining,
  buyAllUpgrades,
  buyGenerator,
  buySpikeUpgrade,
  buyUpgrade,
  checkAchievements,
  computeStats,
  conductorBuy,
  doRegauge,
  genCost,
  haul,
  maxAffordable,
  meetsReq,
  nextParcelDelay,
  nextSpikeAt,
  parcelLifetime,
  potentialSpikes,
  refreshVisibleGens,
  rollBuff,
  spikeGain,
  tick,
} from "../js/engine.js";
import { freshState } from "../js/state.js";

let S;
beforeEach(() => {
  S = freshState();
});

// ---------------------------------------------------------------------------

describe("genCost", () => {
  const handcar = GEN_BY_ID.handcar;

  it("starts at the base price and grows 15% per unit owned", () => {
    expect(genCost(handcar, 0)).toBeCloseTo(15, 9);
    expect(genCost(handcar, 1)).toBeCloseTo(15 * COST_GROWTH, 9);
    expect(genCost(handcar, 10)).toBeCloseTo(15 * COST_GROWTH ** 10, 9);
  });

  it("bulk price is the sum of the individual prices", () => {
    const byHand = genCost(handcar, 7) + genCost(handcar, 8) + genCost(handcar, 9);
    expect(genCost(handcar, 7, 3)).toBeCloseTo(byHand, 6);
  });
});

describe("maxAffordable", () => {
  const handcar = GEN_BY_ID.handcar;

  it("is zero when you cannot even afford one", () => {
    expect(maxAffordable(handcar, 0, 14.99)).toBe(0);
    expect(maxAffordable(handcar, 3, 15)).toBe(0); // the 4th handcar costs more
    expect(genCost(handcar, 3, 0)).toBe(0); // ...and nothing costs nothing
  });

  it("never quotes more than the money actually covers", () => {
    for (const money of [15, 100, 1000, 12_345, 9.9e6]) {
      const n = maxAffordable(handcar, 3, money);
      expect(genCost(handcar, 3, n)).toBeLessThanOrEqual(money + 1e-6);
      // ...and it is genuinely the *most* you can afford.
      expect(genCost(handcar, 3, n + 1)).toBeGreaterThan(money);
    }
  });
});

describe("meetsReq", () => {
  it("passes when there is no requirement at all", () => {
    expect(meetsReq(S, undefined)).toBe(true);
    expect(meetsReq(S, null)).toBe(true);
  });

  it("checks each kind of gate", () => {
    expect(meetsReq(S, { gen: "handcar", owned: 5 })).toBe(false);
    S.gens.handcar = 5;
    expect(meetsReq(S, { gen: "handcar", owned: 5 })).toBe(true);

    expect(meetsReq(S, { total: 1000 })).toBe(false);
    S.totalEarned = 1000;
    expect(meetsReq(S, { total: 1000 })).toBe(true);

    S.hauls = 10;
    S.parcels = 2;
    S.regauges = 1;
    expect(meetsReq(S, { hauls: 10, parcels: 2, regauges: 1 })).toBe(true);
    expect(meetsReq(S, { hauls: 11 })).toBe(false);
  });

  it("fails if any one gate of several is unmet", () => {
    S.gens.handcar = 50;
    expect(meetsReq(S, { gen: "handcar", owned: 25, total: 1e9 })).toBe(false);
  });
});

describe("refreshVisibleGens", () => {
  it("starts with only the handcar on the roster", () => {
    expect(refreshVisibleGens(S)).toEqual(["handcar"]);
  });

  it("reveals exactly one step ahead of what you own", () => {
    S.gens.handcar = 1;
    expect(refreshVisibleGens(S)).toEqual(["handcar", "shunter"]);
    S.gens.shunter = 1;
    expect(refreshVisibleGens(S)).toEqual(["handcar", "shunter", "wagon"]);
  });

  it("keeps things revealed after they are sold off by a regauge", () => {
    S.gens.handcar = 1;
    refreshVisibleGens(S);
    S.gens.handcar = 0;
    expect(refreshVisibleGens(S)).toContain("shunter");
  });

  it("returns the roster in ladder order, not discovery order", () => {
    S.seenGens = ["wagon", "handcar"];
    S.gens.handcar = 1;
    const order = refreshVisibleGens(S);
    expect(order).toEqual(GENERATORS.filter((g) => order.includes(g.id)).map((g) => g.id));
  });
});

describe("availableUpgrades", () => {
  it("hides anything whose requirement is unmet", () => {
    expect(availableUpgrades(S)).toEqual([]);
  });

  it("shows unlocked, unbought works cheapest first", () => {
    S.hauls = 1000;
    S.totalEarned = 1e9;
    S.gens.handcar = 200;
    const list = availableUpgrades(S);
    expect(list.length).toBeGreaterThan(0);
    const costs = list.map((u) => u.cost);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });

  it("drops a work once it is bought", () => {
    S.hauls = 10;
    const first = availableUpgrades(S)[0];
    expect(first).toBeDefined();
    S.upgrades.push(first.id);
    expect(availableUpgrades(S).map((u) => u.id)).not.toContain(first.id);
  });
});

// ---------------------------------------------------------------------------

describe("computeStats", () => {
  it("produces nothing per second on a fresh railway", () => {
    const stats = computeStats(S);
    expect(stats.perSec).toBe(0);
    expect(stats.haulValue).toBe(BASE_HAUL);
  });

  it("sums each generator's rate times its count", () => {
    S.gens.handcar = 10;
    S.gens.shunter = 4;
    const stats = computeStats(S);
    expect(stats.perSec).toBeCloseTo(10 * 0.1 + 4 * 0.33, 9);
    expect(stats.perGen.handcar.total).toBeCloseTo(1, 9);
  });

  it("applies a `gen` effect only to its own line", () => {
    S.gens.handcar = 10;
    S.gens.shunter = 10;
    const before = computeStats(S);
    S.upgrades.push(
      Object.values(UPGRADE_BY_ID).find(
        (u) =>
          u.effects.length === 1 && u.effects[0].k === "gen" && u.effects[0].target === "handcar",
      ).id,
    );
    const after = computeStats(S);
    expect(after.perGen.handcar.each).toBeGreaterThan(before.perGen.handcar.each);
    expect(after.perGen.shunter.each).toBe(before.perGen.shunter.each);
  });

  it("stacks `all` multipliers across works and spikes", () => {
    S.gens.handcar = 10;
    S.spikeUpgrades.push("sp_survey"); // everything ×1.25
    expect(computeStats(S).allMult).toBeCloseTo(1.25, 9);
  });

  it("counts milestones at +1% each and spikes at +5% each", () => {
    S.achievements = ["a", "b", "c"];
    S.totalSpikes = 4;
    const stats = computeStats(S);
    expect(stats.milestoneBonus).toBeCloseTo(0.03, 9);
    expect(stats.spikeBonus).toBeCloseTo(0.2, 9);
    expect(stats.allMult).toBeCloseTo(1.23, 9);
  });

  it("lets Driven Deep double what every spike is worth", () => {
    S.totalSpikes = 10;
    expect(computeStats(S).spikePower).toBeCloseTo(0.05, 9);
    S.spikeUpgrades.push("sp_driven");
    const stats = computeStats(S);
    expect(stats.spikePower).toBeCloseTo(0.1, 9);
    expect(stats.spikeBonus).toBeCloseTo(1.0, 9);
  });

  it("scales a synergy by the number of source generators owned", () => {
    const synergy = Object.values(UPGRADE_BY_ID).find((u) => u.effects[0].k === "genPer");
    const { target, source, pct } = synergy.effects[0];
    S.gens[target] = 1;
    S.gens[source] = 20;
    const plain = computeStats(S).perGen[target].each;
    S.upgrades.push(synergy.id);
    expect(computeStats(S).perGen[target].each).toBeCloseTo(plain * (1 + pct * 20), 9);
  });

  it("makes hauls worth a share of per-second output", () => {
    S.gens.wagon = 100;
    S.spikeUpgrades.push("sp_pneumatic"); // +15% of per-second, per haul
    const stats = computeStats(S);
    expect(stats.haulRatePct).toBeCloseTo(0.15, 9);
    expect(stats.haulValue).toBeCloseTo(BASE_HAUL * stats.allMult + stats.perSec * 0.15, 6);
  });

  it("applies Full Steam to output and Rush Hour only to hauls", () => {
    S.gens.handcar = 100;
    const plain = computeStats(S);

    S.buff = { type: "steam", endsAt: Date.now() + 30_000 };
    const steam = computeStats(S);
    expect(steam.buffMult).toBe(STEAM_BASE);
    expect(steam.perSec).toBeCloseTo(plain.perSec * STEAM_BASE, 9);

    S.buff = { type: "rush", endsAt: Date.now() + 30_000 };
    const rush = computeStats(S);
    expect(rush.perSec).toBeCloseTo(plain.perSec, 9); // rush does not touch output
    expect(rush.haulValue).toBeCloseTo(plain.haulValue * RUSH_BASE, 9);
  });

  it("reports away-progress terms, which only ever improve", () => {
    expect(computeStats(S).offlineHours).toBe(8);
    expect(computeStats(S).offlineRate).toBe(0.5);
    S.spikeUpgrades.push("sp_night");
    expect(computeStats(S).offlineHours).toBe(24);
    expect(computeStats(S).offlineRate).toBe(0.85);
  });

  it("flags the conductor only once it has been hired", () => {
    expect(computeStats(S).conductor).toBe(false);
    S.spikeUpgrades.push("sp_conductor");
    expect(computeStats(S).conductor).toBe(true);
  });

  it("ignores upgrade ids a save may carry that no longer exist", () => {
    S.upgrades.push("upgrade_from_a_future_build");
    S.spikeUpgrades.push("sp_nonsense");
    expect(() => computeStats(S)).not.toThrow();
    expect(computeStats(S).allMult).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe("buying", () => {
  it("buys generators, charges for them, and reveals the next tier", () => {
    S.cargo = 100;
    expect(buyGenerator(S, "handcar", 1)).toBe(1);
    expect(S.gens.handcar).toBe(1);
    expect(S.cargo).toBeCloseTo(85, 9);
    expect(S.seenGens).toContain("shunter");
  });

  it("refuses a purchase it cannot pay for, and changes nothing", () => {
    S.cargo = 14;
    expect(buyGenerator(S, "handcar", 1)).toBe(0);
    expect(S.gens.handcar).toBe(0);
    expect(S.cargo).toBe(14);
  });

  it("buys in bulk, all-or-nothing", () => {
    S.cargo = genCost(GEN_BY_ID.handcar, 0, 10);
    expect(buyGenerator(S, "handcar", 10)).toBe(10);
    expect(S.cargo).toBeCloseTo(0, 6);

    S.cargo = 20;
    expect(buyGenerator(S, "handcar", 10)).toBe(0); // cannot afford all ten
    expect(S.gens.handcar).toBe(10);
  });

  it('"max" takes everything the cargo covers', () => {
    S.cargo = 1000;
    const n = buyGenerator(S, "handcar", "max");
    expect(n).toBeGreaterThan(0);
    expect(S.gens.handcar).toBe(n);
    expect(S.cargo).toBeGreaterThanOrEqual(0);
    expect(buyGenerator(S, "handcar", 1)).toBe(0); // nothing left over
  });

  it("ignores an unknown generator", () => {
    S.cargo = 1e9;
    expect(buyGenerator(S, "hovertrain", 1)).toBe(0);
  });

  it("buys a work once, and only when unlocked and affordable", () => {
    S.hauls = 10;
    const upg = availableUpgrades(S)[0];

    S.cargo = upg.cost - 1;
    expect(buyUpgrade(S, upg.id)).toBe(false);

    S.cargo = upg.cost;
    expect(buyUpgrade(S, upg.id)).toBe(true);
    expect(S.cargo).toBeCloseTo(0, 9);
    expect(S.upgrades).toEqual([upg.id]);

    S.cargo = 1e9;
    expect(buyUpgrade(S, upg.id)).toBe(false); // no buying it twice
  });

  it("will not sell a work whose requirement is unmet", () => {
    S.cargo = 1e12;
    const gated = Object.values(UPGRADE_BY_ID).find((u) => u.req?.regauges >= 3);
    expect(buyUpgrade(S, gated.id)).toBe(false);
  });

  it("buys spike upgrades with spikes, not cargo", () => {
    S.cargo = 1e12;
    expect(buySpikeUpgrade(S, "sp_survey")).toBe(false);
    S.spikes = 1;
    expect(buySpikeUpgrade(S, "sp_survey")).toBe(true);
    expect(S.spikes).toBe(0);
    expect(S.cargo).toBe(1e12);
    S.spikes = 10;
    expect(buySpikeUpgrade(S, "sp_survey")).toBe(false); // already driven
  });
});

describe("buyAllUpgrades", () => {
  beforeEach(() => {
    S.hauls = 1000;
    S.parcels = 50;
    S.totalEarned = 1e9;
    for (const g of GENERATORS) S.gens[g.id] = 200;
  });

  it("does nothing when nothing is affordable", () => {
    S.cargo = 0;
    expect(buyAllUpgrades(S)).toBe(0);
    expect(S.upgrades).toEqual([]);
  });

  it("takes everything the cargo covers and stops", () => {
    S.cargo = 1e6;
    const bought = buyAllUpgrades(S);
    expect(bought).toBeGreaterThan(0);
    expect(S.upgrades).toHaveLength(bought);
    expect(S.cargo).toBeGreaterThanOrEqual(0);
    // Nothing affordable can be left behind.
    expect(availableUpgrades(S).filter((u) => u.cost <= S.cargo)).toEqual([]);
  });

  it("empties the board when cargo is no object", () => {
    S.cargo = Number.MAX_SAFE_INTEGER;
    buyAllUpgrades(S);
    expect(availableUpgrades(S)).toEqual([]);
  });

  it("spends cheapest-first, so it buys the most it can", () => {
    S.cargo = 1e6;
    buyAllUpgrades(S);
    const costs = S.upgrades.map((id) => UPGRADE_BY_ID[id].cost);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });
});

describe("conductorBuy", () => {
  beforeEach(() => {
    S.hauls = 1000;
    S.cargo = 1e6;
    S.spikeUpgrades.push("sp_conductor");
  });

  it("does nothing without the upgrade", () => {
    S.spikeUpgrades = [];
    expect(conductorBuy(S, computeStats(S))).toBeNull();
    expect(S.upgrades).toEqual([]);
  });

  it("does nothing while stood down", () => {
    S.conductorOn = false;
    expect(conductorBuy(S, computeStats(S))).toBeNull();
    expect(S.upgrades).toEqual([]);
  });

  it("signs off exactly one work per call, cheapest first", () => {
    const cheapest = availableUpgrades(S)[0];
    const bought = conductorBuy(S, computeStats(S));
    expect(bought.id).toBe(cheapest.id);
    expect(S.upgrades).toEqual([cheapest.id]);
  });

  it("waits when it cannot afford the cheapest work", () => {
    S.cargo = availableUpgrades(S)[0].cost - 1;
    expect(conductorBuy(S, computeStats(S))).toBeNull();
    expect(S.upgrades).toEqual([]);
  });

  it("stops once the board is clear", () => {
    S.cargo = Number.MAX_SAFE_INTEGER;
    buyAllUpgrades(S);
    expect(conductorBuy(S, computeStats(S))).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("cargo and hauling", () => {
  it("credits the run and the all-time total together", () => {
    addCargo(S, 250);
    expect([S.cargo, S.runEarned, S.totalEarned]).toEqual([250, 250, 250]);
  });

  it("ignores nonsense amounts rather than corrupting the save", () => {
    addCargo(S, -5);
    addCargo(S, NaN);
    expect(S.cargo).toBe(0);
  });

  it("counts the haul and pays out the current haul value", () => {
    const stats = computeStats(S);
    expect(haul(S, stats)).toBe(stats.haulValue);
    expect(S.hauls).toBe(1);
    expect(S.cargo).toBe(stats.haulValue);
  });
});

describe("tick", () => {
  it("pays out per-second output pro-rata and advances the clocks", () => {
    S.gens.handcar = 10; // 1.0/s
    tick(S, 0.5, computeStats(S));
    expect(S.cargo).toBeCloseTo(0.5, 9);
    expect(S.playTime).toBeCloseTo(0.5, 9);
    expect(S.runTime).toBeCloseTo(0.5, 9);
  });

  it("records the best per-second the railway has ever reached", () => {
    S.gens.handcar = 10;
    tick(S, 1, computeStats(S));
    expect(S.bestPerSec).toBeCloseTo(1, 9);
    S.gens.handcar = 1;
    tick(S, 1, computeStats(S));
    expect(S.bestPerSec).toBeCloseTo(1, 9); // a peak, not a current reading
  });

  it("clears a buff the moment it expires", () => {
    S.buff = { type: "steam", endsAt: Date.now() - 1 };
    tick(S, 0.1, computeStats(S));
    expect(S.buff).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("regauging", () => {
  it("earns spikes on the square root of all-time cargo", () => {
    S.totalEarned = 4 * REGAUGE_DIVISOR;
    expect(potentialSpikes(S)).toBe(2);
    expect(spikeGain(S)).toBe(2);
    S.totalSpikes = 2;
    expect(spikeGain(S)).toBe(0); // already banked
  });

  it("quotes the all-time cargo needed for the next spike", () => {
    expect(nextSpikeAt(S)).toBe(REGAUGE_DIVISOR);
    S.totalSpikes = 3;
    expect(nextSpikeAt(S)).toBe(16 * REGAUGE_DIVISOR);
  });

  it("refuses when there is not a whole spike in it yet", () => {
    S.totalEarned = REGAUGE_DIVISOR - 1;
    expect(doRegauge(S, freshState)).toBeNull();
  });

  it("clears the line but carries the permanent things over", () => {
    S.totalEarned = 9 * REGAUGE_DIVISOR;
    S.cargo = 5e8;
    S.gens.handcar = 50;
    S.upgrades.push("shovel");
    S.achievements.push("first_car");
    S.spikeUpgrades.push("sp_survey");
    S.hauls = 400;
    S.runTime = 900;

    const { state: after, gain } = doRegauge(S, freshState);
    expect(gain).toBe(3);

    expect(after.cargo).toBe(0);
    expect(after.gens.handcar).toBe(0);
    expect(after.upgrades).toEqual([]);
    expect(after.runEarned).toBe(0);
    expect(after.runTime).toBe(0);

    expect(after.spikes).toBe(3);
    expect(after.totalSpikes).toBe(3);
    expect(after.spikeUpgrades).toEqual(["sp_survey"]);
    expect(after.achievements).toEqual(["first_car"]);
    expect(after.regauges).toBe(1);
    expect(after.hauls).toBe(400);
    expect(after.totalEarned).toBe(S.totalEarned);
  });

  it("carries the conductor's on/off choice across the rebuild", () => {
    S.totalEarned = REGAUGE_DIVISOR;
    S.conductorOn = false;
    expect(doRegauge(S, freshState).state.conductorOn).toBe(false);
  });

  it("opens the new line with a head start once Advance Funding is driven", () => {
    S.totalEarned = REGAUGE_DIVISOR;
    S.spikeUpgrades.push("sp_funding");
    const { state: after } = doRegauge(S, freshState);
    expect(after.cargo).toBe(10_000);
    expect(after.gens.handcar).toBe(15);
    expect(after.seenGens).toContain("shunter"); // the roster keeps up
  });
});

// ---------------------------------------------------------------------------

describe("express parcels", () => {
  it("shortens the wait as parcel frequency goes up", () => {
    const plain = nextParcelDelay(computeStats(S), () => 0.5);
    S.spikeUpgrades.push("sp_contract"); // ×1.5 as often
    const faster = nextParcelDelay(computeStats(S), () => 0.5);
    expect(faster).toBeCloseTo(plain / 1.5, 6);
  });

  it("stretches how long a parcel waits on the platform", () => {
    const plain = parcelLifetime(computeStats(S));
    S.spikeUpgrades.push("sp_contract"); // waits 1.5× as long
    expect(parcelLifetime(computeStats(S))).toBeCloseTo(plain * 1.5, 6);
  });

  it("picks a buff by weight", () => {
    expect(rollBuff(() => 0)).toBe("steam"); // first bucket
    expect(rollBuff(() => 0.999)).toBe("windfall"); // last bucket
    expect(Object.keys({ steam: 1, rush: 1, windfall: 1 })).toContain(rollBuff(() => 0.5));
  });

  it("pays a windfall out immediately, with no lingering buff", () => {
    S.gens.wagon = 100;
    const stats = computeStats(S);
    const { instant } = applyBuff(S, "windfall", stats);
    expect(instant).toBeGreaterThan(0);
    expect(S.cargo).toBeCloseTo(instant, 6);
    expect(S.buff).toBeNull();
    expect(S.parcels).toBe(1);
  });

  it("starts a timed buff and counts it down", () => {
    applyBuff(S, "steam", computeStats(S));
    expect(S.buff.type).toBe("steam");
    expect(buffRemaining(S)).toBeGreaterThan(0);
    expect(buffRemaining(S)).toBeLessThanOrEqual(30);

    S.buff.endsAt = Date.now() - 5000;
    expect(buffRemaining(S)).toBe(0); // never negative
  });

  it("has no time remaining when there is no buff", () => {
    expect(buffRemaining(S)).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe("applyOffline", () => {
  beforeEach(() => {
    S.gens.handcar = 100; // 10/s
  });

  it("pays half rate for the time you were away", () => {
    const gained = applyOffline(S, computeStats(S), 3600);
    expect(gained).toBeCloseTo(10 * 3600 * 0.5, 6);
    expect(S.cargo).toBeCloseTo(gained, 6);
    expect(S.offlineVisits).toBe(1);
  });

  it("caps at the away-progress limit", () => {
    const stats = computeStats(S);
    const capped = applyOffline(S, stats, 100 * 3600);
    expect(capped).toBeCloseTo(10 * stats.offlineHours * 3600 * stats.offlineRate, 6);
  });

  it("ignores a quick tab flick", () => {
    expect(applyOffline(S, computeStats(S), 20)).toBe(0);
    expect(S.offlineVisits).toBe(0);
  });

  it("pays nothing when nothing was running", () => {
    S.gens.handcar = 0;
    expect(applyOffline(S, computeStats(S), 7200)).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe("checkAchievements", () => {
  it("awards a milestone once and never again", () => {
    S.gens.handcar = 1;
    const first = checkAchievements(S, computeStats(S));
    expect(first.map((a) => a.id)).toContain("first_car");
    expect(checkAchievements(S, computeStats(S)).map((a) => a.id)).not.toContain("first_car");
  });

  it("records the ids it awards", () => {
    S.hauls = 100;
    checkAchievements(S, computeStats(S));
    expect(S.achievements).toContain("handsy");
  });

  it("survives a milestone whose check throws on an odd save", () => {
    const broken = { ...S, gens: null };
    expect(() => checkAchievements(broken, computeStats(S))).not.toThrow();
  });

  it("has a check on every milestone, and no duplicate ids", () => {
    for (const a of ACHIEVEMENTS) expect(typeof a.check).toBe("function");
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});
