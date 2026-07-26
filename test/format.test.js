import { describe, expect, it } from "vitest";
import { fmt, fmtClock, fmtMult, fmtPct, fmtTime } from "../js/format.js";

describe("fmt", () => {
  it("keeps small numbers readable", () => {
    expect(fmt(0)).toBe("0");
    expect(fmt(0.5)).toBe("0.50");
    expect(fmt(1)).toBe("1");
    expect(fmt(1.5)).toBe("1.5");
    expect(fmt(42)).toBe("42");
    expect(fmt(999)).toBe("999");
  });

  it("drops to suffixes at a thousand, with fewer decimals as it grows", () => {
    expect(fmt(1000)).toBe("1.00K");
    expect(fmt(1234)).toBe("1.23K");
    expect(fmt(12_345)).toBe("12.3K");
    expect(fmt(123_456)).toBe("123K");
    expect(fmt(1e6)).toBe("1.00M");
    expect(fmt(1e9)).toBe("1.00B");
    expect(fmt(1e15)).toBe("1.00Qa");
  });

  it("falls back to exponential past the last suffix", () => {
    expect(fmt(1e66)).toBe("1.00e66");
  });

  it("handles negatives, infinity and junk", () => {
    expect(fmt(-1234)).toBe("-1.23K");
    expect(fmt(Infinity)).toBe("∞");
    expect(fmt(NaN)).toBe("0");
  });
});

describe("fmtMult and fmtPct", () => {
  it("formats multipliers", () => {
    expect(fmtMult(2)).toBe("×2");
    expect(fmtMult(1.5)).toBe("×1.5");
    expect(fmtMult(1.005)).toBe("×1"); // rounded to 2dp
    expect(fmtMult(25_000)).toBe("×25.0K");
  });

  it("formats percentages with a sign", () => {
    expect(fmtPct(0.05)).toBe("+5%");
    expect(fmtPct(0.045)).toBe("+4.5%");
    expect(fmtPct(1.5)).toBe("+150%");
    expect(fmtPct(0)).toBe("+0%");
    expect(fmtPct(-0.1)).toBe("-10%");
  });
});

describe("fmtTime and fmtClock", () => {
  it("steps up through the units", () => {
    expect(fmtTime(0)).toBe("0s");
    expect(fmtTime(45)).toBe("45s");
    expect(fmtTime(90)).toBe("1m 30s");
    expect(fmtTime(3600)).toBe("1h 0m");
    expect(fmtTime(8100)).toBe("2h 15m");
    expect(fmtTime(90_000)).toBe("1d 1h");
  });

  it("refuses to guess at nonsense durations", () => {
    expect(fmtTime(-5)).toBe("—");
    expect(fmtTime(NaN)).toBe("—");
  });

  it("counts buff chips down as m:ss", () => {
    expect(fmtClock(7)).toBe("0:07");
    expect(fmtClock(65)).toBe("1:05");
    expect(fmtClock(0.2)).toBe("0:01"); // rounds up, so it never reads 0:00 early
    expect(fmtClock(-3)).toBe("0:00");
  });
});
