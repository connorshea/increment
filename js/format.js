const SUFFIXES = [
  "",
  "K",
  "M",
  "B",
  "T",
  "Qa",
  "Qi",
  "Sx",
  "Sp",
  "Oc",
  "No",
  "Dc",
  "UDc",
  "DDc",
  "TDc",
  "QaDc",
  "QiDc",
  "SxDc",
  "SpDc",
  "OcDc",
  "NoDc",
  "Vg",
];

/** Compact human-readable number: 1234 -> "1.23K". */
export function fmt(n) {
  if (n === Infinity) return "∞";
  if (!Number.isFinite(n)) return "0";
  if (n < 0) return "-" + fmt(-n);
  if (n < 1) return n === 0 ? "0" : n.toFixed(2);
  if (n < 1000) return n < 10 ? trimZeros(n.toFixed(1)) : String(Math.floor(n));

  const tier = Math.floor(Math.log10(n) / 3);
  if (tier >= SUFFIXES.length) return n.toExponential(2).replace("e+", "e");

  const scaled = n / Math.pow(1000, tier);
  const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  return scaled.toFixed(digits) + SUFFIXES[tier];
}

function trimZeros(s) {
  return s.replace(/\.0$/, "");
}

/** Multiplier display: 1.5 -> "×1.5". */
export function fmtMult(n) {
  const rounded = Math.round(n * 100) / 100;
  return "×" + (rounded >= 1000 ? fmt(rounded) : trimZeros(String(rounded)));
}

/** Percent display from a fraction: 0.05 -> "+5%". */
export function fmtPct(frac) {
  const pct = frac * 100;
  const digits = Math.abs(pct) < 10 && pct % 1 !== 0 ? 1 : 0;
  return (pct >= 0 ? "+" : "") + pct.toFixed(digits) + "%";
}

/** Duration in seconds -> "2h 14m". */
export function fmtTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/** Short countdown for buff chips: "0:07". */
export function fmtClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
