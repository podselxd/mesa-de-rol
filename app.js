const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mod = v => Math.floor((v - 10) / 2);
const sg = n => (n >= 0 ? '+' : '') + n;
const BOARD_W = 12, BOARD_H = 8;

// ---- Clases y especies (D&D SRD 5.1 simplificado) ----
const ST = ['Fue', 'Des', 'Con', 'Int', 'Sab', 'Car'];
const CL = {
  Guerrero: { icon: '⚔️', d: 'Pegas fuerte y aguantas golpes. Especialista en armas y armaduras pesadas.', pv: 10, ca: 16, main: 'Fue', weapon: 'Espada larga', dmgDie: 8, arr: { Fue: 15, Con: 14, Des: 13, Sab: 12, Car: 10, Int: 8 }, comp: ['Armaduras', 'Armas marciales'] },
  Mago: { icon: '🪄', d: 'Poco aguante, gran poder arcano. Resuelves problemas con conjuros e intelecto.', pv: 6, ca: 10, main: 'Int', weapon: 'Bastón arcano', dmgDie: 6, arr: { Int: 15, Con: 14, Des: 13, Sab: 12, Car: 10, Fue: 8 }, comp: ['Arcana', 'Historia'] },
  Pícaro: { icon: '🗡️', d: 'Sigilo, velocidad y golpes precisos. Ideal para trampas, sigilo y emboscadas.', pv: 8, ca: 11, main: 'Des', weapon: 'Daga', dmgDie: 6, arr: { Des: 15, Con: 14, Int: 13, Car: 12, Sab: 10, Fue: 8 }, comp: ['Sigilo', 'Juego de manos'] },
  Clérigo: { icon: '✝️', d: 'Guerrero devoto y sanador. Conduce energía divina para curar y resistir en batalla.', pv: 8, ca: 16, main: 'Sab', weapon: 'Maza', dmgDie: 6, arr: { Sab: 15, Con: 14, Fue: 13, Car: 12, Des: 10, Int: 8 }, comp: ['Religión', 'Medicina'] }
};
const SP = {
  Humano: { icon: '👤', bonus: '+1 a todos los atributos', b: { Fue: 1, Des: 1, Con: 1, Int: 1, Sab: 1, Car: 1 } },
  Elfo: { icon: '🧝', bonus: '+2 Destreza · Grácil y certero', b: { Des: 2 } },
  Enano: { icon: '🛡️', bonus: '+2 Constitución · Robusto y resistente', b: { Con: 2 } },
  Mediano: { icon: '🍀', bonus: '+2 Carisma · Ágil y afortunado', b: { Car: 2 } }
};
const BG = {
  Soldado: { icon: '🎖️', d: 'Entrenado en tácticas de guerra y disciplina militar.' },
  Artesano: { icon: '⚒️', d: 'Habilidad manual para forjar, reparar y tasar equipo.' },
  Erudito: { icon: '📜', d: 'Conocimiento de textos antiguos, runas y misterios arcanos.' },
  Criminal: { icon: '🗝️', d: 'Contactos en los bajos fondos y destreza en cerraduras.' }
};

// Paleta D&D de colores de pelo
const HAIR_PALETTE = [
  { name: 'Negro Azabache', color: '#161413' },
  { name: 'Castaño Ébano', color: '#332316' },
  { name: 'Castaño Roble', color: '#57371f' },
  { name: 'Castaño Avellana', color: '#7a4d29' },
  { name: 'Rubio Miel', color: '#b8893d' },
  { name: 'Rubio Dorado', color: '#d6a649' },
  { name: 'Rubio Lino', color: '#ebd99b' },
  { name: 'Pelirrojo Fuego', color: '#962b16' },
  { name: 'Cobrizo Otoñal', color: '#b85423' },
  { name: 'Ceniza', color: '#888888' },
  { name: 'Plata Élfica', color: '#d8dee9' },
  { name: 'Púrpura Brujo', color: '#5c276b' }
];

// Metadatos de Apariencia
const CABEZAS = ['ninguno', 'casco', 'sombrero', 'corona', 'capucha'];
const ARMAS = ['ninguno', 'espada', 'arco', 'baston', 'daga'];
const PIEL_CATS = { piel: 16, elfo: 16, fantasia: 16 };
const PELO_CATS = { mujer: 30, hombre: 32 };
const DEFAULT_AP = { pielCat: 'piel', piel: 1, peloCat: 'mujer', pelo: 1, peloColor: '#57371f', cabeza: 'ninguno', arma: 'ninguno' };

let ASSET_OFFSETS = {};
async function loadOffsets() {
  try {
    const res = await fetch('assets/offsets.json');
    if (res.ok) ASSET_OFFSETS = await res.json();
  } catch (e) {
    console.warn('Aviso: no se pudo cargar assets/offsets.json', e);
  }
}
loadOffsets();

function getAssetOffset(key) {
  return ASSET_OFFSETS[key] || { x: 0, y: 0, scale: 1.0, layer: 'front' };
}

// ---- Motor de Tintado y Renderizado con Caché ----
function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2; let h = 0, s = 0;
  if (max !== min) { const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0); else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; }
  return { h, s, l };
}
function hslToRgb(h, s, l) {
  const hue2rgb = (p, q, t) => { t = ((t % 1) + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [Math.round(hue2rgb(p, q, h + 1 / 3) * 255), Math.round(hue2rgb(p, q, h) * 255), Math.round(hue2rgb(p, q, h - 1 / 3) * 255)];
}

const rawImageCache = new Map();
function loadRawImage(src) {
  if (rawImageCache.has(src)) return rawImageCache.get(src);
  const promise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  rawImageCache.set(src, promise);
  return promise;
}

const peloTintCache = new Map();
function warmPeloTint(cat, i, color, suffix = '') {
  const key = `${cat}/${i}${suffix}/${color}`;
  if (peloTintCache.has(key)) return peloTintCache.get(key);
  peloTintCache.set(key, null);

  const src = `tex/pelo/${cat}/${i}${suffix}.png`;
  loadRawImage(src).then(img => {
    if (!img) { peloTintCache.set(key, ''); return; }
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 128;
    canvas.height = img.naturalHeight || 168;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = imgData.data;
    const { h: hh, s: ss0, l: ll0 } = hexToHsl(color);
    const ll = Math.min(0.9, ll0 * 1.1), ss = Math.min(1, ss0 * 1.35 + 0.1);

    for (let p = 0; p < px.length; p += 4) {
      if (px[p + 3] === 0) continue;
      const gray = (px[p] + px[p + 1] + px[p + 2]) / 3 / 255;
      const centered = gray - 0.5;
      const contrasted = Math.sign(centered) * Math.pow(Math.abs(centered), 0.95) * 0.9;
      const lightness = Math.min(0.88, Math.max(0.04, contrasted + ll));
      const satFalloff = 1 - Math.min(0.3, Math.max(0, Math.abs(lightness - ll) * 0.5));
      const sat = Math.min(1, Math.max(0, ss * (0.82 + 0.18 * satFalloff) + 0.1));
      const [r, g, b] = hslToRgb(hh, sat, lightness);
      px[p] = r; px[p + 1] = g; px[p + 2] = b;
    }
    ctx.putImageData(imgData, 0, 0);
    peloTintCache.set(key, canvas.toDataURL());
    requestRerender();
  });
  return null;
}

let rerenderTimer = null;
function requestRerender() {
  if (rerenderTimer) return;
  rerenderTimer = requestAnimationFrame(() => {
    rerenderTimer = null;
    try { renderAll(); } catch (e) {}
    try { if (!modal.classList.contains('hidden')) updateCreator(); } catch (e) {}
  });
}

function peloLayer(ap, suffix) {
  const url = warmPeloTint(ap.peloCat, ap.pelo, ap.peloColor, suffix);
  if (!url) return '';
  const assetId = `pelo_${ap.peloCat}_${ap.pelo}${suffix}`;
  const off = getAssetOffset(assetId);
  const transform = (off.x !== 0 || off.y !== 0 || off.scale !== 1.0)
    ? `transform:translate(${off.x}px,${off.y}px) scale(${off.scale});`
    : '';
  return `<img src="${url}" class="layer" draggable="false" alt="" style="${transform}" onerror="this.style.display='none'">`;
}

function tokenSprite(ap, size) {
  ap = { ...DEFAULT_AP, ...ap };
  const layer = (src, offKey) => {
    const off = offKey ? getAssetOffset(offKey) : { x: 0, y: 0, scale: 1.0 };
    const transform = (off.x !== 0 || off.y !== 0 || off.scale !== 1.0)
      ? `transform:translate(${off.x}px,${off.y}px) scale(${off.scale});`
      : '';
    return `<img src="${src}" class="layer" draggable="false" alt="" style="${transform}" onerror="this.style.display='none'">`;
  };
  return `<span class="sprite" style="width:${size ? size + 'px' : '100%'};height:${size ? size + 'px' : '100%'}">`
    + peloLayer(ap, '_back')
    + layer(`tex/${ap.pielCat}/${ap.piel}.png`)
    + peloLayer(ap, '')
    + (ap.cabeza !== 'ninguno' ? layer(`tex/cabeza/${ap.cabeza}.png`, `cabeza_${ap.cabeza}`) : '')
    + (ap.arma !== 'ninguno' ? layer(`tex/arma/${ap.arma}.png`, `arma_${ap.arma}`) : '')
    + `</span>`;
}

function build(d) {
  const c = CL[d.cl] || CL.Guerrero, s = SP[d.sp] || SP.Humano, st = {};
  ST.forEach(k => st[k] = (c.arr[k] || 8) + (s.b[k] || 0));
  const pv = c.pv + mod(st.Con), ca = c.ca + mod(st.Des), atk = 2 + mod(st[c.main]), dmgMod = mod(st[c.main]);
  return { cl: d.cl, sp: d.sp, bg: d.bg, nm: d.nm, ap: { ...DEFAULT_AP, ...d.ap }, st, main: c.main, weapon: c.weapon, dmgDie: c.dmgDie, comp: c.comp, pv, ca, atk, dmgMod };
}

const blocked = new Set(['4,1', '4,2', '4,3', '9,1', '9,2', '9,3', '9,4', '2,4', '3,4']);
const defaultState = {
  round: 1, phase: 'Exploración', gridVisible: true, mode: 'none', selectedId: null, draggedId: null,
  chMeta: null,
  tokens: [
    { id: 'goblin', name: 'Goblin explorador', label: 'G', type: 'enemy', x: 8, y: 2, hp: 7, maxHp: 7, defense: 13, attackBonus: 3, damage: '1d6+1', acted: false },
    { id: 'wolf', name: 'Lobo gris', label: 'L', type: 'enemy', x: 10, y: 5, hp: 11, maxHp: 11, defense: 12, attackBonus: 4, damage: '1d6+2', acted: false },
    { id: 'chest', name: 'Cofre de gemas', label: '◆', type: 'treasure', x: 5, y: 3, hp: 1, maxHp: 1, acted: false }
  ],
  tags: [], inventory: [], proposals: [], log: [], history: []
};
let state = structuredClone(defaultState);
try { const raw = localStorage.getItem('manitasRpgState'); if (raw) state = JSON.parse(raw); } catch (e) {}

function persistLocal() { try { localStorage.setItem('manitasRpgState', JSON.stringify(state)); } catch (e) {} }
function saved() { persistLocal(); programarGuardado(); }
const clone = v => structuredClone(v);
const key = (x, y) => `${x},${y}`;
const tokenAt = (x, y) => state.tokens.find(t => t.x === x && t.y === y);
const currentPlayer = () => state.tokens.find(t => t.id === 'pj');
function now() { return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(new Date()); }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2800); }
function status(message, type = '') { const el = $('#boardStatus'); if (el) { el.textContent = message; el.className = `inline-status ${type}`; } }
function addLog(html) { state.log.unshift({ time: now(), html }); state.log = state.log.slice(0, 40); renderLogs(); }

function snapshot() {
  state.history.push(clone({
    tokens: state.tokens,
    tags: state.tags,
    inventory: state.inventory,
    proposals: state.proposals,
    log: state.log,
    round: state.round,
    phase: state.phase,
    mode: state.mode,
    chMeta: state.chMeta
  }));
  if (state.history.length > 20) state.history.shift();
}

function roll(sides) { return Math.floor(Math.random() * sides) + 1; }
function rollDamage(expr) {
  const m = String(expr).match(/(\d+)d(\d+)([+-]\d+)?/i);
  if (!m) { const num = parseInt(expr, 10); return isNaN(num) ? 1 : num; }
  let total = 0; for (let i = 0; i < +m[1]; i++) total += roll(+m[2]);
  return Math.max(1, total + (+(m[3] || 0)));
}
function distance(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function adjacent(a, b) { return distance(a, b) <= 1; }

function validCell(x, y, id) {
  if (x < 1 || x > BOARD_W || y < 1 || y > BOARD_H || blocked.has(key(x, y))) return false;
  const occupant = tokenAt(x, y);
  if (occupant && occupant.id !== id) {
    if (id === 'pj' && occupant.type === 'treasure') return true;
    return false;
  }
  return true;
}

function renderBoard() {
  const board = $('#board'); if (!board) return;
  board.classList.toggle('no-grid', !state.gridVisible);
  board.replaceChildren();
  const p = currentPlayer();
  for (let y = 1; y <= BOARD_H; y++) for (let x = 1; x <= BOARD_W; x++) {
    const cell = document.createElement('div'), blockedCell = blocked.has(key(x, y)), t = tokenAt(x, y);
    cell.className = `cell${blockedCell ? ' blocked' : ''}`; cell.dataset.x = x; cell.dataset.y = y; cell.dataset.coord = `${x},${y}`; cell.setAttribute('role', 'gridcell');
    if (!blockedCell) { cell.addEventListener('dragover', onDragOver); cell.addEventListener('dragleave', onDragLeave); cell.addEventListener('drop', onDrop); cell.addEventListener('click', () => cellClick(x, y)); }
    if (p && state.mode === 'move' && !blockedCell && validCell(x, y, 'pj') && (!t || t.type === 'treasure')) cell.classList.add('drop-target');
    if (t) cell.append(makeToken(t));
    board.append(cell);
  }
}

function makeToken(t) {
  const b = document.createElement('button'); b.type = 'button'; b.draggable = t.type !== 'treasure';
  b.className = `token token-${t.type}${t.ap ? ' sprite-token' : ''}${state.selectedId === t.id ? ' selected' : ''}`;
  b.title = `${t.name} · Vida ${t.hp}/${t.maxHp}`; b.dataset.id = t.id; b.setAttribute('aria-label', esc(t.name));
  if (t.ap) {
    b.innerHTML = tokenSprite(t.ap, 42);
  } else if (t.id === 'goblin') {
    b.innerHTML = '<img src="tex/tokens/goblin.png" style="width:100%;height:100%;border-radius:50%;display:block" alt="Goblin">';
  } else if (t.id === 'wolf') {
    b.innerHTML = '<img src="tex/tokens/wolf.png" style="width:100%;height:100%;border-radius:50%;display:block" alt="Lobo">';
  } else if (t.id === 'chest' || t.type === 'treasure') {
    b.innerHTML = '<img src="tex/tokens/chest.png" style="width:100%;height:100%;border-radius:50%;display:block" alt="Tesoro">';
  } else {
    b.textContent = t.label.slice(0, 3);
  }
  if (t.type !== 'treasure') {
    b.addEventListener('dragstart', e => { if (t.id !== 'pj' || state.phase !== 'Exploración') { e.preventDefault(); return; } state.draggedId = t.id; e.dataTransfer.setData('text/plain', t.id); b.classList.add('dragging'); status('Arrastra a una baldosa iluminada.', 'success'); });
    b.addEventListener('dragend', () => { state.draggedId = null; b.classList.remove('dragging'); $$('.bad-target').forEach(c => c.classList.remove('bad-target')); });
  }
  b.addEventListener('click', e => {
    e.stopPropagation(); state.selectedId = t.id; status(`${t.name}: vida ${t.hp}/${t.maxHp}, defensa ${t.defense ?? '—'}.`);
    if (state.mode === 'attack' && t.type === 'enemy') attack(t);
    renderBoard();
  });
  return b;
}

function onDragOver(e) {
  e.preventDefault();
  const c = e.currentTarget, x = +c.dataset.x, y = +c.dataset.y;
  const ok = state.draggedId === 'pj' && validCell(x, y, 'pj');
  c.classList.toggle('drop-target', !!ok);
  c.classList.toggle('bad-target', !ok);
  e.dataTransfer.dropEffect = ok ? 'move' : 'none';
}
function onDragLeave(e) { e.currentTarget.classList.remove('drop-target', 'bad-target'); }
function onDrop(e) {
  e.preventDefault();
  const c = e.currentTarget, x = +c.dataset.x, y = +c.dataset.y, id = e.dataTransfer.getData('text/plain') || state.draggedId;
  if (id !== 'pj' || !validCell(x, y, 'pj')) { status('Movimiento inválido: usa una baldosa libre iluminada.', 'error'); return; }
  movePlayer(x, y);
}

function cellClick(x, y) {
  const t = tokenAt(x, y);
  if (state.mode === 'move' && currentPlayer() && validCell(x, y, 'pj') && (!t || t.type === 'treasure')) {
    movePlayer(x, y);
    return;
  }
  if (state.mode === 'attack' && t?.type === 'enemy') { attack(t); return; }
  state.selectedId = t?.id || null;
  status(t ? `${t.name} seleccionado.` : `Baldosa ${x},${y} seleccionada.`);
  renderBoard();
}

function needsCharacter() { if (!currentPlayer()) { toast('Crea tu personaje primero para aventurarte.'); openCreator(); return true; } return false; }

function movePlayer(x, y) {
  if (needsCharacter()) return;
  const p = currentPlayer();
  if (p.acted) { status('Ya actuaste este turno. Concluye la ronda para continuar.', 'error'); return; }
  snapshot();
  const from = `${p.x},${p.y}`;
  p.x = x; p.y = y;
  p.acted = true;
  addLog(`<strong>${esc(p.name)}</strong> avanzó de [${from}] a [${x},${y}].`);
  state.mode = 'none';
  pickUpTreasure();
  status(`Posición alcanzada [${x},${y}].`, 'success');
  renderBoard();
  saved();
}

function pickUpTreasure() {
  const p = currentPlayer();
  const chest = state.tokens.find(t => t.type === 'treasure' && t.x === p.x && t.y === p.y);
  if (!chest) return;
  state.tokens = state.tokens.filter(t => t.id !== chest.id);
  state.inventory.push({ icon: '◈', name: 'Tesoro de las ruinas', detail: 'Gemas y reliquias antiguas', qty: 1 });
  addLog(`<strong>${esc(p.name)}</strong> abrió un cofre misterioso y obtuvo un tesoro.`);
  toast('¡Tesoro añadido a tu mochila!');
  renderSheet();
}

function startAction(action) {
  if (needsCharacter()) return; const p = currentPlayer();
  if (p.acted && action !== 'item') { toast('Ya actuaste en esta ronda.'); return; }
  if (action === 'move') { state.mode = 'move'; status('Movimiento activo: pulsa una casilla iluminada o arrastra tu ficha.', 'success'); }
  else if (action === 'attack') { state.mode = 'attack'; status('Ataque preparado: selecciona un enemigo en casilla adyacente.'); }
  else if (action === 'skill') {
    snapshot(); p.acted = true; const heal = roll(6); p.hp = Math.min(p.maxHp, p.hp + heal);
    addLog(`<strong>${esc(p.name)}</strong> invocó su poder heroico y restauró ${heal} puntos de vida.`);
    toast(`+${heal} puntos de vida recuperados.`); endPlayerAction();
  }
  else if (action === 'item') {
    const potion = state.inventory.find(i => i.name === 'Poción de curación' && i.qty > 0);
    if (!potion) { toast('No te quedan pociones de curación.'); return; }
    snapshot(); const heal = roll(4) + roll(4) + 2; potion.qty--; p.hp = Math.min(p.maxHp, p.hp + heal); p.acted = true;
    addLog(`<strong>${esc(p.name)}</strong> bebió una poción de curación y recuperó ${heal} PV.`);
    toast(`+${heal} PV restaurados.`); endPlayerAction();
  }
  renderBoard(); renderSheet(); saved();
}

function attack(target) {
  if (needsCharacter()) return; const p = currentPlayer();
  if (p.acted) { toast('Ya actuaste en esta ronda.'); return; }
  if (!adjacent(p, target)) { status('Ese enemigo está fuera de tu alcance cuerpo a cuerpo.', 'error'); return; }
  snapshot();
  const d20 = roll(20), total = d20 + p.attackBonus;
  if (total >= target.defense) {
    const dmg = rollDamage(p.damage);
    target.hp = Math.max(0, target.hp - dmg);
    addLog(`<strong>${esc(p.name)}</strong> asestó un golpe a ${esc(target.name)}: [d20:${d20}+${p.attackBonus}=${total} vs CA ${target.defense}], causando ${dmg} de daño.`);
    toast(`¡Impacto certero! ${dmg} de daño.`);
    if (target.hp <= 0) {
      state.tokens = state.tokens.filter(t => t.id !== target.id);
      addLog(`<strong>${esc(target.name)}</strong> fue aniquilado.`);
      dropLoot(target);
    } else {
      status(`${target.name} queda con ${target.hp}/${target.maxHp} PV.`, 'success');
    }
  } else {
    addLog(`<strong>${esc(p.name)}</strong> falló su ataque contra ${esc(target.name)}: [d20:${d20}+${p.attackBonus}=${total} vs CA ${target.defense}].`);
    toast('El golpe fue desviado.');
  }
  p.acted = true; state.mode = 'none';
  renderBoard(); renderEncounter(); renderSheet(); saved();
}

function dropLoot(target) {
  const loot = target.name.toLowerCase().includes('goblin') ? 'Monedas y daga oxidada' : 'Botín de batalla';
  state.inventory.push({ icon: '◆', name: loot, detail: 'Despojo de combate', qty: 1 });
  addLog(`Botín recogido: <strong>${esc(loot)}</strong>.`);
  renderSheet();
}

function endPlayerAction() { state.mode = 'none'; renderBoard(); renderSheet(); }

function endTurn() {
  if (needsCharacter()) return;
  const p = currentPlayer();
  snapshot();
  state.tokens.filter(t => t.type === 'enemy').forEach(enemy => {
    if (adjacent(enemy, p)) {
      const d20 = roll(20), total = d20 + enemy.attackBonus;
      if (total >= p.defense) {
        const dmg = rollDamage(enemy.damage);
        p.hp = Math.max(0, p.hp - dmg);
        addLog(`<strong>${esc(enemy.name)}</strong> arremetió contra ${esc(p.name)} causando ${dmg} de daño.`);
      } else {
        addLog(`<strong>${esc(enemy.name)}</strong> erró su ataque contra ${esc(p.name)}.`);
      }
    } else {
      const dx = Math.sign(p.x - enemy.x);
      const dy = Math.sign(p.y - enemy.y);
      const tries = [];
      if (Math.abs(p.x - enemy.x) >= Math.abs(p.y - enemy.y)) {
        if (dx !== 0) tries.push([dx, 0]);
        if (dy !== 0) tries.push([0, dy]);
      } else {
        if (dy !== 0) tries.push([0, dy]);
        if (dx !== 0) tries.push([dx, 0]);
      }
      const move = tries.find(([mx, my]) => {
        const nx = enemy.x + mx, ny = enemy.y + my;
        return validCell(nx, ny, enemy.id) && !tokenAt(nx, ny);
      });
      if (move) {
        enemy.x += move[0];
        enemy.y += move[1];
        addLog(`<strong>${esc(enemy.name)}</strong> se aproximó sigilosamente.`);
      }
    }
  });

  if (p.hp <= 0) {
    state.phase = 'Derrota';
    addLog(`<strong>${esc(p.name)} ha caído en combate.</strong> Pulsa Deshacer o inicia una nueva partida.`);
    toast('¡Has caído! Pulsa Deshacer para intentar otra táctica.');
  } else {
    state.phase = 'Exploración';
    p.acted = false;
    state.round++;
    addLog(`<strong>Comienza la ronda de combate ${state.round}.</strong>`);
  }
  renderAll(); saved();
}

$('#endTurnBtn').addEventListener('click', () => {
  if (state.phase === 'Derrota') { toast('La partida concluyó en derrota. Pulsa Deshacer o reinicia.'); return; }
  endTurn();
});
$$('.action-btn').forEach(b => b.addEventListener('click', () => startAction(b.dataset.action)));
$('#toggleGridBtn').addEventListener('click', () => {
  state.gridVisible = !state.gridVisible;
  $('#toggleGridBtn').textContent = state.gridVisible ? 'Ocultar cuadrícula' : 'Mostrar cuadrícula';
  renderBoard();
});

function renderAbilities() {
  const st = state.chMeta ? state.chMeta.st : { Fue: 10, Des: 10, Con: 10, Int: 10, Sab: 10, Car: 10 };
  $('#abilityGrid').innerHTML = ST.map(k => `
    <div class="ability">
      <span>${k}</span>
      <strong>${st[k]}</strong>
      <small>${sg(mod(st[k]))}</small>
    </div>
  `).join('');
}

function renderSheet() {
  const m = state.chMeta, p = currentPlayer();
  $('#sheetName').textContent = m?.nm || 'Sin nombre';
  $('#sheetIdentity').textContent = m ? `${m.sp} · ${m.cl} · ${m.bg || ''}` : 'Crea tu personaje para empezar';
  $('#sheetApproved').style.display = m ? '' : 'none';
  const port = $('#sheetPortrait'); port.innerHTML = m ? tokenSprite(m.ap) : '?';
  if (p) {
    $('#sheetHp').textContent = `${p.hp} / ${p.maxHp}`;
    $('#sheetDefense').textContent = p.defense;
    $('#sheetHpBar').style.width = `${Math.max(0, p.hp / p.maxHp * 100)}%`;
  } else {
    $('#sheetHp').textContent = m ? `${m.pv} / ${m.pv}` : '— / —';
    $('#sheetDefense').textContent = m ? m.ca : '—';
    $('#sheetHpBar').style.width = '100%';
  }
  $('#attackRow').innerHTML = m ? `<div style="display:flex;justify-content:space-between;font-size:0.85rem"><span>${esc(m.weapon)}</span><b style="color:var(--text-gold)">${sg(m.atk)} a impactar · 1d${m.dmgDie}${sg(m.dmgMod)}</b></div>` : '<div>—</div>';
  $('#compChips').innerHTML = m ? m.comp.map(c => `<span class="phase">${esc(c)}</span>`).join('') : '';
  $('#sheetTags').innerHTML = state.tags.filter(t => t.status === 'confirmed').map(t => `<span class="phase" style="border-color:var(--green);color:#b7e5ca">${esc(t.name)}</span>`).join('');
  $('#inventoryList').innerHTML = state.inventory.map(i => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface2);border:1px solid var(--line);border-radius:8px">
      <span style="font-size:1.1rem;color:var(--gold)">${i.icon}</span>
      <div style="flex:1"><strong>${esc(i.name)}</strong><span style="display:block;font-size:0.68rem;color:var(--muted)">${esc(i.detail)}</span></div>
      <small style="color:var(--gold);font-family:var(--font-title)">×${i.qty}</small>
    </div>
  `).join('') || '<div style="color:var(--muted);text-align:center;padding:12px">Mochila vacía.</div>';

  const atb = $('#activeTurnBox'), icon = $('#activeTurnIcon'), nameEl = $('#activeTurnName'), hint = $('#activeTurnHint');
  if (atb) {
    if (p) {
      icon.innerHTML = m?.ap ? tokenSprite(m.ap, 38) : (m?.nm || 'PJ').slice(0, 2).toUpperCase();
      nameEl.textContent = p.name;
      hint.textContent = p.acted ? 'Turno agotado · pulsa Terminar Turno' : `Acción disponible · ${p.hp}/${p.maxHp} PV`;
    } else {
      icon.textContent = '?'; nameEl.textContent = 'Sin personaje'; hint.textContent = 'Crea tu personaje en la pestaña Ficha.';
    }
  }
  $('#roundNum').textContent = state.round;
  $('#roundNum2').textContent = state.round;
  $('#phasePill').textContent = state.phase;
}

function renderEncounter() {
  const enemies = state.tokens.filter(t => t.type === 'enemy');
  const el = $('#encounterRows'); if (!el) return;
  el.innerHTML = enemies.length ? enemies.map(e => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:0.75rem">
      <span style="width:30px;height:30px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:var(--crimson);border:1px solid #ff9494">
        ${e.id === 'goblin' ? '<img src="tex/tokens/goblin.png" style="width:100%;height:100%" alt="Goblin">' : e.id === 'wolf' ? '<img src="tex/tokens/wolf.png" style="width:100%;height:100%" alt="Lobo">' : `<b style="color:#fff">${esc(e.label)}</b>`}
      </span>
      <div style="flex:1"><strong>${esc(e.name)}</strong><span style="display:block;color:var(--muted)">Vida ${e.hp}/${e.maxHp} · CA ${e.defense}</span></div>
      <b style="color:var(--crimson)">Hostil</b>
    </div>
  `).join('') : '<div style="text-align:center;padding:12px;color:var(--muted)">No hay enemigos en el tablero.</div>';
}

function renderLogs() {
  const html = state.log.map(e => `<li style="display:flex;gap:10px;font-size:0.75rem;line-height:1.4"><span style="color:var(--gold);font-family:var(--font-title);min-width:38px">${e.time}</span><span>${e.html}</span></li>`).join('');
  const q = $('#quickLog'), f = $('#fullLog');
  if (q) q.innerHTML = state.log.slice(0, 4).map(e => `<li style="display:flex;gap:8px;font-size:0.72rem"><span style="color:var(--gold)">${e.time}</span><span>${e.html}</span></li>`).join('');
  if (f) f.innerHTML = html || '<li>Sin registros en la crónica.</li>';
}

function renderProposals() {
  const list = $('#proposalList'); if (!list) return;
  $('#pendingCount').textContent = `${state.proposals.length} pendientes`;
  if (!state.proposals.length) { list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted)">No hay propuestas pendientes.</div>'; return; }
  list.innerHTML = state.proposals.map(p => `
    <article style="padding:12px;border:1px solid var(--gold-dark);border-radius:8px;background:#201912">
      <strong style="color:var(--gold-bright)">${esc(p.tagName)}</strong>
      <p style="margin:4px 0;font-size:0.72rem;color:var(--muted)">${esc(p.text)}<br><small>Efecto: ${esc(p.effect)}</small></p>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn primary" style="padding:4px 10px;font-size:0.68rem" data-approve="${p.id}">Aprobar</button>
        <button class="btn ghost" style="padding:4px 10px;font-size:0.68rem" data-reject="${p.id}">Rechazar</button>
      </div>
    </article>
  `).join('');
}

function renderAll() {
  renderBoard(); renderAbilities(); renderSheet(); renderEncounter(); renderLogs(); renderProposals();
}

$$('.nav-item[data-view]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
$$('[data-view-target]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.viewTarget)));
function switchView(view) {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach(v => v.classList.toggle('active-view', v.id === `view-${view}`));
  renderAll();
}

// ---- Creador de personaje con Cuadrículas D&D ----
let draft = { cl: 'Guerrero', sp: 'Humano', bg: 'Soldado', nm: '', ap: { ...DEFAULT_AP } };
const modal = $('#creatorModal');

// 1. Cuadrícula de Clases
$('#classCards').innerHTML = Object.keys(CL).map(k => `
  <label class="class-card">
    <input type="radio" name="presetClass" value="${k}" ${draft.cl === k ? 'checked' : ''}>
    <span class="class-icon">${CL[k].icon}</span>
    <div class="class-info">
      <b>${k}</b>
      <p>${esc(CL[k].d)}</p>
      <small style="display:inline-block;margin-top:6px;color:var(--gold);font-family:var(--font-title)">Dado PV: d${CL[k].dmgDie} · CA: ${CL[k].ca}</small>
    </div>
  </label>
`).join('');

// 2. Cuadrícula de Especies y Trasfondos
$('#speciesCards').innerHTML = Object.keys(SP).map(k => `
  <label class="class-card">
    <input type="radio" name="presetSpecies" value="${k}" ${draft.sp === k ? 'checked' : ''}>
    <span class="class-icon">${SP[k].icon}</span>
    <div class="class-info">
      <b>${k}</b>
      <p>${SP[k].bonus}</p>
    </div>
  </label>
`).join('');

$('#backgroundCards').innerHTML = Object.keys(BG).map(k => `
  <label class="class-card">
    <input type="radio" name="presetBackground" value="${k}" ${draft.bg === k ? 'checked' : ''}>
    <span class="class-icon">${BG[k].icon}</span>
    <div class="class-info">
      <b>${k}</b>
      <p>${BG[k].d}</p>
    </div>
  </label>
`).join('');

// 3. Paleta de Colores de Pelo
$('#hairPaletteGrid').innerHTML = HAIR_PALETTE.map(p => `
  <button type="button" class="color-swatch-btn${draft.ap.peloColor.toLowerCase() === p.color.toLowerCase() ? ' sel' : ''}" data-color="${p.color}" title="${p.name}" style="background-color:${p.color}"></button>
`).join('');

// 4. Pestañas y Cuadrículas de Piel y Pelo
const PIEL_CAT_LABELS = { piel: 'Piel Clásica', elfo: 'Élfico', fantasia: 'Fantasía' };
$('#apPielTabs').innerHTML = Object.keys(PIEL_CATS).map(cat => `
  <button type="button" class="tab-dnd${draft.ap.pielCat === cat ? ' sel' : ''}" data-cat="${cat}">${PIEL_CAT_LABELS[cat]}</button>
`).join('');

function renderPielSwatches() {
  const n = PIEL_CATS[draft.ap.pielCat];
  $('#apPielTabs').querySelectorAll('.tab-dnd').forEach(t => t.classList.toggle('sel', t.dataset.cat === draft.ap.pielCat));
  $('#apPielSwatches').innerHTML = Array.from({ length: n }, (_, i) => i + 1).map(i => `
    <button type="button" class="skin-card${draft.ap.piel === i ? ' sel' : ''}" data-i="${i}" style="background-image:url('tex/${draft.ap.pielCat}/${i}.png')" aria-label="Rostro ${i}"></button>
  `).join('');
}

$('#apPeloTabs').innerHTML = Object.keys(PELO_CATS).map(cat => `
  <button type="button" class="tab-dnd${draft.ap.peloCat === cat ? ' sel' : ''}" data-cat="${cat}">${cat === 'mujer' ? 'Dama (30)' : 'Caballero (32)'}</button>
`).join('');

function renderPeloSwatches() {
  const n = PELO_CATS[draft.ap.peloCat];
  $('#apPeloTabs').querySelectorAll('.tab-dnd').forEach(t => t.classList.toggle('sel', t.dataset.cat === draft.ap.peloCat));
  $('#apPeloSwatches').innerHTML = Array.from({ length: n }, (_, i) => i + 1).map(i => `
    <button type="button" class="hair-card${draft.ap.pelo === i ? ' sel' : ''}" data-i="${i}" data-num="${i}" style="background-image:url('tex/pelo/${draft.ap.peloCat}/${i}.png')" aria-label="Peinado ${i}"></button>
  `).join('');
}

$('#apCabeza').innerHTML = CABEZAS.map(k => `<option value="${k}">${k === 'ninguno' ? 'Sin Accesorio de Cabeza' : '🪖 ' + k[0].toUpperCase() + k.slice(1)}</option>`).join('');
$('#apArma').innerHTML = ARMAS.map(k => `<option value="${k}">${k === 'ninguno' ? 'Sin Arma en Mano' : '⚔️ ' + k[0].toUpperCase() + k.slice(1)}</option>`).join('');

function updateCreator() {
  $$('.creator-step').forEach(s => s.style.display = +s.dataset.step === state.creatorStep ? 'block' : 'none');
  $$('.step').forEach(s => {
    const stepNum = +s.dataset.stepIndicator;
    s.classList.toggle('active', stepNum <= state.creatorStep);
  });
  $('#stepCounter').textContent = `Paso ${state.creatorStep} de 4`;
  $('#prevStepBtn').disabled = state.creatorStep === 1;
  $('#nextStepBtn').classList.toggle('hidden', state.creatorStep === 4);
  $('#finishCreatorBtn').classList.toggle('hidden', state.creatorStep !== 4);
  draft.nm = $('#newName').value;
  $('#apPreview').innerHTML = tokenSprite(draft.ap);
  if (state.creatorStep === 4) {
    const b = build(draft);
    $('#reviewName').textContent = b.nm || 'Héroe sin nombre';
    $('#reviewDetails').textContent = `${b.sp} · ${b.cl} (${b.bg || 'Aventurero'})`;
    $('#reviewPortrait').innerHTML = tokenSprite(b.ap);
    $('#reviewStats').innerHTML = `
      <li>✓ ${b.pv} Puntos de Vida iniciales · CA ${b.ca}</li>
      <li>✓ Arma: ${esc(b.weapon)} (${sg(b.atk)} al impacto · 1d${b.dmgDie}${sg(b.dmgMod)} daño)</li>
      <li>✓ Competente en: ${b.comp.join(', ')}</li>
      <li>✓ Rasgos de Linaje: ${SP[b.sp]?.bonus || 'Estándar'}</li>
    `;
  }
}

function openCreator() { state.creatorStep = 1; modal.classList.remove('hidden'); updateCreator(); }
$('#openCreatorBtn').addEventListener('click', openCreator);
$('#closeCreatorBtn').addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

$('#nextStepBtn').addEventListener('click', () => { if (state.creatorStep < 4) { state.creatorStep++; updateCreator(); } });
$('#prevStepBtn').addEventListener('click', () => { if (state.creatorStep > 1) { state.creatorStep--; updateCreator(); } });
$('#newName').addEventListener('input', updateCreator);

$('#classCards').addEventListener('change', e => {
  draft.cl = e.target.value;
  updateCreator();
});
$('#speciesCards').addEventListener('change', e => {
  draft.sp = e.target.value;
  updateCreator();
});
$('#backgroundCards').addEventListener('change', e => {
  draft.bg = e.target.value;
  updateCreator();
});

// Eventos de Apariencia
$('#hairPaletteGrid').addEventListener('click', e => {
  const btn = e.target.closest('.color-swatch-btn');
  if (!btn) return;
  const col = btn.dataset.color;
  draft.ap.peloColor = col;
  $('#apPelo').value = col;
  $$('.color-swatch-btn').forEach(b => b.classList.toggle('sel', b === btn));
  updateCreator();
});

let colorDebounce = null;
$('#apPelo').addEventListener('input', e => {
  draft.ap.peloColor = e.target.value;
  $$('.color-swatch-btn').forEach(b => b.classList.toggle('sel', b.dataset.color?.toLowerCase() === e.target.value.toLowerCase()));
  clearTimeout(colorDebounce);
  colorDebounce = setTimeout(() => updateCreator(), 30);
});

$('#apPielTabs').addEventListener('click', e => {
  const t = e.target.closest('.tab-dnd');
  if (!t) return;
  draft.ap.pielCat = t.dataset.cat;
  draft.ap.piel = 1;
  renderPielSwatches();
  updateCreator();
});
$('#apPielSwatches').addEventListener('click', e => {
  const b = e.target.closest('.skin-card');
  if (!b) return;
  draft.ap.piel = +b.dataset.i;
  $$('.skin-card').forEach(c => c.classList.toggle('sel', c === b));
  updateCreator();
});

$('#apPeloTabs').addEventListener('click', e => {
  const t = e.target.closest('.tab-dnd');
  if (!t) return;
  draft.ap.peloCat = t.dataset.cat;
  draft.ap.pelo = 1;
  renderPeloSwatches();
  updateCreator();
});
$('#apPeloSwatches').addEventListener('click', e => {
  const b = e.target.closest('.hair-card');
  if (!b) return;
  draft.ap.pelo = +b.dataset.i;
  $$('.hair-card').forEach(c => c.classList.toggle('sel', c === b));
  updateCreator();
});

$('#apCabeza').addEventListener('change', e => { draft.ap.cabeza = e.target.value; updateCreator(); });
$('#apArma').addEventListener('change', e => { draft.ap.arma = e.target.value; updateCreator(); });

$('#apPelo').value = draft.ap.peloColor;
renderPielSwatches();
renderPeloSwatches();

$('#creatorForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#newName').value.trim() || 'Aventurero Legendario';
  draft.nm = name;
  snapshot();
  const built = build(draft);
  state.chMeta = built;
  let pj = currentPlayer();

  let spawnX = 2, spawnY = 6;
  if (!validCell(spawnX, spawnY, 'pj') || tokenAt(spawnX, spawnY)) {
    for (let y = 1; y <= BOARD_H; y++) {
      for (let x = 1; x <= BOARD_W; x++) {
        if (validCell(x, y, 'pj') && !tokenAt(x, y)) { spawnX = x; spawnY = y; break; }
      }
      if (validCell(spawnX, spawnY, 'pj') && !tokenAt(spawnX, spawnY)) break;
    }
  }

  if (!pj) { pj = { id: 'pj', x: spawnX, y: spawnY, acted: false }; state.tokens.push(pj); }
  pj.name = name; pj.label = name.slice(0, 2).toUpperCase(); pj.type = 'player'; pj.ap = built.ap;
  pj.maxHp = built.pv; pj.hp = Math.min(pj.hp ?? built.pv, built.pv) || built.pv; pj.defense = built.ca;
  pj.attackBonus = built.atk; pj.damage = `1d${built.dmgDie}${sg(built.dmgMod)}`;

  if (!state.inventory.length) {
    state.inventory = [
      { icon: '⚔', name: built.weapon, detail: 'Arma consagrada', qty: 1 },
      { icon: '✚', name: 'Poción de curación', detail: 'Restaura 2d4+2 PV', qty: 2 }
    ];
  }
  modal.classList.add('hidden');
  addLog(`<strong>${esc(name)}</strong> ha entrado en la crónica de las ruinas.`);
  toast('¡Héroe consagrado y listo para la batalla!');
  switchView('characters');
  renderAll();
  saved();
});

// Entidades del Director
$('#entityForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#entityName').value.trim(),
    label = $('#entityLabel').value.trim().slice(0, 2).toUpperCase(),
    type = $('#entityType').value,
    x = Math.max(1, Math.min(BOARD_W, +$('#entityX').value)),
    y = Math.max(1, Math.min(BOARD_H, +$('#entityY').value)),
    hp = Math.max(1, +$('#entityHp').value),
    def = Math.max(0, +$('#entityDef').value),
    atkb = +$('#entityAtk').value,
    dmg = $('#entityDmg').value.trim();

  if (!name || !label || blocked.has(key(x, y)) || tokenAt(x, y)) {
    toast('No se puede colocar en esa baldosa.'); return;
  }
  snapshot();
  state.tokens.push({
    id: `entity-${Date.now()}`,
    name, label, type, x, y, hp, maxHp: hp, defense: def,
    attackBonus: atkb, damage: dmg || '1d6+1', acted: false
  });
  addLog(`<strong>${esc(name)}</strong> apareció en [${x},${y}].`);
  renderAll();
  e.target.reset();
  toast('Entidad manifestada en el tablero.');
  saved();
});

$('#proposalList').addEventListener('click', e => {
  const a = e.target.closest('[data-approve]'), r = e.target.closest('[data-reject]'), id = a?.dataset.approve || r?.dataset.reject;
  if (!id) return;
  const p = state.proposals.find(x => x.id === id);
  state.proposals = state.proposals.filter(x => x.id !== id);
  if (a) {
    state.tags.push({ id: `tag-${Date.now()}`, name: p.tagName, value: p.tagName.toLowerCase().replaceAll(' ', '-'), status: 'confirmed' });
    addLog(`<strong>${esc(p.tagName)}</strong> fue ratificada por el Director.`);
  } else {
    addLog(`<strong>${esc(p.tagName)}</strong> fue descartada.`);
  }
  renderAll(); saved();
});

$('#narrativeForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('#narrativeInput').value.trim();
  if (!text) { toast('Escribe una narración antes de inscribirla.'); return; }
  addLog(`<strong>Relato:</strong> ${esc(text)}`);
  $('#narrativeInput').value = '';
  toast('Crónica narrativa registrada.');
  saved();
});

$('#clearLogBtn').addEventListener('click', () => { state.log = []; renderLogs(); saved(); });
$('#undoBtn').addEventListener('click', () => {
  const h = state.history.pop();
  if (!h) { toast('No hay acciones para revertir.'); return; }
  Object.assign(state, h);
  renderAll();
  toast('Acción revertida en el tiempo.');
  saved();
});

$('#clearTokensBtn').addEventListener('click', () => {
  snapshot();
  state.tokens = state.tokens.filter(t => ['pj', 'goblin', 'wolf', 'chest'].includes(t.id));
  renderAll();
  toast('Criaturas eliminadas.');
  saved();
});

$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'cronica-partida.json'; a.click();
  URL.revokeObjectURL(url);
  toast('Crónica exportada.');
});

$('#helpBtn').addEventListener('click', () => toast('Mueve tu ficha a casillas libres, ataca enemigos adyacentes y concluye tu turno.'));

// ---- Supabase Sync con Respaldo Offline ----
const cfg = window.DND_CONFIG || {};
const cloud = (cfg.supabaseUrl && window.supabase) ? supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;
let me = null, campaignId = localStorage.getItem('lastCampaignId') || null, knownVersion = null;

function renderAcct() {
  const el = $('#acctLabel');
  if (el) el.textContent = me ? (me.is_anonymous ? 'Aventurero Invitado' : me.email) : 'Sin sesión';
}

async function ensureSignedIn() {
  if (!cloud) return null;
  try {
    const { data: { user } } = await cloud.auth.getUser();
    if (user) { me = user; renderAcct(); return user; }
    const { data, error } = await cloud.auth.signInAnonymously();
    if (!error && data?.user) { me = data.user; renderAcct(); return me; }
  } catch (e) {
    console.warn('Aviso: modo local activo sin Supabase.', e);
  }
  return null;
}

$('#emailBtn').addEventListener('click', async () => {
  if (!cloud) { toast('Nube no disponible.'); return; }
  const email = prompt('Correo para recuperar tu campaña:');
  if (!email) return;
  try {
    const { error } = await cloud.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    if (error) throw error;
    toast('Enlace enviado a tu correo.');
  } catch (e) {
    console.error(e);
    toast('No se pudo enviar el enlace.');
  }
});

async function guardarPartidaEnLaNube() {
  persistLocal();
  if (!cloud) return;
  const user = await ensureSignedIn();
  if (!user) return;

  try {
    if (campaignId && knownVersion != null) {
      const { data: current, error: verErr } = await cloud.from('campaigns').select('version').eq('id', campaignId).single();
      if (!verErr && current && current.version !== knownVersion) {
        toast('Campaña modificada en otro dispositivo.');
        return;
      }
    }
    const nextVersion = (knownVersion || 0) + 1;
    const payload = { owner_id: user.id, name: state.chMeta?.nm || 'Partida sin nombre', state, version: nextVersion, updated_at: new Date().toISOString() };
    const { data, error } = await cloud.from('campaigns').upsert(campaignId ? { ...payload, id: campaignId } : payload, { onConflict: 'id' }).select().single();
    if (error) throw error;
    campaignId = data.id;
    knownVersion = data.version;
    localStorage.setItem('lastCampaignId', campaignId);
    toast('Campaña resguardada en la nube.');
  } catch (e) {
    console.warn('Guardado en nube diferido (copia local protegida):', e);
  }
}

async function cargarPartidaDesdeLaNube(id) {
  if (!cloud) { toast('Nube no disponible.'); return; }
  const user = await ensureSignedIn();
  if (!user) { toast('Inicia sesión para descargar.'); return; }

  const { data, error } = await cloud.from('campaigns').select('id,state,version,updated_at').eq('id', id).single();
  if (error) throw error;
  campaignId = data.id;
  knownVersion = data.version;
  state = data.state;
  localStorage.setItem('lastCampaignId', campaignId);
  renderAll();
  toast(`Campaña cargada (${new Date(data.updated_at).toLocaleString('es-MX')}).`);
}

let saveTimer;
function programarGuardado() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    guardarPartidaEnLaNube().catch(e => console.error('Auto-guardado:', e));
  }, 1200);
}

$('#saveBtn').addEventListener('click', async () => {
  persistLocal();
  if (cloud) {
    try { await guardarPartidaEnLaNube(); }
    catch (e) { toast('Guardado en almacenamiento local.'); }
  } else {
    toast('Guardado en almacenamiento local.');
  }
});

$('#loadBtn').addEventListener('click', async () => {
  if (!campaignId) { toast('No hay campaña remota guardada.'); return; }
  try { await cargarPartidaDesdeLaNube(campaignId); }
  catch (e) { console.error(e); toast('No se pudo cargar la partida.'); }
});

$('#newGameBtn').addEventListener('click', () => {
  if (confirm('¿Comenzar nueva campaña? El héroe actual se perderá si no lo guardaste.')) {
    state = clone(defaultState);
    campaignId = null;
    knownVersion = null;
    localStorage.removeItem('lastCampaignId');
    renderAll();
    openCreator();
    toast('Nueva campaña iniciada.');
  }
});

// Inicialización de la aplicación
state.creatorStep = 1;
renderAll();
if (!state.chMeta) openCreator();
ensureSignedIn().then(renderAcct).catch(() => renderAcct());
