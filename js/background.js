// A freight network drawn behind the game, in the language of a transit
// diagram: octilinear routes with rounded corners and geometric stations —
// but the routes are laid as track, with ballast, sleepers and two rails, and
// trains work their way up and down them. A station glows as freight piles up
// on it and dims again as trains take the load away.
//
// The map grows from the centre outward as you build. Stations are laid out in
// a fixed, seeded order sorted by distance from the middle, so revealing the
// first N of them always radiates outward and nothing that already exists ever
// moves. Regauging reseeds the layout, so each railway looks like its own place.

const TAU = Math.PI * 2;
const MAX_STATIONS = 40;
const MAX_CHAIN = 13;
const LINE_COUNT = 7;
const BUILD_SPEED = 340; // px/sec that new track lays itself down
const CAR = 10;
const CAR_GAP = 2.6;
const MAX_CARGO = 5;
const RAIL_GAUGE = 2.6; // half-distance between the two rails

// Muted enough for a night map, separable enough to read as distinct lines.
const PALETTE = [
  "#f5a623",
  "#4aa8ff",
  "#34c77b",
  "#ff5f56",
  "#b07cff",
  "#19c2c2",
  "#ffd23f",
  "#ff7bb0",
];

const SHAPES = ["circle", "square", "triangle", "pentagon", "diamond", "cross", "star"];

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Small deterministic PRNG, so a given seed always draws the same map. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** A soft warm halo, drawn once and stamped under every station that has
 *  freight waiting. Far cheaper than a canvas shadow per station per frame. */
function makeGlowSprite() {
  const size = 64;
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const g = sprite.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255, 198, 124, 0.9)");
  grad.addColorStop(0.35, "rgba(255, 176, 96, 0.34)");
  grad.addColorStop(1, "rgba(255, 170, 90, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return sprite;
}

export function createBackground(canvas) {
  const ctx = canvas.getContext("2d");
  const glowSprite = makeGlowSprite();

  // The track only changes while it is being laid, so it lives on its own
  // layer and is only redrawn when it actually grows.
  const trackLayer = document.createElement("canvas");
  const trackCtx = trackLayer.getContext("2d");
  let trackDirty = true;

  let width = 0;
  let height = 0;
  let net = null;
  let seed = 7;
  let targetStations = 5;
  let busy = 0;
  let enabled = true;
  let running = false;
  let lastFrame = 0;

  // ---- layout -------------------------------------------------------------

  /** Stations on a grid, spiralling out from the middle, nearest first. */
  function placeStations(rng, cell) {
    const cx = width / 2;
    const cy = height / 2;
    const stations = [];
    const occupied = new Set();

    for (let attempt = 0; attempt < 2600 && stations.length < MAX_STATIONS; attempt++) {
      const angle = attempt * 2.399963 + rng() * 0.7;
      const radius = cell * (1.1 + Math.sqrt(attempt) * 0.6);
      const x = Math.round((cx + Math.cos(angle) * radius * 1.5) / cell) * cell;
      const y = Math.round((cy + Math.sin(angle) * radius * 0.95) / cell) * cell;

      if (x < cell * 0.6 || x > width - cell * 0.6) continue;
      if (y < cell * 0.6 || y > height - cell * 0.6) continue;
      const key = `${x},${y}`;
      if (occupied.has(key)) continue;
      if (stations.some((s) => Math.hypot(s.x - x, s.y - y) < cell * 1.35)) continue;
      occupied.add(key);

      stations.push({
        x,
        y,
        shape: SHAPES[Math.floor(rng() * SHAPES.length)],
        lines: 0,
        reveal: 0,
        cargo: Math.floor(rng() * 3),
        cargoShown: 0,
        cargoTimer: rng() * 3,
      });
    }

    stations.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    return stations;
  }

  /**
   * A route between two stations: one 45° run and one straight run, which is
   * what makes a diagram read as a transit map rather than a scribble.
   */
  function octilinear(a, b, diagonalFirst) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    if (adx === 0 || ady === 0 || adx === ady) return [b];

    if (adx > ady) {
      return diagonalFirst
        ? [{ x: a.x + sx * ady, y: b.y }, b]
        : [{ x: b.x - sx * ady, y: a.y }, b];
    }
    return diagonalFirst ? [{ x: b.x, y: a.y + sy * adx }, b] : [{ x: a.x, y: b.y - sy * adx }, b];
  }

  /**
   * Chains always step to a station further out than the last, so a line's
   * revealed prefix is exactly the part of it near the centre.
   */
  function growChain(stations, rng, startIndex) {
    const chain = [startIndex];
    const wanted = 6 + Math.floor(rng() * 6);
    let heading = null;

    while (chain.length < wanted) {
      const from = stations[chain[chain.length - 1]];
      const lastIndex = chain[chain.length - 1];
      let best = -1;
      let bestScore = -Infinity;

      for (let i = lastIndex + 1; i < stations.length; i++) {
        if (stations[i].lines >= 3 || chain.includes(i)) continue;
        const to = stations[i];
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        if (dist < 1) continue;

        // Close, and preferably carrying on the way the line was already going.
        let score = -dist * 0.02 - (i - lastIndex) * 0.6;
        if (heading) {
          const dot = ((to.x - from.x) * heading.x + (to.y - from.y) * heading.y) / dist;
          score += dot * 3.2;
        }
        score += rng() * 1.4;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }

      if (best < 0) break;
      const to = stations[best];
      const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      heading = { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
      chain.push(best);
    }

    if (chain.length < 2) return null;
    for (const i of chain) stations[i].lines++;
    return chain;
  }

  /**
   * Nothing is left stranded: any station no line reached gets attached to the
   * nearest route that can still take it. Chains stay index-monotonic — a
   * station is only ever appended after one closer to the centre, or spliced
   * between two that bracket it — so the reveal order still radiates outward.
   */
  function connectOrphans(stations, chains) {
    if (!chains.length) return;
    for (let idx = 0; idx < stations.length; idx++) {
      if (stations[idx].lines > 0) continue;
      const target = stations[idx];

      // Nearest free end wins, but a route that has already swallowed a lot is
      // penalised — otherwise the first long line keeps being the nearest and
      // ends up absorbing every leftover on the map.
      let bestChain = null;
      let bestScore = Infinity;
      for (const chain of chains) {
        const end = stations[chain[chain.length - 1]];
        if (chain[chain.length - 1] >= idx) continue;
        if (chain.length >= MAX_CHAIN) continue;
        const score = Math.hypot(end.x - target.x, end.y - target.y) + chain.length * 26;
        if (score < bestScore) {
          bestScore = score;
          bestChain = chain;
        }
      }
      if (bestChain) {
        bestChain.push(idx);
        stations[idx].lines++;
        continue;
      }

      // Otherwise splice it into a chain that steps straight over it.
      let placed = false;
      for (const chain of chains) {
        for (let k = 1; k < chain.length && !placed; k++) {
          if (chain[k - 1] < idx && chain[k] > idx) {
            chain.splice(k, 0, idx);
            stations[idx].lines++;
            placed = true;
          }
        }
        if (placed) break;
      }
      if (placed) continue;

      // More central than every line's starting point, so neither of the above
      // can reach it: put it on the front of the nearest chain instead.
      let bestFront = null;
      let frontDistance = Infinity;
      for (const chain of chains) {
        if (chain[0] <= idx) continue;
        const head = stations[chain[0]];
        const d = Math.hypot(head.x - target.x, head.y - target.y);
        if (d < frontDistance) {
          frontDistance = d;
          bestFront = chain;
        }
      }
      if (bestFront) {
        bestFront.unshift(idx);
        stations[idx].lines++;
      }
    }
  }

  function finishLine(stations, rng, chain, colorIndex) {
    // Flatten the chain into a polyline, remembering where each station sits
    // along it so growth can stop cleanly at a station.
    const points = [{ x: stations[chain[0]].x, y: stations[chain[0]].y }];
    const stops = [0];
    for (let i = 1; i < chain.length; i++) {
      const from = stations[chain[i - 1]];
      const to = stations[chain[i]];
      points.push(...octilinear(from, to, rng() < 0.5));
      stops.push(points.length - 1);
    }

    const cum = [0];
    for (let i = 1; i < points.length; i++) {
      cum.push(
        cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y),
      );
    }

    return {
      color: PALETTE[colorIndex % PALETTE.length],
      chain,
      points,
      cum,
      stopAt: stops.map((p) => cum[p]),
      length: cum[cum.length - 1],
      drawn: 0,
      trains: [],
    };
  }

  function build() {
    const rng = mulberry32(seed);
    const cell = Math.max(38, Math.min(width, height) / 13);
    const stations = placeStations(rng, cell);
    const chains = [];

    for (let i = 0; i < LINE_COUNT; i++) {
      // Every line leaves from the middle of the map, so the network radiates
      // outward instead of appearing as unconnected stubs on the edges.
      const start = Math.min(stations.length - 2, Math.floor(rng() * 5));
      if (start < 0) break;
      const chain = growChain(stations, rng, start);
      if (chain) chains.push(chain);
    }

    connectOrphans(stations, chains);
    const lines = chains.map((chain, i) => finishLine(stations, rng, chain, i));

    net = { stations, lines, cell };
  }

  function resize() {
    // Capped at 1.5 rather than 2: on a Retina display that is 44% fewer pixels
    // to clear, blit and composite every frame, and on a dim decorative map
    // behind the page the difference is not one you can pick out.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    trackLayer.width = canvas.width;
    trackLayer.height = canvas.height;
    trackCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    trackDirty = true;
    build();
  }

  // ---- geometry helpers ---------------------------------------------------

  function pointAt(line, distance) {
    const { points, cum } = line;
    const d = Math.max(0, Math.min(distance, line.length));
    for (let i = 1; i < points.length; i++) {
      if (cum[i] >= d) {
        const span = cum[i] - cum[i - 1] || 1;
        const f = (d - cum[i - 1]) / span;
        return {
          x: points[i - 1].x + (points[i].x - points[i - 1].x) * f,
          y: points[i - 1].y + (points[i].y - points[i - 1].y) * f,
          angle: Math.atan2(points[i].y - points[i - 1].y, points[i].x - points[i - 1].x),
        };
      }
    }
    const last = points[points.length - 1];
    return { x: last.x, y: last.y, angle: 0 };
  }

  /** How much of a line should exist, given how many stations are revealed. */
  function targetLength(line) {
    let target = 0;
    for (let i = 0; i < line.chain.length; i++) {
      if (line.chain[i] < targetStations) target = line.stopAt[i];
      else break;
    }
    return target;
  }

  // ---- simulation ---------------------------------------------------------

  function step(dt) {
    for (let i = 0; i < net.stations.length; i++) {
      const station = net.stations[i];
      const wanted = i < targetStations ? 1 : 0;
      station.reveal +=
        Math.sign(wanted - station.reveal) * Math.min(dt * 1.8, Math.abs(wanted - station.reveal));
    }

    // Freight gathers on the platforms and is taken away again. The station's
    // glow is how much is sitting there.
    for (const station of net.stations) {
      if (station.reveal < 0.5) continue;
      station.cargoTimer -= dt;
      if (station.cargoTimer <= 0) {
        station.cargoTimer = 0.9 + Math.random() * 2.6;
        const arriving = Math.random() < 0.5 + busy * 0.18;
        station.cargo = Math.max(0, Math.min(MAX_CARGO, station.cargo + (arriving ? 1 : -1)));
      }
      station.cargoShown += (station.cargo - station.cargoShown) * Math.min(1, dt * 2.4);
    }

    for (const line of net.lines) {
      const target = targetLength(line);
      if (line.drawn !== target) trackDirty = true;
      if (line.drawn < target) line.drawn = Math.min(target, line.drawn + BUILD_SPEED * dt);
      else if (line.drawn > target)
        line.drawn = Math.max(target, line.drawn - BUILD_SPEED * 2 * dt);

      // One train per stretch of line, up to three.
      const wantTrains = line.drawn < 90 ? 0 : Math.min(3, 1 + Math.floor(line.drawn / 420));
      while (line.trains.length < wantTrains) {
        line.trains.push({
          pos: Math.random() * Math.max(1, line.drawn),
          dir: Math.random() < 0.5 ? 1 : -1,
          speed: 26 + Math.random() * 16,
          wagons: 2 + Math.floor(Math.random() * 3),
          dwell: 0,
        });
      }
      while (line.trains.length > wantTrains) line.trains.pop();

      for (const train of line.trains) {
        if (train.dwell > 0) {
          train.dwell -= dt;
          continue;
        }
        train.pos += train.dir * train.speed * (0.75 + busy * 0.9) * dt;
        const tail = train.wagons * (CAR + CAR_GAP);
        if (train.pos > line.drawn) {
          train.pos = line.drawn;
          train.dir = -1;
          train.dwell = 0.6 + Math.random() * 0.8;
        } else if (train.pos < Math.min(tail, line.drawn * 0.5)) {
          train.pos = Math.min(tail, line.drawn * 0.5);
          train.dir = 1;
          train.dwell = 0.6 + Math.random() * 0.8;
        }
      }
    }
  }

  // ---- drawing ------------------------------------------------------------

  function shapePath(x, y, r, shape) {
    ctx.beginPath();
    switch (shape) {
      case "square":
        ctx.rect(x - r, y - r, r * 2, r * 2);
        break;
      case "triangle":
        ctx.moveTo(x, y - r * 1.15);
        ctx.lineTo(x + r * 1.1, y + r * 0.8);
        ctx.lineTo(x - r * 1.1, y + r * 0.8);
        ctx.closePath();
        break;
      case "diamond":
        ctx.moveTo(x, y - r * 1.2);
        ctx.lineTo(x + r * 1.2, y);
        ctx.lineTo(x, y + r * 1.2);
        ctx.lineTo(x - r * 1.2, y);
        ctx.closePath();
        break;
      case "pentagon":
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i * TAU) / 5;
          const px = x + Math.cos(a) * r * 1.15;
          const py = y + Math.sin(a) * r * 1.15;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;
      case "cross": {
        const t = r * 0.42;
        ctx.moveTo(x - t, y - r);
        ctx.lineTo(x + t, y - r);
        ctx.lineTo(x + t, y - t);
        ctx.lineTo(x + r, y - t);
        ctx.lineTo(x + r, y + t);
        ctx.lineTo(x + t, y + t);
        ctx.lineTo(x + t, y + r);
        ctx.lineTo(x - t, y + r);
        ctx.lineTo(x - t, y + t);
        ctx.lineTo(x - r, y + t);
        ctx.lineTo(x - r, y - t);
        ctx.lineTo(x - t, y - t);
        ctx.closePath();
        break;
      }
      case "star":
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const rr = i % 2 === 0 ? r * 1.35 : r * 0.55;
          const px = x + Math.cos(a) * rr;
          const py = y + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;
      default:
        ctx.arc(x, y, r, 0, TAU);
    }
  }

  /** The polyline as far as it has actually been built. */
  function builtPoints(line) {
    const { points, cum } = line;
    if (line.drawn <= 1) return null;
    const out = [points[0]];
    for (let i = 1; i < points.length; i++) {
      if (cum[i] <= line.drawn) {
        out.push(points[i]);
      } else {
        const span = cum[i] - cum[i - 1] || 1;
        const f = (line.drawn - cum[i - 1]) / span;
        out.push({
          x: points[i - 1].x + (points[i].x - points[i - 1].x) * f,
          y: points[i - 1].y + (points[i].y - points[i - 1].y) * f,
        });
        break;
      }
    }
    return out.length >= 2 ? out : null;
  }

  function tracePath(g, pts) {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  }

  /** Ballast: a dark bed so crossings stay readable. */
  function drawBed(g, pts) {
    tracePath(g, pts);
    g.lineWidth = 9.5;
    g.lineJoin = "round";
    g.lineCap = "round";
    g.strokeStyle = "rgba(8, 11, 16, 0.82)";
    g.stroke();
  }

  /** Sleepers: a thick dashed stroke lays ties straight across the route. */
  function drawSleepers(g, pts, color) {
    tracePath(g, pts);
    g.setLineDash([2.2, 6.4]);
    g.lineWidth = 8;
    g.lineCap = "butt";
    g.lineJoin = "round";
    g.strokeStyle = rgba(color, 0.13);
    g.stroke();
    g.setLineDash([]);
  }

  /** Two rails, offset either side of the route's centre line. */
  function drawRails(g, pts, color) {
    g.strokeStyle = rgba(color, 0.32);
    g.lineWidth = 1.25;
    g.lineCap = "round";
    for (const side of [-1, 1]) {
      g.beginPath();
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = (-(b.y - a.y) / len) * RAIL_GAUGE * side;
        const ny = ((b.x - a.x) / len) * RAIL_GAUGE * side;
        g.moveTo(a.x + nx, a.y + ny);
        g.lineTo(b.x + nx, b.y + ny);
      }
      g.stroke();
    }
  }

  function drawTrain(line, train) {
    for (let k = 0; k <= train.wagons; k++) {
      const d = train.pos - train.dir * k * (CAR + CAR_GAP);
      if (d < 0 || d > line.drawn) continue;
      const p = pointAt(line, d);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = "rgba(6, 9, 13, 0.92)";
      ctx.beginPath();
      ctx.roundRect(-CAR / 2 - 1, -4.2, CAR + 2, 8.4, 2.4);
      ctx.fill();
      if (k === 0) {
        ctx.fillStyle = rgba(line.color, 0.8);
        ctx.beginPath();
        ctx.roundRect(-CAR / 2, -3.4, CAR, 6.8, 2);
        ctx.fill();
      } else {
        // An open wagon with a load sitting in it.
        ctx.fillStyle = "rgba(12, 16, 22, 0.95)";
        ctx.beginPath();
        ctx.roundRect(-CAR / 2, -2.7, CAR, 5.4, 1.4);
        ctx.fill();
        ctx.strokeStyle = rgba(line.color, 0.6);
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.fillStyle = rgba(line.color, 0.45);
        ctx.fillRect(-CAR / 2 + 1.6, -2.4, CAR - 3.2, 2);
      }
      ctx.restore();
    }
  }

  function drawStation(station) {
    const r = (station.lines >= 2 ? 6.6 : 5) * (0.4 + 0.6 * station.reveal);

    // The more freight is waiting here, the warmer the station burns.
    const load = Math.max(0, Math.min(1, station.cargoShown / MAX_CARGO)) * station.reveal;
    if (load > 0.02) {
      const size = 18 + load * 34;
      ctx.globalAlpha = 0.1 + load * 0.45;
      ctx.drawImage(glowSprite, station.x - size / 2, station.y - size / 2, size, size);
      ctx.globalAlpha = 1;
    }

    shapePath(station.x, station.y, r, station.shape);
    ctx.fillStyle = "rgba(10, 13, 18, 0.96)";
    ctx.fill();

    ctx.strokeStyle = `rgba(215, 224, 235, ${0.38 * station.reveal})`;
    ctx.lineWidth = station.lines >= 2 ? 2.2 : 1.7;
    shapePath(station.x, station.y, r, station.shape);
    ctx.stroke();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    if (trackDirty) {
      trackDirty = false;
      trackCtx.clearRect(0, 0, width, height);
      // Every bed, then every sleeper, then every rail — so where two routes
      // cross, one doesn't bury the other under its ballast.
      const built = net.lines.map(builtPoints);
      for (const pts of built) if (pts) drawBed(trackCtx, pts);
      for (let i = 0; i < built.length; i++)
        if (built[i]) drawSleepers(trackCtx, built[i], net.lines[i].color);
      for (let i = 0; i < built.length; i++)
        if (built[i]) drawRails(trackCtx, built[i], net.lines[i].color);
    }
    ctx.drawImage(trackLayer, 0, 0, width, height);

    for (const line of net.lines) for (const train of line.trains) drawTrain(line, train);
    for (const station of net.stations) {
      if (station.reveal > 0.01) drawStation(station);
    }
  }

  // Ambient scenery does not need 60fps, and redrawing a full-viewport canvas
  // is the most expensive thing the page does. Half the frames, half the heat;
  // at this speed — slow trains, a slowly growing map — it looks the same.
  const FRAME_MS = 1000 / 30;

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);

    const since = now - lastFrame;
    if (since < FRAME_MS) return;
    lastFrame = now;

    // A hidden tab still fires rAF in some browsers; there is nothing to see.
    if (!enabled || document.hidden) return;
    step(Math.min(since / 1000, 0.5));
    draw();
  }

  window.addEventListener("resize", debounce(resize, 200));
  resize();

  return {
    start() {
      if (running) return;
      running = true;
      lastFrame = performance.now();
      if (reduceMotion) {
        // Settle the map into place and draw it once, with nothing moving.
        for (let i = 0; i < 240; i++) step(1 / 60);
        draw();
        running = false;
        return;
      }
      requestAnimationFrame(frame);
    },

    /**
     * growth — roughly how much you have built; drives how far the map reaches.
     * busy   — 0..1, how hard the railway is working; drives train speed.
     * regauges — reseeds the whole layout, so a rebuilt railway is a new map.
     */
    update({ growth = 0, busy: busyness = 0, regauges = 0 } = {}) {
      busy = Math.max(0, Math.min(1, busyness));
      targetStations = Math.max(4, Math.min(MAX_STATIONS, Math.round(4 + growth * 0.55)));
      const wantSeed = 7 + regauges * 101;
      if (wantSeed !== seed) {
        seed = wantSeed;
        trackDirty = true;
        build();
      }
    },

    setEnabled(on) {
      enabled = on;
      trackDirty = true;
      if (!on) ctx.clearRect(0, 0, width, height);
    },
  };
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
