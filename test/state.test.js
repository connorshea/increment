import { beforeEach, describe, expect, it, vi } from "vitest";
import { GENERATORS } from "../js/data.js";
import {
  SAVE_KEY,
  decodeSave,
  encodeSave,
  freshState,
  load,
  normalize,
  save,
  wipe,
} from "../js/state.js";

// state.js is the only module that touches the browser, so stand in a minimal
// localStorage rather than pulling in a whole DOM.
function stubStorage({ failWrites = false } = {}) {
  const map = new Map();
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (failWrites) throw new DOMException("quota", "QuotaExceededError");
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
    _map: map,
  };
  vi.stubGlobal("localStorage", storage);
  return storage;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe("freshState", () => {
  it("starts empty, with a slot for every generator", () => {
    const S = freshState();
    expect(S.cargo).toBe(0);
    expect(S.upgrades).toEqual([]);
    expect(Object.keys(S.gens).sort()).toEqual(GENERATORS.map((g) => g.id).sort());
    expect(Object.values(S.gens).every((n) => n === 0)).toBe(true);
    expect(S.seenGens).toEqual([GENERATORS[0].id]);
  });

  it("carries the permanent things through, and only those", () => {
    const S = freshState({
      spikes: 4,
      totalSpikes: 9,
      spikeUpgrades: ["sp_survey"],
      achievements: ["first_car"],
      regauges: 2,
      hauls: 300,
      soundOn: false,
      conductorOn: false,
      cargo: 5000, // not a carried field — must be ignored
      upgrades: ["shovel"],
    });
    expect(S.spikes).toBe(4);
    expect(S.totalSpikes).toBe(9);
    expect(S.regauges).toBe(2);
    expect(S.soundOn).toBe(false);
    expect(S.conductorOn).toBe(false);
    expect(S.cargo).toBe(0);
    expect(S.upgrades).toEqual([]);
  });

  it("defaults the toggles to on", () => {
    const S = freshState();
    expect(S.bgOn).toBe(true);
    expect(S.soundOn).toBe(true);
    expect(S.conductorOn).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("normalize", () => {
  it("fills in fields a save from an older build never had", () => {
    const S = normalize({ cargo: 500 });
    expect(S.cargo).toBe(500);
    expect(S.upgrades).toEqual([]);
    expect(S.conductorOn).toBe(true);
    expect(S.gens.handcar).toBe(0);
  });

  it("adds generators that did not exist when the save was written", () => {
    const S = normalize({ gens: { handcar: 3 } });
    expect(S.gens.handcar).toBe(3);
    for (const g of GENERATORS) expect(S.gens[g.id]).toBeGreaterThanOrEqual(0);
  });

  it("copes with a save whose gens field is missing or the wrong type", () => {
    expect(() => normalize({})).not.toThrow();
    expect(normalize({ gens: null }).gens.handcar).toBe(0);
    expect(normalize({ gens: 7 }).gens.handcar).toBe(0);
  });

  it("repairs list fields that are not lists", () => {
    const S = normalize({ upgrades: "shovel", achievements: null, seenGens: 3 });
    expect(S.upgrades).toEqual([]);
    expect(S.achievements).toEqual([]);
    expect(S.seenGens).toEqual([]);
  });

  it("repairs numbers that are not finite", () => {
    const S = normalize({ cargo: "lots", totalEarned: NaN, hauls: Infinity, spikes: null });
    expect(S.cargo).toBe(0);
    expect(S.totalEarned).toBe(0);
    expect(S.hauls).toBe(0);
    expect(S.spikes).toBe(0);
  });

  it("clamps generator counts to whole, non-negative numbers", () => {
    const S = normalize({ gens: { handcar: -4, shunter: 7.9, wagon: "x" } });
    expect(S.gens.handcar).toBe(0);
    expect(S.gens.shunter).toBe(7);
    expect(S.gens.wagon).toBe(0);
  });

  it("drops a buff that expired while the tab was closed", () => {
    expect(normalize({ buff: { type: "steam", endsAt: Date.now() - 1000 } }).buff).toBeNull();
    expect(normalize({ buff: { type: "steam" } }).buff).toBeNull();
    const live = { type: "steam", endsAt: Date.now() + 30_000 };
    expect(normalize({ buff: live }).buff).toEqual(live);
  });
});

// ---------------------------------------------------------------------------

describe("save, load and wipe", () => {
  it("round-trips a railway through storage", () => {
    stubStorage();
    const S = freshState();
    S.cargo = 1234;
    S.gens.handcar = 6;
    S.upgrades.push("shovel");

    expect(save(S)).toBe(true);
    expect(S.lastSaved).toBeGreaterThan(0);

    const back = load();
    expect(back.cargo).toBe(1234);
    expect(back.gens.handcar).toBe(6);
    expect(back.upgrades).toEqual(["shovel"]);
  });

  it("loads nothing when there is nothing saved", () => {
    stubStorage();
    expect(load()).toBeNull();
  });

  it("reports failure instead of throwing when storage is blocked", () => {
    stubStorage({ failWrites: true });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(save(freshState())).toBe(false);
  });

  it("survives a corrupted save rather than refusing to boot", () => {
    const storage = stubStorage();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    storage._map.set(SAVE_KEY, "{not json at all");
    expect(load()).toBeNull();
  });

  it("wipes the save", () => {
    const storage = stubStorage();
    save(freshState());
    expect(storage._map.has(SAVE_KEY)).toBe(true);
    wipe();
    expect(storage._map.has(SAVE_KEY)).toBe(false);
    expect(load()).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("export and import", () => {
  it("round-trips a railway through a paste-able string", () => {
    const S = freshState();
    S.cargo = 98_765.4;
    S.gens.wagon = 12;
    S.spikeUpgrades.push("sp_conductor");

    const back = decodeSave(encodeSave(S));
    expect(back.cargo).toBe(98_765.4);
    expect(back.gens.wagon).toBe(12);
    expect(back.spikeUpgrades).toEqual(["sp_conductor"]);
  });

  it("does not mind whitespace round the pasted code", () => {
    const code = encodeSave(freshState());
    expect(() => decodeSave(`\n  ${code}  \n`)).not.toThrow();
  });

  it("normalises whatever it is handed, so a hand-edited code cannot corrupt a run", () => {
    const code = encodeSave({ cargo: "hello", gens: { handcar: -3 } });
    const back = decodeSave(code);
    expect(back.cargo).toBe(0);
    expect(back.gens.handcar).toBe(0);
  });

  it("throws on something that is not a save at all", () => {
    expect(() => decodeSave("this is not base64 json")).toThrow();
  });

  it("survives emoji and other non-ASCII in the payload", () => {
    const S = freshState();
    S.note = "🚂 branch line — Åland";
    expect(decodeSave(encodeSave(S)).note).toBe("🚂 branch line — Åland");
  });
});
