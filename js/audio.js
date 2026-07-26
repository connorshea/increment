// Everything you hear is synthesised at runtime — there are no audio files in
// this repo. A brown-noise rumble for the rolling stock, wheels ticking over
// rail joints (the rhythm speeds up as the railway gets busier), the odd
// distant horn, and a few short sounds for the things you do.
//
// Browsers refuse to start audio until the player interacts with the page, so
// nothing is built until unlock() is called from a real gesture.

const TARGET_VOLUME = 0.55;

export function createAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const supported = typeof Ctx === "function";

  let ctx = null;
  let master = null;
  let rumbleGain = null;
  let clackBus = null;
  let noise = null;
  let unlocked = false;
  let wanted = false;
  let built = false;
  let timer = null;
  let nextClack = 0;
  let nextHorn = 0;
  let intensity = 0;
  let lastHaulSound = 0;

  // ---- construction -------------------------------------------------------

  function brownNoise(seconds) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return buffer;
  }

  function build() {
    if (built) return;
    built = true;

    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    noise = brownNoise(4);

    // The rolling rumble: brown noise with everything above the basement gone.
    const bed = ctx.createBufferSource();
    bed.buffer = noise;
    bed.loop = true;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 165;
    lowpass.Q.value = 0.8;

    rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.3;

    bed.connect(lowpass).connect(rumbleGain).connect(master);

    // A whisper of air rushing past, to stop the bed sounding like a fridge.
    const air = ctx.createBufferSource();
    air.buffer = noise;
    air.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1400;
    band.Q.value = 0.5;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.016;
    air.connect(band).connect(airGain).connect(master);

    // Very slow swell, so the bed never sits perfectly still.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.07;
    lfo.connect(lfoDepth).connect(rumbleGain.gain);

    clackBus = ctx.createGain();
    clackBus.gain.value = 0.75;
    clackBus.connect(master);

    bed.start();
    air.start();
    lfo.start();

    nextClack = ctx.currentTime + 0.4;
    nextHorn = ctx.currentTime + 45 + Math.random() * 60;
  }

  // ---- voices -------------------------------------------------------------

  /** One wheel passing over a rail joint. */
  function clack(when, volume) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 950 + Math.random() * 600;
    band.Q.value = 1.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
    src.connect(band).connect(gain).connect(clackBus);
    src.start(when, Math.random() * 3, 0.2);
    src.stop(when + 0.14);

    // A little weight underneath the tick.
    const thumpSrc = ctx.createBufferSource();
    thumpSrc.buffer = noise;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 130;
    const thump = ctx.createGain();
    thump.gain.setValueAtTime(0.0001, when);
    thump.gain.linearRampToValueAtTime(volume * 1.5, when + 0.008);
    thump.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    thumpSrc.connect(low).connect(thump).connect(clackBus);
    thumpSrc.start(when, Math.random() * 3, 0.25);
    thumpSrc.stop(when + 0.18);
  }

  /** The classic minor-seventh horn chord, heard from some way off. */
  function horn(when, volume = 0.1, length = 2.1) {
    const shell = ctx.createGain();
    shell.gain.setValueAtTime(0.0001, when);
    shell.gain.exponentialRampToValueAtTime(volume, when + 0.3);
    shell.gain.setValueAtTime(volume, when + length * 0.45);
    shell.gain.exponentialRampToValueAtTime(0.0001, when + length);

    const soften = ctx.createBiquadFilter();
    soften.type = "lowpass";
    soften.frequency.value = 1700;
    shell.connect(soften).connect(master);

    for (const [freq, level] of [
      [196, 1],
      [233, 0.75],
      [294, 0.6],
      [349, 0.4],
      [392, 0.3],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      osc.detune.value = (Math.random() - 0.5) * 8;
      const voice = ctx.createGain();
      voice.gain.value = level * 0.4;
      osc.connect(voice).connect(shell);
      osc.start(when);
      osc.stop(when + length + 0.1);
    }
  }

  /** Short percussive noise, used for hauling and buying. */
  function thud(volume = 0.22, cutoff = 320, decay = 0.13) {
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    src.connect(low).connect(gain).connect(master);
    src.start(now, Math.random() * 3, decay + 0.05);
    src.stop(now + decay + 0.05);
  }

  /** Tape peeling, the flap dropping open, paper moving inside. */
  function unbox() {
    const now = ctx.currentTime;

    // The tape coming off: noise through a bandpass that sweeps upward, with a
    // fast square wobble on the gain for the ratchety texture of a tear.
    const rip = ctx.createBufferSource();
    rip.buffer = noise;
    const sweep = ctx.createBiquadFilter();
    sweep.type = "bandpass";
    sweep.Q.value = 1.1;
    sweep.frequency.setValueAtTime(1200, now);
    sweep.frequency.exponentialRampToValueAtTime(4200, now + 0.24);
    const ripGain = ctx.createGain();
    ripGain.gain.setValueAtTime(0.0001, now);
    ripGain.gain.linearRampToValueAtTime(0.45, now + 0.02);
    ripGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    const wobble = ctx.createOscillator();
    wobble.type = "square";
    wobble.frequency.value = 62;
    const wobbleDepth = ctx.createGain();
    wobbleDepth.gain.value = 0.06;
    wobble.connect(wobbleDepth).connect(ripGain.gain);
    rip.connect(sweep).connect(ripGain).connect(master);
    rip.start(now, Math.random() * 3, 0.35);
    rip.stop(now + 0.32);
    wobble.start(now);
    wobble.stop(now + 0.32);

    // The flap dropping open.
    const flapAt = now + 0.2;
    const flap = ctx.createBufferSource();
    flap.buffer = noise;
    const body = ctx.createBiquadFilter();
    body.type = "lowpass";
    body.frequency.value = 240;
    const flapGain = ctx.createGain();
    flapGain.gain.setValueAtTime(0.0001, flapAt);
    flapGain.gain.linearRampToValueAtTime(0.55, flapAt + 0.01);
    flapGain.gain.exponentialRampToValueAtTime(0.0001, flapAt + 0.2);
    flap.connect(body).connect(flapGain).connect(master);
    flap.start(flapAt, Math.random() * 3, 0.25);
    flap.stop(flapAt + 0.24);

    // Packing paper, somewhere in there.
    const rustleAt = now + 0.26;
    const rustle = ctx.createBufferSource();
    rustle.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3200;
    const rustleGain = ctx.createGain();
    rustleGain.gain.setValueAtTime(0.0001, rustleAt);
    rustleGain.gain.linearRampToValueAtTime(0.13, rustleAt + 0.04);
    rustleGain.gain.exponentialRampToValueAtTime(0.0001, rustleAt + 0.34);
    rustle.connect(hp).connect(rustleGain).connect(master);
    rustle.start(rustleAt, Math.random() * 3, 0.4);
    rustle.stop(rustleAt + 0.38);
  }

  /** A small struck-metal tone, for milestones and spikes. */
  function bell(freqs, volume = 0.09, decay = 1.1) {
    const now = ctx.currentTime;
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freqs[i];
      const gain = ctx.createGain();
      const start = now + i * 0.07;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
      osc.connect(gain).connect(master);
      osc.start(start);
      osc.stop(start + decay + 0.05);
    }
  }

  // ---- scheduling ---------------------------------------------------------

  function pump() {
    if (!built || !wanted || ctx.state !== "running") return;
    const horizon = ctx.currentTime + 0.35;

    // Busier railway, quicker joints — but it never becomes a drum machine.
    const gap = 1.05 - intensity * 0.5;
    while (nextClack < horizon) {
      clack(nextClack, 0.055 + intensity * 0.03);
      clack(nextClack + 0.15, 0.04 + intensity * 0.02);
      nextClack += gap + Math.random() * 0.05;
    }

    if (ctx.currentTime > nextHorn) {
      horn(ctx.currentTime + 0.1, 0.07 + intensity * 0.03);
      nextHorn = ctx.currentTime + 70 + Math.random() * 110;
    }
  }

  function startPump() {
    if (timer) return;
    timer = setInterval(pump, 60);
  }

  function stopPump() {
    clearInterval(timer);
    timer = null;
  }

  function fade(to, seconds = 0.8) {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
    master.gain.linearRampToValueAtTime(to, now + seconds);
  }

  function ready() {
    return supported && wanted && unlocked && built && ctx.state === "running";
  }

  function maybeStart() {
    if (!supported || !wanted || !unlocked) return;
    if (!ctx) ctx = new Ctx();
    build();
    if (ctx.state === "suspended") ctx.resume();
    nextClack = Math.max(nextClack, ctx.currentTime + 0.2);
    fade(TARGET_VOLUME);
    startPump();
  }

  // ---- public -------------------------------------------------------------

  return {
    supported,

    /** Call from a real user gesture; browsers block audio until then. */
    unlock() {
      if (unlocked) return;
      unlocked = true;
      maybeStart();
    },

    setEnabled(on) {
      wanted = !!on;
      if (!wanted) {
        if (built) fade(0, 0.5);
        stopPump();
        return;
      }
      maybeStart();
    },

    /** 0..1 — how busy the railway is. Drives the rhythm of the joints. */
    setIntensity(value) {
      intensity = Math.max(0, Math.min(1, value || 0));
    },

    /** Suspend while the tab is hidden, resume when it comes back. */
    setActive(active) {
      if (!built) return;
      if (!active) {
        stopPump();
        ctx.suspend();
      } else if (wanted) {
        ctx.resume();
        nextClack = ctx.currentTime + 0.2;
        startPump();
      }
    },

    sfx(name) {
      if (!ready()) return;
      switch (name) {
        case "haul": {
          // Rapid clicking shouldn't turn into a machine gun.
          const now = ctx.currentTime;
          if (now - lastHaulSound < 0.055) return;
          lastHaulSound = now;
          thud(0.16, 300, 0.1);
          break;
        }
        case "buy":
          thud(0.2, 420, 0.14);
          clack(ctx.currentTime + 0.05, 0.05);
          break;
        case "spike":
          bell([880, 1318], 0.08, 1.4);
          break;
        case "milestone":
          horn(ctx.currentTime, 0.085, 1.7);
          break;
        case "parcel":
          unbox();
          break;
        case "regauge":
          horn(ctx.currentTime, 0.14, 3);
          break;
        default:
          break;
      }
    },
  };
}
