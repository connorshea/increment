// All of the game's content lives here: what you can build, learn, and unlock.
// Effects are plain data; engine.js knows how to apply each `k` (kind).

export const COST_GROWTH = 1.15;

export const GENERATORS = [
  {
    id: "handcar",
    name: "Handcar",
    icon: "🚋",
    base: 15,
    rate: 0.1,
    blurb: "Two people, one lever, and a great deal of enthusiasm.",
  },
  {
    id: "shunter",
    name: "Steam Shunter",
    icon: "🚂",
    base: 45,
    rate: 0.33,
    blurb: "Small, filthy, and endlessly willing.",
  },
  {
    id: "wagon",
    name: "Freight Wagon",
    icon: "🚃",
    base: 135,
    rate: 1.05,
    blurb: "Forty tonnes of somebody else’s problem, moved.",
  },
  {
    id: "branch",
    name: "Branch Line",
    icon: "🛤️",
    base: 400,
    rate: 3.4,
    blurb: "Two rails out to the quarry, and two rails back.",
  },
  {
    id: "yard",
    name: "Marshalling Yard",
    icon: "🚧",
    base: 1_200,
    rate: 11,
    blurb: "Where trains are taken apart and put back together nightly.",
  },
  {
    id: "diesel",
    name: "Diesel Fleet",
    icon: "🛢️",
    base: 3_600,
    rate: 36,
    blurb: "Twelve cylinders. No complaints, no charm.",
  },
  {
    id: "mainline",
    name: "Electric Mainline",
    icon: "⚡",
    base: 11_000,
    rate: 118,
    blurb: "Copper overhead, timetable underneath.",
  },
  {
    id: "port",
    name: "Container Port",
    icon: "⚓",
    base: 33_000,
    rate: 385,
    blurb: "The sea hands its boxes over to the land, all night.",
  },
  {
    id: "network",
    name: "Continental Network",
    icon: "🗺️",
    base: 98_000,
    rate: 1_250,
    blurb: "Every siding on the continent answers to one dispatcher.",
  },
  {
    id: "maglev",
    name: "Maglev Corridor",
    icon: "🧲",
    base: 295_000,
    rate: 4_000,
    blurb: "It does not touch the ground. It stopped needing to.",
  },
  {
    id: "vactrain",
    name: "Vacuum Trunk",
    icon: "🕳️",
    base: 885_000,
    rate: 13_000,
    blurb: "Freight at very nearly the speed of sound, in a tube.",
  },
  {
    id: "orbital",
    name: "Orbital Funicular",
    icon: "🛰️",
    base: 2.65e6,
    rate: 43_000,
    blurb: "A cable to the sky. The ticket office is extremely high up.",
  },
];

export const GEN_BY_ID = Object.fromEntries(GENERATORS.map((g) => [g.id, g]));

// ---------------------------------------------------------------------------
// Rolling-stock upgrades: every generator gets the same tiered ladder.
// ---------------------------------------------------------------------------

const TIERS = [
  {
    owned: 10,
    costFactor: 12,
    mult: 2,
    prefix: "Overhauled",
    flavor: "New bearings, fresh paint, fewer excuses.",
  },
  {
    owned: 25,
    costFactor: 130,
    mult: 2,
    prefix: "Doubled",
    flavor: "Two tracks where stubbornly there was one.",
  },
  {
    owned: 50,
    costFactor: 1_600,
    mult: 2,
    prefix: "Signalled",
    flavor: "Block signals: nobody waits on a rumour anymore.",
  },
  {
    owned: 100,
    costFactor: 25_000,
    mult: 2,
    prefix: "Electrified",
    flavor: "The wires go up and the timetable tightens.",
  },
  {
    owned: 175,
    costFactor: 400_000,
    mult: 3,
    prefix: "Automated",
    flavor: "It runs itself, and faintly resents supervision.",
  },
  {
    owned: 250,
    costFactor: 6e6,
    mult: 3,
    prefix: "Legendary",
    flavor: "Written up in every enthusiast magazine on the continent.",
  },
];

function generatorUpgrades() {
  const out = [];
  for (const gen of GENERATORS) {
    TIERS.forEach((tier, i) => {
      out.push({
        id: `${gen.id}_t${i}`,
        name: `${tier.prefix} ${gen.name}`,
        icon: gen.icon,
        cost: gen.base * tier.costFactor,
        desc: tier.flavor,
        effects: [{ k: "gen", target: gen.id, mult: tier.mult }],
        req: { gen: gen.id, owned: tier.owned },
      });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hand-written upgrades
// ---------------------------------------------------------------------------

const SPECIAL_UPGRADES = [
  // Hand-loading line. Deliberately long: there should always be another rung,
  // and the later ones pay a share of the whole network's output so that a haul
  // keeps up with the railway instead of being left behind by it.
  {
    id: "shovel",
    name: "Bigger Shovel",
    icon: "🥄",
    cost: 100,
    desc: "Twice the coal, same aching back.",
    effects: [{ k: "click", mult: 2 }],
    req: { hauls: 10 },
  },
  {
    id: "crew",
    name: "Second Crew",
    icon: "🧑‍🔧",
    cost: 500,
    desc: "Someone to swear at the wagon from the other side.",
    effects: [{ k: "click", mult: 2 }],
    req: { hauls: 50 },
  },
  {
    id: "conveyor",
    name: "Loading Conveyor",
    icon: "🎢",
    cost: 2_000,
    desc: "The whole yard lends a hand every time you do.",
    effects: [{ k: "haulRate", pct: 0.04 }],
    req: { hauls: 120 },
  },
  {
    id: "barrow",
    name: "Steam Barrow",
    icon: "🛒",
    cost: 8_000,
    desc: "It does the walking. You do the pointing.",
    effects: [{ k: "click", mult: 3 }],
    req: { hauls: 250 },
  },
  {
    id: "gantry",
    name: "Gantry Crane",
    icon: "🏗️",
    cost: 30_000,
    desc: "It picks up what a person simply cannot.",
    effects: [{ k: "haulRate", pct: 0.08 }],
    req: { hauls: 400 },
  },
  {
    id: "hopper",
    name: "Hopper Chutes",
    icon: "🧺",
    cost: 100_000,
    desc: "Open the hatch and let gravity do the shift.",
    effects: [{ k: "haulRate", pct: 0.07 }],
    req: { hauls: 600 },
  },
  {
    id: "hundredhands",
    name: "A Hundred Hands",
    icon: "🙌",
    cost: 400_000,
    desc: "Every platform on the line loads at once.",
    effects: [{ k: "click", mult: 5 }],
    req: { hauls: 900 },
  },
  {
    id: "autoload",
    name: "Automatic Loader",
    icon: "🤖",
    cost: 1.5e6,
    desc: "You just point. The network does the lifting.",
    effects: [{ k: "haulRate", pct: 0.1 }],
    req: { hauls: 1_200 },
  },
  {
    id: "telpher",
    name: "Telpherage Line",
    icon: "🚡",
    cost: 5e6,
    desc: "Buckets on a wire, running to wherever you are looking.",
    effects: [{ k: "haulRate", pct: 0.12 }],
    req: { hauls: 1_800 },
  },
  {
    id: "roboyard",
    name: "Robotic Yard",
    icon: "🦾",
    cost: 2e7,
    desc: "It loads faster than you can decide what to load.",
    effects: [{ k: "click", mult: 10 }],
    req: { hauls: 2_500 },
  },
  {
    id: "maglift",
    name: "Mag-Lift Grapples",
    icon: "🪝",
    cost: 7e7,
    desc: "Freight comes to your hand because you thought about it.",
    effects: [{ k: "haulRate", pct: 0.14 }],
    req: { hauls: 3_500 },
  },
  {
    id: "wholeyard",
    name: "The Whole Yard at Once",
    icon: "🌀",
    cost: 2.5e8,
    desc: "One gesture. Everything moves.",
    effects: [{ k: "haulRate", pct: 0.15 }],
    req: { hauls: 5_000 },
  },

  // Whole-railway line
  {
    id: "timetable",
    name: "The Timetable",
    icon: "📋",
    cost: 40_000,
    desc: "Written down, so nobody can argue about it.",
    effects: [{ k: "all", mult: 1.05 }],
    req: { total: 6e4 },
  },
  {
    id: "airbrakes",
    name: "Air Brakes",
    icon: "💨",
    cost: 150_000,
    desc: "Stopping quickly means starting confidently.",
    effects: [{ k: "all", mult: 1.1 }],
    req: { total: 2.5e5 },
  },
  {
    id: "ctc",
    name: "Centralised Traffic Control",
    icon: "🖥️",
    cost: 700_000,
    desc: "One room, one board, every train on it.",
    effects: [{ k: "all", mult: 1.15 }],
    req: { total: 1.2e6 },
  },
  {
    id: "gauge",
    name: "Standard Gauge",
    icon: "📏",
    cost: 3e6,
    desc: "Four foot eight and a half, everywhere, no exceptions.",
    effects: [{ k: "all", mult: 1.2 }],
    req: { total: 5e6 },
  },
  {
    id: "dispatch",
    name: "Perfect Dispatch",
    icon: "🎛️",
    cost: 1.5e7,
    desc: "Nothing on the network is ever waiting on anything.",
    effects: [{ k: "all", mult: 1.25 }],
    req: { total: 2.5e7 },
  },
  {
    id: "legendtt",
    name: "Timetable of Legend",
    icon: "📖",
    cost: 8e7,
    desc: "Other railways set their clocks by yours.",
    effects: [{ k: "all", mult: 1.35 }],
    req: { total: 1.2e8 },
  },

  // Synergies
  {
    id: "watertowers",
    name: "Water Towers",
    icon: "⛲",
    cost: 6_000,
    desc: "Steam Shunters gain +1% for every Handcar on the roster.",
    effects: [{ k: "genPer", target: "shunter", source: "handcar", pct: 0.01 }],
    req: { gen: "shunter", owned: 15 },
  },
  {
    id: "couplers",
    name: "Automatic Couplers",
    icon: "🔗",
    cost: 25_000,
    desc: "Freight Wagons gain +2% for every Steam Shunter you run.",
    effects: [{ k: "genPer", target: "wagon", source: "shunter", pct: 0.02 }],
    req: { gen: "wagon", owned: 20 },
  },
  {
    id: "ballast",
    name: "Deep Ballast",
    icon: "🪨",
    cost: 120_000,
    desc: "Branch Lines gain +3% for every Freight Wagon rolling on them.",
    effects: [{ k: "genPer", target: "branch", source: "wagon", pct: 0.03 }],
    req: { gen: "branch", owned: 25 },
  },
  {
    id: "depots",
    name: "Refuelling Depots",
    icon: "⛽",
    cost: 2e6,
    desc: "Diesel Fleets gain +4% for every Marshalling Yard they can reach.",
    effects: [{ k: "genPer", target: "diesel", source: "yard", pct: 0.04 }],
    req: { gen: "diesel", owned: 25 },
  },

  // Express parcel line
  {
    id: "lostproperty",
    name: "Lost Property Office",
    icon: "🧳",
    cost: 20_000,
    desc: "Express parcels turn up noticeably more often.",
    effects: [{ k: "parcelFreq", mult: 1.35 }],
    req: { parcels: 1 },
  },
  {
    id: "flagman",
    name: "Attentive Flagman",
    icon: "🚩",
    cost: 300_000,
    desc: "Parcels sit on the platform 60% longer before they are gone.",
    effects: [{ k: "parcelDur", mult: 1.6 }],
    req: { parcels: 5 },
  },
  {
    id: "boiler",
    name: "Overpressured Boiler",
    icon: "🔥",
    cost: 4e6,
    desc: "Full Steam hits 60% harder. The gauge is painted red for a reason.",
    effects: [{ k: "steam", mult: 1.6 }],
    req: { parcels: 15 },
  },
  {
    id: "expresslane",
    name: "Express Lane",
    icon: "🌟",
    cost: 6e7,
    desc: "Parcels arrive twice as often again.",
    effects: [{ k: "parcelFreq", mult: 2 }],
    req: { parcels: 40 },
  },

  // Post-regauge
  {
    id: "blueprints",
    name: "Old Blueprints",
    icon: "📐",
    cost: 150_000,
    desc: "The new railway remembers how the old one was surveyed.",
    effects: [{ k: "all", mult: 1.25 }],
    req: { regauges: 1 },
  },
  {
    id: "roadbed",
    name: "Preserved Roadbed",
    icon: "🛣️",
    cost: 3e6,
    desc: "Every spike you have ever driven pulls a little harder.",
    effects: [{ k: "spikePower", add: 0.02 }],
    req: { regauges: 3 },
  },
  {
    id: "permanentway",
    name: "The Permanent Way",
    icon: "♾️",
    cost: 1.2e8,
    desc: "There is no longer a meaningful gap between one railway and the next.",
    effects: [{ k: "spikePower", add: 0.03 }],
    req: { regauges: 10 },
  },
];

export const UPGRADES = [...generatorUpgrades(), ...SPECIAL_UPGRADES];
export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// ---------------------------------------------------------------------------
// Spike shop — bought with golden spikes, survives every regauge.
// ---------------------------------------------------------------------------

export const SPIKE_UPGRADES = [
  {
    id: "sp_survey",
    name: "Surveyor's Notes",
    icon: "📓",
    cost: 1,
    desc: "Every railway you build from now on runs 25% better.",
    effects: [{ k: "all", mult: 1.25 }],
  },
  {
    id: "sp_shovel",
    name: "Steel Shovel",
    icon: "⛏️",
    cost: 2,
    desc: "Loading by hand is five times as productive.",
    effects: [{ k: "click", mult: 5 }],
  },
  {
    id: "sp_contract",
    name: "Parcel Contract",
    icon: "📮",
    cost: 3,
    desc: "Express parcels arrive 50% more often and wait 50% longer.",
    effects: [
      { k: "parcelFreq", mult: 1.5 },
      { k: "parcelDur", mult: 1.5 },
    ],
  },
  {
    id: "sp_funding",
    name: "Advance Funding",
    icon: "💰",
    cost: 5,
    desc: "Open every new railway with 10,000 cargo and 15 Handcars already running.",
    effects: [{ k: "headStart", cargo: 10_000, gens: { handcar: 15 } }],
  },
  {
    id: "sp_conductor",
    name: "The Conductor",
    icon: "🎩",
    cost: 5,
    desc: "Hires a conductor who signs off works for you, cheapest first, as you can afford them.",
    effects: [{ k: "conductor" }],
  },
  {
    id: "sp_night",
    name: "Night Shift",
    icon: "🌙",
    cost: 8,
    desc: "While you are away: up to 24h of progress at 85% rate, instead of 8h at 50%.",
    effects: [{ k: "offline", hours: 24, rate: 0.85 }],
  },
  {
    id: "sp_pneumatic",
    name: "Pneumatic Loaders",
    icon: "⚙️",
    cost: 8,
    desc: "Hauls by hand earn a further 15% of everything the railway makes each second.",
    effects: [{ k: "haulRate", pct: 0.15 }],
  },
  {
    id: "sp_driven",
    name: "Driven Deep",
    icon: "🔩",
    cost: 13,
    desc: "Doubles the bonus from every golden spike you have ever earned: +5% each becomes +10%.",
    effects: [{ k: "spikePower", add: 0.05 }],
  },
  {
    id: "sp_ironroad",
    name: "The Iron Road",
    icon: "⛓️",
    cost: 21,
    desc: "The whole railway runs twice as fast.",
    effects: [{ k: "all", mult: 2 }],
  },
  {
    id: "sp_hands",
    name: "Ten Thousand Hands",
    icon: "👐",
    cost: 30,
    desc: "Hauling by hand is twenty-five times as productive.",
    effects: [{ k: "click", mult: 25 }],
  },
  {
    id: "sp_atomic",
    name: "Atomic Traction",
    icon: "☢️",
    cost: 34,
    desc: "Everything runs 2.5× faster, and Full Steam doubles in strength.",
    effects: [
      { k: "all", mult: 2.5 },
      { k: "steam", mult: 2 },
    ],
  },
  {
    id: "sp_ticketed",
    name: "The World, Ticketed",
    icon: "🌍",
    cost: 55,
    desc: "Everything runs 4× faster. There is nowhere left the line does not go.",
    effects: [{ k: "all", mult: 4 }],
  },
];

export const SPIKE_BY_ID = Object.fromEntries(SPIKE_UPGRADES.map((u) => [u.id, u]));

// ---------------------------------------------------------------------------
// Express parcels — catch them for a temporary boost.
// ---------------------------------------------------------------------------

export const BUFFS = {
  steam: {
    name: "Full Steam",
    icon: "🔥",
    duration: 30,
    weight: 5,
    toast: "FULL STEAM! The whole network is flying.",
  },
  rush: {
    name: "Rush Hour",
    icon: "⚡",
    duration: 18,
    weight: 3,
    toast: "RUSH HOUR! Every haul counts for a hundred.",
  },
  windfall: {
    name: "Windfall",
    icon: "💰",
    duration: 0,
    weight: 3,
    toast: "A lucrative contract lands in your lap!",
  },
};

export const STEAM_BASE = 7;
export const RUSH_BASE = 100;

// ---------------------------------------------------------------------------
// Milestones — each one grants +1% to everything, forever.
// ---------------------------------------------------------------------------

export const ACHIEVEMENTS = [
  {
    id: "first_car",
    name: "First Wheels",
    icon: "🚋",
    desc: "Put a handcar on the rails.",
    check: (S) => (S.gens.handcar || 0) >= 1,
  },
  {
    id: "steam",
    name: "Steam Up",
    icon: "🚂",
    desc: "Light the fire in a steam shunter.",
    check: (S) => (S.gens.shunter || 0) >= 1,
  },
  {
    id: "handsy",
    name: "Blistered",
    icon: "🥄",
    desc: "Load cargo by hand 100 times.",
    check: (S) => S.hauls >= 100,
  },
  {
    id: "tireless",
    name: "Iron Back",
    icon: "💪",
    desc: "Load cargo by hand 1,000 times.",
    check: (S) => S.hauls >= 1_000,
  },
  {
    id: "yardmaster",
    name: "Yardmaster",
    icon: "🧤",
    desc: "Load cargo by hand 5,000 times.",
    check: (S) => S.hauls >= 5_000,
  },
  {
    id: "thousand",
    name: "A Modest Consignment",
    icon: "📦",
    desc: "Move 1,000 cargo.",
    check: (S) => S.totalEarned >= 1_000,
  },
  {
    id: "million",
    name: "Regional Carrier",
    icon: "🏭",
    desc: "Move a hundred thousand cargo all told.",
    check: (S) => S.totalEarned >= 1e5,
  },
  {
    id: "billion",
    name: "Continental",
    icon: "🗺️",
    desc: "Move ten million cargo all told.",
    check: (S) => S.totalEarned >= 1e7,
  },
  {
    id: "trillion",
    name: "Geological Tonnage",
    icon: "🏔️",
    desc: "Move a billion cargo all told.",
    check: (S) => S.totalEarned >= 1e9,
  },
  {
    id: "quad",
    name: "Beyond the Ledger",
    icon: "🌌",
    desc: "Move a hundred billion cargo all told.",
    check: (S) => S.totalEarned >= 1e11,
  },
  {
    id: "ten",
    name: "A Proper Roster",
    icon: "🔟",
    desc: "Own 10 of anything.",
    check: (S) => Object.values(S.gens).some((n) => n >= 10),
  },
  {
    id: "hundred",
    name: "Committed to the Bit",
    icon: "💯",
    desc: "Own 100 of a single thing.",
    check: (S) => Object.values(S.gens).some((n) => n >= 100),
  },
  {
    id: "twofifty",
    name: "Enthusiast",
    icon: "🔁",
    desc: "Own 250 of a single thing.",
    check: (S) => Object.values(S.gens).some((n) => n >= 250),
  },
  {
    id: "variety",
    name: "Mixed Traffic",
    icon: "🎠",
    desc: "Own at least one of six different things.",
    check: (S) => Object.values(S.gens).filter((n) => n > 0).length >= 6,
  },
  {
    id: "everything",
    name: "The Full Roster",
    icon: "📚",
    desc: "Own at least one of everything.",
    check: (S) => GENERATORS.every((g) => (S.gens[g.id] || 0) >= 1),
  },
  {
    id: "learner",
    name: "Apprentice Engineer",
    icon: "🎓",
    desc: "Buy 10 upgrades.",
    check: (S) => S.upgrades.length >= 10,
  },
  {
    id: "scholar",
    name: "Chief Engineer",
    icon: "👷",
    desc: "Buy 30 upgrades.",
    check: (S) => S.upgrades.length >= 30,
  },
  {
    id: "parcel1",
    name: "Signed For",
    icon: "📦",
    desc: "Catch an express parcel.",
    check: (S) => S.parcels >= 1,
  },
  {
    id: "parcel25",
    name: "Sorting Office",
    icon: "📬",
    desc: "Catch 25 express parcels.",
    check: (S) => S.parcels >= 25,
  },
  {
    id: "regauge1",
    name: "Ripped It Up",
    icon: "🔩",
    desc: "Regauge the network for the first time.",
    check: (S) => S.regauges >= 1,
  },
  {
    id: "regauge5",
    name: "Never Satisfied",
    icon: "🔄",
    desc: "Regauge five times.",
    check: (S) => S.regauges >= 5,
  },
  {
    id: "regauge20",
    name: "Serial Rebuilder",
    icon: "🏗️",
    desc: "Regauge twenty times.",
    check: (S) => S.regauges >= 20,
  },
  {
    id: "spikes50",
    name: "Gold in the Ballast",
    icon: "✨",
    desc: "Earn 50 golden spikes in total.",
    check: (S) => S.totalSpikes >= 50,
  },
  {
    id: "spikeshop",
    name: "Well Capitalised",
    icon: "🏦",
    desc: "Buy five spike upgrades.",
    check: (S) => S.spikeUpgrades.length >= 5,
  },
  {
    id: "fast",
    name: "Express Service",
    icon: "🚄",
    desc: "Reach ten thousand cargo per second.",
    check: (S, stats) => stats.perSec >= 1e4,
  },
  {
    id: "faster",
    name: "Runaway",
    icon: "☄️",
    desc: "Reach a million cargo per second.",
    check: (S, stats) => stats.perSec >= 1e6,
  },
  {
    id: "hour",
    name: "Settled In",
    icon: "🕰️",
    desc: "Run the railway for an hour.",
    check: (S) => S.playTime >= 3_600,
  },
  {
    id: "patient",
    name: "Lifer",
    icon: "🧘",
    desc: "Run the railway for eight hours.",
    check: (S) => S.playTime >= 28_800,
  },
  {
    id: "idle",
    name: "The Night Shift",
    icon: "😴",
    desc: "Come back to progress made while you were away.",
    check: (S) => S.offlineVisits >= 1,
  },
];
