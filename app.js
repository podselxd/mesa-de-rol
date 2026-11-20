const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mod = v => Math.floor((v - 10) / 2);
const sg = n => (n >= 0 ? '+' : '') + n;
const BOARD_W = 12, BOARD_H = 8;

// ---- Clases y especies (D&D SRD 5.1 simplificado) ----
const ST = ['Fue', 'Des', 'Con', 'Int', 'Sab', 'Car'];
const CL = {
  Guerrero: { d: 'Pegas fuerte y aguantas golpes. La opción más simple para empezar.', pv: 10, ca: 16, main: 'Fue', weapon: 'Espada larga', dmgDie: 8, arr: { Fue: 15, Con: 14, Des: 13, Sab: 12, Car: 10, Int: 8 }, comp: ['Armaduras', 'Armas marciales'] },
  Mago: { d: 'Poco aguante, mucho ingenio. Resuelves problemas con conocimiento.', pv: 6, ca: 10, main: 'Int', weapon: 'Bastón arcano', dmgDie: 6, arr: { Int: 15, Con: 14, Des: 13, Sab: 12, Car: 10, Fue: 8 }, comp: ['Arcana', 'Historia'] },
  Pícaro: { d: 'Sigilo, rapidez y manos ágiles. Ideal para trampas y cerraduras.', pv: 8, ca: 11, main: 'Des', weapon: 'Daga', dmgDie: 6, arr: { Des: 15, Con: 14, Int: 13, Car: 12, Sab: 10, Fue: 8 }, comp: ['Sigilo', 'Juego de manos'] },
  Clérigo: { d: 'Resistente y con intuición. Cuidas al grupo y lees a las personas.', pv: 8, ca: 16, main: 'Sab', weapon: 'Maza', dmgDie: 6, arr: { Sab: 15, Con: 14, Fue: 13, Car: 12, Des: 10, Int: 8 }, comp: ['Religión', 'Medicina'] }
};
const SP = { Humano: { b: { Fue: 1, Des: 1, Con: 1, Int: 1, Sab: 1, Car: 1 } }, Elfo: { b: { Des: 2 } }, Enano: { b: { Con: 2 } }, Mediano: { b: { Car: 2 } } };

// ---- Metadatos de Apariencia y Offsets ----
const CABEZAS = ['ninguno', 'casco', 'sombrero', 'corona', 'capucha'];
const ARMAS = ['ninguno', 'espada', 'arco', 'baston', 'daga'];
const PIEL_CATS = { piel: 16, elfo: 16, fantasia: 16 };
const PELO_CATS = { mujer: 30, hombre: 32 };
const DEFAULT_AP = { pielCat: 'piel', piel: 1, peloCat: 'mujer', pelo: 1, peloColor: '#3b2a1a', cabeza: 'ninguno', arma: 'ninguno' };

let ASSET_OFFSETS = {};
async function loadOffsets() {
  try {
    const res = await fetch('assets/offsets.json');
    if (res.ok) ASSET_OFFSETS = await res.json();
  } catch (e) {
    console.warn('Aviso: no se pudo cargar assets/offsets.json, usando valores por defecto.', e);
  }
}
loadOffsets();

function getAssetOffset(key) {
  return ASSET_OFFSETS[key] || { x: 0, y: 0, scale: 1.0, layer: 'front' };
}

// ---- Motor de Tintado y Renderizado de Capas con Caché ----
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
  return `<span class="sprite" style="width:${size}px;height:${size}px">`
    + peloLayer(ap, '_back')
    + layer(`tex/${ap.pielCat}/${ap.piel}.png`)
    + peloLayer(ap, '')
    + (ap.cabeza !== 'ninguno' ? layer(`tex/cabeza/${ap.cabeza}.png`, `cabeza_${ap.cabeza}`) : '')
    + (ap.arma !== 'ninguno' ? layer(`tex/arma/${ap.arma}.png`, `arma_${ap.arma}`) : '')
    + `</span>`;
}

function build(d) {
  const c = CL[d.cl], s = SP[d.sp], st = {};
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
    { id: 'chest', name: 'Cofre antiguo', label: '◆', type: 'treasure', x: 5, y: 3, hp: 1, maxHp: 1, acted: false }
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
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2600); }
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

// Permite mover hacia un tesoro si el actor es el jugador 'pj'
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
  if (t.ap) b.innerHTML = tokenSprite(t.ap, 39); else b.textContent = t.label.slice(0, 3);
  if (t.type !== 'treasure') {
    b.addEventListener('dragstart', e => { if (t.id !== 'pj' || state.phase !== 'Exploración') { e.preventDefault(); return; } state.draggedId = t.id; e.dataTransfer.setData('text/plain', t.id); b.classList.add('dragging'); status('Arrastra a una casilla iluminada.', 'success'); });
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
  if (id !== 'pj' || !validCell(x, y, 'pj')) { status('Movimiento inválido: usa una casilla libre iluminada.', 'error'); return; }
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
  status(t ? `${t.name} seleccionado.` : `Casilla ${x},${y} seleccionada.`);
  renderBoard();
}

function needsCharacter() { if (!currentPlayer()) { toast('Crea tu personaje primero.'); openCreator(); return true; } return false; }

function movePlayer(x, y) {
  if (needsCharacter()) return;
  const p = currentPlayer();
  if (p.acted) { status('Ya actuaste este turno. Termina el turno para continuar.', 'error'); return; }
  snapshot();
  const from = `${p.x},${p.y}`;
  p.x = x; p.y = y;
  p.acted = true;
  addLog(`<strong>${esc(p.name)}</strong> se movió de ${from} a ${x},${y}.`);
  state.mode = 'none';
  pickUpTreasure();
  status(`Llegaste a ${x},${y}.`, 'success');
  renderBoard();
  saved();
}

function pickUpTreasure() {
  const p = currentPlayer();
  const chest = state.tokens.find(t => t.type === 'treasure' && t.x === p.x && t.y === p.y);
  if (!chest) return;
  state.tokens = state.tokens.filter(t => t.id !== chest.id);
  state.inventory.push({ icon: '◈', name: 'Tesoro de las ruinas', detail: 'Botín encontrado', qty: 1 });
  addLog(`<strong>${esc(p.name)}</strong> recogió un tesoro.`);
  toast('¡Tesoro añadido al inventario!');
  renderSheet();
}

function startAction(action) {
  if (needsCharacter()) return; const p = currentPlayer();
  if (p.acted && action !== 'item') { toast('Ya actuaste este turno.'); return; }
  if (action === 'move') { state.mode = 'move'; status('Movimiento activo: elige una casilla iluminada o arrastra tu ficha.', 'success'); }
  else if (action === 'attack') { state.mode = 'attack'; status('Ataque activo: selecciona un enemigo adyacente.'); }
  else if (action === 'skill') {
    snapshot(); p.acted = true; const heal = roll(6); p.hp = Math.min(p.maxHp, p.hp + heal);
    addLog(`<strong>${esc(p.name)}</strong> usó su habilidad de clase y recuperó ${heal} vida.`);
    toast(`+${heal} vida.`); endPlayerAction();
  }
  else if (action === 'item') {
    const potion = state.inventory.find(i => i.name === 'Poción de curación' && i.qty > 0);
    if (!potion) { toast('No quedan pociones.'); return; }
    snapshot(); const heal = roll(4) + roll(4) + 2; potion.qty--; p.hp = Math.min(p.maxHp, p.hp + heal); p.acted = true;
    addLog(`<strong>${esc(p.name)}</strong> usó una poción y recuperó ${heal} vida.`);
    toast(`+${heal} vida.`); endPlayerAction();
  }
  renderBoard(); renderSheet(); saved();
}

function attack(target) {
  if (needsCharacter()) return; const p = currentPlayer();
  if (p.acted) { toast('Ya actuaste este turno.'); return; }
  if (!adjacent(p, target)) { status('Ese objetivo está fuera de tu alcance.', 'error'); return; }
  snapshot();
  const d20 = roll(20), total = d20 + p.attackBonus;
  if (total >= target.defense) {
    const dmg = rollDamage(p.damage);
    target.hp = Math.max(0, target.hp - dmg);
    addLog(`<strong>${esc(p.name)}</strong> atacó a ${esc(target.name)}: ${d20}+${p.attackBonus}=${total}, daño ${dmg}.`);
    toast(`Impacto: ${dmg} de daño.`);
    if (target.hp <= 0) {
      state.tokens = state.tokens.filter(t => t.id !== target.id);
      addLog(`<strong>${esc(target.name)}</strong> fue derrotado.`);
      dropLoot(target);
    } else {
      status(`${target.name} queda con ${target.hp}/${target.maxHp} vida.`, 'success');
    }
  } else {
    addLog(`<strong>${esc(p.name)}</strong> falló contra ${esc(target.name)}: ${d20}+${p.attackBonus}=${total}.`);
    toast('El ataque falló.');
  }
  p.acted = true; state.mode = 'none';
  renderBoard(); renderEncounter(); renderSheet(); saved();
}

function dropLoot(target) {
  const loot = target.name.toLowerCase().includes('goblin') ? 'Monedas del goblin' : 'Botín de combate';
  state.inventory.push({ icon: '◆', name: loot, detail: 'Botín de combate', qty: 1 });
  addLog(`Botín obtenido: <strong>${esc(loot)}</strong>.`);
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
        addLog(`<strong>${esc(enemy.name)}</strong> atacó a ${esc(p.name)} y causó ${dmg} daño.`);
      } else {
        addLog(`<strong>${esc(enemy.name)}</strong> falló su ataque contra ${esc(p.name)}.`);
      }
    } else {
      // IA de acercamiento limpia usando dirección por signo
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
        addLog(`<strong>${esc(enemy.name)}</strong> se acercó.`);
      }
    }
  });

  if (p.hp <= 0) {
    state.phase = 'Derrota';
    addLog(`<strong>${esc(p.name)} cayó.</strong> Reinicia la partida o deshaz tu acción para volver a intentarlo.`);
    toast('Derrota: quedaste sin vida.');
  } else {
    state.phase = 'Exploración';
    p.acted = false;
    state.round++;
    addLog(`<strong>Comienza la ronda ${state.round}.</strong>`);
  }
  renderAll(); saved();
}

$('#endTurnBtn').addEventListener('click', () => {
  if (state.phase === 'Derrota') { toast('La partida terminó en derrota. Pulsa Deshacer o inicia una nueva partida.'); return; }
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
  $('#abilityGrid').innerHTML = ST.map(k => `<div class="ability"><span>${k}</span><strong>${st[k]}</strong><small>${sg(mod(st[k]))}</small></div>`).join('');
}

function renderSheet() {
  const m = state.chMeta, p = currentPlayer();
  $('#sheetName').textContent = m?.nm || 'Sin nombre';
  $('#sheetIdentity').textContent = m ? `${m.sp} · ${m.cl} · ${m.bg || ''}` : 'Crea tu personaje para empezar';
  $('#sheetApproved').style.display = m ? '' : 'none';
  const port = $('#sheetPortrait'); port.innerHTML = m ? tokenSprite(m.ap, 120) : '?';
  if (p) {
    $('#sheetHp').textContent = `${p.hp} / ${p.maxHp}`;
    $('#sheetDefense').textContent = p.defense;
    $('#sheetHpBar').style.width = `${Math.max(0, p.hp / p.maxHp * 100)}%`;
  } else {
    $('#sheetHp').textContent = m ? `${m.pv} / ${m.pv}` : '— / —';
    $('#sheetDefense').textContent = m ? m.ca : '—';
    $('#sheetHpBar').style.width = '100%';
  }
  $('#attackRow').innerHTML = m ? `<div class="data-row"><span>${esc(m.weapon)}</span><b>${sg(m.atk)} · 1d${m.dmgDie}${sg(m.dmgMod)}</b></div>` : '<div class="data-row"><span>—</span><b>—</b></div>';
  $('#compChips').innerHTML = m ? m.comp.map(c => `<span class="chip blue">${esc(c)}</span>`).join('') : '';
  $('#sheetTags').innerHTML = state.tags.filter(t => t.status === 'confirmed').map(t => `<span class="chip green">${esc(t.name)}</span>`).join('');
  $('#inventoryList').innerHTML = state.inventory.map(i => `<div class="inventory-item"><span class="item-icon">${i.icon}</span><div><strong>${esc(i.name)}</strong><span>${esc(i.detail)}</span></div><small>×${i.qty}</small></div>`).join('') || '<div class="empty-state">Inventario vacío.</div>';

  const atb = $('#activeTurnBox'), icon = $('#activeTurnIcon'), nameEl = $('#activeTurnName'), hint = $('#activeTurnHint');
  if (atb) {
    if (p) {
      icon.innerHTML = m?.ap ? tokenSprite(m.ap, 33) : (m?.nm || 'PJ').slice(0, 2).toUpperCase();
      icon.style.background = m?.ap ? 'none' : '';
      nameEl.textContent = p.name;
      hint.textContent = p.acted ? 'Ya actuaste · termina turno para seguir' : `Acción disponible · ${p.hp}/${p.maxHp} vida`;
    } else {
      icon.textContent = '?'; nameEl.textContent = 'Sin personaje'; hint.textContent = 'Crea tu personaje en la pestaña Personajes.';
    }
  }
  $('#roundNum').textContent = state.round;
  $('#roundNum2').textContent = state.round;
  $('#phasePill').textContent = state.phase;
}

function renderEncounter() {
  const enemies = state.tokens.filter(t => t.type === 'enemy');
  const el = $('#encounterRows'); if (!el) return;
  el.innerHTML = enemies.length ? enemies.map(e => `<div class="encounter-row"><span class="mini-token enemy-token">${esc(e.label)}</span><div><strong>${esc(e.name)}</strong><span>Vida ${e.hp}/${e.maxHp} · Defensa ${e.defense}</span></div><b class="danger-text">Vivo</b></div>`).join('') : '<div class="empty-state">Sin enemigos en el tablero.</div>';
}

function renderLogs() {
  const html = state.log.map(e => `<li><span class="log-time">${e.time}</span><span>${e.html}</span></li>`).join('');
  const q = $('#quickLog'), f = $('#fullLog');
  if (q) q.innerHTML = state.log.slice(0, 4).map(e => `<li><span class="log-time">${e.time}</span><span>${e.html}</span></li>`).join('');
  if (f) f.innerHTML = html || '<li>Sin eventos.</li>';
}

function renderProposals() {
  const list = $('#proposalList'); if (!list) return;
  $('#pendingCount').textContent = state.proposals.length;
  if (!state.proposals.length) { list.innerHTML = '<div class="empty-state">No hay propuestas pendientes.</div>'; return; }
  list.innerHTML = state.proposals.map(p => `<article class="proposal" data-id="${p.id}"><strong>${esc(p.tagName)}</strong><p>${esc(p.text)}<br><small>Efecto: ${esc(p.effect)}</small></p><div class="proposal-actions"><button class="approve" data-approve="${p.id}">Aprobar</button><button data-reject="${p.id}">Rechazar</button></div></article>`).join('');
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

// ---- Creador de personaje ----
let draft = { cl: 'Guerrero', sp: 'Humano', bg: 'Soldado', nm: '', ap: { ...DEFAULT_AP } };
const modal = $('#creatorModal');
$('#classCards').innerHTML = Object.keys(CL).map(k => `<label class="preset ${draft.cl === k ? 'selected' : ''}"><input type="radio" name="preset" value="${k}" ${draft.cl === k ? 'checked' : ''}><b>${k}</b><span>${esc(CL[k].d)}</span></label>`).join('');
const PIEL_CAT_LABELS = { piel: 'Piel', elfo: 'Elfo', fantasia: 'Fantasía' };
$('#apPielTabs').innerHTML = Object.keys(PIEL_CATS).map(cat => `<button type="button" class="piel-tab" data-cat="${cat}">${PIEL_CAT_LABELS[cat]}</button>`).join('');

function renderPielSwatches() {
  const n = PIEL_CATS[draft.ap.pielCat];
  $$('.piel-tab').forEach(t => t.classList.toggle('sel', t.dataset.cat === draft.ap.pielCat));
  const box = $('#apPielSwatches');
  if (!n) { box.innerHTML = '<p class="hint" style="color:var(--muted);font-size:.68rem">Próximamente.</p>'; return; }
  box.innerHTML = Array.from({ length: n }, (_, i) => i + 1).map(i => `<button type="button" class="piel-swatch${draft.ap.piel === i ? ' sel' : ''}" data-i="${i}" style="background-image:url('tex/${draft.ap.pielCat}/${i}.png')" aria-label="Retrato ${i}"></button>`).join('');
}

$('#apPeloTabs').innerHTML = Object.keys(PELO_CATS).map(cat => `<button type="button" class="piel-tab" data-cat="${cat}">${cat === 'mujer' ? 'Mujer' : 'Hombre'}</button>`).join('');
function renderPeloSwatches() {
  const n = PELO_CATS[draft.ap.peloCat];
  $('#apPeloTabs').querySelectorAll('.piel-tab').forEach(t => t.classList.toggle('sel', t.dataset.cat === draft.ap.peloCat));
  $('#apPeloSwatches').innerHTML = Array.from({ length: n }, (_, i) => i + 1).map(i => `<button type="button" class="piel-swatch${draft.ap.pelo === i ? ' sel' : ''}" data-i="${i}" style="background-image:url('tex/pelo/${draft.ap.peloCat}/${i}.png');background-color:#2a3442" aria-label="Pelo ${i}"></button>`).join('');
}

$('#apCabeza').innerHTML = CABEZAS.map(k => `<option value="${k}">${k === 'ninguno' ? 'Ninguno' : k[0].toUpperCase() + k.slice(1)}</option>`).join('');
$('#apArma').innerHTML = ARMAS.map(k => `<option value="${k}">${k === 'ninguno' ? 'Ninguno' : k[0].toUpperCase() + k.slice(1)}</option>`).join('');

function updateCreator() {
  $$('.creator-step').forEach(s => s.classList.toggle('active-step', +s.dataset.step === state.creatorStep));
  $$('.step').forEach((s, i) => s.classList.toggle('active', i < state.creatorStep));
  $('#stepCounter').textContent = `Paso ${state.creatorStep} de 4`;
  $('#prevStepBtn').disabled = state.creatorStep === 1;
  $('#nextStepBtn').classList.toggle('hidden', state.creatorStep === 4);
  $('#finishCreatorBtn').classList.toggle('hidden', state.creatorStep !== 4);
  draft.nm = $('#newName').value; draft.bg = $('#newBackground').value;
  $('#apPreview').innerHTML = tokenSprite(draft.ap, 110);
  if (state.creatorStep === 4) {
    const b = build(draft);
    $('#reviewName').textContent = b.nm || 'Sin nombre';
    $('#reviewDetails').textContent = `${b.sp} · ${b.cl} · ${b.bg || ''}`;
    $('#reviewPortrait').innerHTML = tokenSprite(b.ap, 140);
    $('#reviewStats').innerHTML = `<li>✓ Vida ${b.pv}, Defensa ${b.ca}</li><li>✓ Ataque ${sg(b.atk)} con ${esc(b.weapon)} (1d${b.dmgDie}${sg(b.dmgMod)})</li><li>✓ Competente en ${b.comp.join(' y ')}</li>`;
  }
}

function openCreator() { state.creatorStep = 1; modal.classList.remove('hidden'); updateCreator(); }
$('#openCreatorBtn').addEventListener('click', openCreator);
$('#closeCreatorBtn').addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
$('#nextStepBtn').addEventListener('click', () => { if (state.creatorStep < 4) { state.creatorStep++; updateCreator(); } });
$('#prevStepBtn').addEventListener('click', () => { if (state.creatorStep > 1) { state.creatorStep--; updateCreator(); } });
$('#newName').addEventListener('input', updateCreator);
$('#newBackground').addEventListener('change', updateCreator);
$('#newSpecies').addEventListener('change', e => { draft.sp = e.target.value; updateCreator(); });
$('#classCards').addEventListener('change', e => {
  if (e.target.name === 'preset') {
    draft.cl = e.target.value;
    $$('#classCards .preset').forEach(l => l.classList.toggle('selected', l.querySelector('input').checked));
    updateCreator();
  }
});
$('#apPielTabs').addEventListener('click', e => { const t = e.target.closest('.piel-tab'); if (!t) return; draft.ap.pielCat = t.dataset.cat; draft.ap.piel = 1; renderPielSwatches(); updateCreator(); });
$('#apPielSwatches').addEventListener('click', e => { const b = e.target.closest('.piel-swatch'); if (!b) return; draft.ap.piel = +b.dataset.i; renderPielSwatches(); updateCreator(); });
$('#apPeloTabs').addEventListener('click', e => { const t = e.target.closest('.piel-tab'); if (!t) return; draft.ap.peloCat = t.dataset.cat; draft.ap.pelo = 1; renderPeloSwatches(); updateCreator(); });
$('#apPeloSwatches').addEventListener('click', e => { const b = e.target.closest('.piel-swatch'); if (!b) return; draft.ap.pelo = +b.dataset.i; renderPeloSwatches(); updateCreator(); });

// Debounce eficiente para el selector de color de pelo
let colorDebounce = null;
$('#apPelo').addEventListener('input', e => {
  draft.ap.peloColor = e.target.value;
  clearTimeout(colorDebounce);
  colorDebounce = setTimeout(() => updateCreator(), 30);
});
$('#apCabeza').addEventListener('change', e => { draft.ap.cabeza = e.target.value; updateCreator(); });
$('#apArma').addEventListener('change', e => { draft.ap.arma = e.target.value; updateCreator(); });
$('#apPelo').value = draft.ap.peloColor;
renderPielSwatches();
renderPeloSwatches();

$('#creatorForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#newName').value.trim() || 'Aventurero';
  draft.nm = name;
  snapshot();
  const built = build(draft);
  state.chMeta = built;
  let pj = currentPlayer();

  // Buscar casilla libre sin bloquear para el jugador
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
      { icon: '⚔', name: built.weapon, detail: 'Arma inicial', qty: 1 },
      { icon: '✚', name: 'Poción de curación', detail: 'Recupera 2d4+2 vida', qty: 2 }
    ];
  }
  modal.classList.add('hidden');
  addLog(`<strong>${esc(name)}</strong> confirmó su hoja de personaje.`);
  toast('Personaje creado y listo para jugar.');
  switchView('characters');
  renderAll();
  saved();
});

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
    toast('No se puede colocar: casilla inválida u ocupada.'); return;
  }
  snapshot();
  state.tokens.push({
    id: `entity-${Date.now()}`,
    name, label, type, x, y, hp, maxHp: hp, defense: def,
    attackBonus: atkb, damage: dmg || '1d6+1', acted: false
  });
  addLog(`<strong>${esc(name)}</strong> fue colocado en ${x},${y}.`);
  renderAll();
  e.target.reset();
  toast('Entidad colocada.');
  saved();
});

$('#proposalList').addEventListener('click', e => {
  const a = e.target.closest('[data-approve]'), r = e.target.closest('[data-reject]'), id = a?.dataset.approve || r?.dataset.reject;
  if (!id) return;
  const p = state.proposals.find(x => x.id === id);
  state.proposals = state.proposals.filter(x => x.id !== id);
  if (a) {
    state.tags.push({ id: `tag-${Date.now()}`, name: p.tagName, value: p.tagName.toLowerCase().replaceAll(' ', '-'), status: 'confirmed' });
    addLog(`<strong>${esc(p.tagName)}</strong> aprobada por el director.`);
  } else {
    addLog(`<strong>${esc(p.tagName)}</strong> rechazada por el director.`);
  }
  renderAll(); saved();
});

$('#narrativeForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('#narrativeInput').value.trim();
  if (!text) { toast('Escribe una narración antes de registrar.'); return; }
  addLog(`<strong>Narración:</strong> ${esc(text)}`);
  $('#narrativeInput').value = '';
  toast('Narración guardada sin efecto automático.');
  saved();
});

$('#clearLogBtn').addEventListener('click', () => { state.log = []; renderLogs(); saved(); });
$('#undoBtn').addEventListener('click', () => {
  const h = state.history.pop();
  if (!h) { toast('No hay acciones para deshacer.'); return; }
  Object.assign(state, h);
  renderAll();
  toast('Acción revertida.');
  saved();
});

$('#clearTokensBtn').addEventListener('click', () => {
  snapshot();
  state.tokens = state.tokens.filter(t => ['pj', 'goblin', 'wolf', 'chest'].includes(t.id));
  renderAll();
  toast('Entidades manuales eliminadas.');
  saved();
});

$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'estado-partida.json'; a.click();
  URL.revokeObjectURL(url);
  toast('Estado exportado.');
});

$('#helpBtn').addEventListener('click', () => toast('Crea tu personaje, mueve tu ficha, ataca enemigos adyacentes y termina el turno para que respondan.'));

// ---- Supabase Auth + Guardado en la nube con respaldo Offline ----
const cfg = window.DND_CONFIG || {};
const cloud = (cfg.supabaseUrl && window.supabase) ? supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;
let me = null, campaignId = localStorage.getItem('lastCampaignId') || null, knownVersion = null;

function renderAcct() {
  const el = $('#acctLabel');
  if (el) el.textContent = me ? (me.is_anonymous ? 'Invitado' : me.email) : 'Sin sesión';
}

async function ensureSignedIn() {
  if (!cloud) return null;
  try {
    const { data: { user } } = await cloud.auth.getUser();
    if (user) { me = user; renderAcct(); return user; }
    const { data, error } = await cloud.auth.signInAnonymously();
    if (!error && data?.user) { me = data.user; renderAcct(); return me; }
  } catch (e) {
    console.warn('Aviso: modo sin conexión o autenticación anónima deshabilitada.', e);
  }
  return null;
}

$('#emailBtn').addEventListener('click', async () => {
  if (!cloud) { toast('Nube no configurada.'); return; }
  const email = prompt('Tu correo (te enviaremos un enlace de acceso para recuperar tu partida):');
  if (!email) return;
  try {
    const { error } = await cloud.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    if (error) throw error;
    toast('Revisa tu correo para el enlace de acceso.');
  } catch (e) {
    console.error(e);
    toast('No se pudo enviar el enlace.');
  }
});

async function guardarPartidaEnLaNube() {
  persistLocal();
  if (!cloud) return;
  const user = await ensureSignedIn();
  if (!user) return; // Si no hay sesión o internet, queda guardado en local limpio

  try {
    if (campaignId && knownVersion != null) {
      const { data: current, error: verErr } = await cloud.from('campaigns').select('version').eq('id', campaignId).single();
      if (!verErr && current && current.version !== knownVersion) {
        toast('La partida cambió en otro dispositivo. Carga antes de guardar.');
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
    toast('Partida guardada en la nube.');
  } catch (e) {
    console.warn('Fallo al guardar en la nube (respaldo local guardado):', e);
  }
}

async function cargarPartidaDesdeLaNube(id) {
  if (!cloud) { toast('Nube no disponible.'); return; }
  const user = await ensureSignedIn();
  if (!user) { toast('Inicia sesión para cargar desde la nube.'); return; }

  const { data, error } = await cloud.from('campaigns').select('id,state,version,updated_at').eq('id', id).single();
  if (error) throw error;
  campaignId = data.id;
  knownVersion = data.version;
  state = data.state;
  localStorage.setItem('lastCampaignId', campaignId);
  renderAll();
  toast(`Partida cargada (${new Date(data.updated_at).toLocaleString('es-MX')}).`);
}

let saveTimer;
function programarGuardado() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    guardarPartidaEnLaNube().catch(e => console.error('Guardado automático:', e));
  }, 1200);
}

$('#saveBtn').addEventListener('click', async () => {
  persistLocal();
  if (cloud) {
    try { await guardarPartidaEnLaNube(); }
    catch (e) { toast('Guardado localmente (sin conexión a la nube).'); }
  } else {
    toast('Guardado localmente.');
  }
});

$('#loadBtn').addEventListener('click', async () => {
  if (!campaignId) { toast('Todavía no existe una partida guardada en la nube.'); return; }
  try { await cargarPartidaDesdeLaNube(campaignId); }
  catch (e) { console.error(e); toast('No se pudo cargar la partida de la nube.'); }
});

$('#newGameBtn').addEventListener('click', () => {
  if (confirm('¿Reiniciar la partida? Se perderá el personaje actual si no lo guardaste.')) {
    state = clone(defaultState);
    campaignId = null;
    knownVersion = null;
    localStorage.removeItem('lastCampaignId');
    renderAll();
    openCreator();
    toast('Nueva partida creada.');
  }
});

// Inicialización de la aplicación
state.creatorStep = 1;
renderAll();
if (!state.chMeta) openCreator();
ensureSignedIn().then(renderAcct).catch(() => renderAcct());
