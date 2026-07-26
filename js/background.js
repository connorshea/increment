// A rail network that slowly surveys itself across the page behind the game.
// Lines run straight, turn on proper railway angles, and throw off junctions as
// the railway grows. It never clears — it accretes, like a real network does.

const MAX_SEGMENTS = 9_000;
const ANGLE_STEP = Math.PI / 12; // 15° — track curves in decent increments
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createBackground(canvas) {
  const ctx = canvas.getContext('2d', { alpha: true });
  let heads = [];
  let segments = 0;
  let width = 0;
  let height = 0;
  let hue = 32;
  let intensity = 0;
  let enabled = true;
  let running = false;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    segments = 0;
    heads = Array.from({ length: headTarget() }, () => newHead());
  }

  function snap(angle) {
    return Math.round(angle / ANGLE_STEP) * ANGLE_STEP;
  }

  function newHead(x, y, angle) {
    return {
      x: x ?? Math.random() * width,
      y: y ?? Math.random() * height,
      angle: angle ?? snap(Math.random() * Math.PI * 2),
      life: 140 + Math.random() * 320,
      run: 30 + Math.random() * 90, // pixels until the next chance to turn
      tie: 0,
      width: 0.5 + Math.random() * 0.9,
    };
  }

  function headTarget() {
    return Math.round(4 + Math.min(26, intensity * 26));
  }

  function step() {
    const target = headTarget();
    while (heads.length < target) heads.push(newHead());
    while (heads.length > target) heads.pop();

    // Once the page fills up, fade it back so the survey can keep going.
    if (segments > MAX_SEGMENTS) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
      segments = Math.floor(MAX_SEGMENTS * 0.75);
    }

    const light = 46 + Math.min(22, intensity * 22);

    for (let i = 0; i < heads.length; i++) {
      const head = heads[i];
      const fromX = head.x;
      const fromY = head.y;
      const speed = 1.2 + head.width;

      head.x += Math.cos(head.angle) * speed;
      head.y += Math.sin(head.angle) * speed;
      head.life -= 1;
      head.run -= speed;
      head.tie += speed;

      // The rail itself.
      ctx.strokeStyle = `hsla(${hue}, 55%, ${light}%, 0.2)`;
      ctx.lineWidth = head.width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
      segments++;

      // Sleepers, every few pixels.
      if (head.tie > 7) {
        head.tie = 0;
        const nx = Math.cos(head.angle + Math.PI / 2) * (1.6 + head.width);
        const ny = Math.sin(head.angle + Math.PI / 2) * (1.6 + head.width);
        ctx.strokeStyle = `hsla(${hue - 8}, 40%, ${light - 6}%, 0.16)`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(head.x - nx, head.y - ny);
        ctx.lineTo(head.x + nx, head.y + ny);
        ctx.stroke();
      }

      if (head.run <= 0) {
        head.run = 40 + Math.random() * 130;
        // Curve, or throw off a junction.
        if (Math.random() < 0.62) {
          head.angle = snap(head.angle + (Math.random() < 0.5 ? -1 : 1) * ANGLE_STEP);
        }
        if (Math.random() < 0.22 && heads.length < target + 10) {
          ctx.fillStyle = `hsla(${hue + 14}, 75%, 66%, 0.3)`;
          ctx.beginPath();
          ctx.arc(head.x, head.y, 1.6 + head.width, 0, Math.PI * 2);
          ctx.fill();
          heads.push(newHead(head.x, head.y, snap(head.angle + (Math.random() < 0.5 ? -2 : 2) * ANGLE_STEP)));
        }
      }

      const off = head.x < -60 || head.x > width + 60 || head.y < -60 || head.y > height + 60;
      if (head.life <= 0 || off) heads[i] = newHead();
    }
  }

  function frame() {
    if (!running) return;
    if (enabled) step();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', debounce(resize, 200));
  resize();

  return {
    start() {
      if (running) return;
      running = true;
      // Lay some track up front so the page never opens on a blank survey.
      for (let i = 0; i < 320; i++) step();
      if (reduceMotion) {
        running = false; // a quiet snapshot instead of an endless animation
        return;
      }
      requestAnimationFrame(frame);
    },
    /** progress: 0..1-ish measure of how big the railway is; regauges shifts the palette. */
    update(progress, regauges) {
      intensity = Math.max(0, Math.min(1, progress));
      hue = (32 + regauges * 27) % 360;
    },
    setEnabled(on) {
      enabled = on;
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
