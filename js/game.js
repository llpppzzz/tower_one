/* =========================================================
   ASTRAL RIFT — core game
   ========================================================= */
(function () {
  'use strict';

  const D = window.GAME_DATA;
  const {
    WORLD, TOTAL_WAVES, PATH_POINTS, CORE_POS, TOWER_ORDER, TOWERS,
    ENEMY_ORDER, ENEMIES, WAVE_NAMES, BOSSES, WAVE_MODIFIERS, RARITY,
    UPGRADE_CARDS, META_UPGRADES, DIFFICULTIES, ABILITIES, TUTORIAL
  } = D;

  const TAU = Math.PI * 2;
  const SAVE_KEY = 'astralRift.save.v2';
  const META_KEY = 'astralRift.meta.v2';
  const MAX_PARTICLES = 760;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => (v - a) / (b - a);
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeOutQuint = t => 1 - Math.pow(1 - t, 5);
  const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const pad2 = n => String(n).padStart(2, '0');
  const formatNum = n => {
    n = Math.round(n);
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const v = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const n = parseInt(v, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgba(hex, a) {
    const c = hexToRgb(hex);
    return `rgba(${c.r},${c.g},${c.b},${a})`;
  }
  function mixColor(hex1, hex2, t) {
    const a = hexToRgb(hex1), b = hexToRgb(hex2);
    return `rgb(${Math.round(lerp(a.r, b.r, t))},${Math.round(lerp(a.g, b.g, t))},${Math.round(lerp(a.b, b.b, t))})`;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (!l2) return dist(px, py, x1, y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = clamp(t, 0, 1);
    return dist(px, py, x1 + t * dx, y1 + t * dy);
  }
  function angleLerp(a, b, t) {
    let d = ((b - a + Math.PI * 3) % TAU) - Math.PI;
    return a + d * t;
  }
  function weightedPick(items, weightFn, rng) {
    let total = 0;
    const weights = items.map(it => {
      const w = Math.max(0, weightFn(it));
      total += w;
      return w;
    });
    let r = rng() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /* ---------- path ---------- */
  function buildPath(points) {
    const raw = [];
    const n = points.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(n - 1, i + 2)];
      const steps = i === n - 2 ? 26 : 24;
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const t2 = t * t, t3 = t2 * t;
        raw.push({
          x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
    raw.push({ x: points[n - 1].x, y: points[n - 1].y });
    const cum = [0];
    for (let i = 1; i < raw.length; i++) {
      cum[i] = cum[i - 1] + dist(raw[i - 1].x, raw[i - 1].y, raw[i].x, raw[i].y);
    }
    return { points: raw, cum, length: cum[cum.length - 1] };
  }

  const PATH = buildPath(PATH_POINTS);

  function pathPointAt(d) {
    d = clamp(d, 0, PATH.length);
    let lo = 0, hi = PATH.cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (PATH.cum[mid] <= d) lo = mid; else hi = mid;
    }
    const seg = PATH.cum[hi] - PATH.cum[lo] || 1;
    const t = (d - PATH.cum[lo]) / seg;
    const a = PATH.points[lo], b = PATH.points[hi];
    const x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t);
    const tangent = Math.atan2(b.y - a.y, b.x - a.x);
    return { x, y, angle: tangent };
  }

  function distanceToPath(x, y) {
    let best = Infinity;
    const p = PATH.points;
    for (let i = 0; i < p.length - 1; i++) {
      const d = distToSegment(x, y, p[i].x, p[i].y, p[i + 1].x, p[i + 1].y);
      if (d < best) {
        best = d;
        if (best < 1) break;
      }
    }
    return best;
  }

  function tracePath(ctx) {
    const p = PATH.points;
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
  }

  /* ---------- DOM ---------- */
  const DOM = {
    app: $('#app'),
    canvas: $('#game'),
    bloom: $('#bloom'),
    hud: $('#hud'),
    menu: $('#menu'),
    aim: $('#aimCursor'),
    waveValue: $('#waveValue'),
    waveTotal: $('#waveTotal'),
    waveProgress: $('#waveProgress'),
    coreHealthFill: $('#coreHealthFill'),
    coreHealthText: $('#coreHealthText'),
    coreHealthMax: $('#coreHealthMax'),
    corePercent: $('#corePercent'),
    creditValue: $('#creditValue'),
    creditDelta: $('#creditDelta'),
    soundBtn: $('#soundBtn'),
    speedBtn: $('#speedBtn'),
    speedValue: $('#speedValue'),
    pauseBtn: $('#pauseBtn'),
    sidePanel: $('#sidePanel'),
    towerShop: $('#towerShop'),
    waveIntel: $('#waveIntel'),
    intelTitle: $('#intelTitle'),
    intelEnemies: $('#intelEnemies'),
    intelModifier: $('#intelModifier'),
    threatChip: $('#threatChip'),
    waveStatusText: $('#waveStatusText'),
    waveKillText: $('#waveKillText'),
    waveTrackFill: $('#waveTrackFill'),
    towerDetail: $('#towerDetail'),
    detailIcon: $('#detailIcon'),
    detailName: $('#detailName'),
    detailRole: $('#detailRole'),
    detailLevel: $('#detailLevel'),
    detailDps: $('#detailDps'),
    detailDamage: $('#detailDamage'),
    detailRange: $('#detailRange'),
    detailRate: $('#detailRate'),
    detailModeBtn: $('#targetModeBtn'),
    upgradeBtn: $('#upgradeBtn'),
    upgradeCost: $('#upgradeCost'),
    sellBtn: $('#sellBtn'),
    sellValue: $('#sellValue'),
    closeDetail: $('#closeDetail'),
    backDeployBtn: $('#backDeployBtn'),
    protocolSummary: $('#protocolSummary'),
    startZone: $('#startZone'),
    startWaveBtn: $('#startWaveBtn'),
    startWaveLabel: $('#startWaveLabel'),
    startHint: $('#startHint'),
    comboHud: $('#comboHud'),
    comboValue: $('#comboValue'),
    comboFill: $('#comboFill'),
    comboCount: $('#comboCount'),
    abilityList: $('#abilityList'),
    statusRibbon: $('#statusRibbon'),
    statusText: $('#statusRibbonText'),
    hintCard: $('#hintCard'),
    hintText: $('#hintText'),
    hintClose: $('#hintClose'),
    toastStack: $('#toastStack'),
    chroma: $('#chromaFx'),
    damageFlash: $('#damageFlash'),
    transition: $('#screenTransition'),
    newRunBtn: $('#newRunBtn'),
    continueBtn: $('#continueBtn'),
    continueMeta: $('#continueMeta'),
    shardValue: $('#shardValue'),
    metaList: $('#metaList'),
    menuStats: $('#menuStats'),
    difficultySwitch: $('#difficultySwitch'),
    abyssDifficulty: $('#abyssDifficulty'),
    draftOverlay: $('#draftOverlay'),
    draftGrid: $('#draftGrid'),
    draftCredits: $('#draftCredits'),
    rerollBtn: $('#rerollBtn'),
    rerollCost: $('#rerollCost'),
    waveBanner: $('#waveBanner'),
    bannerKicker: $('#bannerKicker'),
    bannerTitle: $('#bannerTitle'),
    bannerSub: $('#bannerSub'),
    bossWarning: $('#bossWarning'),
    bossWarningTitle: $('#bossWarningTitle'),
    bossWarningSub: $('#bossWarningSub'),
    pauseOverlay: $('#pauseOverlay'),
    pauseStats: $('#pauseStats'),
    resumeBtn: $('#resumeBtn'),
    saveBtn: $('#saveBtn'),
    abandonBtn: $('#abandonBtn'),
    shakeToggle: $('#shakeToggle'),
    bloomToggle: $('#bloomToggle'),
    musicToggle: $('#musicToggle'),
    endOverlay: $('#endOverlay'),
    endKicker: $('#endKicker'),
    endTitle: $('#endTitle'),
    endSub: $('#endSub'),
    endStats: $('#endStats'),
    endShards: $('#endShards'),
    endGlyph: $('#endGlyph'),
    retryBtn: $('#retryBtn'),
    menuBtn: $('#menuBtn'),
    endlessBtn: $('#endlessBtn'),
    rotateHint: $('#rotateHint')
  };

  /* ---------- persistent data ---------- */
  function defaultMeta() {
    return {
      version: 2,
      shards: 0,
      upgrades: { core: 0, capital: 0, damage: 0, cost: 0, ability: 0 },
      bestWave: 0,
      bestScore: 0,
      runs: 0,
      kills: 0,
      bosses: 0,
      victories: 0,
      unlockedAbyss: false,
      settings: { muted: false, music: true, shake: true, bloom: true }
    };
  }

  let meta = defaultMeta();
  let savedRun = null;
  let selectedDifficulty = 'standard';

  function loadMeta() {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        meta = Object.assign(defaultMeta(), parsed);
        meta.upgrades = Object.assign(defaultMeta().upgrades, parsed.upgrades || {});
        meta.settings = Object.assign(defaultMeta().settings, parsed.settings || {});
      }
    } catch (e) { meta = defaultMeta(); }
  }
  function saveMeta() {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* storage unavailable */ }
  }
  function loadSavedRun() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 2 || !parsed.run) return null;
      return parsed;
    } catch (e) { return null; }
  }
  function readSavedRun() {
    savedRun = loadSavedRun();
    return savedRun;
  }
  function deleteSavedRun() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    savedRun = null;
  }

  /* ---------- runtime state ---------- */
  let state = 'menu';
  let run = null;
  let towers = [];
  let enemies = [];
  let projectiles = [];
  let particles = [];
  let effects = [];
  let damageTexts = [];
  let decals = [];
  let ambientStars = [];
  let ambientDust = [];
  let bossBarEl = null;
  let paused = false;
  let speed = 1;
  let selectedBuildType = null;
  let selectedTowerId = null;
  let hoverTowerId = null;
  let pointer = { x: -1000, y: -1000, sx: 0, sy: 0, inside: false, valid: false };
  let view = { w: 0, h: 0, dpr: 1, scale: 1, offX: 0, offY: 0 };
  let bgCanvas = null;
  let bloomCanvas = null;
  let bloomCtx = null;
  let shake = 0;
  let chroma = 0;
  let hitStop = 0;
  let slowMo = 0;
  let lastTime = 0;
  let gameTime = 0;
  let uiAccum = 0;
  let hintTimer = null;
  let lastCredits = 0;
  let toastId = 0;
  let bossBarFlashTimer = 0;
  let currentDraftCards = [];
  let draftRerolled = false;
  let abandonArmed = false;
  let metaToastQueue = null;
  let pendingAttract = 0;
  let attractEnemies = [];
  let overwriteArmed = false;
  let overwriteTimer = null;
  let buildIdCounter = 0;

  const ctx = DOM.canvas.getContext('2d', { alpha: false, desynchronized: true });
  const settings = () => meta.settings;

  /* =========================================================
     UI CONSTRUCTION
     ========================================================= */
  function buildShop() {
    DOM.towerShop.innerHTML = TOWER_ORDER.map((id, i) => {
      const t = TOWERS[id];
      return `
        <button class="tower-card" data-tower="${id}" style="--tower-color:${t.color}" title="${t.name} · ${t.desc}">
          <span class="tower-card-ico"><svg><use href="#${t.icon}"></use></svg></span>
          <span class="tower-card-copy">
            <span class="tower-card-name">${t.name}<em>${t.en}</em></span>
            <span class="tower-card-role">${t.role}</span>
          </span>
          <span class="tower-card-side">
            <span class="tower-cost"><svg><use href="#i-credit"></use></svg><b data-cost="${id}">${t.cost}</b></span>
            <span class="tower-key">${i + 1}</span>
          </span>
        </button>`;
    }).join('');
    DOM.towerShop.addEventListener('click', e => {
      const card = e.target.closest('[data-tower]');
      if (!card) return;
      selectBuildType(card.dataset.tower);
    });
  }

  function buildAbilities() {
    DOM.abilityList.innerHTML = ABILITIES.map(a => `
      <button class="ability-btn" data-ability="${a.id}" style="--ability-color:${a.color}" aria-label="${a.name}" title="${a.name}：${a.desc}（冷却 ${a.cooldown}s）">
        <span class="ability-fill"></span>
        <span class="ability-cd"></span>
        <span class="ability-key">${a.key}</span>
        <span class="ability-icon"><svg><use href="#${a.icon}"></use></svg></span>
        <span class="ability-copy"><b>${a.name}</b><small>${a.en}</small></span>
      </button>`).join('');
    DOM.abilityList.addEventListener('click', e => {
      const btn = e.target.closest('[data-ability]');
      if (!btn) return;
      useAbility(btn.dataset.ability);
    });
  }

  function buildBossBar() {
    bossBarEl = document.createElement('div');
    bossBarEl.className = 'boss-bar is-hidden';
    bossBarEl.innerHTML = `
      <div class="boss-bar-top">
        <b id="bossBarName">裂隙级威胁</b>
        <span id="bossBarEn">RIFT SIGNATURE</span>
        <em id="bossBarPhase">PHASE I</em>
      </div>
      <div class="boss-hp"><i id="bossBarFill"></i></div>
      <div class="boss-shield"><i id="bossBarShield"></i></div>
      <div class="boss-ability" id="bossBarAbility">正在解析威胁信号…</div>`;
    DOM.hud.appendChild(bossBarEl);
  }

  function metaUpgradeLevel(key) { return meta.upgrades[key] || 0; }
  function metaUpgradeDef(key) { return META_UPGRADES.find(m => m.key === key); }

  function renderMeta() {
    DOM.shardValue.textContent = formatNum(meta.shards);
    DOM.metaList.innerHTML = META_UPGRADES.map(def => {
      const lv = metaUpgradeLevel(def.key);
      const max = lv >= def.max;
      const cost = max ? 0 : def.costs[lv];
      const can = !max && meta.shards >= cost;
      return `
        <div class="meta-item ${max ? 'is-max' : ''}" data-meta-item="${def.key}">
          <div class="meta-glyph"><svg><use href="#${def.icon}"></use></svg></div>
          <div class="meta-copy">
            <b>${def.name}</b>
            <p>${max ? def.desc(lv) : def.desc(lv + 1)}</p>
            <div class="meta-levels">${Array.from({ length: def.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
          </div>
          <button class="meta-buy ${max ? 'is-max' : ''}" data-meta-buy="${def.key}" ${(max || !can) ? 'disabled' : ''}>
            ${max ? '已满级' : `<span>强化</span><b>◈ ${cost}</b>`}
          </button>
        </div>`;
    }).join('');
    DOM.abyssDifficulty.disabled = !meta.unlockedAbyss;
    DOM.abyssDifficulty.innerHTML = `深渊 <small>+35% HP</small>${meta.unlockedAbyss ? '' : '<svg><use href="#i-lock"></use></svg>'}`;
    if (!meta.unlockedAbyss && selectedDifficulty === 'abyss') {
      selectedDifficulty = 'standard';
    }
    updateDifficultyButtons();
  }

  function renderMenuStats() {
    DOM.menuStats.innerHTML = `
      <div><span>最高波次</span><b>${String(meta.bestWave || 0).padStart(2, '0')}<em>WAVE</em></b></div>
      <div><span>最高评分</span><b>${formatNum(meta.bestScore || 0)}<em>PTS</em></b></div>
      <div><span>累计行动</span><b>${formatNum(meta.runs || 0)}<em>RUNS</em></b></div>
      <div><span>星核守望</span><b>${formatNum(meta.victories || 0)}<em>WINS</em></b></div>`;
  }

  function updateDifficultyButtons() {
    $$('#difficultySwitch button').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.difficulty === selectedDifficulty);
    });
  }

  function refreshMenu() {
    readSavedRun();
    renderMeta();
    renderMenuStats();
    if (savedRun) {
      DOM.continueBtn.classList.remove('is-hidden');
      DOM.continueMeta.textContent = `WAVE ${pad2(savedRun.run.nextWave)} · ${savedRun.run.difficulty === 'abyss' ? '深渊' : '标准'}`;
    } else {
      DOM.continueBtn.classList.add('is-hidden');
    }
    updateDifficultyButtons();
  }

  function buyMeta(key) {
    const def = metaUpgradeDef(key);
    if (!def) return;
    const lv = metaUpgradeLevel(key);
    if (lv >= def.max) return;
    const cost = def.costs[lv];
    if (meta.shards < cost) {
      audioEngine.sfx('error');
      toast('星尘不足，继续行动以获得更多。', 'warn');
      return;
    }
    meta.shards -= cost;
    meta.upgrades[key] = lv + 1;
    saveMeta();
    renderMeta();
    audioEngine.unlock();
    audioEngine.sfx('upgrade');
    toast(`${def.name} 强化至 ${lv + 1} 级`, 'gold');
  }

  /* =========================================================
     HUD UTILITIES
     ========================================================= */
  function towerCost(type) {
    const base = TOWERS[type].cost;
    const reduction = metaUpgradeLevel('cost') * 0.04 + (run ? run.mods.costReduction : 0);
    return Math.max(30, Math.round(base * (1 - clamp(reduction, 0, 0.55))));
  }
  function upgradeCost(t) {
    const def = TOWERS[t.type];
    const base = def.upgradeCosts[t.level - 1];
    if (base == null) return null;
    const reduction = metaUpgradeLevel('cost') * 0.04 + (run ? run.mods.costReduction : 0);
    return Math.max(20, Math.round(base * (1 - clamp(reduction, 0, 0.5))));
  }
  function towerSellValue(t) {
    return Math.round(t.invested * 0.72);
  }

  function updateShop() {
    if (!run) return;
    $$('[data-tower]', DOM.towerShop).forEach(card => {
      const type = card.dataset.tower;
      const cost = towerCost(type);
      const poor = run.credits < cost;
      card.classList.toggle('is-active', selectedBuildType === type);
      card.classList.toggle('is-poor', poor);
      const costEl = $(`[data-cost="${type}"]`, card);
      if (costEl) costEl.textContent = cost;
    });
  }

  function formatWaveNumber(w) {
    if (run && run.endless && w > TOTAL_WAVES) return '∞';
    return pad2(Math.min(w, TOTAL_WAVES));
  }

  function refreshHUD() {
    if (!run) return;
    const showingWave = state === 'wave' || state === 'ending'
      ? (run.waveData ? run.waveData.wave : run.nextWave)
      : run.nextWave;
    DOM.waveValue.textContent = formatWaveNumber(showingWave);
    DOM.waveTotal.textContent = run.endless ? '/ ∞' : `/ ${TOTAL_WAVES}`;
    const hpRatio = clamp(run.coreHP / run.maxCoreHP, 0, 1);
    DOM.coreHealthFill.style.width = (hpRatio * 100) + '%';
    DOM.coreHealthFill.classList.toggle('is-low', hpRatio <= 0.3);
    DOM.coreHealthFill.classList.toggle('is-mid', hpRatio > 0.3 && hpRatio <= 0.6);
    DOM.coreHealthText.textContent = Math.max(0, Math.ceil(run.coreHP));
    DOM.coreHealthMax.textContent = Math.ceil(run.maxCoreHP);
    DOM.corePercent.textContent = Math.round(hpRatio * 100) + '%';
    DOM.creditValue.textContent = formatNum(run.credits);
    if (run.credits > lastCredits) {
      DOM.creditValue.classList.remove('bump');
      void DOM.creditValue.offsetWidth;
      DOM.creditValue.classList.add('bump');
      if (lastCredits >= 0) {
        const delta = run.credits - lastCredits;
        DOM.creditDelta.textContent = '+' + delta;
        DOM.creditDelta.classList.add('show');
        clearTimeout(DOM.creditDelta._t);
        DOM.creditDelta._t = setTimeout(() => DOM.creditDelta.classList.remove('show'), 1100);
      }
    }
    lastCredits = run.credits;
    DOM.speedValue.textContent = speed + '×';
    updateShop();
    updateStartZone();
    renderWaveIntel();
    refreshTowerDetail();
    refreshProtocolSummary();
    updateSoundButton();
  }

  function updateStartZone() {
    if (!run) return;
    const busy = state === 'wave' || state === 'ending';
    DOM.startWaveBtn.classList.toggle('is-busy', busy);
    if (busy) {
      const total = run.waveData ? run.waveData.total : 0;
      DOM.startWaveLabel.textContent = `第 ${run.waveData ? run.waveData.wave : run.nextWave} 波进行中`;
      DOM.startHint.textContent = run.boss ? '裂隙级威胁已确认 · 全力拦截' : '威胁信号仍在持续';
    } else {
      DOM.startWaveLabel.textContent = `启动第 ${run.nextWave} 波`;
      DOM.startHint.textContent = run.endless && run.nextWave > TOTAL_WAVES ? '无尽回响 · 每一次都更强' : '部署完成后启动波次 · 空格暂停';
    }
  }

  function renderWaveIntel() {
    if (!run) return;
    const waveData = state === 'wave' || state === 'ending' ? run.waveData : run.preview;
    if (!waveData) return;
    const isBoss = !!waveData.boss;
    DOM.intelTitle.textContent = `第 ${waveData.wave} 波 · ${waveData.name}`;
    const threat = waveData.threat;
    DOM.threatChip.textContent = threat.label;
    DOM.threatChip.className = 'threat-chip ' + threat.cls;
    DOM.intelEnemies.innerHTML = waveData.typeList.map(item => {
      const def = ENEMIES[item.type] || (waveData.boss && BOSSES[waveData.boss.wave] ? BOSSES[waveData.boss.wave] : null);
      const color = def ? def.color : '#ff5d8b';
      const name = def ? def.name : '未知';
      const icon = def ? (def.icon || 'i-bolt') : 'i-bolt';
      return `<span class="intel-enemy" style="--enemy-color:${color}"><svg><use href="#${icon}"></use></svg>${name}<b>×${item.count}</b></span>`;
    }).join('') || '<span class="intel-enemy">信号解析中…</span>';
    const mods = waveData.modifiers || [];
    if (mods.length) {
      const danger = mods.some(m => m.danger);
      DOM.intelModifier.className = 'intel-modifier' + (danger ? ' is-danger' : '');
      DOM.intelModifier.innerHTML = `<svg><use href="#${danger ? 'i-signal' : 'i-shard'}"></use></svg><span>${mods.map(m => `<b>${m.name}</b> ${m.desc}`).join(' · ')}</span>`;
    } else {
      DOM.intelModifier.className = 'intel-modifier';
      DOM.intelModifier.innerHTML = `<svg><use href="#i-signal"></use></svg><span>裂隙稳定，无异常信号。</span>`;
    }
    if (state === 'wave' || state === 'ending') {
      const total = waveData.total;
      const killed = run.killsThisWave || 0;
      DOM.waveStatusText.textContent = isBoss ? '首领信号锁定' : '交战中';
      DOM.waveKillText.textContent = `${killed} / ${total}`;
      DOM.waveTrackFill.style.width = clamp(killed / Math.max(1, total), 0, 1) * 100 + '%';
      const remaining = enemies.length + Math.max(0, waveData.queue.length - run.spawnIndex);
      DOM.waveProgress.style.width = (run.waveData.total - remaining) / Math.max(1, run.waveData.total) * 100 + '%';
    } else {
      DOM.waveStatusText.textContent = '等待部署';
      DOM.waveKillText.textContent = `0 / ${waveData.total}`;
      DOM.waveTrackFill.style.width = '0%';
      DOM.waveProgress.style.width = '0%';
    }
  }

  function refreshProtocolSummary() {
    if (!run) return;
    const taken = run.cards.map(id => UPGRADE_CARDS.find(c => c.id === id)).filter(Boolean);
    const uniq = [];
    const seen = new Set();
    taken.forEach(c => { if (!seen.has(c.id)) { seen.add(c.id); uniq.push(c); } });
    if (!uniq.length) {
      DOM.protocolSummary.className = 'protocol-summary is-empty';
      DOM.protocolSummary.innerHTML = `<div class="protocol-head"><span>ACTIVE PROTOCOLS</span><b>尚未接入</b></div><span class="protocol-empty">每波结束后选择一项永久生效的战术协议。</span>`;
      return;
    }
    DOM.protocolSummary.className = 'protocol-summary';
    const shown = uniq.slice(-5);
    DOM.protocolSummary.innerHTML = `
      <div class="protocol-head"><span>ACTIVE PROTOCOLS</span><b><em>${run.cards.length}</em> 项 · 评分 ${formatNum(run.score)}</b></div>
      <div class="protocol-chips">${shown.map(c => {
        const rar = RARITY[c.rarity];
        const rgb = hexToRgb(rar.color);
        return `<span class="protocol-chip" style="--chip-color:${rar.color};--chip-rgb:${rgb.r},${rgb.g},${rgb.b}" title="${c.name} · ${c.desc}"><svg><use href="#${c.icon}"></use></svg>${c.name}<b>${c.value}</b></span>`;
      }).join('')}${uniq.length > 5 ? `<span class="protocol-chip" style="--chip-color:#6f91a3;--chip-rgb:110,140,160">+${uniq.length - 5}</span>` : ''}</div>`;
  }

  function updateSoundButton() {
    DOM.soundBtn.classList.toggle('is-muted', !!settings().muted);
  }

  function showToast(message, kind, icon) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = `<svg><use href="#${icon || (kind === 'warn' ? 'i-signal' : 'i-shard')}"></use></svg><span>${message}</span>`;
    DOM.toastStack.appendChild(el);
    setTimeout(() => el.remove(), 3700);
    while (DOM.toastStack.children.length > 4) DOM.toastStack.firstElementChild.remove();
  }

  function toast(message, kind, icon) { showToast(message, kind, icon); }

  function showHint(text, duration) {
    if (!run) return;
    DOM.hintText.textContent = text;
    DOM.hintCard.classList.remove('is-hidden');
    clearTimeout(hintTimer);
    if (duration !== 0) hintTimer = setTimeout(() => DOM.hintCard.classList.add('is-hidden'), duration || 9000);
  }

  function hideHint() {
    clearTimeout(hintTimer);
    DOM.hintCard.classList.add('is-hidden');
  }

  function triggerFlash(intensity) {
    const el = DOM.damageFlash;
    el.classList.remove('fire');
    void el.offsetWidth;
    el.style.opacity = '';
    el.classList.add('fire');
    chroma = Math.max(chroma, intensity == null ? 0.55 : intensity);
  }

  function screenShake(amount) {
    if (!settings().shake) return;
    shake = Math.max(shake, amount);
  }

  function playTransition() {
    const el = DOM.transition;
    el.classList.remove('is-active');
    void el.offsetWidth;
    el.classList.add('is-active');
  }

  /* ---------- audio wrappers ---------- */
  function sfx(name, data) {
    if (!meta.settings.muted) audioEngine.sfx(name, data);
  }
  function tryUnlockAudio() {
    audioEngine.unlock();
    audioEngine.setMuted(meta.settings.muted);
    audioEngine.setMusicEnabled(meta.settings.music);
  }

  /* =========================================================
     SAVE / RESTORE
     ========================================================= */
  function serializeTower(t) {
    return {
      id: t.id, type: t.type, x: t.x, y: t.y, level: t.level, mode: t.mode,
      invested: t.invested, shots: t.shots || 0
    };
  }

  function saveRun(character) {
    if (!run || state === 'menu' || state === 'gameover' || state === 'victory' || state === 'ending') return false;
    try {
      const inWave = state === 'wave';
      const payload = {
        version: 2,
        timestamp: Date.now(),
        run: {
          difficulty: run.difficulty,
          seed: run.seed,
          nextWave: inWave ? run.wave : run.nextWave,
          inWave,
          credits: run.credits,
          coreHP: run.coreHP,
          maxCoreHP: run.maxCoreHP,
          score: run.score,
          totalKills: run.totalKills,
          bossesKilled: run.bossesKilled,
          leaks: run.leaks,
          comboMax: run.comboMax,
          cards: run.cards.slice(),
          mods: JSON.parse(JSON.stringify(run.mods)),
          towers: towers.map(serializeTower),
          abilityCd: run.abilityCd,
          startedAt: run.startedAt,
          playTime: run.playTime,
          endless: run.endless
        }
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      savedRun = payload;
      if (state === 'menu') refreshMenu();
      return true;
    } catch (e) {
      return false;
    }
  }

  function makeDefaultMods() {
    return {
      damage: 0, range: 0, fireRate: 0, costReduction: 0,
      killCredits: 0, waveCredits: 0, slowDamage: 0, frozenDamage: 0,
      executeThreshold: 0, executeBonus: 0, critChance: 0, critMult: 2,
      armorPen: 0, chainExtra: 0, chainFalloff: 0, pierceExtra: 0,
      splashBonus: 0, railDamage: 0, mortarDamage: 0, slowBonus: 0,
      novaDamage: 0, novaCooldown: 0, chronoDuration: 0, chronoSlow: 0,
      overclockDuration: 0, overclockBoost: 0, abilityCooldown: 0,
      coreMax: 0, coreRegen: 0, coreDamageReduction: 0,
      deathExplosion: 0, orbital: false, droneChance: 0, lowCoreRate: 0,
      eliteChance: 0, eliteReward: 0, instantCredits: 0
    };
  }

  function makeRun(difficulty) {
    const diff = DIFFICULTIES[difficulty] || DIFFICULTIES.standard;
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const maxCore = 100 + metaUpgradeLevel('core') * 25;
    return {
      difficulty: diff.id,
      seed,
      nextWave: 1,
      wave: 0,
      credits: 320 + metaUpgradeLevel('capital') * 80,
      coreHP: maxCore,
      maxCoreHP: maxCore,
      score: 0,
      totalKills: 0,
      bossesKilled: 0,
      killsThisWave: 0,
      leaks: 0,
      combo: 0,
      comboTimer: 0,
      comboMax: 0,
      cards: [],
      mods: makeDefaultMods(),
      abilityCd: { nova: 0, overclock: 0, chrono: 0 },
      overclockTimer: 0,
      chronoFieldTimer: 0,
      waveData: null,
      preview: null,
      waveTimer: 0,
      spawnIndex: 0,
      waveEnding: 0,
      boss: null,
      bossKilledThisWave: false,
      startedAt: Date.now(),
      playTime: 0,
      endless: false,
      settled: false,
      tutorialStep: 0,
      tutorialBuilt: false,
      orbitalTimer: 0,
      rerollUsed: false,
      previewDirty: true
    };
  }

  /* =========================================================
     WAVE GENERATION
     ========================================================= */
  function pickWaveModifiers(wave, rng, bossDef) {
    const ids = [];
    if (bossDef && WAVE_MODIFIERS[bossDef.modifier]) {
      ids.push(bossDef.modifier);
    } else if (wave >= 4) {
      const chance = wave >= 15 ? 0.72 : 0.5;
      if (rng() < chance) {
        const pool = Object.keys(WAVE_MODIFIERS);
        ids.push(pool[Math.floor(rng() * pool.length)]);
      }
      if (wave >= 16 && rng() < 0.26) {
        const pool = Object.keys(WAVE_MODIFIERS).filter(id => !ids.includes(id));
        if (pool.length) ids.push(pool[Math.floor(rng() * pool.length)]);
      }
    }
    return ids.map(id => WAVE_MODIFIERS[id]).filter(Boolean);
  }

  function getBossForWave(wave) {
    if (wave % 5 !== 0) return null;
    if (BOSSES[wave]) return { wave, def: BOSSES[wave] };
    // Endless rotations reuse boss archetypes with escalating stats.
    const cycle = [5, 10, 15, 20, 25, 30];
    const key = cycle[(Math.floor(wave / 5) - 1) % cycle.length];
    const base = BOSSES[key];
    return { wave, def: Object.assign({}, base, { name: `回响 · ${base.name}`, en: 'ECHO ' + base.en }) };
  }

  function generateWave(wave) {
    const bossInfo = getBossForWave(wave);
    const bossDef = bossInfo ? bossInfo.def : null;
    const seed = (run.seed + wave * 7919 + (run.endless ? 4127 : 0)) >>> 0;
    const rng = mulberry32(seed);
    const available = ENEMY_ORDER.filter(k => ENEMIES[k].unlock <= wave);
    const queue = [];
    const eliteBase = wave >= 5 ? clamp(0.028 + wave * 0.0018, 0, 0.09) : 0;
    const eliteChance = clamp(eliteBase + (run.mods.eliteChance || 0), 0, 0.24);

    if (bossDef) {
      queue.push({ type: 'boss', time: 5.2, bossKey: bossInfo.wave, bossDef });
    }

    const totalGroupBudget = bossDef ? clamp(2 + Math.floor(wave / 7), 2, 4) : clamp(2 + Math.floor(wave / 6), 2, 5);
    let clock = bossDef ? 8.2 : 0.8;
    const chosenTypes = [];
    for (let g = 0; g < totalGroupBudget; g++) {
      let type = weightedPick(available, key => {
        const base = { drone: 3, runner: 2.3, tank: 1.1, splitter: 1.5, shield: 1.2, phase: 1.1, healer: 0.7 }[key] || 1;
        const recent = chosenTypes.slice(-2).filter(k => k === key).length;
        return base * (recent ? 0.4 : 1);
      }, rng);
      chosenTypes.push(type);
      const base = { drone: 5, runner: 4, tank: 1, splitter: 2, shield: 2, phase: 2, healer: 1 }[type];
      const grow = { drone: 0.11, runner: 0.07, tank: 0.035, splitter: 0.055, shield: 0.05, phase: 0.05, healer: 0.028 }[type];
      let count = Math.round(base + wave * grow + rng() * 2);
      count = Math.min(count, { drone: 13, runner: 11, tank: 5, splitter: 7, shield: 6, phase: 6, healer: 4 }[type]);
      const interval = { drone: 0.34, runner: 0.25, tank: 0.95, splitter: 0.55, shield: 0.68, phase: 0.5, healer: 0.95 }[type] * (0.88 + rng() * 0.22);
      for (let i = 0; i < count; i++) {
        queue.push({
          type,
          time: clock + i * interval,
          elite: rng() < eliteChance,
          spawnDelay: rng() * 0.08
        });
      }
      clock += count * interval + (2.1 + rng() * 2.2);
    }

    // Hard cap unit density for performance and readability.
    if (queue.length > 38) {
      const bossEntries = queue.filter(q => q.type === 'boss');
      const nonBoss = queue.filter(q => q.type !== 'boss');
      while (nonBoss.length > 37 - bossEntries.length) nonBoss.splice(Math.floor(rng() * nonBoss.length), 1);
      queue.length = 0;
      queue.push(...bossEntries, ...nonBoss);
    }

    queue.sort((a, b) => a.time - b.time);

    const modifiers = pickWaveModifiers(wave, rng, bossDef);
    const typeCounts = {};
    queue.forEach(q => {
      const key = q.type === 'boss' ? 'boss' : q.type;
      typeCounts[key] = (typeCounts[key] || 0) + 1;
    });
    const typeList = Object.keys(typeCounts).map(type => ({ type, count: typeCounts[type] }));

    let threatScore = wave + modifiers.length * 3 + (bossDef ? 7 : 0);
    if (run.difficulty === 'abyss') threatScore += 3;
    const threat = threatScore >= 27
      ? { label: 'SEVERE', cls: 'high' }
      : threatScore >= 18 ? { label: 'HIGH', cls: 'high' }
        : threatScore >= 10 ? { label: 'MODERATE', cls: 'mid' }
          : { label: 'LOW', cls: '' };

    let name = WAVE_NAMES[wave - 1];
    if (!name) {
      const suffix = ['无尽回响', '深空余烬', '裂隙潮汐', '失重挽歌'][(wave - TOTAL_WAVES - 1) % 4];
      name = `${suffix} ${pad2(wave - TOTAL_WAVES)}`;
    }

    return {
      wave, name, queue, total: queue.length, typeList, modifiers, boss: bossInfo,
      threat, duration: clock + 6, eliteChance
    };
  }

  function ensurePreview() {
    if (!run) return;
    if (!run.preview || run.previewDirty) {
      run.preview = generateWave(run.nextWave);
      run.previewDirty = false;
    }
  }

  /* =========================================================
     TOWER INTERACTION
     ========================================================= */
  function statForTower(t) {
    const def = TOWERS[t.type];
    const lv = t.level;
    const m = run.mods;
    const metaDamage = metaUpgradeLevel('damage') * 0.05;
    let damage = def.damage;
    let range = def.range;
    let cooldown = def.cooldown;
    let splash = def.splash || 0;
    let chain = def.chain || 0;
    let pierce = def.pierce || 0;
    let slow = def.slow || 0;

    if (t.type === 'pulse') {
      damage *= Math.pow(1.52, lv - 1);
      range += (lv - 1) * 12;
      cooldown *= Math.pow(0.88, lv - 1);
    } else if (t.type === 'prism') {
      damage *= Math.pow(1.48, lv - 1);
      chain += lv - 1;
      cooldown *= Math.pow(0.92, lv - 1);
    } else if (t.type === 'mortar') {
      damage *= Math.pow(1.57, lv - 1);
      splash += (lv - 1) * 23;
      cooldown *= Math.pow(0.95, lv - 1);
    } else if (t.type === 'cryo') {
      damage *= Math.pow(1.44, lv - 1);
      range += (lv - 1) * 13;
      slow += (lv - 1) * 0.075;
      cooldown *= Math.pow(0.96, lv - 1);
    } else if (t.type === 'rail') {
      damage *= Math.pow(1.62, lv - 1);
      pierce += lv - 1;
      cooldown *= Math.pow(0.93, lv - 1);
    }

    damage *= 1 + m.damage + metaDamage;
    if (t.type === 'rail') damage *= 1 + m.railDamage;
    if (t.type === 'mortar') damage *= 1 + m.mortarDamage;
    range *= 1 + m.range;
    cooldown /= 1 + m.fireRate;
    if (t.type === 'cryo') slow += m.slowBonus;
    chain += m.chainExtra;
    pierce += m.pierceExtra;
    splash += m.splashBonus;

    if (run.coreHP / run.maxCoreHP < 0.5 && m.lowCoreRate) cooldown /= 1 + m.lowCoreRate;
    if (run.overclockTimer > 0) cooldown /= 1 + 1 + m.overclockBoost;
    if (run.boss && run.boss.alive && run.boss.style === 'chronarch') cooldown *= 1.22;
    const rateMod = run.waveData && run.waveData.modifiers.some(x => x.id === 'emp') ? 0.88 : 1;
    cooldown *= rateMod;
    cooldown = Math.max(0.075, cooldown);

    let dps = damage / cooldown;
    if (t.type === 'prism') dps *= Math.max(1, chain) * 0.74;
    if (t.type === 'rail') dps *= Math.max(1, pierce) * 0.72;
    if (t.type === 'cryo') dps *= 0.7;

    return { damage, range, cooldown, splash, chain, pierce, slow, dps, rate: 1 / cooldown };
  }

  function canPlace(x, y) {
    if (x < 72 || x > WORLD.w - 390 || y < 92 || y > WORLD.h - 54) return false;
    if (dist(x, y, CORE_POS.x, CORE_POS.y) < 112) return false;
    if (distanceToPath(x, y) < 64) return false;
    for (let i = 0; i < towers.length; i++) {
      if (dist(x, y, towers[i].x, towers[i].y) < 64) return false;
    }
    return true;
  }

  function createTower(type, x, y, opts) {
    const def = TOWERS[type];
    const o = opts || {};
    return {
      id: o.id || ('tw_' + (++buildIdCounter) + '_' + Math.floor(Math.random() * 9999)),
      type, x, y,
      level: o.level || 1,
      mode: o.mode || def.targetMode,
      angle: o.angle == null ? -Math.PI / 2 : o.angle,
      cooldown: o.cooldown || 0,
      invested: o.invested == null ? towerCost(type) : o.invested,
      shots: o.shots || 0,
      recoil: 0,
      flash: 0,
      spawn: o.spawn == null ? 0 : o.spawn,
      phase: Math.random() * TAU,
      charge: 0,
      aimPulse: 0
    };
  }

  function selectBuildType(type) {
    if (!run || paused || (state !== 'prep' && state !== 'wave')) return;
    if (selectedBuildType === type) {
      selectedBuildType = null;
      updateShop();
      return;
    }
    const cost = towerCost(type);
    if (run.credits < cost) {
      sfx('error');
      toast(`信用点不足，需要 ${cost} 点。`, 'warn', 'i-credit');
      return;
    }
    selectedBuildType = type;
    selectedTowerId = null;
    DOM.towerDetail.classList.add('is-hidden');
    DOM.waveIntel.classList.remove('is-hidden');
    hideHint();
    updateShop();
    refreshTowerDetail();
    sfx('click');
  }

  function selectTower(t) {
    if (!run || (state !== 'prep' && state !== 'wave')) return;
    selectedTowerId = t.id;
    selectedBuildType = null;
    DOM.aim.classList.remove('is-placing', 'is-invalid');
    DOM.canvas.classList.remove('is-invalid-cursor');
    updateShop();
    refreshTowerDetail();
    sfx('click');
  }

  function deselectAll() {
    selectedBuildType = null;
    selectedTowerId = null;
    DOM.aim.classList.remove('is-placing', 'is-invalid');
    DOM.canvas.classList.remove('is-invalid-cursor');
    updateShop();
    refreshTowerDetail();
  }

  function refreshTowerDetail() {
    const t = towers.find(x => x.id === selectedTowerId);
    if (!t || !run) {
      DOM.towerDetail.classList.add('is-hidden');
      DOM.waveIntel.classList.remove('is-hidden');
      DOM.sidePanel.classList.remove('is-inspecting');
      return;
    }
    const def = TOWERS[t.type];
    const s = statForTower(t);
    DOM.towerDetail.classList.remove('is-hidden');
    DOM.waveIntel.classList.add('is-hidden');
    DOM.sidePanel.classList.add('is-inspecting');
    DOM.detailIcon.style.color = def.color;
    DOM.detailIcon.innerHTML = `<svg><use href="#${def.icon}"></use></svg>`;
    DOM.detailName.textContent = def.name;
    DOM.detailRole.textContent = def.role;
    DOM.detailLevel.innerHTML = [1, 2, 3].map(i => `<i class="${i <= t.level ? 'on' : ''}"></i>`).join('');
    DOM.detailDps.textContent = 'DPS ' + Math.round(s.dps);
    DOM.detailDamage.textContent = Math.round(s.damage);
    DOM.detailRange.textContent = Math.round(s.range);
    DOM.detailRate.textContent = s.rate.toFixed(1) + '/s';
    const modeNames = { first: '最前目标', strong: '最强目标', close: '最近目标' };
    DOM.detailModeBtn.innerHTML = `${modeNames[t.mode]} <i>↻</i>`;
    const cost = upgradeCost(t);
    if (cost == null) {
      DOM.upgradeBtn.disabled = true;
      DOM.upgradeBtn.querySelector('span').textContent = '已达最高同步';
      DOM.upgradeCost.textContent = 'MAX';
    } else {
      DOM.upgradeBtn.disabled = run.credits < cost;
      DOM.upgradeBtn.querySelector('span').textContent = '同步强化';
      DOM.upgradeCost.textContent = cost;
    }
    DOM.sellValue.textContent = '+' + towerSellValue(t);
  }

  function placeTower(type, x, y) {
    const cost = towerCost(type);
    if (run.credits < cost) { sfx('error'); return false; }
    if (!canPlace(x, y)) {
      sfx('error');
      toast('该坐标被路径或防御单位占据。', 'warn', 'i-signal');
      return false;
    }
    run.credits -= cost;
    const t = createTower(type, x, y, { invested: cost, spawn: 0 });
    towers.push(t);
    selectedTowerId = t.id;
    selectedBuildType = null;
    DOM.aim.classList.remove('is-placing', 'is-invalid');
    DOM.canvas.classList.remove('is-invalid-cursor');
    addRing(x, y, TOWERS[type].color, 12, 70, 0.55, 2);
    spawnParticles(x, y, TOWERS[type].color, 18, 120, { life: 0.7, size: 2 });
    sfx('place');
    screenShake(2.2);
    if (!run.tutorialBuilt) {
      run.tutorialBuilt = true;
      run.tutorialStep = Math.max(run.tutorialStep, 1);
      setTimeout(() => showHint(TUTORIAL[1], 8500), 900);
    }
    updateShop();
    refreshHUD();
    refreshTowerDetail();
    saveRun();
    return true;
  }

  function upgradeSelected() {
    const t = towers.find(x => x.id === selectedTowerId);
    if (!t) return;
    const cost = upgradeCost(t);
    if (cost == null) return;
    if (run.credits < cost) {
      sfx('error');
      toast(`信用点不足，需要 ${cost} 点。`, 'warn', 'i-credit');
      return;
    }
    run.credits -= cost;
    t.level++;
    t.invested += cost;
    t.flash = 0.3;
    addRing(t.x, t.y, TOWERS[t.type].color, 16, 84, 0.7, 2.5);
    spawnParticles(t.x, t.y, TOWERS[t.type].color2, 22, 170, { life: 0.75, size: 2.4 });
    damageTexts.push({ x: t.x, y: t.y - 38, text: 'SYNC ' + t.level, color: '#d7fbff', life: 1, maxLife: 1, vy: -28, size: 15, weight: 600 });
    sfx('upgrade');
    screenShake(2.8);
    refreshHUD();
    refreshTowerDetail();
    saveRun();
    if (t.level === 3) toast(`${TOWERS[t.type].name} 已达最高同步等级`, 'gold', 'i-bolt');
  }

  function sellSelected() {
    const t = towers.find(x => x.id === selectedTowerId);
    if (!t) return;
    const refund = towerSellValue(t);
    run.credits += refund;
    towers = towers.filter(x => x.id !== t.id);
    selectedTowerId = null;
    addRing(t.x, t.y, '#ff9a7a', 10, 65, 0.6, 2);
    spawnParticles(t.x, t.y, '#ff9a7a', 16, 100, { life: 0.65, size: 2 });
    damageTexts.push({ x: t.x, y: t.y - 30, text: '+' + refund, color: '#ffe2a0', life: 1, maxLife: 1, vy: -32, size: 16, weight: 600 });
    sfx('sell');
    refreshHUD();
    refreshTowerDetail();
    saveRun();
  }

  function cycleTargetMode() {
    const t = towers.find(x => x.id === selectedTowerId);
    if (!t) return;
    const modes = ['first', 'strong', 'close'];
    t.mode = modes[(modes.indexOf(t.mode) + 1) % modes.length];
    sfx('click');
    refreshTowerDetail();
  }

  /* =========================================================
     ABILITIES
     ========================================================= */
  function abilityTotal(id) {
    const def = ABILITIES.find(a => a.id === id);
    const reduction = clamp((run ? run.mods.abilityCooldown : 0) + metaUpgradeLevel('ability') * 0.07, 0, 0.5);
    let total = def.cooldown * (1 - reduction);
    if (id === 'nova') total -= run ? run.mods.novaCooldown : 0;
    return Math.max(8, total);
  }

  function useAbility(id) {
    if (!run || state !== 'wave' || paused) {
      sfx('error');
      if (run && state === 'prep') toast('战术指令仅可在波次进行中释放。', 'warn', 'i-chrono');
      return;
    }
    const cd = run.abilityCd[id] || 0;
    if (cd > 0) { sfx('error'); return; }
    if (!enemies.length && id === 'nova') {
      toast('当前没有可打击的敌对目标。', 'warn', 'i-nova');
      return;
    }
    const total = abilityTotal(id);
    run.abilityCd[id] = total;
    const btn = DOM.abilityList.querySelector(`[data-ability="${id}"]`);
    if (btn) {
      btn.classList.remove('is-active');
      void btn.offsetWidth;
      btn.classList.add('is-active');
      setTimeout(() => btn.classList.remove('is-active'), 600);
    }

    if (id === 'nova') {
      const damage = (112 + run.wave * 9) * (1 + run.mods.novaDamage);
      enemies.slice().forEach(e => {
        if (!e.alive) return;
        hitEnemy(e, damage, { source: 'nova', noArmor: false, canCrit: false, color: '#7ff6ff' });
        applyStun(e, 0.85);
        addRing(e.x, e.y, '#bffcff', 3, 38, 0.38, 1.4);
      });
      addNovaRays(CORE_POS.x, CORE_POS.y, '#8ff8ff', 18, 880, 0.75);
      addNovaRays(CORE_POS.x, CORE_POS.y, '#b79bff', 12, 620, 0.6);
      addRing(CORE_POS.x, CORE_POS.y, '#6ff4ff', 20, 900, 1.1, 7);
      addRing(CORE_POS.x, CORE_POS.y, '#c9ffff', 10, 760, 0.85, 2);
      for (let i = 0; i < 3; i++) addRing(CORE_POS.x, CORE_POS.y, i === 1 ? '#a47bff' : '#54e7ff', 20, 650 + i * 130, 0.95 + i * 0.08, 3);
      spawnParticles(CORE_POS.x, CORE_POS.y, '#8df8ff', 80, 640, { life: 1.1, size: 2.6, drag: 1.8 });
      triggerFlash(0.5);
      screenShake(13);
      slowMo = Math.max(slowMo, 0.32);
      sfx('nova');
      toast('脉冲新星释放 · 全场目标受创', 'good', 'i-nova');
      DOM.statusText.textContent = '脉冲新星 · 全域冲击';
    } else if (id === 'overclock') {
      run.overclockTimer = Math.max(run.overclockTimer, 8 + run.mods.overclockDuration);
      towers.forEach((t, i) => {
        setTimeout(() => {
          if (!run) return;
          addRing(t.x, t.y, '#ffc96b', 10, 66, 0.55, 2);
          addBeam(CORE_POS.x, CORE_POS.y, t.x, t.y, '#ffd47c', 0.28, 1.4);
          spawnParticles(t.x, t.y, '#ffc96b', 7, 90, { life: 0.5, size: 1.8 });
        }, i * 55);
      });
      triggerFlash(0.22);
      sfx('overclock');
      toast('战术超频启动 · 全阵列射速提升', 'gold', 'i-overclock');
      DOM.statusText.textContent = '超频协议运行中';
    } else if (id === 'chrono') {
      run.chronoFieldTimer = 6 + run.mods.chronoDuration;
      enemies.forEach(e => {
        applySlow(e, 0.62 + (run.mods.chronoSlow || 0), run.chronoFieldTimer);
        e.markTimer = Math.max(e.markTimer || 0, run.chronoFieldTimer);
      });
      addRing(CORE_POS.x, CORE_POS.y, '#b08cff', 30, 1100, 1.4, 5);
      for (let i = 0; i < 16; i++) {
        const p = pathPointAt((i / 16) * PATH.length);
        addRing(p.x, p.y, '#a47bff', 4, 44, 0.6 + i * 0.02, 1.2);
      }
      triggerFlash(0.16);
      slowMo = Math.max(slowMo, 0.35);
      sfx('chrono');
      toast('时滞场展开 · 全场敌人减速', 'good', 'i-chrono');
      DOM.statusText.textContent = '时滞场 · 时间流速受控';
    }
    refreshHUD();
    saveRun();
  }

  function updateAbilityUI() {
    if (!run) return;
    ABILITIES.forEach(a => {
      const btn = DOM.abilityList.querySelector(`[data-ability="${a.id}"]`);
      if (!btn) return;
      const total = abilityTotal(a.id);
      const cd = run.abilityCd[a.id] || 0;
      const cooling = cd > 0.05;
      btn.classList.toggle('is-cooling', cooling);
      btn.classList.toggle('is-ready', !cooling && state === 'wave');
      const fill = btn.querySelector('.ability-fill');
      const cdEl = btn.querySelector('.ability-cd');
      fill.style.height = cooling ? (cd / total * 100) + '%' : '0%';
      cdEl.textContent = cooling ? Math.ceil(cd) : '';
    });
  }

  /* =========================================================
     DRAFT / PROTOCOLS
     ========================================================= */
  function pickDraftChoices() {
    const taken = new Set(run.cards);
    const available = UPGRADE_CARDS.filter(c => c.repeatable || !taken.has(c.id));
    const choices = [];
    const pickOne = (pool, weights) => {
      for (let tries = 0; tries < 30; tries++) {
        const c = weightedPick(pool, weights, Math.random);
        if (!choices.some(x => x.id === c.id)) return c;
      }
      return pool[Math.floor(Math.random() * pool.length)];
    };
    const rarityWeight = (c) => {
      if (c.rarity === 'epic') return 5 + Math.min(8, run.wave * 0.35);
      if (c.rarity === 'rare') return 25 + Math.min(12, run.wave * 0.5);
      return Math.max(24, 62 - run.wave * 0.8);
    };
    for (let i = 0; i < 3; i++) {
      const c = pickOne(available, rarityWeight);
      if (c && !choices.some(x => x.id === c.id)) choices.push(c);
    }
    if (run.wave >= 4 && !choices.some(c => c.rarity !== 'common')) {
      const better = available.filter(c => c.rarity !== 'common' && !choices.some(x => x.id === c.id));
      if (better.length) choices[choices.length - 1] = pickOne(better, rarityWeight);
    }
    while (choices.length < 3) {
      const c = UPGRADE_CARDS[Math.floor(Math.random() * UPGRADE_CARDS.length)];
      if (!choices.some(x => x.id === c.id)) choices.push(c);
    }
    return choices;
  }

  function renderDraft() {
    DOM.draftGrid.innerHTML = currentDraftCards.map((card, i) => {
      const rar = RARITY[card.rarity];
      return `
        <button class="draft-card" data-draft-index="${i}" style="--rarity-color:${rar.color}">
          <span class="draft-rarity"><i></i>${rar.name}<span>PROTOCOL ${pad2(i + 1)}</span></span>
          <span class="draft-icon"><svg><use href="#${card.icon}"></use></svg></span>
          <h3>${card.name}</h3>
          <p>${card.desc}</p>
          <span class="draft-value"><b>${card.value}</b><span>${card.unit}</span></span>
          <span class="draft-pick"><span>接入协议</span><i>→</i></span>
        </button>`;
    }).join('');
    DOM.draftCredits.textContent = '+' + (run.lastReward || 0);
    DOM.rerollBtn.disabled = draftRerolled || run.credits < 40;
    DOM.rerollCost.textContent = draftRerolled ? '已使用' : '40';
  }

  function openDraft() {
    if (!run) return;
    state = 'draft';
    paused = false;
    run.rerollUsed = false;
    run.draftPicking = false;
    draftRerolled = false;
    DOM.aim.classList.remove('is-visible');
    currentDraftCards = pickDraftChoices();
    renderDraft();
    DOM.draftOverlay.classList.remove('is-hidden');
    DOM.hud.style.opacity = '.34';
    sfx('draft');
    audioEngine.setIntensity(0.35);
    saveRun();
  }

  function closeDraft() {
    DOM.draftOverlay.classList.add('is-hidden');
    DOM.hud.style.opacity = '';
    state = 'prep';
    run.nextWave = run.wave + 1;
    run.previewDirty = true;
    ensurePreview();
    run.combo = 0;
    run.comboTimer = 0;
    run.waveEnding = 0;
    run.waveData = null;
    run.boss = null;
    selectedBuildType = null;
    refreshHUD();
    saveRun();
    audioEngine.setIntensity(0.38);
    showHint('波次已清空。利用协议强化与整备时间，准备下一轮冲击。', 6500);
  }

  function applyCard(card) {
    const oldCoreMax = run.maxCoreHP;
    const oldModCore = run.mods.coreMax;
    card.apply(run.mods);
    const deltaMax = run.mods.coreMax - oldModCore;
    run.maxCoreHP = Math.max(30, oldCoreMax + deltaMax);
    if (deltaMax > 0) {
      run.coreHP = Math.min(run.maxCoreHP, run.coreHP + deltaMax);
    } else if (deltaMax < 0) {
      run.coreHP = Math.min(run.coreHP, run.maxCoreHP);
    }
    if (run.mods.instantCredits) {
      run.credits += run.mods.instantCredits;
      run.mods.instantCredits = 0;
    }
    run.cards.push(card.id);
    run.score += 80 + run.wave * 12;
    if (run.mods.orbital) run.orbitalTimer = 0;
  }

  function chooseDraft(index) {
    if (state !== 'draft' || run.draftPicking) return;
    const card = currentDraftCards[index];
    if (!card) return;
    run.draftPicking = true;
    const cardEl = DOM.draftGrid.querySelector(`[data-draft-index="${index}"]`);
    if (cardEl) cardEl.classList.add('is-picked');
    applyCard(card);
    sfx('pick');
    addRing(CORE_POS.x, CORE_POS.y, RARITY[card.rarity].color, 20, 700, 0.8, 3);
    triggerFlash(0.12);
    setTimeout(() => {
      run.draftPicking = false;
      DOM.draftOverlay.classList.add('is-hidden');
      DOM.hud.style.opacity = '';
      state = 'prep';
      run.nextWave = run.wave + 1;
      run.previewDirty = true;
      ensurePreview();
      run.combo = 0;
      run.comboTimer = 0;
      run.waveEnding = 0;
      run.waveData = null;
      run.boss = null;
      selectedBuildType = null;
      refreshHUD();
      saveRun();
      audioEngine.setIntensity(0.38);
      toast(`协议已接入：${card.name}`, 'good', card.icon);
      showHint('协议生效。调整部署，然后启动下一波攻势。', 6000);
    }, 420);
  }

  function rerollDraft() {
    if (state !== 'draft' || draftRerolled) return;
    if (run.credits < 40) { sfx('error'); toast('信用点不足，无法重构协议。', 'warn'); return; }
    run.credits -= 40;
    draftRerolled = true;
    currentDraftCards = pickDraftChoices();
    renderDraft();
    DOM.rerollBtn.disabled = true;
    sfx('pick');
    refreshHUD();
  }

  /* =========================================================
     RUN LIFECYCLE
     ========================================================= */
  function requestNewRun() {
    tryUnlockAudio();
    if (savedRun && !overwriteArmed) {
      overwriteArmed = true;
      DOM.newRunBtn.classList.add('is-confirm');
      const copy = DOM.newRunBtn.querySelector('.primary-copy b');
      if (copy) copy.textContent = '再次点击覆盖存档';
      toast('检测到未完成的行动。再次确认将覆盖当前存档。', 'warn', 'i-save');
      sfx('error');
      clearTimeout(overwriteTimer);
      overwriteTimer = setTimeout(() => {
        overwriteArmed = false;
        DOM.newRunBtn.classList.remove('is-confirm');
        const c = DOM.newRunBtn.querySelector('.primary-copy b');
        if (c) c.textContent = '启动新序列';
      }, 3400);
      return;
    }
    overwriteArmed = false;
    clearTimeout(overwriteTimer);
    DOM.newRunBtn.classList.remove('is-confirm');
    const c = DOM.newRunBtn.querySelector('.primary-copy b');
    if (c) c.textContent = '启动新序列';
    tryUnlockAudio();
    startNewRun(selectedDifficulty);
  }

  function startNewRun(difficulty) {
    const diff = difficulty || selectedDifficulty;
    run = makeRun(diff);
    towers = [];
    enemies = [];
    projectiles = [];
    particles = [];
    effects = [];
    damageTexts = [];
    attractEnemies = [];
    selectedBuildType = null;
    selectedTowerId = null;
    hoverTowerId = null;
    paused = false;
    speed = 1;
    slowMo = 0;
    shake = 0;
    state = 'prep';
    DOM.toastStack.innerHTML = '';
    DOM.toastStack.classList.remove('is-menu');
    hideHint();
    lastCredits = run.credits;
    run.wave = 0;
    run.preview = generateWave(1);
    run.waveData = null;
    meta.runs += 1;
    saveMeta();
    DOM.menu.classList.add('is-hidden');
    DOM.hud.classList.remove('is-hidden');
    DOM.hud.style.opacity = '';
    DOM.endOverlay.classList.add('is-hidden');
    DOM.pauseOverlay.classList.add('is-hidden');
    DOM.draftOverlay.classList.add('is-hidden');
    DOM.bossWarning.classList.remove('is-active');
    resize();
    DOM.waveBanner.classList.remove('is-active');
    DOM.damageFlash.style.background = '';
    DOM.aim.classList.remove('is-visible');
    selectedDifficulty = diff;
    tryUnlockAudio();
    audioEngine.setIntensity(0.38);
    sfx('waveclear');
    playTransition();
    refreshHUD();
    updateAbilityUI();
    saveRun();
    setTimeout(() => {
      if (!run || state !== 'prep') return;
      showHint(TUTORIAL[0], 11000);
    }, 850);
  }

  function continueRun() {
    const saved = readSavedRun();
    if (!saved || !saved.run) { sfx('error'); return; }
    const s = saved.run;
    run = makeRun(s.difficulty || 'standard');
    run.seed = s.seed || run.seed;
    run.nextWave = clamp(s.nextWave || 1, 1, 9999);
    run.wave = Math.max(0, run.nextWave - 1);
    run.credits = s.credits == null ? run.credits : s.credits;
    run.maxCoreHP = s.maxCoreHP || run.maxCoreHP;
    run.coreHP = clamp(s.coreHP == null ? run.maxCoreHP : s.coreHP, 1, run.maxCoreHP);
    run.score = s.score || 0;
    run.totalKills = s.totalKills || 0;
    run.bossesKilled = s.bossesKilled || 0;
    run.leaks = s.leaks || 0;
    run.comboMax = s.comboMax || 0;
    run.cards = Array.isArray(s.cards) ? s.cards.slice() : [];
    run.mods = Object.assign(makeDefaultMods(), s.mods || {});
    run.endless = !!s.endless;
    run.playTime = s.playTime || 0;
    run.startedAt = s.startedAt || Date.now();
    towers = Array.isArray(s.towers) ? s.towers.map(t => createTower(t.type, t.x, t.y, {
      id: t.id, level: t.level, mode: t.mode, invested: t.invested, shots: t.shots, spawn: 1, angle: -Math.PI / 2
    })) : [];
    enemies = [];
    projectiles = [];
    particles = [];
    effects = [];
    damageTexts = [];
    selectedBuildType = null;
    selectedTowerId = null;
    paused = false;
    speed = 1;
    slowMo = 0;
    shake = 0;
    state = 'prep';
    DOM.toastStack.innerHTML = '';
    DOM.toastStack.classList.remove('is-menu');
    DOM.endlessBtn.classList.add('is-hidden');
    run.previewDirty = true;
    ensurePreview();
    run.boss = null;
    run.waveData = null;
    lastCredits = run.credits;
    DOM.menu.classList.add('is-hidden');
    DOM.hud.classList.remove('is-hidden');
    DOM.hud.style.opacity = '';
    DOM.endOverlay.classList.add('is-hidden');
    DOM.pauseOverlay.classList.add('is-hidden');
    DOM.draftOverlay.classList.add('is-hidden');
    resize();
    tryUnlockAudio();
    audioEngine.setIntensity(0.4);
    playTransition();
    refreshHUD();
    updateAbilityUI();
    saveRun();
    setTimeout(() => {
      if (!run) return;
      if (s.inWave) toast(`检查点已恢复：第 ${run.nextWave} 波将重新开始。`, 'warn', 'i-save');
      else toast(`行动已恢复：第 ${run.nextWave} 波待命。`, 'good', 'i-save');
      showHint('部署与强化已同步。点击“启动波次”继续行动。', 7000);
    }, 800);
  }

  function showMenu() {
    state = 'menu';
    paused = false;
    run = null;
    towers = [];
    enemies = [];
    projectiles = [];
    particles = [];
    effects = [];
    damageTexts = [];
    selectedBuildType = null;
    selectedTowerId = null;
    speed = 1;
    DOM.hud.classList.add('is-hidden');
    DOM.hud.style.opacity = '';
    resize();
    DOM.pauseOverlay.classList.add('is-hidden');
    DOM.endOverlay.classList.add('is-hidden');
    DOM.draftOverlay.classList.add('is-hidden');
    DOM.menu.classList.remove('is-hidden');
    DOM.aim.classList.remove('is-visible');
    DOM.toastStack.innerHTML = '';
    DOM.toastStack.classList.add('is-menu');
    hideHint();
    overwriteArmed = false;
    clearTimeout(overwriteTimer);
    DOM.newRunBtn.classList.remove('is-confirm');
    const newCopy = DOM.newRunBtn.querySelector('.primary-copy b');
    if (newCopy) newCopy.textContent = '启动新序列';
    audioEngine.setIntensity(0.22);
    refreshMenu();
    playTransition();
  }

  function startWave() {
    if (!run || state !== 'prep') return;
    if (run.nextWave > TOTAL_WAVES && !run.endless) {
      finishRun(true);
      return;
    }
    run.wave = run.nextWave;
    run.waveData = generateWave(run.wave);
    run.waveTimer = 0;
    run.spawnIndex = 0;
    run.killsThisWave = 0;
    run.waveEnding = 0;
    run.bossKilledThisWave = false;
    run.boss = null;
    run.orbitalTimer = 0;
    run.combo = 0;
    run.comboTimer = 0;
    run.comboMax = 0;
    state = 'wave';
    paused = false;
    selectedBuildType = null;
    projectiles = [];
    effects = effects.filter(e => e.type === 'ambient');
    if (run.waveData.boss) {
      showBossWarning(run.waveData.boss.def);
      sfx('boss');
      screenShake(9);
      audioEngine.setIntensity(1.75);
    } else {
      showWaveBanner(run.waveData.wave, run.waveData.name, run.waveData.modifiers);
      sfx('wave');
      audioEngine.setIntensity(1.1);
    }
    run.abilityCd.nova = Math.min(run.abilityCd.nova || 0, 5);
    updateAbilityUI();
    refreshHUD();
    saveRun();
    DOM.aim.classList.remove('is-visible');
    DOM.statusText.textContent = run.waveData.boss ? '裂隙级威胁 · 全阵列交战' : '敌袭信号确认 · 防线交战中';
  }

  function completeWave() {
    if (!run || state !== 'wave' || run.waveEnding > 0) return;
    run.waveEnding = 1;
    const diff = DIFFICULTIES[run.difficulty];
    const flowBonus = Math.round((run.comboMax || 0) * 1.4);
    const clear = Math.round((62 + run.wave * 17) * (1 + run.mods.waveCredits) * diff.reward) + flowBonus;
    const bossBonus = run.bossKilledThisWave ? Math.round((70 + run.wave * 9) * diff.reward) : 0;
    const totalReward = clear + bossBonus;
    run.credits += totalReward;
    run.lastReward = totalReward;
    run.score += Math.round(run.wave * 120 * (1 + Math.min(0.8, run.comboMax * 0.012)));
    run.nextWave = run.wave + 1;
    run.previewDirty = true;
    if (run.mods.coreRegen > 0 && run.coreHP < run.maxCoreHP) {
      run.coreHP = Math.min(run.maxCoreHP, run.coreHP + run.mods.coreRegen);
    }
    const isFinalCampaign = run.wave === TOTAL_WAVES && !run.endless;
    if (isFinalCampaign) {
      run.score += 1500;
      meta.bestWave = Math.max(meta.bestWave, TOTAL_WAVES);
      saveMeta();
    }
    sfx('waveclear');
    audioEngine.setIntensity(0.38);
    damageTexts.push({
      x: CORE_POS.x, y: CORE_POS.y - 70, text: '+' + totalReward + ' CR', color: '#ffe1a0',
      life: 1.4, maxLife: 1.4, vy: -30, size: 18, weight: 600
    });
    if (isFinalCampaign) {
      state = 'ending';
      refreshHUD();
      saveRun();
      setTimeout(() => {
        if (!run || run.wave < TOTAL_WAVES) return;
        finishRun(true);
      }, 1900);
    } else {
      run.waveEnding = 0;
      refreshHUD();
      openDraft();
    }
  }

  function showWaveBanner(wave, name, modifiers) {
    const el = DOM.waveBanner;
    DOM.bannerKicker.textContent = (modifiers && modifiers.length) ? 'ANOMALY SIGNATURE DETECTED' : 'HOSTILE SIGNAL DETECTED';
    DOM.bannerTitle.textContent = 'WAVE ' + pad2(wave);
    DOM.bannerSub.textContent = name + (modifiers && modifiers.length ? ' · ' + modifiers[0].name : '');
    el.classList.remove('is-active');
    void el.offsetWidth;
    el.classList.add('is-active');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('is-active'), 3000);
  }

  function showBossWarning(bossDef) {
    const el = DOM.bossWarning;
    DOM.bossWarningTitle.textContent = bossDef.name;
    DOM.bossWarningSub.textContent = `${bossDef.en} // ${bossDef.abilityName}`;
    el.classList.remove('is-active');
    void el.offsetWidth;
    el.classList.add('is-active');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('is-active'), 4200);
  }

  function finishRun(victory) {
    if (!run || run.settled) return;
    run.settled = true;
    const wasPaused = paused;
    paused = false;
    state = 'ending';
    DOM.pauseOverlay.classList.add('is-hidden');
    DOM.aim.classList.remove('is-visible');
    const diff = DIFFICULTIES[run.difficulty];
    const cleared = victory ? TOTAL_WAVES : Math.max(0, run.wave - 1);
    const shards = Math.max(1, Math.round((cleared * 4 + run.bossesKilled * 18 + run.score / 900 + (victory ? 80 : 0)) * diff.shards));
    meta.shards += shards;
    meta.bestWave = Math.max(meta.bestWave, victory ? Math.max(TOTAL_WAVES, run.wave) : run.wave - 1);
    meta.bestScore = Math.max(meta.bestScore, run.score);
    meta.kills += run.totalKills;
    meta.bosses += run.bossesKilled;
    if (victory) {
      meta.victories += 1;
      meta.unlockedAbyss = true;
    }
    saveMeta();
    deleteSavedRun();
    audioEngine.setIntensity(victory ? 1.4 : 0.1);
    sfx(victory ? 'victory' : 'defeat');
    triggerFlash(victory ? 0.65 : 0.35);
    screenShake(victory ? 16 : 12);
    if (victory) {
      for (let i = 0; i < 5; i++) {
        addRing(CORE_POS.x, CORE_POS.y, i % 2 ? '#ffc96b' : '#7dffc4', 30, 500 + i * 130, 1.4 + i * 0.1, 3);
      }
      spawnParticles(CORE_POS.x, CORE_POS.y, '#ffc96b', 120, 520, { life: 2, size: 3, drag: 0.8 });
    } else {
      spawnParticles(CORE_POS.x, CORE_POS.y, '#ff4f66', 90, 420, { life: 1.5, size: 3 });
      DOM.damageFlash.style.background = 'rgba(255,40,70,.3)';
    }
    DOM.hud.style.opacity = '.22';
    const endDelay = victory ? 2100 : 1500;
    setTimeout(() => {
      if (!run) return;
      if (victory) run.endless = true;
      showEndScreen(victory, shards);
    }, endDelay);
  }

  function showEndScreen(victory, shards) {
    state = victory ? 'victory' : 'gameover';
    DOM.endOverlay.classList.remove('is-hidden');
    DOM.endOverlay.className = 'screen modal-screen';
    DOM.endOverlay.classList.add(victory ? 'is-victory' : 'is-defeat');
    DOM.endOverlay.classList.remove('is-hidden');
    DOM.endKicker.textContent = victory ? 'SIGNAL PRESERVED // CORE ASCENDED' : 'SIGNAL LOST // CORE BREACH';
    DOM.endTitle.textContent = victory ? '星核永存' : '防线失守';
    DOM.endSub.textContent = victory
      ? '你守住了最后一束光。裂隙退潮，而你的防线已成为传说。'
      : '星核在裂隙潮汐中熄灭。但每一次失败，都会让下一道防线更坚固。';
    DOM.endGlyph.innerHTML = victory
      ? '<svg><use href="#i-core"></use></svg>'
      : '<svg><use href="#i-bolt"></use></svg>';
    DOM.endStats.innerHTML = `
      <div><span>抵达波次</span><b>${victory ? TOTAL_WAVES : Math.max(1, run.wave)}</b></div>
      <div><span>歼灭目标</span><b>${formatNum(run.totalKills)}</b></div>
      <div><span>行动评分</span><b>${formatNum(run.score)}</b></div>`;
    DOM.endShards.textContent = '+' + shards;
    DOM.endlessBtn.classList.toggle('is-hidden', !victory);
    DOM.retryBtn.querySelector('b').textContent = victory ? '再守一次' : '再次出击';
    DOM.hud.style.opacity = '';
    DOM.endOverlay.classList.remove('is-hidden');
    audioEngine.setIntensity(0.25);
  }

  function continueEndless() {
    if (!run || state !== 'victory') return;
    DOM.endOverlay.classList.add('is-hidden');
    run.settled = false;
    run.endless = true;
    run.nextWave = Math.max(TOTAL_WAVES + 1, run.nextWave);
    run.wave = TOTAL_WAVES;
    run.coreHP = run.maxCoreHP;
    run.credits += 500;
    run.score += 500;
    run.overclockTimer = 0;
    run.chronoFieldTimer = 0;
    run.boss = null;
    run.waveData = null;
    run.previewDirty = true;
    ensurePreview();
    state = 'prep';
    DOM.hud.style.opacity = '';
    DOM.damageFlash.style.background = '';
    refreshHUD();
    saveRun();
    audioEngine.setIntensity(0.45);
    sfx('waveclear');
    toast('无尽回响已解锁 · 星核修复完毕，并获得 500 信用点。', 'gold', 'i-nova');
    showHint('无尽回响没有终点。每一轮都会重构敌人组成与威胁协议。', 8500);
  }

  function togglePause(force) {
    if (!run || (state !== 'wave' && state !== 'prep')) return;
    paused = force == null ? !paused : !!force;
    DOM.pauseOverlay.classList.toggle('is-hidden', !paused);
    if (paused) {
      DOM.pauseStats.innerHTML = `
        <div><span>WAVE</span><b>${pad2(Math.max(1, state === 'wave' ? run.wave : run.nextWave))}</b></div>
        <div><span>KILLS</span><b>${formatNum(run.totalKills)}</b></div>
        <div><span>SCORE</span><b>${formatNum(run.score)}</b></div>`;
      abandonArmed = false;
      DOM.abandonBtn.textContent = '放弃行动';
      DOM.abandonBtn.style.color = '';
      DOM.aim.classList.remove('is-visible');
      saveRun();
      audioEngine.setIntensity(0.15);
    } else {
      audioEngine.setIntensity(state === 'wave' ? (run.boss ? 1.7 : 1.1) : 0.38);
    }
  }

  function saveAndExit() {
    if (!run) return;
    saveRun(true);
    paused = false;
    DOM.pauseOverlay.classList.add('is-hidden');
    showMenu();
    toast('进度已保存。可以从主界面继续行动。', 'good', 'i-save');
  }

  function armAbandon() {
    if (!abandonArmed) {
      abandonArmed = true;
      DOM.abandonBtn.textContent = '再次点击确认放弃';
      DOM.abandonBtn.style.color = '#ff9ba7';
      setTimeout(() => {
        abandonArmed = false;
        DOM.abandonBtn.textContent = '放弃行动';
        DOM.abandonBtn.style.color = '';
      }, 3200);
      sfx('error');
      return;
    }
    abandonArmed = false;
    DOM.abandonBtn.textContent = '放弃行动';
    DOM.abandonBtn.style.color = '';
    DOM.pauseOverlay.classList.add('is-hidden');
    paused = false;
    finishRun(false);
  }

  function applySettings() {
    DOM.shakeToggle.checked = !!meta.settings.shake;
    DOM.bloomToggle.checked = !!meta.settings.bloom;
    DOM.musicToggle.checked = !!meta.settings.music;
    updateSoundButton();
    DOM.bloom.style.display = meta.settings.bloom ? 'block' : 'none';
    audioEngine.setMuted(meta.settings.muted);
    audioEngine.setMusicEnabled(meta.settings.music);
  }

  function updateBossBar() {
    if (!bossBarEl) return;
    const boss = run && run.boss;
    if (!boss || !boss.alive) {
      bossBarEl.classList.add('is-hidden');
      return;
    }
    bossBarEl.classList.remove('is-hidden');
    const nameEl = $('#bossBarName', bossBarEl);
    const enEl = $('#bossBarEn', bossBarEl);
    const phaseEl = $('#bossBarPhase', bossBarEl);
    const fillEl = $('#bossBarFill', bossBarEl);
    const shieldEl = $('#bossBarShield', bossBarEl);
    const abilityEl = $('#bossBarAbility', bossBarEl);
    if (nameEl.textContent !== boss.name) {
      nameEl.textContent = boss.name;
      enEl.textContent = boss.en || 'RIFT SIGNATURE';
      abilityEl.textContent = boss.abilityName || '正在解析威胁信号…';
    }
    fillEl.style.width = clamp(boss.hp / boss.maxHp, 0, 1) * 100 + '%';
    const shieldRatio = boss.maxShield > 0 ? clamp(boss.shield / boss.maxShield, 0, 1) : 0;
    shieldEl.style.width = (shieldRatio * 100) + '%';
    shieldEl.parentElement.style.opacity = boss.shield > 0 ? '1' : '0';
    abilityEl.textContent = boss.shield > 0
      ? `护盾 ${formatNum(boss.shield)}  ·  ${boss.abilityName || '威胁解析中'}`
      : (boss.abilityName || '正在解析威胁信号…');
    phaseEl.textContent = boss.phase === 3 ? 'PHASE III // ENRAGED' : boss.phase === 2 ? 'PHASE II' : 'PHASE I';
    if (bossBarFlashTimer > 0) bossBarEl.classList.add('flash');
    else bossBarEl.classList.remove('flash');
  }

  function refreshStatus() {
    if (!run) return;
    if (state === 'wave') {
      if (run.boss && run.boss.alive) {
        DOM.statusText.textContent = `首领交战 · ${run.boss.name}`;
      } else {
        const remaining = run.waveData ? Math.max(0, run.waveData.queue.length - run.spawnIndex) + enemies.length : enemies.length;
        DOM.statusText.textContent = `敌袭信号 ${remaining} · 防线交战中`;
      }
    } else if (state === 'prep') {
      DOM.statusText.textContent = run.nextWave > TOTAL_WAVES && !run.endless ? '最终协议完成' : '星核稳定 · 防线待命';
    } else if (state === 'draft') {
      DOM.statusText.textContent = '战术协议解析中';
    }
  }

  function updateComboUI() {
    if (!run) return;
    const mult = 1 + Math.min(50, run.combo) * 0.02;
    DOM.comboValue.textContent = '×' + mult.toFixed(1);
    DOM.comboCount.textContent = run.combo + ' CHAIN';
    DOM.comboFill.style.width = clamp(run.comboTimer / 3.5, 0, 1) * 100 + '%';
    DOM.comboHud.classList.toggle('is-hot', run.combo > 0);
  }

  /* =========================================================
     COMBAT / ENTITY UPDATES
     ========================================================= */
  function addRing(x, y, color, r0, r1, life, width, opts) {
    effects.push({
      type: 'ring', x, y, color, r0, r1, life, maxLife: life, width: width || 2,
      fill: !!(opts && opts.fill), angle: (opts && opts.angle) || 0
    });
  }
  function addBeam(x1, y1, x2, y2, color, life, width) {
    effects.push({ type: 'beam', x1, y1, x2, y2, color, life, maxLife: life, width: width || 2 });
  }
  function addLightning(points, color, life, width) {
    effects.push({ type: 'lightning', points, color, life, maxLife: life, width: width || 1.5 });
  }
  function addExplosion(x, y, color, radius, power) {
    addRing(x, y, color, 4, radius, 0.48, 2.2);
    addRing(x, y, '#fff6db', 2, radius * 0.5, 0.26, 1.5);
    spawnParticles(x, y, color, Math.round(11 + power * 8), 130 + power * 90, { life: 0.7, size: 2.2, gravity: 50, drag: 1.4 });
    spawnParticles(x, y, '#ffdca8', 6, 90, { life: 0.5, size: 1.6, gravity: 20 });
    screenShake(1.6 + power * 2.2);
  }
  function addNovaRays(x, y, color, count, length, life) {
    effects.push({ type: 'rays', x, y, color, count, length, life, maxLife: life });
  }
  function addOrbitalBeam(x, y, color) {
    effects.push({ type: 'orbital', x, y, color, life: 0.65, maxLife: 0.65, width: 1 });
    addRing(x, y, color, 6, 75, 0.55, 2.5);
    addRing(x, y, '#fff7db', 2, 44, 0.3, 1.5);
    spawnParticles(x, y, color, 26, 180, { life: 0.75, size: 2.6, gravity: 50 });
    screenShake(4);
    sfx('orbital');
  }
  function spawnParticles(x, y, color, count, speed, opts) {
    const o = opts || {};
    const amount = Math.min(count, MAX_PARTICLES);
    for (let i = 0; i < amount; i++) {
      if (particles.length >= MAX_PARTICLES) particles.splice(0, 4);
      const a = Math.random() * TAU;
      const v = (speed || 120) * (0.2 + Math.random() * 0.8);
      const life = (o.life || 0.6) * (0.6 + Math.random() * 0.7);
      particles.push({
        x, y,
        vx: Math.cos(a) * v + (o.vx || 0),
        vy: Math.sin(a) * v + (o.vy || 0),
        life, maxLife: life,
        size: (o.size || 2) * (0.5 + Math.random()),
        color: Array.isArray(color) ? color[Math.floor(Math.random() * color.length)] : color,
        gravity: o.gravity || 0,
        drag: o.drag || 1.8,
        trail: !!o.trail,
        shape: o.shape || 'dot'
      });
    }
  }
  function addDamageText(x, y, amount, color, opts) {
    const o = opts || {};
    if (damageTexts.length > 74) damageTexts.splice(0, damageTexts.length - 74);
    damageTexts.push({
      x: x + rand(-6, 6), y: y - (o.offset || 0), text: typeof amount === 'string' ? amount : Math.round(amount),
      color: color || '#e8fbff', life: o.life || 0.8, maxLife: o.life || 0.8,
      vy: o.vy == null ? -48 : o.vy, size: o.size || 13, weight: o.weight || 500, crit: !!o.crit
    });
  }

  function waveMod(id) {
    if (!run || !run.waveData) return null;
    return run.waveData.modifiers.find(m => m.id === id) || null;
  }

  function enemyHpScale(wave) {
    const diff = DIFFICULTIES[run.difficulty];
    const base = 1 + (wave - 1) * 0.155 + Math.pow(wave / 10, 2.4) * 0.7;
    const endless = wave > TOTAL_WAVES ? 1 + (wave - TOTAL_WAVES) * 0.14 : 1;
    return base * diff.hp * endless;
  }

  function spawnEnemy(type, opts) {
    const o = opts || {};
    if (type === 'boss') { spawnBoss(o); return; }
    const def = ENEMIES[type];
    if (!def) return null;
    const wave = run.wave;
    const diff = DIFFICULTIES[run.difficulty];
    const hpScale = enemyHpScale(wave);
    const elite = !!o.elite;
    const hp = o.hpOverride != null ? o.hpOverride : def.hp * hpScale * (elite ? 1.72 : 1);
    const shieldPct = waveMod('aegis');
    let shield = (def.shield || 0) * hpScale + (shieldPct ? hp * 0.2 : 0);
    if (o.shieldOverride != null) shield = o.shieldOverride;
    const modSpeed = waveMod('overclocked');
    const modArmor = waveMod('armored');
    const modBounty = waveMod('bounty');
    const phaseMod = waveMod('phase');
    const speedScale = (1 + Math.min(0.5, (wave - 1) * 0.012)) * diff.speed * (modSpeed ? modSpeed.speed : 1);
    const rewardBase = Math.round((def.reward + (run.mods.killCredits || 0)) * diff.reward * (modBounty ? modBounty.reward : 1) * (elite ? 1.6 * (1 + run.mods.eliteReward) : 1));
    const e = {
      key: 'en_' + (++buildIdCounter),
      type, name: def.name, shape: def.shape,
      hp, maxHp: hp, shield: shield, maxShield: shield,
      speed: def.speed * speedScale * (o.speedMult || 1),
      armor: def.armor + (modArmor ? modArmor.armor : 0) + (o.armor || 0),
      reward: o.rewardOverride != null ? o.rewardOverride : rewardBase,
      score: def.score * (elite ? 2 : 1),
      leak: def.leak, radius: def.radius * (elite ? 1.17 : 1) * (o.scale || 1),
      color: elite ? '#ffd47a' : def.color,
      color2: elite ? '#fff2cd' : def.color2,
      dist: o.dist || 0,
      x: -200, y: -200, angle: 0, px: -200, py: -200,
      alive: true, elite, isChild: !!o.isChild,
      flash: 0, slowTimer: 0, slowAmount: 0, stunTimer: 0, markTimer: 0,
      lastDamageAt: -99, shieldRegenDelay: def.regenDelay || 3,
      regen: def.regen || 0, regenAccum: 0,
      blinkTimer: (def.blinkEvery || (phaseMod ? rand(6, 10) : 0)) * rand(0.7, 1.2),
      untargetableTimer: 0,
      healTimer: 0, healFxTimer: 0,
      phaseAge: 0, trail: [], trailTimer: 0,
      modPhase: !!phaseMod, boss: false, bossAdd: !!o.bossAdd,
      spawnT: 0
    };
    const p = pathPointAt(e.dist);
    e.x = p.x; e.y = p.y; e.angle = p.angle;
    enemies.push(e);
    if (p.x > -10 && p.x < WORLD.w) {
      if (!o.silent) {
        addRing(p.x, p.y, e.color, 2, 27, 0.55, 1.5);
        spawnParticles(p.x, p.y, e.color, 6, 65, { life: 0.45, size: 1.8 });
      }
    }
    return e;
  }

  function spawnBoss(opts) {
    const info = opts.bossDef ? { wave: opts.bossKey, def: opts.bossDef } : getBossForWave(run.wave);
    if (!info) return null;
    const def = info.def;
    const diff = DIFFICULTIES[run.difficulty];
    const loop = run.wave > 30 ? 1 + (run.wave - 30) * 0.24 : 1;
    const hp = def.hpBase * (1 + run.wave * 0.22) * diff.hp * loop;
    const e = {
      key: 'boss_' + (++buildIdCounter),
      type: 'boss', boss: true, name: def.name, en: def.en, style: def.style,
      hp, maxHp: hp, shield: 0, maxShield: 0,
      speed: def.speed * diff.speed * (1 + Math.min(0.18, run.wave * 0.003)),
      armor: 8, reward: Math.round(def.reward * diff.reward),
      score: 260 + run.wave * 10, leak: def.leak, radius: def.radius,
      color: def.color, color2: def.color2,
      dist: 0, x: -200, y: -200, angle: 0, px: -200, py: -200,
      alive: true, elite: false, flash: 0, slowTimer: 0, slowAmount: 0,
      stunTimer: 0, markTimer: 0, untargetableTimer: 0,
      abilityTimer: 5.2, abilityInterval: def.style === 'warden' ? 10.5 : def.style === 'final' ? 8 : 8.5,
      abilityName: def.abilityName, phase: 1, didSplit: false, enraged: false,
      lastDamageAt: -99, shieldRegenDelay: 99, regen: 0, trail: [], trailTimer: 0,
      bossAdd: false, spawnT: 0, phaseFx: 0
    };
    const p = pathPointAt(0);
    e.x = p.x; e.y = p.y; e.angle = p.angle;
    enemies.push(e);
    run.boss = e;
    bossBarFlashTimer = 0.8;
    addRing(p.x, p.y, e.color, 8, 130, 1.1, 4);
    spawnParticles(p.x, p.y, e.color, 30, 170, { life: 1.1, size: 3 });
    return e;
  }

  function applySlow(e, amount, duration) {
    if (!e.alive) return;
    const resist = e.boss ? 0.5 : 1;
    const slow = clamp(amount * resist, 0, 0.85);
    if (slow >= e.slowAmount || e.slowTimer <= 0) e.slowAmount = slow;
    e.slowTimer = Math.max(e.slowTimer, duration);
  }
  function applyStun(e, duration) {
    if (!e.alive) return;
    e.stunTimer = Math.max(e.stunTimer, duration * (e.boss ? 0.22 : 1));
  }

  function hitEnemy(e, rawDamage, opts) {
    if (!e || !e.alive) return 0;
    const o = opts || {};
    if (e.untargetableTimer > 0 && !o.trueDamage) return 0;
    let dmg = rawDamage;
    const totalPen = clamp((run.mods.armorPen || 0) + (o.armorPen || 0), 0, 0.9);
    const effArmor = Math.max(0, e.armor * (1 - totalPen));
    if (!o.noArmor) dmg *= 1 - effArmor / (effArmor + 52);
    if (e.slowTimer > 0) dmg *= 1 + (run.mods.slowDamage || 0) + (run.mods.frozenDamage || 0);
    if (e.markTimer > 0) dmg *= 1.22;
    if (run.mods.executeThreshold > 0 && e.hp / e.maxHp <= run.mods.executeThreshold) {
      dmg *= 1 + run.mods.executeBonus;
    }
    let crit = false;
    if (o.canCrit && Math.random() < (run.mods.critChance || 0)) {
      dmg *= run.mods.critMult || 2;
      crit = true;
    }
    dmg = Math.max(1, dmg);
    let absorbed = 0;
    if (e.shield > 0) {
      absorbed = Math.min(e.shield, dmg);
      e.shield -= absorbed;
      dmg -= absorbed;
      e.lastDamageAt = gameTime;
      if (e.shield <= 0.01) {
        e.shield = 0;
        addRing(e.x, e.y, '#7fe9ff', 6, 48, 0.4, 2);
        spawnParticles(e.x, e.y, '#a7f4ff', 7, 100, { life: 0.4, size: 1.8 });
      }
    }
    if (dmg > 0) {
      e.hp -= dmg;
      e.lastDamageAt = gameTime;
      e.flash = 0.1;
    }
    const color = crit ? '#ffe16c' : o.color || (e.shield > 0 ? '#bff7ff' : '#e8fbff');
    const display = dmg + absorbed;
    if (!o.silent) addDamageText(e.x, e.y - e.radius, display, color, {
      crit, size: crit ? 18 : (display > 120 ? 16 : 13), offset: 2
    });
    if (!o.silent && (crit || Math.random() < 0.45)) {
      spawnParticles(e.x, e.y, crit ? '#ffe16c' : (o.color || e.color2), crit ? 9 : 3, crit ? 180 : 80, {
        life: 0.35, size: crit ? 2.4 : 1.4, gravity: 20
      });
      sfx('hit');
    }
    if (e.hp <= 0) killEnemy(e, o);
    return display;
  }

  function killEnemy(e, opts) {
    if (!e.alive) return;
    e.alive = false;
    const o = opts || {};
    run.totalKills++;
    run.killsThisWave++;
    run.combo++;
    run.comboTimer = 3.5;
    run.comboMax = Math.max(run.comboMax, run.combo);
    const flow = 1 + Math.min(50, run.combo) * 0.02;
    run.score += Math.round((e.score || 10) * flow);
    run.credits += e.reward;
    hudDirty = true;
    const burstColor = e.elite ? ['#ffd47a', '#fff3c8'] : [e.color, e.color2];
    if (e.boss) {
      run.bossesKilled++;
      run.bossKilledThisWave = true;
      slowMo = Math.max(slowMo, 1.25);
      screenShake(18);
      hitStop = Math.max(hitStop, 0.18);
      triggerFlash(0.5);
      for (let i = 0; i < 4; i++) addRing(e.x, e.y, i % 2 ? e.color2 : e.color, 10, 220 + i * 150, 1.1 + i * 0.1, 4);
      spawnParticles(e.x, e.y, burstColor, 90, 390, { life: 1.6, size: 3.4, gravity: 40, drag: 1.1 });
      addExplosion(e.x, e.y, e.color, 150, 3);
      addDamageText(e.x, e.y - 50, 'BOSS DOWN', '#ffe6a8', { life: 1.8, size: 24, weight: 700, vy: -24 });
      sfx('explode');
      sfx('victory');
      toast(`${e.name} 已被击破`, 'gold', 'i-core');
      bossBarFlashTimer = 0.5;
    } else {
      const count = e.elite ? 26 : 13;
      spawnParticles(e.x, e.y, burstColor, count, e.elite ? 260 : 165, { life: 0.85, size: e.elite ? 2.8 : 2.1, gravity: 25, drag: 1.2 });
      addRing(e.x, e.y, e.color, 2, e.radius + 26, 0.42, 1.4);
      if (e.elite) {
        addExplosion(e.x, e.y, e.color, 58, 1.2);
        addDamageText(e.x, e.y - 28, '+' + e.reward, '#ffe2a0', { life: 0.9, size: 14, vy: -45 });
      }
      sfx(Math.random() < 0.35 ? 'explode' : 'kill');
    }
    if (run.mods.deathExplosion > 0 && !o.fromExplosion) {
      const blast = 30 + e.maxHp * 0.08;
      enemies.forEach(other => {
        if (other !== e && other.alive && dist(e.x, e.y, other.x, other.y) < 84) {
          hitEnemy(other, blast, { fromExplosion: true, noArmor: true, silent: true, color: '#ffb36b' });
        }
      });
      addRing(e.x, e.y, '#ff9d5c', 4, 86, 0.35, 2);
    }
    if (e.type === 'splitter' && !e.isChild) {
      for (let i = 0; i < 2; i++) {
        const child = spawnEnemy('splitter', {
          dist: Math.max(0, e.dist - i * 12), isChild: true, silent: true,
          scale: 0.68, speedMult: 1.2, hpOverride: e.maxHp * 0.34,
          rewardOverride: Math.round(e.reward * 0.45)
        });
        if (child) {
          child.color = '#ff9aeb';
          child.color2 = '#ffd7f6';
          child.score *= 0.5;
          spawnParticles(child.x, child.y, child.color, 9, 100, { life: 0.45, size: 1.8 });
        }
      }
    }
    if (e.boss) {
      // clear summoned trash is not automatic; keep pressure.
    }
    updateAbilityUI();
  }

  function leakEnemy(e) {
    if (!e.alive) return;
    e.alive = false;
    const reduction = clamp(run.mods.coreDamageReduction || 0, 0, 0.8);
    const dmg = Math.max(1, Math.round(e.leak * (1 - reduction)));
    run.coreHP -= dmg;
    run.leaks++;
    run.combo = 0;
    run.comboTimer = 0;
    addRing(CORE_POS.x, CORE_POS.y, '#ff4f66', 20, 180, 0.7, 5);
    addRing(CORE_POS.x, CORE_POS.y, '#ffd3d8', 8, 120, 0.45, 2);
    spawnParticles(CORE_POS.x, CORE_POS.y, ['#ff4f66', '#ff9aa9'], 30, 260, { life: 0.9, size: 2.8 });
    addDamageText(CORE_POS.x, CORE_POS.y - 50, '-' + dmg + ' CORE', '#ff7d8f', { life: 1.2, size: 18, weight: 600 });
    screenShake(10);
    triggerFlash(0.45);
    sfx('leak');
    toast(`星核受损！${e.name || '敌人'} 突破防线`, 'warn', 'i-heart');
    refreshHUD();
    if (run.coreHP <= 0) {
      run.coreHP = 0;
      refreshHUD();
      finishRun(false);
    }
  }

  function updateBossAbilities(e, dt) {
    e.abilityTimer -= dt;
    if (e.style === 'final') {
      const ratio = e.hp / e.maxHp;
      const nextPhase = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
      if (nextPhase !== e.phase) {
        e.phase = nextPhase;
        addRing(e.x, e.y, e.color, 12, 260, 0.9, 5);
        triggerFlash(0.25);
        screenShake(9);
        addDamageText(e.x, e.y - 80, 'PHASE ' + (nextPhase === 2 ? 'II' : 'III'), '#ffd8df', { life: 1.5, size: 20, weight: 700, vy: -20 });
        bossBarFlashTimer = 0.8;
      }
    }
    if (e.abilityTimer > 0) return;
    e.abilityTimer = e.abilityInterval;
    if (e.style === 'brood') {
      const n = 2 + Math.floor(run.wave / 12);
      for (let i = 0; i < n; i++) {
        spawnEnemy('drone', { dist: Math.max(0, e.dist - 14 - i * 18), bossAdd: true, silent: true, elite: Math.random() < 0.25 });
      }
      addRing(e.x, e.y, '#ff719a', 10, 140, 0.7, 3);
      addDamageText(e.x, e.y - 60, e.abilityName, '#ffb0c3', { life: 1.2, size: 13, vy: -22 });
      screenShake(4);
    } else if (e.style === 'warden') {
      e.shield = Math.min(e.maxHp * 0.22, e.shield + e.maxHp * 0.085);
      e.maxShield = Math.max(e.maxShield, e.shield);
      addRing(e.x, e.y, '#b18aff', 10, 125, 0.65, 3);
      spawnParticles(e.x, e.y, '#d9c7ff', 22, 140, { life: 0.8, size: 2.3 });
      addDamageText(e.x, e.y - 60, e.abilityName, '#d6c6ff', { life: 1.2, size: 13, vy: -22 });
      bossBarFlashTimer = 0.7;
    } else if (e.style === 'devourer') {
      const oldX = e.x, oldY = e.y;
      e.untargetableTimer = 1.15;
      e.dist = Math.min(PATH.length - 10, e.dist + 95);
      const p = pathPointAt(e.dist);
      e.x = p.x; e.y = p.y; e.angle = p.angle;
      addRing(oldX, oldY, '#9e83ff', 10, 95, 0.55, 3);
      addRing(e.x, e.y, '#cbb8ff', 8, 80, 0.5, 3);
      spawnParticles(oldX, oldY, '#9e83ff', 16, 150, { life: 0.6, size: 2 });
      screenShake(5);
    } else if (e.style === 'tyrant') {
      if (!e.didSplit && e.hp < e.maxHp * 0.5) {
        e.didSplit = true;
        for (let i = 0; i < 2; i++) {
          spawnEnemy('tank', { dist: Math.max(0, e.dist - 20 - i * 40), elite: true, bossAdd: true, silent: true });
        }
        addRing(e.x, e.y, '#ff7d5d', 10, 180, 0.8, 4);
        triggerFlash(0.2);
        addDamageText(e.x, e.y - 65, 'FISSION', '#ffb59e', { life: 1.3, size: 16, weight: 600, vy: -22 });
        screenShake(9);
      } else {
        spawnEnemy('tank', { dist: Math.max(0, e.dist - 20), elite: true, bossAdd: true, silent: true });
        addRing(e.x, e.y, '#ff9d72', 10, 100, 0.5, 2.5);
      }
    } else if (e.style === 'chronarch') {
      spawnEnemy('phase', { dist: Math.max(0, e.dist - 25), bossAdd: true, silent: true });
      addRing(e.x, e.y, '#ffc96b', 10, 120, 0.6, 3);
      addDamageText(e.x, e.y - 60, e.abilityName, '#ffe2a8', { life: 1.2, size: 13, vy: -22 });
    } else if (e.style === 'final') {
      if (e.phase === 1) {
        e.shield = Math.min(e.maxHp * 0.24, e.shield + e.maxHp * 0.075);
        e.maxShield = Math.max(e.maxShield, e.shield);
        for (let i = 0; i < 3; i++) spawnEnemy('drone', { dist: Math.max(0, e.dist - 20 - i * 20), bossAdd: true, silent: true });
        addRing(e.x, e.y, '#ff6d85', 10, 150, 0.7, 4);
        bossBarFlashTimer = 0.8;
      } else if (e.phase === 2) {
        for (let i = 0; i < 4; i++) spawnEnemy('runner', { dist: Math.max(0, e.dist - 16 - i * 18), bossAdd: true, silent: true, speedMult: 1.2 });
        addRing(e.x, e.y, '#ff9c6a', 10, 170, 0.6, 4);
        screenShake(7);
      } else {
        for (let i = 0; i < 2; i++) spawnEnemy('phase', { dist: Math.max(0, e.dist - 20 - i * 20), bossAdd: true, silent: true });
        e.shield = Math.min(e.maxHp * 0.18, e.shield + e.maxHp * 0.045);
        addRing(e.x, e.y, '#ff4f66', 10, 210, 0.8, 5);
        triggerFlash(0.15);
        screenShake(8);
      }
      addDamageText(e.x, e.y - 70, e.abilityName, '#ffb7c2', { life: 1.2, size: 13, vy: -22 });
    }
  }

  function updateEnemies(dt) {
    const list = enemies.slice();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive) continue;
      e.spawnT = Math.min(1, e.spawnT + dt * 3.2);
      e.flash = Math.max(0, e.flash - dt);
      if (e.slowTimer > 0) { e.slowTimer -= dt; if (e.slowTimer <= 0) e.slowAmount = 0; }
      if (e.markTimer > 0) e.markTimer -= dt;
      if (e.untargetableTimer > 0) e.untargetableTimer -= dt;
      if (e.stunTimer > 0) { e.stunTimer -= dt; }
      if (e.lastDamageAt < 0) e.lastDamageAt = gameTime;

      // shields
      if (e.regen > 0 && e.shield < (e.maxShield || 0) && gameTime - e.lastDamageAt > e.shieldRegenDelay) {
        e.shield = Math.min(e.maxShield, e.shield + e.regen * dt);
      }
      // wave regeneration anomaly
      const regenMod = waveMod('regenerative');
      if (regenMod && e.hp < e.maxHp) {
        const regenRate = e.boss ? regenMod.regenPct * 0.22 : regenMod.regenPct;
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * regenRate * dt);
      }
      // healer aura
      if (e.type === 'healer') {
        e.healTimer -= dt;
        e.healFxTimer -= dt;
        if (e.healTimer <= 0) {
          e.healTimer = 0.45;
          let healedAny = false;
          for (const other of enemies) {
            if (other !== e && other.alive && other.hp < other.maxHp && dist(e.x, e.y, other.x, other.y) < ENEMIES.healer.healRadius) {
              other.hp = Math.min(other.maxHp, other.hp + ENEMIES.healer.heal * 1.8);
              healedAny = true;
            }
          }
          if (healedAny && e.healFxTimer <= 0) {
            e.healFxTimer = 1.2;
            addRing(e.x, e.y, '#6df0b5', 10, ENEMIES.healer.healRadius, 0.6, 1);
            spawnParticles(e.x, e.y, '#8cffcb', 10, 60, { life: 0.7, size: 1.5 });
          }
        }
      }
      // phase blinking
      if (e.blinkTimer > 0) {
        e.blinkTimer -= dt;
        if (e.blinkTimer <= 0 && e.untargetableTimer <= 0) {
          e.untargetableTimer = e.boss ? 0.8 : 0.7;
          if (e.type === 'phase' || e.modPhase) {
            e.dist = Math.min(PATH.length - 6, e.dist + (e.boss ? 22 : 24));
            const p = pathPointAt(e.dist);
            addRing(e.x, e.y, '#b08cff', 4, 34, 0.4, 1.4);
            e.x = p.x; e.y = p.y;
            spawnParticles(p.x, p.y, '#b08cff', 8, 80, { life: 0.4, size: 1.6 });
          }
          e.blinkTimer = (ENEMIES[e.type] && ENEMIES[e.type].blinkEvery ? ENEMIES[e.type].blinkEvery : 8.5) * rand(0.8, 1.2);
        }
      }
      if (e.boss) updateBossAbilities(e, dt);

      let slow = e.slowTimer > 0 ? e.slowAmount : 0;
      let speed = e.speed * (1 - clamp(slow, 0, 0.88));
      if (waveMod('frenzy') && e.hp / e.maxHp < 0.4) speed *= 1.45;
      if (e.boss && e.style === 'final' && e.phase === 3) speed *= 1.2;
      if (e.stunTimer > 0) speed = 0;
      // chronarch buffs its escort
      if (!e.boss && run.boss && run.boss.alive && run.boss.style === 'chronarch') speed *= 1.12;

      e.px = e.x; e.py = e.y;
      e.dist += speed * dt;
      const p = pathPointAt(e.dist);
      e.x = p.x; e.y = p.y; e.angle = p.angle;
      e.trailTimer -= dt;
      if (e.trailTimer <= 0) {
        e.trailTimer = e.boss ? 0.035 : 0.055;
        e.trail.push({ x: e.x, y: e.y });
        if (e.trail.length > (e.boss ? 14 : 7)) e.trail.shift();
      }
      if (e.dist >= PATH.length - 1) {
        leakEnemy(e);
        if (state !== 'wave') break;
      }
    }
  }

  function findTarget(t, s) {
    let best = null;
    let bestValue = -Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive || e.untargetableTimer > 0) continue;
      const d = dist(t.x, t.y, e.x, e.y);
      if (d > s.range) continue;
      let value;
      if (t.mode === 'strong') value = e.hp + (e.boss ? 500 : 0);
      else if (t.mode === 'close') value = -d;
      else value = e.dist;
      if (value > bestValue) { bestValue = value; best = e; }
    }
    return best;
  }

  function fireTower(t, s, target) {
    const def = TOWERS[t.type];
    t.cooldown = s.cooldown;
    t.recoil = 1;
    t.flash = 0.08;
    t.shots++;
    const muzzle = 29;
    const mx = t.x + Math.cos(t.angle) * muzzle;
    const my = t.y + Math.sin(t.angle) * muzzle;
    if (t.type === 'pulse') {
      projectiles.push({
        kind: 'bolt', x: mx, y: my, px: mx, py: my,
        target, speed: 920, damage: s.damage, color: def.color, life: 2.2,
        radius: 3, canCrit: true, drone: false
      });
      addRing(mx, my, def.color, 2, 14, 0.15, 1);
      sfx('shoot_pulse', { pitch: 900 + Math.random() * 240 });
    } else if (t.type === 'prism') {
      let current = target;
      let dmg = s.damage;
      const hit = new Set();
      const points = [{ x: mx, y: my }];
      let chain = Math.max(1, s.chain);
      for (let i = 0; i < chain && current; i++) {
        hit.add(current);
        points.push({ x: current.x, y: current.y });
        hitEnemy(current, dmg, { canCrit: true, color: def.color2 });
        dmg *= 0.76 + (run.mods.chainFalloff || 0);
        if (i < chain - 1) {
          let next = null, nd = Infinity;
          for (const e of enemies) {
            if (!e.alive || hit.has(e) || e.untargetableTimer > 0) continue;
            const d = dist(current.x, current.y, e.x, e.y);
            if (d < (def.chainRange || 150) && d < nd) { nd = d; next = e; }
          }
          current = next;
        }
      }
      addLightning(points, def.color, 0.2, 2);
      addRing(target.x, target.y, def.color2, 2, 26, 0.25, 1);
      sfx('shoot_prism');
    } else if (t.type === 'mortar') {
      const travel = clamp(dist(t.x, t.y, target.x, target.y) / 500, 0.45, 1.15);
      const lead = pathPointAt(Math.min(PATH.length, target.dist + target.speed * travel * 0.55));
      projectiles.push({
        kind: 'shell', x: mx, y: my, sx: mx, sy: my, tx: lead.x, ty: lead.y,
        t: 0, duration: travel, height: 90 + dist(mx, my, lead.x, lead.y) * 0.28,
        damage: s.damage, splash: s.splash, color: def.color
      });
      spawnParticles(mx, my, def.color, 5, 80, { life: 0.3, size: 1.6, vy: -30 });
      sfx('shoot_mortar');
    } else if (t.type === 'cryo') {
      enemies.forEach(e => {
        if (!e.alive) return;
        if (dist(t.x, t.y, e.x, e.y) <= s.range) {
          applySlow(e, s.slow, def.slowDuration + 0.2);
          hitEnemy(e, s.damage, { silent: true, color: '#bdefff', canCrit: true });
        }
      });
      addRing(t.x, t.y, '#8de8ff', 8, s.range, 0.55, 1.5);
      addRing(t.x, t.y, '#d7f9ff', 2, s.range * 0.55, 0.3, 1);
      spawnParticles(mx, my, '#bdefff', 6, 70, { life: 0.5, size: 1.7 });
    } else if (t.type === 'rail') {
      const dir = t.angle;
      const hits = [];
      for (const e of enemies) {
        if (!e.alive || e.untargetableTimer > 0) continue;
        const dx = e.x - t.x, dy = e.y - t.y;
        const proj = dx * Math.cos(dir) + dy * Math.sin(dir);
        if (proj < 0 || proj > s.range) continue;
        const perp = Math.abs(dx * Math.sin(dir) - dy * Math.cos(dir));
        if (perp < e.radius + 15) hits.push({ e, proj });
      }
      hits.sort((a, b) => a.proj - b.proj);
      const end = hits.length ? Math.min(s.range, hits[Math.min(hits.length - 1, s.pierce - 1)].proj + 30) : s.range;
      const ex = t.x + Math.cos(dir) * end;
      const ey = t.y + Math.sin(dir) * end;
      addBeam(mx, my, ex, ey, '#ffb3d4', 0.3, 5);
      addBeam(mx, my, ex, ey, '#fff1f8', 0.16, 1.6);
      hits.slice(0, Math.max(1, s.pierce)).forEach((hit, i) => {
        hitEnemy(hit.e, s.damage * (i === 0 ? 1 : 0.82), { canCrit: true, armorPen: def.armorPen, color: '#ffd6e6' });
        spawnParticles(hit.e.x, hit.e.y, '#ffc4dc', 8, 130, { life: 0.4, size: 1.9 });
      });
      spawnParticles(mx, my, '#ffd6e6', 8, 120, { life: 0.3, size: 1.7 });
      screenShake(3);
      sfx('shoot_rail');
    }

    if (Math.random() < (run.mods.droneChance || 0) && target && target.alive) {
      projectiles.push({
        kind: 'bolt', x: t.x + Math.cos(t.angle) * 12, y: t.y + Math.sin(t.angle) * 12,
        px: t.x, py: t.y, target, speed: 1150, damage: s.damage * 0.38,
        color: '#bff4ff', life: 1.6, radius: 2.2, canCrit: false, drone: true
      });
    }
  }

  function updateTowerVisuals(dt) {
    for (const t of towers) {
      t.spawn = Math.min(1, t.spawn + dt * 3.8);
      t.recoil = Math.max(0, t.recoil - dt * 5.8);
      t.flash = Math.max(0, t.flash - dt);
      t.aimPulse += dt;
    }
  }

  function updateTowers(dt) {
    for (const t of towers) {
      const s = statForTower(t);
      const target = findTarget(t, s);
      if (target) {
        const desired = Math.atan2(target.y - t.y, target.x - t.x);
        t.angle = angleLerp(t.angle, desired, 1 - Math.pow(0.0008, dt));
        t.aimPulse = 0;
        if (t.cooldown <= 0) fireTower(t, s, target);
      } else {
        t.angle += dt * 0.12;
      }
      t.cooldown -= dt;
    }
  }

  function explodeShell(p) {
    const radius = p.splash;
    addExplosion(p.tx, p.ty, p.color, radius, 2.5);
    enemies.forEach(e => {
      if (!e.alive) return;
      const d = dist(p.tx, p.ty, e.x, e.y);
      if (d <= radius + e.radius) {
        const falloff = lerp(1, 0.55, clamp(d / radius, 0, 1));
        hitEnemy(e, p.damage * falloff, { canCrit: true, color: '#ffd39e' });
      }
    });
    sfx('explode');
  }

  function updateProjectiles(dt) {
    for (const p of projectiles) {
      if (p.dead) continue;
      if (p.kind === 'bolt') {
        const target = p.target;
        if (!target || !target.alive) {
          p.dead = true;
          spawnParticles(p.x, p.y, p.color, 4, 55, { life: 0.25, size: 1.3 });
          continue;
        }
        p.px = p.x; p.py = p.y;
        const dx = target.x - p.x, dy = target.y - p.y;
        const d = Math.hypot(dx, dy);
        const step = p.speed * dt;
        if (d <= step + target.radius + 6) {
          hitEnemy(target, p.damage, { canCrit: p.canCrit, color: p.color });
          addRing(target.x, target.y, p.color, 2, 20, 0.22, 1.2);
          spawnParticles(target.x, target.y, p.color, p.drone ? 3 : 5, 75, { life: 0.28, size: 1.4 });
          p.dead = true;
        } else {
          p.x += dx / d * step;
          p.y += dy / d * step;
          if (Math.random() < 0.55) {
            particles.push({
              x: p.x, y: p.y, vx: rand(-8, 8), vy: rand(-8, 8), life: 0.18, maxLife: 0.18,
              size: p.drone ? 1 : 1.4, color: p.color, gravity: 0, drag: 0, trail: false, shape: 'dot'
            });
          }
        }
      } else if (p.kind === 'shell') {
        p.t += dt / p.duration;
        if (p.t >= 1) {
          p.dead = true;
          explodeShell(p);
        } else {
          p.x = lerp(p.sx, p.tx, p.t);
          const arc = Math.sin(p.t * Math.PI) * p.height;
          p.y = lerp(p.sy, p.ty, p.t) - arc;
          if (Math.random() < 0.4) {
            particles.push({
              x: p.x, y: p.y + arc * 0.35, vx: rand(-10, 10), vy: rand(-2, 6), life: 0.25, maxLife: 0.25,
              size: 1.4, color: '#ffc27a', gravity: 0, drag: 0, trail: false, shape: 'dot'
            });
          }
        }
      }
    }
    projectiles = projectiles.filter(p => !p.dead);
  }

  function updateOrbital(dt) {
    if (!run.mods.orbital || state !== 'wave') return;
    run.orbitalTimer -= dt;
    if (run.orbitalTimer > 0) return;
    const targets = enemies.filter(e => e.alive && e.untargetableTimer <= 0);
    if (!targets.length) { run.orbitalTimer = 1.2; return; }
    let best = targets[0];
    for (const e of targets) if (e.hp > best.hp) best = e;
    run.orbitalTimer = 11.5;
    const damage = (95 + run.wave * 10) * (1 + run.mods.damage * 0.35);
    addOrbitalBeam(best.x, best.y, '#8fefff');
    hitEnemy(best, damage, { canCrit: false, color: '#c8fbff', noArmor: true });
    addDamageText(best.x, best.y - 55, 'ORBITAL', '#bffaff', { life: 1.1, size: 12, vy: -28 });
  }

  function updateGame(dt) {
    if (!run || state !== 'wave') return;
    run.playTime += dt;
    gameTime += dt;
    ABILITIES.forEach(a => {
      if (run.abilityCd[a.id] > 0) run.abilityCd[a.id] = Math.max(0, run.abilityCd[a.id] - dt);
    });
    if (run.overclockTimer > 0) run.overclockTimer = Math.max(0, run.overclockTimer - dt);
    if (run.chronoFieldTimer > 0) run.chronoFieldTimer = Math.max(0, run.chronoFieldTimer - dt);
    if (run.comboTimer > 0) {
      run.comboTimer -= dt;
      if (run.comboTimer <= 0) { run.combo = 0; run.comboTimer = 0; }
    }
    if (run.waveData) {
      run.waveTimer += dt;
      while (run.spawnIndex < run.waveData.queue.length && run.waveTimer >= run.waveData.queue[run.spawnIndex].time) {
        const entry = run.waveData.queue[run.spawnIndex++];
        if (entry.type === 'boss') {
          spawnBoss({ bossDef: entry.bossDef, bossKey: entry.bossKey });
          audioEngine.setIntensity(1.85);
        } else {
          spawnEnemy(entry.type, { elite: entry.elite });
        }
      }
    }
    updateEnemies(dt);
    if (state !== 'wave') return;
    updateTowers(dt);
    updateProjectiles(dt);
    updateOrbital(dt);
    enemies = enemies.filter(e => e.alive);
    if (state === 'wave' && run.waveData && run.spawnIndex >= run.waveData.queue.length && enemies.length === 0) {
      if (!run.waveEnding) completeWave();
    }
  }

  function updateVisuals(dt, allowLife) {
    const lifeDt = allowLife === false ? dt * 0.15 : dt;
    updateTowerVisuals(dt);
    for (const p of particles) {
      p.life -= lifeDt;
      p.x += p.vx * lifeDt;
      p.y += p.vy * lifeDt;
      p.vy += (p.gravity || 0) * lifeDt;
      const drag = Math.max(0, 1 - (p.drag || 0) * lifeDt);
      p.vx *= drag; p.vy *= drag;
    }
    particles = particles.filter(p => p.life > 0);
    for (const e of effects) e.life -= lifeDt;
    effects = effects.filter(e => e.life > 0);
    for (const t of damageTexts) {
      t.life -= lifeDt;
      t.y += t.vy * lifeDt;
      t.vy *= 0.94;
    }
    damageTexts = damageTexts.filter(t => t.life > 0);
    shake = Math.max(0, shake - dt * 38);
    chroma = Math.max(0, chroma - dt * 1.9);
    slowMo = Math.max(0, slowMo - dt);
    if (bossBarFlashTimer > 0) bossBarFlashTimer = Math.max(0, bossBarFlashTimer - dt);
    DOM.chroma.style.opacity = (chroma * 0.75).toFixed(3);
    if (hitStop > 0) hitStop = Math.max(0, hitStop - dt);
  }

  /* =========================================================
     RENDERING
     ========================================================= */
  function initStars() {
    const rng = mulberry32(0xA57A1);
    ambientStars = [];
    for (let i = 0; i < 165; i++) {
      ambientStars.push({
        x: rng() * WORLD.w,
        y: rng() * WORLD.h,
        size: rng() * 1.7 + 0.35,
        phase: rng() * TAU,
        speed: 0.3 + rng() * 1.2,
        depth: rng(),
        bright: rng() > 0.88
      });
    }
    ambientDust = [];
    for (let i = 0; i < 46; i++) {
      ambientDust.push({
        x: rng() * WORLD.w, y: rng() * WORLD.h,
        vx: (rng() - 0.5) * 7, vy: -3 - rng() * 8,
        size: rng() * 2 + 0.6, alpha: 0.08 + rng() * 0.18,
        phase: rng() * TAU
      });
    }
  }

  function buildBackground() {
    const c = document.createElement('canvas');
    c.width = WORLD.w; c.height = WORLD.h;
    const g = c.getContext('2d');
    const rng = mulberry32(0xBADC0DE);

    // base
    let grad = g.createLinearGradient(0, 0, WORLD.w, WORLD.h);
    grad.addColorStop(0, '#03070f');
    grad.addColorStop(0.38, '#06111e');
    grad.addColorStop(0.7, '#071422');
    grad.addColorStop(1, '#040810');
    g.fillStyle = grad;
    g.fillRect(0, 0, WORLD.w, WORLD.h);

    // nebula clouds
    g.globalCompositeOperation = 'lighter';
    const nebulas = [
      { x: 250, y: 150, r: 420, c1: 'rgba(25,90,120,.15)', c2: 'rgba(12,34,61,0)' },
      { x: 920, y: 250, r: 500, c1: 'rgba(83,42,130,.13)', c2: 'rgba(18,26,62,0)' },
      { x: 1060, y: 690, r: 480, c1: 'rgba(14,80,96,.12)', c2: 'rgba(5,15,30,0)' },
      { x: 480, y: 700, r: 380, c1: 'rgba(94,24,72,.09)', c2: 'rgba(4,10,20,0)' }
    ];
    nebulas.forEach(n => {
      const rg = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      rg.addColorStop(0, n.c1);
      rg.addColorStop(1, n.c2);
      g.fillStyle = rg;
      g.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    });

    // distant planet + orbit
    const planet = { x: 1220, y: 145, r: 245 };
    let pg = g.createRadialGradient(planet.x - 60, planet.y - 45, 20, planet.x, planet.y, planet.r);
    pg.addColorStop(0, 'rgba(53,97,128,.22)');
    pg.addColorStop(0.55, 'rgba(16,37,61,.28)');
    pg.addColorStop(1, 'rgba(4,9,18,.05)');
    g.fillStyle = pg;
    g.beginPath(); g.arc(planet.x, planet.y, planet.r, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(95,199,230,.1)';
    g.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.ellipse(planet.x, planet.y + 112, 290 + i * 28, 42 + i * 9, -0.22, 0, TAU);
      g.strokeStyle = `rgba(95,199,230,${0.08 - i * 0.018})`;
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';

    // faint deep-space stars baked into background
    for (let i = 0; i < 220; i++) {
      const x = rng() * WORLD.w, y = rng() * WORLD.h;
      const a = rng() * 0.5 + 0.05;
      g.fillStyle = `rgba(${150 + rng() * 80},${210 + rng() * 40},255,${a})`;
      g.fillRect(x, y, rng() * 1.5 + 0.4, rng() * 1.5 + 0.4);
    }

    // technical grid clipped to containment zone
    g.save();
    g.beginPath();
    g.rect(54, 78, 1160, 776);
    g.clip();
    for (let x = 60; x <= 1214; x += 74) {
      g.strokeStyle = x % 148 < 70 ? 'rgba(96,180,210,.045)' : 'rgba(96,180,210,.027)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, 82); g.lineTo(x, 850); g.stroke();
    }
    for (let y = 94; y <= 850; y += 74) {
      g.strokeStyle = y % 148 < 80 ? 'rgba(96,180,210,.045)' : 'rgba(96,180,210,.027)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(54, y); g.lineTo(1218, y); g.stroke();
    }
    // crosshair marks
    g.strokeStyle = 'rgba(123,225,250,.1)';
    for (let x = 134; x < 1210; x += 148) {
      for (let y = 168; y < 840; y += 148) {
        g.beginPath();
        g.moveTo(x - 4, y); g.lineTo(x + 4, y);
        g.moveTo(x, y - 4); g.lineTo(x, y + 4);
        g.stroke();
      }
    }
    // scan paths
    g.strokeStyle = 'rgba(84,231,255,.035)';
    g.lineWidth = 30;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(-50 + i * 300, 900);
      g.lineTo(260 + i * 300, 70);
      g.stroke();
    }
    g.restore();

    // random map debris / rocks
    for (let i = 0; i < 38; i++) {
      const x = rng() * WORLD.w, y = 90 + rng() * 740;
      const size = 1.5 + rng() * 3.6;
      g.save();
      g.translate(x, y);
      g.rotate(rng() * TAU);
      g.fillStyle = `rgba(107,171,199,${0.04 + rng() * 0.08})`;
      g.beginPath();
      g.moveTo(size, 0); g.lineTo(-size * 0.7, size * 0.7); g.lineTo(-size * 0.3, -size); g.closePath();
      g.fill();
      g.restore();
    }

    // containment border
    g.strokeStyle = 'rgba(93,192,224,.16)';
    g.lineWidth = 1;
    g.setLineDash([2, 8]);
    g.strokeRect(54.5, 78.5, 1159, 775);
    g.setLineDash([]);
    const corners = [[54, 78, 1, 1], [1213, 78, -1, 1], [54, 853, 1, -1], [1213, 853, -1, -1]];
    corners.forEach(([x, y, sx, sy]) => {
      g.strokeStyle = 'rgba(115,226,250,.5)';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(x + 22 * sx, y); g.lineTo(x, y); g.lineTo(x, y + 22 * sy);
      g.stroke();
    });

    // core orbital arcs
    g.strokeStyle = 'rgba(84,231,255,.05)';
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(CORE_POS.x, CORE_POS.y, 130 + i * 62, -0.4 + i, 2.5 + i);
      g.setLineDash([3, 10 + i * 2]);
      g.stroke();
    }
    g.setLineDash([]);

    // labels
    g.font = '500 8px "SFMono-Regular", monospace';
    g.fillStyle = 'rgba(108,202,226,.26)';
    g.fillText('RIFT CONTAINMENT GRID // SECTOR 07', 700, 864);
    g.fillText('CORE UPLINK  ▸  77.3%     //     DEPLOYMENT ZONE A-01', 700, 878);
    g.fillStyle = 'rgba(108,202,226,.16)';
    g.fillText('A-01', 86, 810);
    g.fillText('VOID / NO DEPLOY', 78, 860);
    g.textAlign = 'right';
    g.fillStyle = 'rgba(108,202,226,.2)';
    g.fillText('GRAVITY ANCHOR // LOCKED', 1212, 860);
    g.textAlign = 'left';

    // ------- path base -------
    g.lineCap = 'round';
    g.lineJoin = 'round';
    tracePath(g);
    g.strokeStyle = 'rgba(84,231,255,.06)';
    g.lineWidth = 86;
    g.shadowColor = 'rgba(40,190,220,.45)';
    g.shadowBlur = 34;
    g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = '#030912';
    g.lineWidth = 76;
    g.stroke();
    g.strokeStyle = 'rgba(84,231,255,.21)';
    g.lineWidth = 69;
    g.stroke();
    g.strokeStyle = '#07131f';
    g.lineWidth = 65;
    g.stroke();
    let pgrad = g.createLinearGradient(0, 0, WORLD.w, WORLD.h);
    pgrad.addColorStop(0, 'rgba(11,26,42,.96)');
    pgrad.addColorStop(0.48, 'rgba(15,36,53,.96)');
    pgrad.addColorStop(1, 'rgba(20,23,51,.96)');
    g.strokeStyle = pgrad;
    g.lineWidth = 59;
    g.stroke();
    // faint interior lane
    g.strokeStyle = 'rgba(73,156,186,.08)';
    g.lineWidth = 1;
    g.setLineDash([13, 28]);
    g.stroke();
    g.setLineDash([]);

    // path lane tick marks
    const tickCount = Math.floor(PATH.length / 62);
    for (let i = 0; i < tickCount; i++) {
      const d = (i + 0.5) * 62;
      const p = pathPointAt(d);
      const nx = Math.cos(p.angle + Math.PI / 2);
      const ny = Math.sin(p.angle + Math.PI / 2);
      g.strokeStyle = i % 4 === 0 ? 'rgba(123,226,248,.14)' : 'rgba(123,226,248,.06)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(p.x + nx * 26, p.y + ny * 26);
      g.lineTo(p.x + nx * 31, p.y + ny * 31);
      g.moveTo(p.x - nx * 26, p.y - ny * 26);
      g.lineTo(p.x - nx * 31, p.y - ny * 31);
      g.stroke();
    }

    // core socket
    g.save();
    g.translate(CORE_POS.x, CORE_POS.y);
    g.strokeStyle = 'rgba(84,231,255,.18)';
    g.lineWidth = 1;
    [58, 72, 96].forEach((r, i) => {
      g.beginPath(); g.arc(0, 0, r, i * 0.9, i * 0.9 + 4.1); g.stroke();
    });
    g.fillStyle = 'rgba(3,9,16,.8)';
    g.beginPath(); g.arc(0, 0, 52, 0, TAU); g.fill();
    g.restore();

    // spawn gate socket
    const gate = pathPointAt(185);
    g.save();
    g.translate(gate.x, gate.y);
    g.rotate(gate.angle);
    g.strokeStyle = 'rgba(255,93,138,.23)';
    g.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.ellipse(-12, 0, 16 + i * 10, 30 + i * 5, 0, 0, TAU);
      g.stroke();
    }
    g.restore();

    bgCanvas = c;
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    view.w = w; view.h = h; view.dpr = dpr;
    DOM.canvas.width = Math.floor(w * dpr);
    DOM.canvas.height = Math.floor(h * dpr);
    view.scale = Math.max(w / WORLD.w, h / WORLD.h);
    view.offX = (w - WORLD.w * view.scale) / 2;
    view.offY = (h - WORLD.h * view.scale) / 2;
    if (state !== 'menu' && DOM.sidePanel) {
      const panelRect = DOM.sidePanel.getBoundingClientRect();
      if (panelRect.width > 0) {
        const coreScreenX = view.offX + CORE_POS.x * view.scale;
        const safeX = panelRect.left - 112;
        if (coreScreenX > safeX) {
          const minOffX = w - WORLD.w * view.scale - 96;
          view.offX = Math.max(minOffX, view.offX - (coreScreenX - safeX));
        }
      }
    }
    const bs = 0.38;
    bloomCanvas = DOM.bloom;
    bloomCanvas.width = Math.max(2, Math.floor(w * bs));
    bloomCanvas.height = Math.max(2, Math.floor(h * bs));
    bloomCtx = bloomCanvas.getContext('2d');
    bloomCanvas._bs = bs;
  }

  function worldTransform(c) {
    const sx = (Math.random() * 2 - 1) * shake * 0.55;
    const sy = (Math.random() * 2 - 1) * shake * 0.55;
    c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    c.translate(view.offX + sx, view.offY + sy);
    c.scale(view.scale, view.scale);
    return { sx, sy };
  }

  function drawStars(c, time) {
    c.save();
    for (const s of ambientStars) {
      const tw = 0.5 + Math.sin(time * s.speed + s.phase) * 0.5;
      const a = (s.bright ? 0.5 : 0.18) * (0.4 + tw * 0.6);
      c.globalAlpha = a;
      c.fillStyle = s.bright ? '#c8fbff' : '#7ac9e6';
      const x = s.x + Math.sin(time * 0.03 + s.phase) * 3;
      const y = s.y + Math.cos(time * 0.025 + s.phase) * 2;
      c.fillRect(x, y, s.size, s.size);
      if (s.bright) {
        c.globalAlpha = a * 0.35;
        c.fillRect(x - 3, y + s.size * 0.4, 7, 0.5);
        c.fillRect(x + s.size * 0.4, y - 3, 0.5, 7);
      }
    }
    c.globalAlpha = 1;
    for (const d of ambientDust) {
      d.x += d.vx / 60;
      d.y += d.vy / 60;
      if (d.y < -10) { d.y = WORLD.h + 10; d.x = Math.random() * WORLD.w; }
      if (d.x < -10) d.x = WORLD.w + 10;
      if (d.x > WORLD.w + 10) d.x = -10;
      c.globalAlpha = d.alpha * (0.5 + Math.sin(time * 0.7 + d.phase) * 0.5);
      c.fillStyle = '#80d8ee';
      c.beginPath(); c.arc(d.x, d.y, d.size, 0, TAU); c.fill();
    }
    c.restore();
  }

  function drawPathDynamic(c, time) {
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    // center energy lane
    let grad = c.createLinearGradient(0, 0, WORLD.w, WORLD.h);
    grad.addColorStop(0, 'rgba(84,231,255,.55)');
    grad.addColorStop(0.48, 'rgba(93,195,255,.35)');
    grad.addColorStop(1, 'rgba(164,123,255,.5)');
    tracePath(c);
    c.strokeStyle = grad;
    c.lineWidth = 1.8;
    c.setLineDash([16, 29]);
    c.lineDashOffset = -time * 58;
    c.shadowColor = 'rgba(84,231,255,.5)';
    c.shadowBlur = 8;
    c.stroke();
    c.setLineDash([]);
    c.shadowBlur = 0;

    // moving energy chevrons
    const offset = (time * 56) % 130;
    for (let d = offset; d < PATH.length; d += 130) {
      const p = pathPointAt(d);
      if (p.x < 0 || p.x > WORLD.w) continue;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.angle);
      c.strokeStyle = 'rgba(120,237,255,.23)';
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(-4, -5); c.lineTo(4, 0); c.lineTo(-4, 5);
      c.stroke();
      c.restore();
    }

    // traveling energy orbs
    for (let i = 0; i < 4; i++) {
      const d = ((time * (48 + i * 11) + i * PATH.length / 4) % PATH.length);
      const p = pathPointAt(d);
      if (p.x < -20) continue;
      const a = 0.5 + Math.sin(time * 2 + i) * 0.2;
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = `rgba(133,242,255,${a})`;
      c.beginPath(); c.arc(p.x, p.y, 2.4, 0, TAU); c.fill();
      c.fillStyle = `rgba(84,231,255,${a * 0.22})`;
      c.beginPath(); c.arc(p.x, p.y, 11, 0, TAU); c.fill();
    }
    c.globalCompositeOperation = 'source-over';

    // spawn gate
    const gate = pathPointAt(185);
    c.save();
    c.translate(gate.x, gate.y);
    c.rotate(gate.angle);
    c.globalCompositeOperation = 'lighter';
    const pulse = 0.5 + Math.sin(time * 2.2) * 0.2;
    const gr = c.createRadialGradient(0, 0, 0, 0, 0, 52);
    gr.addColorStop(0, `rgba(255,93,138,${0.18 * pulse})`);
    gr.addColorStop(1, 'rgba(255,93,138,0)');
    c.fillStyle = gr;
    c.beginPath(); c.ellipse(0, 0, 58, 52, 0, 0, TAU); c.fill();
    c.strokeStyle = `rgba(255,112,151,${0.28 + pulse * 0.2})`;
    c.lineWidth = 1.4;
    c.setLineDash([5, 6]);
    c.lineDashOffset = -time * 20;
    c.beginPath(); c.ellipse(-8, 0, 25, 33, 0, 0, TAU); c.stroke();
    c.beginPath(); c.ellipse(-8, 0, 17, 25, 0, 0, TAU); c.stroke();
    c.setLineDash([]);
    c.restore();
    c.restore();
  }

  function drawMenuAnomaly(c, time) {
    const x = 960, y = 420;
    const pulse = 0.5 + Math.sin(time * 1.25) * 0.5;
    c.save();
    c.translate(x, y);
    c.globalCompositeOperation = 'lighter';
    // immense ambient field
    let glow = c.createRadialGradient(0, 0, 20, 0, 0, 360);
    glow.addColorStop(0, `rgba(75,220,255,${0.13 + pulse * 0.035})`);
    glow.addColorStop(0.42, 'rgba(52,120,190,.055)');
    glow.addColorStop(0.7, 'rgba(112,72,190,.035)');
    glow.addColorStop(1, 'rgba(2,8,16,0)');
    c.fillStyle = glow;
    c.beginPath(); c.arc(0, 0, 360, 0, TAU); c.fill();

    // giant orbital segments
    c.save();
    c.rotate(time * 0.045);
    for (let i = 0; i < 5; i++) {
      c.strokeStyle = i % 2 ? 'rgba(140,120,255,.12)' : 'rgba(84,231,255,.14)';
      c.lineWidth = i === 0 ? 1.4 : 1;
      c.setLineDash(i % 2 ? [2, 18] : [48, 26]);
      c.beginPath(); c.ellipse(0, 0, 232 + i * 32, 94 + i * 16, -0.09 + i * 0.035, 0, TAU); c.stroke();
    }
    c.setLineDash([]);
    c.restore();

    // rift tear
    c.save();
    c.rotate(-0.14);
    const tear = c.createRadialGradient(0, 0, 2, 0, 0, 150);
    tear.addColorStop(0, 'rgba(228,255,255,.42)');
    tear.addColorStop(0.18, 'rgba(78,231,255,.18)');
    tear.addColorStop(0.52, 'rgba(48,80,170,.09)');
    tear.addColorStop(1, 'rgba(5,9,20,0)');
    c.fillStyle = tear;
    c.beginPath(); c.ellipse(0, 0, 85 + pulse * 6, 208 + pulse * 10, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(140,245,255,.38)';
    c.lineWidth = 1.3;
    c.shadowColor = '#54e7ff'; c.shadowBlur = 24;
    c.beginPath(); c.ellipse(0, 0, 71, 185, 0, 0, TAU); c.stroke();
    c.strokeStyle = 'rgba(171,137,255,.32)';
    c.lineWidth = 1;
    c.beginPath(); c.ellipse(0, 0, 49, 156, 0, 0, TAU); c.stroke();
    c.shadowBlur = 0;

    // bright inner slit
    c.strokeStyle = `rgba(213,255,255,${0.32 + pulse * 0.25})`;
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -130); c.lineTo(0, 130); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.8)';
    c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(0, -75); c.lineTo(0, 82); c.stroke();
    c.restore();

    // glitch shards
    for (let i = 0; i < 11; i++) {
      const a = time * (0.16 + i * 0.012) + i * 1.77;
      const r = 155 + (i % 4) * 44;
      const sx = Math.cos(a) * r;
      const sy = Math.sin(a) * r * 0.54;
      c.save();
      c.translate(sx, sy);
      c.rotate(a + time * 0.4);
      c.fillStyle = i % 3 ? 'rgba(110,226,255,.28)' : 'rgba(176,137,255,.24)';
      c.fillRect(-5 - i % 3, -0.8, 10 + i % 5, 1.6);
      c.restore();
    }
    c.restore();

    // projected node label
    c.save();
    c.globalAlpha = 0.5;
    c.strokeStyle = 'rgba(104,230,255,.2)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(x + 78, y + 198); c.lineTo(x + 150, y + 250); c.lineTo(x + 250, y + 250); c.stroke();
    c.fillStyle = 'rgba(123,200,220,.55)';
    c.font = '500 8px "SFMono-Regular", monospace';
    c.fillText('UNSTABLE RIFT / ANOMALY 07', x + 156, y + 244);
    c.fillStyle = 'rgba(255,94,138,.55)';
    c.beginPath(); c.arc(x + 145, y + 250, 2, 0, TAU); c.fill();
    c.restore();
  }

  function drawCore(c, time) {
    const ratio = run ? clamp(run.coreHP / run.maxCoreHP, 0, 1) : 1;
    const x = CORE_POS.x, y = CORE_POS.y;
    const pulse = 0.5 + Math.sin(time * 2.1) * 0.5;
    const low = run && ratio < 0.34;
    const coreColor = low ? '#ff6a82' : '#77f2ff';
    c.save();
    c.translate(x, y);
    c.globalCompositeOperation = 'lighter';

    // vertical shaft
    const shaft = c.createLinearGradient(0, -430, 0, 60);
    shaft.addColorStop(0, 'rgba(84,231,255,0)');
    shaft.addColorStop(0.6, `rgba(84,231,255,${0.02 + pulse * 0.018})`);
    shaft.addColorStop(1, `rgba(84,231,255,${0.07 + pulse * 0.03})`);
    c.fillStyle = shaft;
    c.beginPath();
    c.moveTo(-22, -430); c.lineTo(22, -430); c.lineTo(46, 70); c.lineTo(-46, 70); c.closePath();
    c.fill();

    // aura
    const aura = c.createRadialGradient(0, 0, 8, 0, 0, 148);
    aura.addColorStop(0, low ? 'rgba(255,70,95,.28)' : 'rgba(78,230,255,.25)');
    aura.addColorStop(0.45, low ? 'rgba(255,70,95,.08)' : 'rgba(84,231,255,.075)');
    aura.addColorStop(1, 'rgba(10,20,40,0)');
    c.fillStyle = aura;
    c.beginPath(); c.arc(0, 0, 148, 0, TAU); c.fill();

    // rotating rings
    c.save();
    c.rotate(time * 0.22);
    c.strokeStyle = low ? 'rgba(255,106,130,.5)' : 'rgba(106,231,255,.48)';
    c.lineWidth = 1.3;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.arc(0, 0, 54 + i * 13, i * 1.35, i * 1.35 + 1.2 + i * 0.1);
      c.stroke();
    }
    c.restore();
    c.save();
    c.rotate(-time * 0.37);
    c.strokeStyle = 'rgba(164,123,255,.28)';
    c.setLineDash([3, 12]);
    c.lineWidth = 1;
    c.beginPath(); c.arc(0, 0, 86, 0, TAU); c.stroke();
    c.setLineDash([]);
    c.restore();

    // hex shield
    c.save();
    c.rotate(time * 0.12);
    c.strokeStyle = low ? 'rgba(255,133,148,.3)' : 'rgba(160,247,255,.25)';
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const px = Math.cos(a) * 47, py = Math.sin(a) * 47;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath(); c.stroke();
    c.restore();

    // crystal
    const s = 1 + pulse * 0.045;
    c.save();
    c.scale(s, s);
    c.shadowColor = coreColor;
    c.shadowBlur = 26;
    const crystal = c.createLinearGradient(-18, -32, 20, 34);
    crystal.addColorStop(0, '#f2ffff');
    crystal.addColorStop(0.24, low ? '#ffb2bd' : '#9ffbff');
    crystal.addColorStop(0.58, low ? '#ff546d' : '#31cbe8');
    crystal.addColorStop(1, low ? '#8c1d3a' : '#265eae');
    c.fillStyle = crystal;
    c.beginPath();
    c.moveTo(0, -34); c.lineTo(19, -8); c.lineTo(12, 23); c.lineTo(0, 34); c.lineTo(-12, 23); c.lineTo(-19, -8); c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(230,255,255,.7)';
    c.lineWidth = 1;
    c.stroke();
    c.shadowBlur = 0;
    // inner facet
    c.fillStyle = 'rgba(240,255,255,.45)';
    c.beginPath(); c.moveTo(0, -28); c.lineTo(7, -5); c.lineTo(0, 7); c.lineTo(-7, -5); c.closePath(); c.fill();
    c.restore();

    // orbiting shards
    for (let i = 0; i < 7; i++) {
      const a = time * (0.65 + i * 0.035) + i * TAU / 7;
      const r = 66 + Math.sin(time * 1.6 + i) * 8;
      const sx = Math.cos(a) * r, sy = Math.sin(a) * r * 0.65;
      c.fillStyle = i % 2 ? 'rgba(151,247,255,.75)' : 'rgba(164,123,255,.55)';
      c.save();
      c.translate(sx, sy);
      c.rotate(a);
      c.fillRect(-3, -1, 6, 2);
      c.restore();
    }

    c.globalCompositeOperation = 'source-over';
    // health arc
    c.strokeStyle = 'rgba(9,23,34,.9)';
    c.lineWidth = 4;
    c.beginPath(); c.arc(0, 0, 101, Math.PI * 0.2, Math.PI * 1.8); c.stroke();
    c.strokeStyle = low ? '#ff6079' : '#6ff2e6';
    c.lineWidth = 2;
    c.shadowColor = c.strokeStyle;
    c.shadowBlur = 9;
    c.beginPath();
    c.arc(0, 0, 101, Math.PI * 0.2, Math.PI * 0.2 + Math.PI * 1.6 * ratio);
    c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(131,201,220,.46)';
    c.font = '500 7px "SFMono-Regular", monospace';
    c.textAlign = 'center';
    c.fillText('RIFT CORE', 0, 122);
    c.textAlign = 'left';
    c.restore();
  }

  function drawHex(c, r, rotation) {
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = rotation + i / 6 * TAU;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath();
  }

  function drawTowerBase(c, t, def, time) {
    const lv = t.level;
    const sp = easeOutCubic(t.spawn);
    const s = (1.15 + (lv - 1) * 0.07) * sp;
    c.save();
    c.translate(t.x, t.y);
    c.globalAlpha = sp;
    // ground halo
    c.save();
    c.globalCompositeOperation = 'lighter';
    const halo = c.createRadialGradient(0, 0, 4, 0, 0, 48);
    halo.addColorStop(0, rgba(def.color, 0.15));
    halo.addColorStop(0.55, rgba(def.color, 0.045));
    halo.addColorStop(1, rgba(def.color, 0));
    c.fillStyle = halo;
    c.beginPath(); c.arc(0, 0, 48, 0, TAU); c.fill();
    c.restore();
    // shadow
    c.fillStyle = 'rgba(0,0,0,.5)';
    c.beginPath(); c.ellipse(0, 9, 31, 14, 0, 0, TAU); c.fill();
    c.scale(s, s);
    // ground ring
    c.strokeStyle = rgba(def.color, 0.22 + 0.08 * Math.sin(time * 2 + t.phase));
    c.lineWidth = 1.2;
    c.beginPath(); c.arc(0, 0, 36, 0, TAU); c.stroke();
    c.strokeStyle = rgba(def.color, 0.08);
    c.beginPath(); c.arc(0, 0, 42, 0, TAU); c.stroke();
    // base hex
    drawHex(c, 26, Math.PI / 6);
    c.fillStyle = '#081722';
    c.fill();
    c.strokeStyle = rgba(def.color, 0.72);
    c.lineWidth = 1.3;
    c.stroke();
    drawHex(c, 20, Math.PI / 6);
    c.fillStyle = rgba(def.color, 0.14);
    c.fill();
    c.strokeStyle = rgba(def.color, 0.32);
    c.lineWidth = 1;
    c.stroke();
    // rotating segments
    c.save();
    c.rotate(time * 0.23 + t.phase);
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc(0, 0, 32 + (lv - 1) * 2, i * TAU / 3, i * TAU / 3 + 0.68);
      c.strokeStyle = rgba(def.color, 0.8);
      c.lineWidth = 2;
      c.shadowColor = def.color;
      c.shadowBlur = 7;
      c.stroke();
    }
    c.shadowBlur = 0;
    c.restore();
    // outer tick marks
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + Math.PI / 6;
      c.fillStyle = rgba(def.color, 0.3);
      c.fillRect(Math.cos(a) * 39 - 1, Math.sin(a) * 39 - 1, 2, 2);
    }
    // level pips
    for (let i = 0; i < 3; i++) {
      c.fillStyle = i < lv ? def.color : 'rgba(104,156,177,.22)';
      if (i < lv) { c.shadowColor = def.color; c.shadowBlur = 6; }
      c.fillRect(-16 + i * 12, 33, 8, 2.5);
      c.shadowBlur = 0;
    }
    c.restore();
  }

  function drawTower(c, t, time) {
    const def = TOWERS[t.type];
    const lv = t.level;
    drawTowerBase(c, t, def, time);
    const sp = easeOutCubic(t.spawn);
    if (sp < 0.01) return;
    c.save();
    c.translate(t.x, t.y);
    c.globalAlpha = sp;
    const scale = (1.18 + (lv - 1) * 0.075) * (0.9 + sp * 0.1);
    c.scale(scale, scale);
    const recoil = t.recoil * 3.5;
    const flash = Math.max(0, t.flash / 0.08);

    if (t.type === 'pulse') {
      c.save();
      c.rotate(t.angle);
      c.translate(-recoil, 0);
      // rear housing
      c.fillStyle = '#0c2232';
      c.beginPath(); c.arc(0, 0, 10, 0, TAU); c.fill();
      c.strokeStyle = rgba(def.color, 0.65);
      c.lineWidth = 1;
      c.stroke();
      // twin prongs
      c.strokeStyle = rgba(def.color, 0.9);
      c.lineWidth = 2.4;
      c.lineCap = 'round';
      [-7, 7].forEach(oy => {
        c.beginPath(); c.moveTo(4, oy); c.lineTo(25, oy * 0.65); c.stroke();
        c.strokeStyle = rgba(def.color2, 0.4); c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(6, oy * 0.7); c.lineTo(23, oy * 0.45); c.stroke();
        c.strokeStyle = rgba(def.color, 0.9); c.lineWidth = 2.4;
      });
      // emitter orb
      c.fillStyle = '#dffeff';
      c.shadowColor = def.color; c.shadowBlur = 12;
      c.beginPath(); c.arc(22, 0, 2.6, 0, TAU); c.fill();
      c.shadowBlur = 0;
      // inner core
      c.fillStyle = rgba(def.color, 0.8);
      c.beginPath(); c.arc(0, 0, 4, 0, TAU); c.fill();
      if (flash > 0) {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = `rgba(190,252,255,${flash * 0.7})`;
        c.beginPath(); c.arc(27, 0, 7 + flash * 5, 0, TAU); c.fill();
      }
      c.restore();
    } else if (t.type === 'prism') {
      // orbit shards
      c.save();
      c.rotate(time * 1.2 + t.phase);
      for (let i = 0; i < 3; i++) {
        c.rotate(TAU / 3);
        c.fillStyle = i === 0 ? def.color2 : rgba(def.color, 0.75);
        c.beginPath();
        c.moveTo(18, -2.5); c.lineTo(22, 0); c.lineTo(18, 2.5); c.lineTo(15, 0); c.closePath();
        c.fill();
      }
      c.restore();
      c.save();
      c.rotate(t.angle);
      c.translate(-recoil, 0);
      // triangular frame
      c.fillStyle = 'rgba(22,16,48,.92)';
      c.strokeStyle = rgba(def.color, 0.8);
      c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(20, 0); c.lineTo(-10, -13); c.lineTo(-10, 13); c.closePath(); c.fill(); c.stroke();
      // internal beam
      c.strokeStyle = rgba(def.color2, 0.6);
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(-6, 0); c.lineTo(16, 0); c.stroke();
      // crystal
      c.fillStyle = def.color2;
      c.shadowColor = def.color; c.shadowBlur = 10;
      c.beginPath(); c.moveTo(3, -6); c.lineTo(9, 0); c.lineTo(3, 6); c.lineTo(-3, 0); c.closePath(); c.fill();
      c.shadowBlur = 0;
      c.restore();
    } else if (t.type === 'mortar') {
      c.save();
      c.rotate(t.angle);
      c.translate(-recoil * 1.6, 0);
      // supports
      c.strokeStyle = 'rgba(150,105,62,.8)';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(-3, -9); c.lineTo(7, -3); c.moveTo(-3, 9); c.lineTo(7, 3); c.stroke();
      // tube
      c.lineCap = 'round';
      c.strokeStyle = '#10151e';
      c.lineWidth = 11;
      c.beginPath(); c.moveTo(-2, 0); c.lineTo(20, -5); c.stroke();
      c.strokeStyle = rgba(def.color, 0.85);
      c.lineWidth = 6;
      c.beginPath(); c.moveTo(-1, 0); c.lineTo(19, -4.5); c.stroke();
      c.strokeStyle = rgba(def.color2, 0.5);
      c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(1, -2); c.lineTo(19, -6); c.stroke();
      // mouth
      c.fillStyle = '#21160f';
      c.beginPath(); c.arc(21, -5, 5.5, 0, TAU); c.fill();
      c.strokeStyle = rgba(def.color, 0.9);
      c.lineWidth = 1.4;
      c.stroke();
      // drum
      c.fillStyle = '#2b1d13';
      c.beginPath(); c.arc(-2, 0, 9, 0, TAU); c.fill();
      c.strokeStyle = rgba(def.color, 0.55);
      c.stroke();
      if (flash > 0) {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = `rgba(255,211,140,${flash * 0.8})`;
        c.beginPath(); c.arc(24, -5, 9 + flash * 8, 0, TAU); c.fill();
      }
      c.restore();
    } else if (t.type === 'cryo') {
      const rot = time * 0.58 + t.phase;
      c.save();
      c.rotate(rot);
      for (let i = 0; i < 4; i++) {
        c.rotate(TAU / 4);
        c.fillStyle = i % 2 ? rgba(def.color, 0.7) : rgba(def.color2, 0.5);
        c.beginPath();
        c.moveTo(5, -3); c.lineTo(26, 0); c.lineTo(5, 3); c.lineTo(10, 0); c.closePath();
        c.fill();
      }
      c.restore();
      c.save();
      c.rotate(-rot * 1.4);
      c.strokeStyle = rgba(def.color, 0.4);
      c.lineWidth = 1;
      c.setLineDash([3, 5]);
      c.beginPath(); c.arc(0, 0, 23, 0, TAU); c.stroke();
      c.setLineDash([]);
      c.restore();
      c.fillStyle = '#d9fbff';
      c.shadowColor = def.color; c.shadowBlur = 16;
      c.beginPath(); c.arc(0, 0, 5.5, 0, TAU); c.fill();
      c.shadowBlur = 0;
      // frost sparkles
      for (let i = 0; i < 3; i++) {
        const a = rot + i * 2.1;
        c.fillStyle = `rgba(190,246,255,${0.3 + Math.sin(time * 3 + i) * 0.2})`;
        c.beginPath(); c.arc(Math.cos(a) * 25, Math.sin(a) * 25, 1.1, 0, TAU); c.fill();
      }
    } else if (t.type === 'rail') {
      c.save();
      c.rotate(t.angle);
      c.translate(-recoil * 2, 0);
      // base rail housing
      c.fillStyle = '#161221';
      c.beginPath(); c.roundRect(-8, -9, 15, 18, 3); c.fill();
      c.strokeStyle = rgba(def.color, 0.5); c.lineWidth = 1; c.stroke();
      // twin rails
      c.lineCap = 'round';
      c.strokeStyle = '#0b0914';
      c.lineWidth = 7;
      c.beginPath(); c.moveTo(0, -6); c.lineTo(32, -3); c.moveTo(0, 6); c.lineTo(32, 3); c.stroke();
      c.strokeStyle = rgba(def.color, 0.9);
      c.lineWidth = 1.7;
      c.beginPath(); c.moveTo(2, -6); c.lineTo(32, -3); c.moveTo(2, 6); c.lineTo(32, 3); c.stroke();
      // coils
      for (let i = 0; i < 4; i++) {
        const x = 5 + i * 6.5;
        c.strokeStyle = rgba(def.color2, 0.35 + i * 0.1);
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(x, -8); c.lineTo(x + 2, 8); c.stroke();
      }
      // energy core
      const pulse = 0.55 + Math.sin(time * 5 + t.phase) * 0.3;
      c.fillStyle = rgba(def.color, 0.8);
      c.shadowColor = def.color; c.shadowBlur = 12;
      c.beginPath(); c.arc(1, 0, 3.2, 0, TAU); c.fill();
      c.shadowBlur = 0;
      c.fillStyle = `rgba(255,220,238,${pulse})`;
      c.fillRect(4, -0.7, 25, 1.4);
      if (flash > 0) {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = `rgba(255,174,207,${flash * 0.65})`;
        c.beginPath(); c.arc(32, 0, 13, 0, TAU); c.fill();
      }
      c.restore();
    }
    c.restore();

    // selection / hover ring
    if (t.id === selectedTowerId || t.id === hoverTowerId) {
      c.save();
      c.translate(t.x, t.y);
      c.rotate(time * 0.5);
      c.strokeStyle = t.id === selectedTowerId ? rgba(def.color, 0.9) : rgba(def.color, 0.45);
      c.lineWidth = 1;
      c.setLineDash([8, 7]);
      c.beginPath(); c.arc(0, 0, 43, 0, TAU); c.stroke();
      c.setLineDash([]);
      c.restore();
      if (t.id === selectedTowerId) {
        c.strokeStyle = rgba(def.color, 0.7);
        c.lineWidth = 1.4;
        const br = 50;
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
          c.beginPath();
          c.moveTo(t.x + sx * br, t.y + sy * br - sy * 8);
          c.lineTo(t.x + sx * br, t.y + sy * br);
          c.lineTo(t.x + sx * br - sx * 8, t.y + sy * br);
          c.stroke();
        });
      }
    }
  }

  function drawRange(c, t) {
    const s = statForTower(t);
    const def = TOWERS[t.type];
    c.save();
    c.fillStyle = rgba(def.color, 0.035);
    c.strokeStyle = rgba(def.color, 0.45);
    c.lineWidth = 1;
    c.setLineDash([4, 7]);
    c.beginPath(); c.arc(t.x, t.y, s.range, 0, TAU); c.fill(); c.stroke();
    c.setLineDash([]);
    c.strokeStyle = rgba(def.color, 0.08);
    c.beginPath(); c.arc(t.x, t.y, s.range * 0.5, 0, TAU); c.stroke();
    c.restore();
  }

  function drawEnemyShape(c, e, r, time) {
    const s = e.shape;
    const flash = e.flash > 0;
    c.save();
    c.translate(e.x, e.y);
    if (e.untargetableTimer > 0) c.globalAlpha = 0.33 + Math.sin(time * 34) * 0.1;
    c.rotate(e.angle);
    c.lineJoin = 'round';
    let fill = e.color;
    let accent = e.color2;
    c.shadowColor = fill;
    c.shadowBlur = e.boss ? 0 : (e.elite ? 11 : 5);

    if (s === 'diamond') {
      c.fillStyle = fill;
      c.beginPath(); c.moveTo(r * 1.25, 0); c.lineTo(0, -r * 0.72); c.lineTo(-r * 0.95, 0); c.lineTo(0, r * 0.72); c.closePath(); c.fill();
      c.fillStyle = rgba(accent, 0.5);
      c.beginPath(); c.moveTo(r * 0.55, 0); c.lineTo(0, -r * 0.35); c.lineTo(-r * 0.4, 0); c.lineTo(0, r * 0.35); c.closePath(); c.fill();
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(r * 0.3, 0, 1.6, 0, TAU); c.fill();
    } else if (s === 'arrow') {
      c.fillStyle = fill;
      c.beginPath(); c.moveTo(r * 1.6, 0); c.lineTo(-r * 0.7, -r * 0.8); c.lineTo(-r * 0.25, 0); c.lineTo(-r * 0.7, r * 0.8); c.closePath(); c.fill();
      c.fillStyle = rgba(accent, 0.65);
      c.beginPath(); c.moveTo(r * 0.8, 0); c.lineTo(-r * 0.25, -r * 0.3); c.lineTo(-r * 0.25, r * 0.3); c.closePath(); c.fill();
    } else if (s === 'fortress') {
      c.fillStyle = '#33160f';
      c.strokeStyle = fill;
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU;
        const x = Math.cos(a) * r * 1.2, y = Math.sin(a) * r;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = rgba(fill, 0.65);
      c.fillRect(-r * 0.45, -r * 0.4, r * 0.9, r * 0.8);
      c.strokeStyle = rgba(accent, 0.55);
      c.lineWidth = 1;
      c.strokeRect(-r * 0.6, -r * 0.55, r * 1.2, r * 1.1);
      c.fillStyle = accent;
      c.beginPath(); c.arc(0, 0, r * 0.24, 0, TAU); c.fill();
    } else if (s === 'splitter') {
      c.fillStyle = rgba(fill, 0.88);
      for (let i = 0; i < 3; i++) {
        const a = time * 1.4 + i * TAU / 3;
        c.beginPath(); c.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.55, 0, TAU); c.fill();
      }
      c.fillStyle = '#1c0b1e';
      c.beginPath(); c.arc(0, 0, r * 0.45, 0, TAU); c.fill();
      c.fillStyle = accent;
      c.beginPath(); c.arc(0, 0, r * 0.2, 0, TAU); c.fill();
    } else if (s === 'shield') {
      c.fillStyle = fill;
      c.beginPath(); c.moveTo(r * 1.1, 0); c.lineTo(0, -r * 0.75); c.lineTo(-r, 0); c.lineTo(0, r * 0.75); c.closePath(); c.fill();
      c.strokeStyle = rgba(accent, 0.75);
      c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, r * 1.15, -0.9, 0.9); c.stroke();
      c.fillStyle = 'rgba(10,25,40,.8)';
      c.beginPath(); c.arc(0, 0, r * 0.38, 0, TAU); c.fill();
      c.fillStyle = accent;
      c.beginPath(); c.arc(0, 0, r * 0.18, 0, TAU); c.fill();
    } else if (s === 'phase') {
      c.globalAlpha *= 0.78;
      for (let i = 2; i >= 0; i--) {
        c.globalAlpha = (i === 0 ? 0.9 : 0.14) * (e.untargetableTimer > 0 ? 0.5 : 1);
        c.fillStyle = i === 0 ? fill : '#8c6dff';
        c.beginPath();
        c.moveTo(r * 1.25 - i * 4, 0);
        c.lineTo(-r * 0.8 - i * 3, -r * 0.82);
        c.lineTo(-r * 0.35, 0);
        c.lineTo(-r * 0.8 - i * 3, r * 0.82);
        c.closePath(); c.fill();
      }
      c.globalAlpha = 0.9;
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(r * 0.2, 0, 1.4, 0, TAU); c.fill();
    } else if (s === 'healer') {
      c.fillStyle = '#0d2b25';
      c.strokeStyle = fill;
      c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke();
      c.strokeStyle = rgba(accent, 0.85);
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(-r * 0.45, 0); c.lineTo(r * 0.45, 0); c.moveTo(0, -r * 0.45); c.lineTo(0, r * 0.45); c.stroke();
      c.fillStyle = rgba(fill, 0.4);
      for (let i = 0; i < 3; i++) {
        const a = time * 0.9 + i * TAU / 3;
        c.beginPath(); c.arc(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25, 2, 0, TAU); c.fill();
      }
    }
    c.shadowBlur = 0;
    if (flash) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.65;
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(0, 0, r * 1.05, 0, TAU); c.fill();
    }
    c.restore();
  }

  function drawEnemy(c, e, time) {
    const r = e.radius * (0.65 + easeOutCubic(e.spawnT) * 0.35);
    // trail
    if (e.trail.length > 1) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < e.trail.length; i++) {
        const p = e.trail[i];
        const a = (i / e.trail.length) * 0.16;
        c.fillStyle = rgba(e.color, a);
        c.beginPath(); c.arc(p.x, p.y, r * (0.2 + i / e.trail.length * 0.5), 0, TAU); c.fill();
      }
      c.restore();
    }
    // aura
    c.save();
    c.globalCompositeOperation = 'lighter';
    const aura = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 2.2);
    aura.addColorStop(0, rgba(e.color, e.elite ? 0.22 : 0.1));
    aura.addColorStop(1, rgba(e.color, 0));
    c.fillStyle = aura;
    c.beginPath(); c.arc(e.x, e.y, r * 2.2, 0, TAU); c.fill();
    c.restore();

    if (e.elite) {
      c.save();
      c.translate(e.x, e.y);
      c.rotate(time * 0.8);
      c.strokeStyle = 'rgba(255,212,122,.4)';
      c.lineWidth = 1;
      c.setLineDash([3, 6]);
      c.beginPath(); c.arc(0, 0, r + 9, 0, TAU); c.stroke();
      c.setLineDash([]);
      c.restore();
    }
    drawEnemyShape(c, e, r, time);

    // status markers
    if (e.slowTimer > 0) {
      c.save();
      c.translate(e.x, e.y);
      c.rotate(time * 1.2);
      c.strokeStyle = 'rgba(126,220,255,.55)';
      c.lineWidth = 1;
      c.setLineDash([2, 4]);
      c.beginPath(); c.arc(0, 0, r + 5, 0, TAU); c.stroke();
      c.setLineDash([]);
      c.restore();
    }
    if (e.markTimer > 0) {
      c.fillStyle = 'rgba(180,144,255,.8)';
      c.beginPath(); c.arc(e.x, e.y - r - 9, 2, 0, TAU); c.fill();
    }
    if (e.stunTimer > 0) {
      c.fillStyle = 'rgba(255,238,180,.85)';
      for (let i = 0; i < 3; i++) {
        const a = time * 4 + i * TAU / 3;
        c.beginPath(); c.arc(e.x + Math.cos(a) * (r + 3), e.y - r - 4 + Math.sin(a) * 2, 1.2, 0, TAU); c.fill();
      }
    }
    // shield shell
    if (e.shield > 0) {
      c.save();
      c.translate(e.x, e.y);
      c.rotate(-time * 0.8);
      c.strokeStyle = 'rgba(126,233,255,.36)';
      c.lineWidth = 1.2;
      c.setLineDash([6, 5]);
      c.beginPath(); c.arc(0, 0, r + 8, 0, TAU); c.stroke();
      c.setLineDash([]);
      c.restore();
    }
    // health / shield bars
    const damaged = e.hp < e.maxHp - 0.5 || e.elite || (e.maxShield > 0 && e.shield < e.maxShield - 0.5);
    if (damaged) {
      const w = Math.max(24, r * 2.3);
      const hpR = clamp(e.hp / e.maxHp, 0, 1);
      const bx = e.x - w / 2, by = e.y - r - 15;
      c.fillStyle = 'rgba(5,14,22,.68)';
      c.fillRect(bx, by, w, 3);
      c.fillStyle = e.elite ? '#ffd47a' : e.color;
      c.fillRect(bx, by, w * hpR, 3);
      if (e.maxShield > 0) {
        c.fillStyle = 'rgba(5,14,22,.68)';
        c.fillRect(bx, by - 4, w, 2);
        c.fillStyle = '#76eaff';
        c.fillRect(bx, by - 4, w * clamp(e.shield / e.maxShield, 0, 1), 2);
      }
    }
  }

  function drawBoss(c, e, time) {
    const R = e.radius;
    const pulse = 0.5 + Math.sin(time * 2.6) * 0.5;
    const aggro = e.hp / e.maxHp < 0.5;
    // trail
    if (e.trail.length > 1) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < e.trail.length; i++) {
        const p = e.trail[i];
        const a = (i / e.trail.length) * 0.18;
        c.fillStyle = rgba(e.color, a);
        c.beginPath(); c.arc(p.x, p.y, R * (0.24 + i / e.trail.length * 0.55), 0, TAU); c.fill();
      }
      c.restore();
    }
    // ground aura
    c.save();
    c.translate(e.x, e.y);
    c.globalCompositeOperation = 'lighter';
    const aura = c.createRadialGradient(0, 0, 4, 0, 0, R * 3.2);
    aura.addColorStop(0, rgba(e.color, 0.25));
    aura.addColorStop(0.5, rgba(e.color, 0.07));
    aura.addColorStop(1, rgba(e.color, 0));
    c.fillStyle = aura;
    c.beginPath(); c.arc(0, 0, R * 3.2, 0, TAU); c.fill();
    c.restore();
    // aura rings
    c.save();
    c.translate(e.x, e.y);
    c.rotate(time * 0.25);
    for (let i = 0; i < 4; i++) {
      c.strokeStyle = rgba(e.color, 0.2 + i * 0.06);
      c.lineWidth = 1.2;
      c.setLineDash(i % 2 ? [2, 12] : [20, 9]);
      c.beginPath(); c.arc(0, 0, R + 16 + i * 13, i * 1.2, i * 1.2 + 1.5 + i * 0.25); c.stroke();
    }
    c.setLineDash([]);
    c.restore();

    c.save();
    c.translate(e.x, e.y);
    if (e.untargetableTimer > 0) c.globalAlpha = 0.4 + Math.sin(time * 30) * 0.15;
    c.rotate(e.angle);

    if (e.style === 'final') {
      // outer mechanical petals
      c.save();
      c.rotate(-time * 0.28);
      for (let i = 0; i < 6; i++) {
        c.rotate(TAU / 6);
        c.fillStyle = i % 2 ? 'rgba(34,12,26,.92)' : 'rgba(58,14,30,.85)';
        c.strokeStyle = rgba(e.color, 0.55);
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(R * 0.68, -R * 0.2);
        c.lineTo(R * 1.22, -R * 0.5);
        c.lineTo(R * 1.07, R * 0.22);
        c.lineTo(R * 0.58, R * 0.34);
        c.closePath(); c.fill(); c.stroke();
      }
      c.restore();
      // eye
      c.fillStyle = '#0b0711';
      c.beginPath(); c.ellipse(0, 0, R * 0.76, R * 0.62, 0, 0, TAU); c.fill();
      c.strokeStyle = rgba(e.color, 0.8);
      c.lineWidth = 2;
      c.stroke();
      const iris = c.createRadialGradient(R * 0.15, 0, 2, 0, 0, R * 0.42);
      iris.addColorStop(0, '#fff3f5');
      iris.addColorStop(0.18, e.color2);
      iris.addColorStop(0.6, e.color);
      iris.addColorStop(1, 'rgba(40,2,12,.9)');
      c.fillStyle = iris;
      c.beginPath(); c.arc(R * 0.15, 0, R * 0.4, 0, TAU); c.fill();
      c.fillStyle = '#12030a';
      c.beginPath(); c.ellipse(R * 0.17, 0, R * 0.12, R * 0.3, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,.8)';
      c.beginPath(); c.arc(R * 0.02, -R * 0.12, R * 0.07, 0, TAU); c.fill();
    } else if (e.style === 'chronarch') {
      c.fillStyle = 'rgba(35,24,10,.94)';
      c.strokeStyle = rgba(e.color, 0.8);
      c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, R * 0.78, 0, TAU); c.fill(); c.stroke();
      c.strokeStyle = rgba(e.color2, 0.55);
      c.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU;
        c.beginPath();
        c.moveTo(Math.cos(a) * R * 0.63, Math.sin(a) * R * 0.63);
        c.lineTo(Math.cos(a) * R * 0.74, Math.sin(a) * R * 0.74);
        c.stroke();
      }
      c.strokeStyle = e.color2;
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(time * 0.7) * R * 0.5, Math.sin(time * 0.7) * R * 0.5); c.stroke();
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(time * 1.8 + 2) * R * 0.38, Math.sin(time * 1.8 + 2) * R * 0.38); c.stroke();
      c.fillStyle = e.color2;
      c.beginPath(); c.arc(0, 0, 4, 0, TAU); c.fill();
    } else {
      // generic hex core, shapes vary by spikes
      const spikes = e.style === 'tyrant' ? 8 : e.style === 'warden' ? 6 : e.style === 'brood' ? 5 : 7;
      c.fillStyle = 'rgba(12,16,28,.9)';
      c.strokeStyle = rgba(e.color, 0.85);
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const a = i / (spikes * 2) * TAU;
        const rr = i % 2 ? R * 0.62 : R * 1.04;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = rgba(e.color, 0.28);
      c.beginPath(); c.arc(0, 0, R * 0.64, 0, TAU); c.fill();
      // inner eye/core
      const core = c.createRadialGradient(0, 0, 2, 0, 0, R * 0.5);
      core.addColorStop(0, '#fff7fa');
      core.addColorStop(0.25, e.color2);
      core.addColorStop(1, e.color);
      c.fillStyle = core;
      c.shadowColor = e.color; c.shadowBlur = 24;
      c.beginPath(); c.arc(0, 0, R * 0.35 + pulse * 3, 0, TAU); c.fill();
      c.shadowBlur = 0;
      if (e.style === 'brood') {
        for (let i = 0; i < 3; i++) {
          const a = time * 0.5 + i * TAU / 3;
          c.fillStyle = rgba(e.color2, 0.7);
          c.beginPath(); c.arc(Math.cos(a) * R * 0.75, Math.sin(a) * R * 0.75, R * 0.17, 0, TAU); c.fill();
        }
      } else if (e.style === 'warden') {
        c.strokeStyle = 'rgba(224,214,255,.45)';
        c.lineWidth = 1;
        c.setLineDash([5, 6]);
        c.beginPath(); c.arc(0, 0, R * 0.87, 0, TAU); c.stroke();
        c.setLineDash([]);
      } else if (e.style === 'tyrant') {
        c.strokeStyle = rgba(e.color2, 0.55);
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(-R * 0.75, 0); c.lineTo(R * 0.75, 0); c.stroke();
      }
    }
    if (e.shield > 0) {
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = rgba(e.color2, 0.55);
      c.lineWidth = 2;
      c.setLineDash([12, 8]);
      c.beginPath(); c.arc(0, 0, R + 9, 0, TAU); c.stroke();
      c.setLineDash([]);
    }
    if (e.flash > 0) {
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = `rgba(255,255,255,${e.flash * 2.5})`;
      c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
    }
    c.restore();

    // shield bar above boss
    if (e.shield > 0) {
      const w = R * 2.4;
      c.fillStyle = 'rgba(3,9,15,.7)';
      c.fillRect(e.x - w / 2, e.y - R - 23, w, 2);
      c.fillStyle = '#8defff';
      c.fillRect(e.x - w / 2, e.y - R - 23, w * clamp(e.shield / Math.max(1, e.maxShield), 0, 1), 2);
    }
    if (aggro && e.style === 'final') {
      c.fillStyle = 'rgba(255,100,120,.6)';
      c.beginPath(); c.arc(e.x, e.y, R + 27 + Math.sin(time * 5) * 3, 0, TAU); c.strokeStyle = 'rgba(255,100,120,.35)'; c.stroke();
    }
  }

  function drawProjectiles(c, time) {
    for (const p of projectiles) {
      if (p.kind === 'bolt') {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = p.color;
        c.lineWidth = p.drone ? 1.2 : 2;
        c.shadowColor = p.color;
        c.shadowBlur = 9;
        c.beginPath(); c.moveTo(p.px, p.py); c.lineTo(p.x, p.y); c.stroke();
        c.fillStyle = '#f0ffff';
        c.beginPath(); c.arc(p.x, p.y, p.radius, 0, TAU); c.fill();
        c.restore();
      } else if (p.kind === 'shell') {
        const arc = Math.sin(p.t * Math.PI) * p.height;
        const gx = p.x, gy = p.y + arc;
        c.save();
        c.fillStyle = 'rgba(0,0,0,.35)';
        c.beginPath(); c.ellipse(gx, gy, 7, 3, 0, 0, TAU); c.fill();
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = p.color;
        c.shadowColor = p.color; c.shadowBlur = 12;
        c.beginPath(); c.arc(p.x, p.y, 4.2, 0, TAU); c.fill();
        c.fillStyle = '#fff3d8';
        c.beginPath(); c.arc(p.x - 1, p.y - 1, 1.4, 0, TAU); c.fill();
        c.restore();
      }
    }
  }

  function drawEffects(c, time) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const e of effects) {
      const t = 1 - e.life / e.maxLife;
      const alpha = Math.max(0, e.life / e.maxLife);
      if (e.type === 'ring') {
        const r = lerp(e.r0, e.r1, easeOutQuint(t));
        c.strokeStyle = rgba(e.color, alpha * 0.85);
        c.lineWidth = e.width * (1 - t * 0.5);
        c.shadowColor = e.color;
        c.shadowBlur = 9;
        c.beginPath(); c.arc(e.x, e.y, r, 0, TAU); c.stroke();
        c.shadowBlur = 0;
      } else if (e.type === 'beam') {
        c.strokeStyle = rgba(e.color, alpha * 0.9);
        c.lineWidth = e.width * (0.4 + alpha * 0.6);
        c.shadowColor = e.color;
        c.shadowBlur = 16;
        c.beginPath(); c.moveTo(e.x1, e.y1); c.lineTo(e.x2, e.y2); c.stroke();
        c.shadowBlur = 0;
        c.strokeStyle = `rgba(255,255,255,${alpha * 0.4})`;
        c.lineWidth = 1;
        c.stroke();
      } else if (e.type === 'lightning') {
        c.lineJoin = 'round';
        for (let pass = 0; pass < 2; pass++) {
          c.strokeStyle = pass === 0 ? rgba(e.color, alpha * 0.45) : `rgba(232,255,255,${alpha * 0.9})`;
          c.lineWidth = pass === 0 ? e.width * 2.6 : e.width * 0.8;
          c.shadowColor = e.color;
          c.shadowBlur = pass === 0 ? 14 : 0;
          c.beginPath();
          e.points.forEach((p, i) => {
            const jx = i === 0 ? 0 : rand(-3, 3);
            const jy = i === 0 ? 0 : rand(-3, 3);
            if (i === 0) c.moveTo(p.x + jx, p.y + jy); else c.lineTo(p.x + jx, p.y + jy);
          });
          c.stroke();
        }
        c.shadowBlur = 0;
      } else if (e.type === 'rays') {
        const prog = 1 - alpha;
        c.save();
        c.translate(e.x, e.y);
        for (let i = 0; i < e.count; i++) {
          const a = i / e.count * TAU + (i % 2 ? 0.08 : -0.03);
          const inner = 22 + prog * 130;
          const outer = Math.min(e.length, 120 + prog * e.length);
          c.strokeStyle = rgba(e.color, alpha * (i % 3 === 0 ? 0.5 : 0.22));
          c.lineWidth = i % 4 === 0 ? 2 : 1;
          c.beginPath();
          c.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
          c.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
          c.stroke();
        }
        c.restore();
      } else if (e.type === 'orbital') {
        const grd = c.createLinearGradient(e.x, e.y - 520, e.x, e.y);
        grd.addColorStop(0, 'rgba(160,250,255,0)');
        grd.addColorStop(0.4, rgba(e.color, alpha * 0.38));
        grd.addColorStop(1, `rgba(255,255,255,${alpha * 0.95})`);
        c.fillStyle = grd;
        c.fillRect(e.x - 3 - alpha * 5, e.y - 520, 6 + alpha * 10, 520);
        c.fillStyle = `rgba(255,255,255,${alpha * 0.9})`;
        c.beginPath(); c.arc(e.x, e.y, 5 + alpha * 10, 0, TAU); c.fill();
        c.strokeStyle = rgba(e.color, alpha * 0.65);
        c.lineWidth = 1.5;
        c.beginPath(); c.arc(e.x, e.y, 24 + t * 75, 0, TAU); c.stroke();
      }
    }
    c.restore();
  }

  function drawParticles(c) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      c.globalAlpha = a;
      c.fillStyle = p.color;
      if (p.trail) {
        c.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else {
        c.beginPath(); c.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, TAU); c.fill();
      }
    }
    c.globalAlpha = 1;
    c.restore();
  }

  function drawDamageTexts(c) {
    c.save();
    c.textAlign = 'center';
    for (const t of damageTexts) {
      const a = clamp(t.life / t.maxLife, 0, 1);
      c.globalAlpha = a;
      c.font = `${t.weight || 500} ${t.size || 13}px "SFMono-Regular", "PingFang SC", monospace`;
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(2,6,12,.75)';
      c.strokeText(t.text, t.x, t.y);
      c.fillStyle = t.crit ? '#fff6c9' : t.color;
      c.fillText(t.text, t.x, t.y);
    }
    c.globalAlpha = 1;
    c.restore();
  }

  function drawGhost(c, time) {
    if (!selectedBuildType || !pointer.inside || !run || (state !== 'prep' && state !== 'wave')) return;
    const type = selectedBuildType;
    const def = TOWERS[type];
    const x = pointer.x, y = pointer.y;
    if (x < 0 || y < 0 || x > WORLD.w || y > WORLD.h) return;
    const valid = canPlace(x, y) && run.credits >= towerCost(type);
    const color = valid ? def.color : '#ff556e';
    const s = statForTower({ type, level: 1 });
    c.save();
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = rgba(color, valid ? 0.045 : 0.06);
    c.strokeStyle = rgba(color, 0.75);
    c.lineWidth = 1.2;
    c.setLineDash([5, 7]);
    c.lineDashOffset = -time * 24;
    c.beginPath(); c.arc(x, y, s.range, 0, TAU); c.fill(); c.stroke();
    c.setLineDash([]);
    c.strokeStyle = rgba(color, 0.4);
    c.beginPath(); c.arc(x, y, 43, 0, TAU); c.stroke();
    c.fillStyle = rgba(color, 0.08);
    c.beginPath(); c.arc(x, y, 26, 0, TAU); c.fill();
    drawHex(c, 20, Math.PI / 6);
    c.strokeStyle = rgba(color, 0.6);
    c.stroke();
    for (let i = 0; i < 4; i++) {
      const a = time * 0.9 + i * TAU / 4;
      c.fillStyle = rgba(color, 0.9);
      c.beginPath(); c.arc(x + Math.cos(a) * 32, y + Math.sin(a) * 32, 1.6, 0, TAU); c.fill();
    }
    c.fillStyle = rgba(color, 0.9);
    c.font = '600 9px "SFMono-Regular", monospace';
    c.textAlign = 'center';
    c.fillText(valid ? 'DEPLOY' : 'BLOCKED', x, y - 45);
    c.textAlign = 'left';
    c.restore();
  }

  function drawBuildAssist(c, time) {
    if (!selectedBuildType || !run) return;
    c.save();
    c.strokeStyle = 'rgba(84,231,255,.05)';
    c.lineWidth = 1;
    const pointerX = pointer.inside ? Math.round(pointer.x / 40) * 40 : 600;
    const pointerY = pointer.inside ? Math.round(pointer.y / 40) * 40 : 430;
    for (let i = -3; i <= 3; i++) {
      c.beginPath(); c.moveTo(pointerX + i * 40, pointerY - 140); c.lineTo(pointerX + i * 40, pointerY + 140); c.stroke();
      c.beginPath(); c.moveTo(pointerX - 140, pointerY + i * 40); c.lineTo(pointerX + 140, pointerY + i * 40); c.stroke();
    }
    c.strokeStyle = 'rgba(84,231,255,.14)';
    c.strokeRect(62, 88, 1148, 772);
    c.restore();
  }

  function renderBloom(time, sx, sy) {
    const bs = bloomCanvas._bs || 0.38;
    const b = bloomCtx;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
    b.setTransform(bs, 0, 0, bs, 0, 0);
    b.translate(view.offX + sx, view.offY + sy);
    b.scale(view.scale, view.scale);
    b.globalCompositeOperation = 'lighter';

    const ratio = run ? clamp(run.coreHP / run.maxCoreHP, 0, 1) : 1;
    const coreColor = (run && ratio < 0.34) ? '#ff4f66' : '#5cecff';
    let g = b.createRadialGradient(CORE_POS.x, CORE_POS.y, 2, CORE_POS.x, CORE_POS.y, 125);
    g.addColorStop(0, rgba(coreColor, 0.48));
    g.addColorStop(0.4, rgba(coreColor, 0.12));
    g.addColorStop(1, rgba(coreColor, 0));
    b.fillStyle = g;
    b.beginPath(); b.arc(CORE_POS.x, CORE_POS.y, 125, 0, TAU); b.fill();

    for (const t of towers) {
      const def = TOWERS[t.type];
      const a = 0.12 + (t.flash > 0 ? 0.26 : 0);
      b.fillStyle = rgba(def.color, a);
      b.beginPath(); b.arc(t.x, t.y, 23 + (t.flash > 0 ? 14 : 0), 0, TAU); b.fill();
    }
    for (const e of enemies) {
      b.fillStyle = rgba(e.color, e.boss ? 0.28 : 0.11);
      b.beginPath(); b.arc(e.x, e.y, e.boss ? e.radius * 1.5 : e.radius * 1.1, 0, TAU); b.fill();
    }
    for (const p of projectiles) {
      b.fillStyle = rgba(p.color || '#fff', 0.4);
      b.beginPath(); b.arc(p.x, p.y, p.kind === 'bolt' ? 4 : 6, 0, TAU); b.fill();
    }
    for (const e of effects) {
      const alpha = e.life / e.maxLife;
      if (e.type === 'ring') {
        const r = lerp(e.r0, e.r1, easeOutQuint(1 - alpha));
        b.strokeStyle = rgba(e.color, alpha * 0.38);
        b.lineWidth = Math.max(1, e.width);
        b.beginPath(); b.arc(e.x, e.y, r, 0, TAU); b.stroke();
      } else if (e.type === 'beam' || e.type === 'orbital') {
        b.strokeStyle = rgba(e.color, alpha * 0.34);
        b.lineWidth = e.width * 2;
        b.beginPath();
        if (e.type === 'beam') { b.moveTo(e.x1, e.y1); b.lineTo(e.x2, e.y2); }
        else { b.moveTo(e.x, e.y - 200); b.lineTo(e.x, e.y); }
        b.stroke();
      }
    }
    // a subset of particles creates sparkle
    for (let i = 0; i < particles.length; i += 2) {
      const p = particles[i];
      b.fillStyle = rgba(p.color, (p.life / p.maxLife) * 0.3);
      b.beginPath(); b.arc(p.x, p.y, p.size * 1.8, 0, TAU); b.fill();
    }
    b.globalCompositeOperation = 'source-over';
  }

  function render(time) {
    if (!view.w) return;
    const dpr = view.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#02050b';
    ctx.fillRect(0, 0, view.w, view.h);
    const sc = worldTransform(ctx);
    if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0);
    drawStars(ctx, time);
    drawPathDynamic(ctx, time);

    if (state === 'menu') {
      drawMenuAnomaly(ctx, time);
      drawCore(ctx, time);
      // ambient data motes over menu scene
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rng = mulberry32(191);
      for (let i = 0; i < 28; i++) {
        const x = rng() * WORLD.w;
        const y = rng() * WORLD.h;
        const a = 0.15 + Math.sin(time * 0.5 + i) * 0.1;
        ctx.fillStyle = `rgba(104,229,255,${a})`;
        ctx.fillRect(x, y + Math.sin(time + i) * 6, 1.2, 1.2);
      }
      ctx.restore();
    } else {
      drawBuildAssist(ctx, time);
      // ranges
      if (selectedTowerId) {
        const t = towers.find(x => x.id === selectedTowerId);
        if (t) drawRange(ctx, t);
      }
      if (hoverTowerId && hoverTowerId !== selectedTowerId) {
        const t = towers.find(x => x.id === hoverTowerId);
        if (t) drawRange(ctx, t);
      }
      drawCore(ctx, time);
      for (const t of towers) drawTower(ctx, t, time);
      for (const e of enemies) {
        if (e.boss) drawBoss(ctx, e, time); else drawEnemy(ctx, e, time);
      }
      drawProjectiles(ctx, time);
      drawEffects(ctx, time);
      drawParticles(ctx);
      drawDamageTexts(ctx);
      drawGhost(ctx, time);

      // active field overlays
      ctx.save();
      if (run && run.chronoFieldTimer > 0) {
        const a = clamp(run.chronoFieldTimer / 6, 0, 1) * 0.12;
        ctx.fillStyle = `rgba(122,104,255,${a})`;
        ctx.fillRect(0, 0, WORLD.w, WORLD.h);
        ctx.strokeStyle = `rgba(177,160,255,${a * 0.5})`;
        ctx.lineWidth = 1;
        for (let i = 0; i < 7; i++) {
          ctx.beginPath();
          ctx.arc(CORE_POS.x, CORE_POS.y, 130 + i * 120 + (time * 20) % 120, 0, TAU);
          ctx.stroke();
        }
      }
      if (run && run.overclockTimer > 0) {
        ctx.strokeStyle = 'rgba(255,201,107,.08)';
        ctx.lineWidth = 2;
        ctx.setLineDash([16, 30]);
        ctx.lineDashOffset = -time * 80;
        tracePath(ctx);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
    ctx.restore();

    // bloom is rendered into a separate composited canvas (#bloom)
    if (settings().bloom && bloomCanvas) {
      renderBloom(time, sc.sx, sc.sy);
    }

    // screen-space overlays
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (run && run.chronoFieldTimer > 0) {
      const a = clamp(run.chronoFieldTimer / 6, 0, 1);
      const grad = ctx.createRadialGradient(view.w * 0.5, view.h * 0.5, view.h * 0.2, view.w * 0.5, view.h * 0.5, view.w * 0.7);
      grad.addColorStop(0, 'rgba(100,90,240,0)');
      grad.addColorStop(1, `rgba(100,80,220,${a * 0.1})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, view.w, view.h);
    }
    if (run && run.overclockTimer > 0 && state !== 'menu') {
      const a = clamp(run.overclockTimer / 8, 0, 1) * 0.22;
      const side = ctx.createLinearGradient(0, 0, view.w, 0);
      side.addColorStop(0, `rgba(255,201,107,${a})`);
      side.addColorStop(0.18, 'rgba(255,201,107,0)');
      side.addColorStop(0.82, 'rgba(255,201,107,0)');
      side.addColorStop(1, `rgba(255,201,107,${a})`);
      ctx.fillStyle = side;
      ctx.fillRect(0, 0, view.w, 2);
      ctx.fillRect(0, view.h - 2, view.w, 2);
    }
    if (run && run.coreHP / run.maxCoreHP < 0.34 && state !== 'menu') {
      const pulse = 0.5 + Math.sin(time * 5) * 0.5;
      const grad = ctx.createRadialGradient(view.w * 0.48, view.h * 0.48, view.h * 0.2, view.w * 0.48, view.h * 0.48, view.w * 0.64);
      grad.addColorStop(0, 'rgba(255,40,70,0)');
      grad.addColorStop(1, `rgba(255,30,60,${0.08 + pulse * 0.12})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, view.w, view.h);
    }
    // subtle top/bottom letterboxing glow
    const edge = ctx.createLinearGradient(0, view.h - 160, 0, view.h);
    edge.addColorStop(0, 'rgba(2,6,12,0)');
    edge.addColorStop(1, 'rgba(2,6,12,.26)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, view.h - 160, view.w, 160);
  }

  /* =========================================================
     INPUT / UI EVENTS
     ========================================================= */
  let hudDirty = false;
  let lastFpsNotify = 0;

  let pendingPointerEvent = null;
  let pointerRaf = 0;

  function processPointerEvent(e) {
    const rect = DOM.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    pointer.sx = sx; pointer.sy = sy;
    pointer.x = (sx - view.offX) / view.scale;
    pointer.y = (sy - view.offY) / view.scale;
    pointer.inside = true;
    pointer.valid = selectedBuildType ? canPlace(pointer.x, pointer.y) : false;
    DOM.canvas.classList.toggle('is-invalid-cursor', !!selectedBuildType && !pointer.valid);

    if ((state === 'prep' || state === 'wave') && !selectedBuildType) {
      let nearest = null, nd = 36;
      for (const t of towers) {
        const d = dist(pointer.x, pointer.y, t.x, t.y);
        if (d < nd) { nd = d; nearest = t; }
      }
      hoverTowerId = nearest ? nearest.id : null;
    } else {
      hoverTowerId = null;
    }
  }

  function queuePointerEvent(e) {
    pendingPointerEvent = { clientX: e.clientX, clientY: e.clientY };
    if (pointerRaf) return;
    pointerRaf = requestAnimationFrame(() => {
      pointerRaf = 0;
      const ev = pendingPointerEvent;
      pendingPointerEvent = null;
      if (ev) processPointerEvent(ev);
    });
  }

  function onCanvasDown(e) {
    if (e.button === 2) {
      if (selectedBuildType || selectedTowerId) {
        deselectAll();
        sfx('click');
      }
      return;
    }
    if (state !== 'prep' && state !== 'wave') return;
    tryUnlockAudio();
    processPointerEvent(e);
    const near = towers.find(t => dist(pointer.x, pointer.y, t.x, t.y) < 38);
    if (selectedBuildType) {
      if (near) {
        selectedBuildType = null;
        selectTower(near);
        return;
      }
      placeTower(selectedBuildType, pointer.x, pointer.y);
      updateShop();
      return;
    }
    if (near) {
      selectTower(near);
    } else {
      deselectAll();
    }
  }

  function cycleSpeed() {
    speed = speed === 1 ? 2 : 1;
    DOM.speedValue.textContent = speed + '×';
    sfx('click');
    toast(speed === 2 ? '时间流速 ×2 已启用' : '时间流速 ×1 已恢复', '', 'i-chrono');
  }

  function toggleSound() {
    meta.settings.muted = !meta.settings.muted;
    saveMeta();
    updateSoundButton();
    audioEngine.unlock();
    audioEngine.setMuted(meta.settings.muted);
    if (!meta.settings.muted) { audioEngine.sfx('click'); sfx('upgrade'); }
  }

  function initEvents() {
    DOM.canvas.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch' && e.buttons === 0) return;
      queuePointerEvent(e);
    });
    DOM.canvas.addEventListener('pointerdown', onCanvasDown);
    DOM.canvas.addEventListener('pointerleave', () => {
      pointer.inside = false;
      hoverTowerId = null;
      DOM.canvas.classList.remove('is-invalid-cursor');
      DOM.aim.classList.remove('is-visible');
    });
    DOM.canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 120));

    document.addEventListener('keydown', e => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (state === 'menu') {
        if (e.code === 'Enter') { e.preventDefault(); requestNewRun(); }
        return;
      }
      if (state === 'draft' || state === 'ending' || state === 'gameover' || state === 'victory') {
        if (e.code === 'Escape' && state === 'draft') e.preventDefault();
        return;
      }
      if (e.code === 'Space') {
        if (state === 'wave' || state === 'prep') { e.preventDefault(); togglePause(); }
        return;
      }
      if (e.code === 'KeyF') { e.preventDefault(); cycleSpeed(); return; }
      if (e.code === 'KeyP') { e.preventDefault(); togglePause(); return; }
      if (e.code === 'Escape') {
        if (state === 'draft') return;
        if (paused) { togglePause(false); return; }
        if (selectedBuildType || selectedTowerId) { deselectAll(); return; }
        if (state === 'wave' || state === 'prep') togglePause();
        return;
      }
      if (paused) return;
      if (e.code === 'KeyR') {
        if (selectedTowerId) { e.preventDefault(); upgradeSelected(); }
        return;
      }
      if (e.code === 'KeyX' || e.code === 'Delete') {
        if (selectedTowerId) { e.preventDefault(); sellSelected(); }
        return;
      }
      if (e.code === 'KeyQ') { useAbility('nova'); return; }
      if (e.code === 'KeyW') { useAbility('overclock'); return; }
      if (e.code === 'KeyE') { useAbility('chrono'); return; }
      const digitMap = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4 };
      if (digitMap[e.code] != null) {
        e.preventDefault();
        selectBuildType(TOWER_ORDER[digitMap[e.code]]);
      }
    });

    DOM.newRunBtn.addEventListener('click', requestNewRun);
    DOM.continueBtn.addEventListener('click', () => {
      tryUnlockAudio();
      continueRun();
    });
    DOM.difficultySwitch.addEventListener('click', e => {
      const btn = e.target.closest('[data-difficulty]');
      if (!btn || btn.disabled) return;
      selectedDifficulty = btn.dataset.difficulty;
      updateDifficultyButtons();
      sfx('click');
    });
    DOM.metaList.addEventListener('click', e => {
      const btn = e.target.closest('[data-meta-buy]');
      if (!btn) return;
      buyMeta(btn.dataset.metaBuy);
    });
    DOM.startWaveBtn.addEventListener('click', () => {
      if (state === 'prep') startWave();
    });
    DOM.speedBtn.addEventListener('click', cycleSpeed);
    DOM.soundBtn.addEventListener('click', toggleSound);
    DOM.pauseBtn.addEventListener('click', () => togglePause());
    DOM.resumeBtn.addEventListener('click', () => togglePause(false));
    DOM.saveBtn.addEventListener('click', saveAndExit);
    DOM.abandonBtn.addEventListener('click', armAbandon);
    DOM.retryBtn.addEventListener('click', () => {
      const diff = run ? run.difficulty : selectedDifficulty;
      DOM.endOverlay.classList.add('is-hidden');
      DOM.endlessBtn.classList.add('is-hidden');
      startNewRun(diff);
    });
    DOM.endlessBtn.addEventListener('click', continueEndless);
    DOM.menuBtn.addEventListener('click', () => {
      DOM.endOverlay.classList.add('is-hidden');
      showMenu();
    });
    DOM.upgradeBtn.addEventListener('click', upgradeSelected);
    DOM.sellBtn.addEventListener('click', sellSelected);
    DOM.detailModeBtn.addEventListener('click', cycleTargetMode);
    DOM.closeDetail.addEventListener('click', deselectAll);
    DOM.backDeployBtn.addEventListener('click', deselectAll);
    DOM.hintClose.addEventListener('click', hideHint);
    DOM.rerollBtn.addEventListener('click', rerollDraft);
    DOM.draftGrid.addEventListener('click', e => {
      const card = e.target.closest('[data-draft-index]');
      if (!card) return;
      chooseDraft(Number(card.dataset.draftIndex));
    });
    DOM.shakeToggle.addEventListener('change', () => {
      meta.settings.shake = DOM.shakeToggle.checked;
      saveMeta();
    });
    DOM.bloomToggle.addEventListener('change', () => {
      meta.settings.bloom = DOM.bloomToggle.checked;
      DOM.bloom.style.display = meta.settings.bloom ? 'block' : 'none';
      saveMeta();
    });
    DOM.musicToggle.addEventListener('change', () => {
      meta.settings.music = DOM.musicToggle.checked;
      saveMeta();
      audioEngine.setMusicEnabled(meta.settings.music);
    });

    // unlock audio on first interaction anywhere
    const unlockOnce = () => {
      tryUnlockAudio();
      window.removeEventListener('pointerdown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (run && (state === 'wave' || state === 'prep') && !paused) {
          togglePause(true);
          saveRun();
        } else if (run && state === 'draft') {
          saveRun();
        }
      }
    });
    window.addEventListener('pagehide', () => {
      if (run && (state === 'wave' || state === 'prep' || state === 'draft')) saveRun();
    });
  }

  function updateAttract(dt) {
    pendingAttract -= dt;
    if (pendingAttract <= 0) {
      pendingAttract = rand(0.12, 0.34);
      if (particles.length < 120) {
        if (Math.random() < 0.55) {
          const p = pathPointAt(Math.random() * PATH.length);
          particles.push({
            x: p.x, y: p.y + rand(-20, 20), vx: rand(-10, 10), vy: rand(-16, -4),
            life: rand(1.5, 3.2), maxLife: 3, size: rand(0.6, 1.8),
            color: Math.random() < 0.2 ? '#bca7ff' : '#72dff4', gravity: 0, drag: 0.2, trail: false, shape: 'dot'
          });
        } else {
          const a = Math.random() * TAU;
          particles.push({
            x: CORE_POS.x + Math.cos(a) * rand(50, 170),
            y: CORE_POS.y + Math.sin(a) * rand(40, 120),
            vx: Math.cos(a + Math.PI / 2) * rand(4, 16),
            vy: Math.sin(a + Math.PI / 2) * rand(4, 16),
            life: rand(1.2, 2.6), maxLife: 2.6, size: rand(0.7, 2),
            color: Math.random() < 0.25 ? '#c7a9ff' : '#6ff0ff', gravity: 0, drag: 0.1, trail: false, shape: 'dot'
          });
        }
      }
    }
    if (Math.random() < 0.004 && effects.length < 20) {
      addRing(CORE_POS.x, CORE_POS.y, Math.random() < 0.2 ? '#b18aff' : '#6fefff', 20, 210, 2.4, 1);
    }
  }

  function updateUI(dt) {
    if (!run) return;
    updateAbilityUI();
    updateComboUI();
    updateBossBar();
    refreshStatus();
    if (hudDirty) {
      hudDirty = false;
      refreshHUD();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!lastTime) lastTime = now;
    let rawDt = (now - lastTime) / 1000;
    lastTime = now;
    if (!isFinite(rawDt)) rawDt = 0.016;
    rawDt = clamp(rawDt, 0, 0.05);

    if (state === 'menu') {
      updateAttract(rawDt);
      updateVisuals(rawDt, true);
    } else if (state === 'wave' && !paused) {
      const timeScale = slowMo > 0 ? 0.34 : 1;
      if (hitStop <= 0) {
        let remaining = Math.min(0.1, rawDt * speed * timeScale);
        let guard = 0;
        while (remaining > 0.0001 && state === 'wave' && guard++ < 10) {
          const step = Math.min(remaining, 1 / 60);
          updateGame(step);
          remaining -= step;
        }
      }
      updateVisuals(rawDt, true);
    } else if (paused || state === 'draft') {
      updateVisuals(rawDt, false);
    } else {
      updateVisuals(rawDt, true);
    }

    uiAccum += rawDt;
    if (uiAccum >= 0.08) {
      updateUI(uiAccum);
      uiAccum = 0;
    }
    render(now / 1000);
  }

  function boot() {
    window.__errors = [];
    window.addEventListener('error', e => { window.__errors.push(String(e.message || e.error || 'error')); });
    window.addEventListener('unhandledrejection', e => { window.__errors.push(String(e.reason || 'rejection')); });
    loadMeta();
    readSavedRun();
    applySettings();
    buildShop();
    buildAbilities();
    buildBossBar();
    renderMeta();
    renderMenuStats();
    refreshMenu();
    updateDifficultyButtons();
    initStars();
    buildBackground();
    resize();
    initEvents();
    DOM.aim.classList.remove('is-visible');
    DOM.toastStack.classList.add('is-menu');
    lastTime = 0;
    updateSoundButton();
    // Periodic autosave and checkpointing.
    setInterval(() => {
      if (run && !paused && (state === 'wave' || state === 'prep')) saveRun();
    }, 7000);
    requestAnimationFrame(frame);
  }

  // QA hooks are only exposed with ?debug in the URL.
  if (new URLSearchParams(location.search).has('debug')) {
    // Debug / QA hooks (harmless for players, useful for automated verification)
    window.__ASTRAL__ = {
      get state() { return state; },
      get run() { return run; },
      get towers() { return towers; },
      get view() { return view; },
      get enemies() { return enemies; },
      startNewRun,
      startWave,
      completeWave,
      finishRun,
      showMenu,
      saveRun,
      addCredits(amount) { if (run) { run.credits += amount; refreshHUD(); } },
      setWave(number) { if (run) { run.nextWave = number; run.previewDirty = true; ensurePreview(); refreshHUD(); } },
      spawnEnemy(type) { if (run) { if (state !== 'wave') startWave(); spawnEnemy(type); } },
      placeTower(type, x, y) { if (run) return placeTower(type, x, y); },
      selectBuildType(type) { selectBuildType(type); },
      forcePrep() { if (run) { state = 'prep'; refreshHUD(); } },
      killAll() { enemies.slice().forEach(e => { if (e.alive) { e.hp = 0; killEnemy(e); } }); }
    };

  }

  boot();
})();
