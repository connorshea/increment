import {
  ACHIEVEMENTS, BUFFS, GENERATORS, GEN_BY_ID, SPIKE_UPGRADES, UPGRADE_BY_ID,
} from './data.js';
import {
  availableUpgrades, buffRemaining, genCost, maxAffordable, nextSpikeAt, spikeGain,
} from './engine.js';
import { fmt, fmtClock, fmtMult, fmtPct, fmtTime } from './format.js';

const $ = (sel) => document.querySelector(sel);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initUI(handlers) {
  const el = {
    cargo: $('#cargo'),
    persec: $('#persec'),
    buffHint: $('#buff-hint'),
    haulval: $('#haulval'),
    buffbar: $('#buffbar'),
    spikeBadge: $('#spike-badge'),
    spikeNum: $('#spike-num'),
    spikeBonus: $('#spike-bonus'),
    qsRun: $('#qs-run'),
    qsTotal: $('#qs-total'),
    qsHauls: $('#qs-hauls'),
    genList: $('#gen-list'),
    upgradeList: $('#upgrade-list'),
    upgradeEmpty: $('#upgrade-empty'),
    ownedList: $('#owned-list'),
    ownedCount: $('#owned-count'),
    spikeList: $('#spike-list'),
    statgrid: $('#statgrid'),
    achList: $('#ach-list'),
    achCount: $('#ach-count'),
    regaugeGain: $('#regauge-gain'),
    regaugeBtn: $('#regauge-btn'),
    regaugeNext: $('#regauge-next'),
    pipUpgrades: $('#pip-upgrades'),
    pipSpikes: $('#pip-spikes'),
    saveStatus: $('#save-status'),
    bgBtn: $('#bg-btn'),
    parcelLayer: $('#parcel-layer'),
    toastLayer: $('#toast-layer'),
    loader: $('#loader'),
  };

  let buyAmount = 1;
  let activeTab = 'build';
  let upgradeSig = '';
  let genSig = '';
  const genRows = new Map();
  const spikeRows = new Map();
  const achRows = new Map();

  // ---- static lists -------------------------------------------------------

  for (const upg of SPIKE_UPGRADES) {
    const btn = document.createElement('button');
    btn.className = 'upg spike';
    btn.dataset.cost = upg.cost;
    btn.title = describeEffects(upg.effects);
    btn.innerHTML = `
      <span class="upg-icon">${upg.icon}</span>
      <span>
        <span class="upg-name">${upg.name}</span><br>
        <span class="upg-desc">${upg.desc}</span>
      </span>
      <span class="upg-cost">${upg.cost} 🔩</span>`;
    btn.addEventListener('click', () => handlers.onBuySpike(upg.id));
    const li = document.createElement('li');
    li.appendChild(btn);
    el.spikeList.appendChild(li);
    spikeRows.set(upg.id, btn);
  }

  for (const ach of ACHIEVEMENTS) {
    const li = document.createElement('li');
    li.className = 'ach';
    li.innerHTML = `
      <span class="ach-emoji">${ach.icon}</span>
      <span>
        <span class="ach-name">${ach.name}</span><br>
        <span class="ach-desc">${ach.desc}</span>
      </span>`;
    el.achList.appendChild(li);
    achRows.set(ach.id, li);
  }

  // ---- events -------------------------------------------------------------

  el.loader.addEventListener('click', (ev) => handlers.onHaul(ev));

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.tabpanel').forEach((p) => {
        p.classList.toggle('active', p.dataset.panel === activeTab);
      });
      handlers.onTabChange?.(activeTab);
    });
  });

  document.querySelectorAll('.amt').forEach((btn) => {
    btn.addEventListener('click', () => {
      buyAmount = btn.dataset.amt === 'max' ? 'max' : Number(btn.dataset.amt);
      document.querySelectorAll('.amt').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  el.regaugeBtn.addEventListener('click', () => handlers.onRegauge());
  $('#save-btn').addEventListener('click', () => handlers.onSave(true));
  $('#wipe-btn').addEventListener('click', () => handlers.onWipe());
  $('#export-btn').addEventListener('click', () => handlers.onExport());
  $('#import-btn').addEventListener('click', () => handlers.onImport());
  el.bgBtn.addEventListener('click', () => handlers.onToggleBg());

  // ---- rendering ----------------------------------------------------------

  function ensureGenRows(S) {
    const visible = S.seenGens.slice();
    const nextIdx = visible.length;
    const teaser = nextIdx < GENERATORS.length ? GENERATORS[nextIdx].id : null;
    const sig = `${visible.join(',')}|${teaser}`;
    if (sig === genSig) return;
    genSig = sig;

    el.genList.textContent = '';
    genRows.clear();

    for (const id of visible) {
      const gen = GEN_BY_ID[id];
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'gen';
      btn.innerHTML = `
        <span class="gen-icon">${gen.icon}</span>
        <span>
          <span class="gen-name">${gen.name}</span>
          <span class="gen-blurb">${gen.blurb}</span>
          <span class="gen-out" data-out></span>
        </span>
        <span class="gen-right">
          <span class="gen-cost" data-cost></span><br>
          <span class="gen-owned" data-owned>0</span><br>
          <span class="gen-tier" data-tier></span>
        </span>`;
      btn.addEventListener('click', () => handlers.onBuyGen(gen.id, buyAmount));
      li.appendChild(btn);
      el.genList.appendChild(li);
      genRows.set(id, {
        btn,
        cost: btn.querySelector('[data-cost]'),
        owned: btn.querySelector('[data-owned]'),
        out: btn.querySelector('[data-out]'),
        tier: btn.querySelector('[data-tier]'),
      });
    }

    if (teaser) {
      const prev = GENERATORS[nextIdx - 1];
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="gen locked">
          <span class="gen-icon">❔</span>
          <span>
            <span class="gen-name">something bigger</span>
            <span class="gen-blurb">put a ${prev.name} on the rails to find out what comes next</span>
          </span>
          <span class="gen-right"><span class="gen-cost">???</span></span>
        </div>`;
      el.genList.appendChild(li);
    }
  }

  function renderGens(S, stats) {
    ensureGenRows(S);
    for (const [id, row] of genRows) {
      const gen = GEN_BY_ID[id];
      const owned = S.gens[id] || 0;
      const affordableCount = maxAffordable(gen, owned, S.cargo);
      const count = buyAmount === 'max' ? Math.max(1, affordableCount) : buyAmount;
      const cost = genCost(gen, owned, count);
      const canAfford = buyAmount === 'max' ? affordableCount >= 1 : cost <= S.cargo;

      row.cost.textContent = `${fmt(cost)}${count > 1 ? ` ·×${count}` : ''}`;
      row.cost.classList.toggle('too-dear', !canAfford);
      row.owned.textContent = owned;
      row.btn.classList.toggle('affordable', canAfford);
      const { each, total, mult } = stats.perGen[id];
      row.out.textContent = owned > 0
        ? `${fmt(total)}/s · ${fmt(each)} each`
        : `${fmt(each)}/s each`;
      row.tier.textContent = mult > 1 ? fmtMult(mult) : '';
    }
  }

  function renderUpgrades(S) {
    const list = availableUpgrades(S);
    const sig = list.map((u) => u.id).join(',');
    if (sig !== upgradeSig) {
      upgradeSig = sig;
      el.upgradeList.textContent = '';
      for (const upg of list) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.className = 'upg';
        btn.dataset.cost = upg.cost;
        btn.title = describeEffects(upg.effects);
        btn.innerHTML = `
          <span class="upg-icon">${upg.icon}</span>
          <span>
            <span class="upg-name">${upg.name}</span><br>
            <span class="upg-effect">${describeEffects(upg.effects)}</span><br>
            <span class="upg-desc">${upg.desc}</span>
          </span>
          <span class="upg-cost">${fmt(upg.cost)}</span>`;
        btn.addEventListener('click', () => handlers.onBuyUpgrade(upg.id));
        li.appendChild(btn);
        el.upgradeList.appendChild(li);
      }
      el.upgradeEmpty.hidden = list.length > 0;

      el.ownedList.textContent = '';
      for (const id of S.upgrades) {
        const upg = UPGRADE_BY_ID[id];
        if (!upg) continue;
        const span = document.createElement('span');
        span.textContent = upg.icon;
        span.title = `${upg.name} — ${describeEffects(upg.effects)}`;
        el.ownedList.appendChild(span);
      }
      el.ownedCount.textContent = `(${S.upgrades.length})`;
    }

    for (const btn of el.upgradeList.querySelectorAll('.upg')) {
      btn.classList.toggle('affordable', Number(btn.dataset.cost) <= S.cargo);
    }
  }

  function renderSpikes(S) {
    for (const [id, btn] of spikeRows) {
      const bought = S.spikeUpgrades.includes(id);
      btn.classList.toggle('bought', bought);
      btn.classList.toggle('affordable', !bought && S.spikes >= Number(btn.dataset.cost));
      btn.disabled = bought;
    }
  }

  function renderStats(S, stats) {
    const totalGens = Object.values(S.gens).reduce((a, b) => a + b, 0);
    const rows = [
      ['cargo in hand', fmt(S.cargo)],
      ['per second', fmt(stats.perSec)],
      ['best per second', fmt(S.bestPerSec)],
      ['per haul', fmt(stats.haulValue)],
      ['moved on this line', fmt(S.runEarned)],
      ['moved all time', fmt(S.totalEarned)],
      ['rolling stock', fmt(totalGens)],
      ['works completed', `${S.upgrades.length}`],
      ['milestones', `${S.achievements.length} / ${ACHIEVEMENTS.length}`],
      ['global multiplier', fmtMult(stats.allMult)],
      ['milestone bonus', fmtPct(stats.milestoneBonus)],
      ['spike bonus', fmtPct(stats.spikeBonus)],
      ['spikes held / driven', `${fmt(S.spikes)} / ${fmt(S.totalSpikes)}`],
      ['regauges', `${S.regauges}`],
      ['parcels caught', `${S.parcels}`],
      ['hauls by hand', fmt(S.hauls)],
      ['this line', fmtTime(S.runTime)],
      ['total played', fmtTime(S.playTime)],
      ['away progress', `${stats.offlineHours}h @ ${Math.round(stats.offlineRate * 100)}%`],
      ['railway founded', new Date(S.startedAt).toLocaleDateString()],
    ];
    el.statgrid.innerHTML = rows
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
      .join('');

    const got = new Set(S.achievements);
    for (const [id, li] of achRows) li.classList.toggle('got', got.has(id));
    el.achCount.textContent = `(${S.achievements.length}/${ACHIEVEMENTS.length})`;
  }

  function renderHeader(S, stats) {
    el.cargo.textContent = fmt(S.cargo);
    el.persec.textContent = fmt(stats.perSec);
    el.buffHint.textContent = stats.buffMult > 1 ? `  ×${Math.round(stats.buffMult)}!` : '';
    el.haulval.textContent = fmt(stats.haulValue);
    el.qsRun.textContent = fmt(S.runEarned);
    el.qsTotal.textContent = fmt(S.totalEarned);
    el.qsHauls.textContent = fmt(S.hauls);

    const hasSpikes = S.totalSpikes > 0 || S.regauges > 0;
    el.spikeBadge.hidden = !hasSpikes;
    if (hasSpikes) {
      el.spikeNum.textContent = fmt(S.spikes);
      el.spikeBonus.textContent = fmtPct(stats.spikeBonus);
    }

    if (S.buff) {
      const buff = BUFFS[S.buff.type];
      el.buffbar.hidden = false;
      el.buffbar.innerHTML = `<span class="buff-chip">${buff.icon} ${buff.name} ${fmtClock(buffRemaining(S))}</span>`;
    } else if (!el.buffbar.hidden) {
      el.buffbar.hidden = true;
      el.buffbar.textContent = '';
    }

    const gain = spikeGain(S);
    el.regaugeGain.textContent = fmt(gain);
    el.regaugeBtn.disabled = gain < 1;
    const need = nextSpikeAt(S);
    el.regaugeNext.textContent = gain >= 1
      ? `one more at ${fmt(need)} cargo moved all time`
      : `first spike at ${fmt(need)} cargo moved all time (${fmt(S.totalEarned)} so far)`;

    el.pipUpgrades.hidden = !availableUpgrades(S).some((u) => u.cost <= S.cargo);
    el.pipSpikes.hidden = !SPIKE_UPGRADES.some(
      (u) => !S.spikeUpgrades.includes(u.id) && S.spikes >= u.cost,
    );
    el.bgBtn.textContent = `Background: ${S.bgOn ? 'on' : 'off'}`;
  }

  function render(S, stats) {
    renderHeader(S, stats);
    if (activeTab === 'build') renderGens(S, stats);
    else if (activeTab === 'upgrades') renderUpgrades(S);
    else if (activeTab === 'spikes') renderSpikes(S);
    else if (activeTab === 'stats') renderStats(S, stats);
  }

  // ---- effects ------------------------------------------------------------

  function floatNumber(x, y, text, gold = false) {
    if (reduceMotion) return;
    const node = document.createElement('div');
    node.className = 'float-num';
    node.textContent = text;
    if (gold) node.style.color = 'var(--gold)';
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 1000);
  }

  const MAX_TOASTS = 4;

  function toast(message, gold = false) {
    const node = document.createElement('div');
    node.className = `toast${gold ? ' gold' : ''}`;
    node.textContent = message;
    el.toastLayer.appendChild(node);
    // A pile of milestones at once shouldn't bury the game.
    while (el.toastLayer.childElementCount > MAX_TOASTS) {
      el.toastLayer.firstElementChild.remove();
    }
    setTimeout(() => node.remove(), 4200);
  }

  function pressLoader() {
    el.loader.classList.add('pressed');
    setTimeout(() => el.loader.classList.remove('pressed'), 90);
  }

  /** Sends an express parcel rolling across the screen. Returns a dismiss fn. */
  function spawnParcel(lifetimeMs, onCatch) {
    const btn = document.createElement('button');
    btn.className = 'parcel';
    btn.type = 'button';
    btn.textContent = '📦';
    btn.setAttribute('aria-label', 'Catch the express parcel');
    const pad = 90;
    btn.style.left = `${pad + Math.random() * Math.max(1, window.innerWidth - pad * 2)}px`;
    btn.style.top = `${pad + Math.random() * Math.max(1, window.innerHeight - pad * 2)}px`;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      btn.classList.add('gone');
      setTimeout(() => btn.remove(), 400);
    };
    btn.addEventListener('click', () => {
      if (done) return;
      finish();
      onCatch();
    });
    const timer = setTimeout(finish, lifetimeMs);
    el.parcelLayer.appendChild(btn);
    return finish;
  }

  function setSaveStatus(text) {
    el.saveStatus.textContent = text;
  }

  function forceRefreshLists() {
    upgradeSig = '';
    genSig = '';
  }

  return {
    render, toast, floatNumber, pressLoader, spawnParcel, setSaveStatus,
    forceRefreshLists,
    getActiveTab: () => activeTab,
    getBuyAmount: () => buyAmount,
  };
}

// ---------------------------------------------------------------------------

export function describeEffects(effects) {
  return effects
    .map((e) => {
      switch (e.k) {
        case 'gen': return `${GEN_BY_ID[e.target].name} ${fmtMult(e.mult)}`;
        case 'all': return `everything ${fmtMult(e.mult)}`;
        case 'click': return `hauling ${fmtMult(e.mult)}`;
        case 'haulRate': return `hauls also earn ${fmtPct(e.pct)} of your per-second output`;
        case 'genPer': return `${GEN_BY_ID[e.target].name} ${fmtPct(e.pct)} per ${GEN_BY_ID[e.source].name}`;
        case 'parcelFreq': return `parcels ${fmtMult(e.mult)} as often`;
        case 'parcelDur': return `parcels wait ${fmtMult(e.mult)} as long`;
        case 'steam': return `Full Steam ${fmtMult(e.mult)} stronger`;
        case 'spikePower': return `each golden spike ${fmtPct(e.add)} stronger`;
        case 'offline': return `away progress: ${e.hours}h cap at ${Math.round(e.rate * 100)}%`;
        case 'headStart': return `open each line with ${fmt(e.cargo)} cargo`;
        default: return '';
      }
    })
    .filter(Boolean)
    .join(' · ');
}
