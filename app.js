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

// Apariencia: el retrato es siempre una foto/imagen subida por el jugador (o ninguna, con placeholder)
const DEFAULT_AP = { customPortrait: null };

// Devuelve el HTML del retrato: la imagen subida, o una ficha con iniciales si no hay ninguna
function portraitHTML(ap, label) {
  if (ap?.customPortrait) {
    return `<img src="${ap.customPortrait}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block" onerror="this.style.display='none'">`;
  }
  const initials = esc((label || '?').slice(0, 2).toUpperCase());
  return `<span style="display:grid;place-items:center;width:100%;height:100%;font-weight:900;color:var(--text-muted)">${initials}</span>`;
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
    b.innerHTML = portraitHTML(t.ap, t.label);
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
$$('[data-action]').forEach(b => b.addEventListener('click', () => startAction(b.dataset.action)));
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
  const approved = $('#sheetApproved'); if (approved) approved.style.display = m ? '' : 'none';
  const portFrame = $('#sheetPortraitFrame');
  if (portFrame) portFrame.innerHTML = portraitHTML(m?.ap, m?.nm);
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
  const tagsEl = $('#sheetTags'); if (tagsEl) tagsEl.innerHTML = state.tags.filter(t => t.status === 'confirmed').map(t => `<span class="phase" style="border-color:var(--green);color:#b7e5ca">${esc(t.name)}</span>`).join('');
  $('#inventoryList').innerHTML = state.inventory.map(i => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface-alt);border:1px solid var(--panel-border);border-radius:8px">
      <span style="font-size:1.1rem;color:var(--gold)">${i.icon}</span>
      <div style="flex:1"><strong>${esc(i.name)}</strong><span style="display:block;font-size:0.68rem;color:var(--text-muted)">${esc(i.detail)}</span></div>
      <small style="color:var(--gold)">×${i.qty}</small>
    </div>
  `).join('') || '<div style="color:var(--text-muted);text-align:center;padding:12px">Mochila vacía.</div>';

  const atb = $('#activeTurnBox'), icon = $('#activeTurnIcon'), nameEl = $('#activeTurnName'), hint = $('#activeTurnHint');
  if (atb) {
    if (p) {
      icon.innerHTML = portraitHTML(m?.ap, p.name);
      nameEl.textContent = p.name;
      hint.textContent = p.acted ? 'Turno agotado · pulsa Terminar Turno' : `Acción disponible · ${p.hp}/${p.maxHp} PV`;
    } else {
      icon.textContent = '?'; nameEl.textContent = 'Sin personaje'; hint.textContent = 'Crea tu personaje en la pestaña Ficha.';
    }
  }
  const roundEl = $('#roundNum'); if (roundEl) roundEl.textContent = state.round;
  renderAbilities();
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

// Especie y trasfondo usan los <select> existentes (#newSpecies/#newBackground) mas abajo.
// La apariencia es siempre una foto subida (ver SECCIÓN 1 del modal) — sin piel/pelo seleccionables.

$('#classCards').addEventListener('change', e => { draft.cl = e.target.value; });

// ---- CREATOR FORM SUBMIT ----
$('#creatorForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = ($('#newName')?.value || '').trim() || 'Aventurero Legendario';
  const sp = $('#newSpecies')?.value || draft.sp || 'Humano';
  const bg = $('#newBackground')?.value || draft.bg || 'Soldado';
  draft.nm = name; draft.sp = sp; draft.bg = bg;

  // If portrait was loaded from file/URL/preset, attach to ap (only when actually shown)
  const prevImg = $('#creatorPreviewImg');
  if (prevImg?.src && prevImg.style.display !== 'none' && (prevImg.src.startsWith('data:') || prevImg.src.startsWith('http'))) {
    draft.ap.customPortrait = prevImg.src;
  } else {
    draft.ap.customPortrait = null;
  }

  snapshot();
  const built = build(draft);
  built.ap = { ...draft.ap }; // keep customPortrait
  state.chMeta = built;
  let pj = currentPlayer();

  let spawnX = 2, spawnY = 6;
  if (!validCell(spawnX, spawnY, 'pj') || tokenAt(spawnX, spawnY)) {
    outer: for (let sy = 1; sy <= BOARD_H; sy++) {
      for (let sx = 1; sx <= BOARD_W; sx++) {
        if (validCell(sx, sy, 'pj') && !tokenAt(sx, sy)) { spawnX = sx; spawnY = sy; break outer; }
      }
    }
  }
  if (!pj) { pj = { id: 'pj', x: spawnX, y: spawnY, acted: false }; state.tokens.push(pj); }
  pj.name = name; pj.label = name.slice(0, 2).toUpperCase(); pj.type = 'player'; pj.ap = built.ap;
  pj.maxHp = built.pv; pj.hp = Math.min(pj.hp ?? built.pv, built.pv) || built.pv;
  pj.defense = built.ca; pj.attackBonus = built.atk; pj.damage = `1d${built.dmgDie}${sg(built.dmgMod)}`;

  if (!state.inventory.length) {
    state.inventory = [
      { icon: '⚔', name: built.weapon, detail: 'Arma consagrada', qty: 1 },
      { icon: '✚', name: 'Poción de curación', detail: 'Restaura 2d4+2 PV', qty: 2 }
    ];
  }
  $('#creatorModal').classList.add('hidden');
  addLog(`<strong>${esc(name)}</strong> ha entrado en la crónica de las ruinas.`);
  toast('¡Héroe consagrado y listo para la batalla!');
  switchView('characters');
  renderAll();
  saved();
});

// ---- ENTITY FORM (DIRECTOR) ----
$('#entityForm')?.addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#entityName')?.value.trim() || '';
  const label = ($('#entityLabel')?.value.trim() || '').slice(0, 2).toUpperCase();
  const type = $('#entityType')?.value || 'enemy';
  const x = Math.max(1, Math.min(BOARD_W, +($('#entityX')?.value) || 7));
  const y = Math.max(1, Math.min(BOARD_H, +($('#entityY')?.value) || 3));
  const hp = Math.max(1, +($('#entityHp')?.value) || 12);
  const def = Math.max(0, +($('#entityDef')?.value) || 12);
  const atkb = +($('#entityAtk')?.value) || 3;
  const dmg = ($('#entityDmg')?.value || '').trim() || '1d6+1';
  if (!name || !label || blocked.has(key(x, y)) || tokenAt(x, y)) { toast('No se puede colocar en esa baldosa.'); return; }
  snapshot();
  state.tokens.push({ id: `entity-${Date.now()}`, name, label, type, x, y, hp, maxHp: hp, defense: def, attackBonus: atkb, damage: dmg, acted: false });
  addLog(`<strong>${esc(name)}</strong> apareció en [${x},${y}].`);
  renderAll(); e.target.reset(); toast('Entidad manifestada en el tablero.'); saved();
});

// ---- PROPOSALS / NARRATIVE / LOG ----
$('#proposalList')?.addEventListener('click', e => {
  const a = e.target.closest('[data-approve]'), r = e.target.closest('[data-reject]');
  const id = a?.dataset.approve || r?.dataset.reject; if (!id) return;
  const p = state.proposals.find(x => x.id === id);
  state.proposals = state.proposals.filter(x => x.id !== id);
  if (a && p) { state.tags.push({ id: `tag-${Date.now()}`, name: p.tagName, value: p.tagName.toLowerCase().replaceAll(' ', '-'), status: 'confirmed' }); addLog(`<strong>${esc(p.tagName)}</strong> ratificada.`); }
  else if (p) addLog(`<strong>${esc(p.tagName)}</strong> descartada.`);
  renderAll(); saved();
});
$('#narrativeForm')?.addEventListener('submit', e => { e.preventDefault(); const text = $('#narrativeInput')?.value.trim(); if (!text) { toast('Escribe algo antes.'); return; } addLog(`<strong>Relato:</strong> ${esc(text)}`); if ($('#narrativeInput')) $('#narrativeInput').value = ''; toast('Narración inscrita.'); saved(); });
$('#clearLogBtn')?.addEventListener('click', () => { state.log = []; renderLogs(); saved(); });
$('#undoBtn')?.addEventListener('click', () => { const h = state.history.pop(); if (!h) { toast('No hay acciones para revertir.'); return; } Object.assign(state, h); renderAll(); toast('Acción revertida.'); saved(); });
$('#clearTokensBtn')?.addEventListener('click', () => { snapshot(); state.tokens = state.tokens.filter(t => ['pj','goblin','wolf','chest'].includes(t.id)); renderAll(); toast('Criaturas eliminadas.'); saved(); });
$('#exportBtn')?.addEventListener('click', () => { const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'}); const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `cronica-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url); toast('Crónica exportada.'); });
$('#helpBtn')?.addEventListener('click', () => toast('Mueve tu ficha a casillas libres, ataca enemigos adyacentes y concluye tu turno.'));

// ---- LOCAL-FIRST SAVE (no Supabase email required) ----
let saveTimer2;
function programarGuardado() {
  clearTimeout(saveTimer2);
  saveTimer2 = setTimeout(() => {
    persistLocal();
    const st = $('#saveText');
    if (st) { st.textContent = '✓ Guardado'; setTimeout(() => { if (st) st.textContent = 'Guardado en PC'; }, 2000); }
  }, 800);
}

// ===== NEW FEATURES: APPENDED AFTER ORIGINAL HANDLERS =====
// Photo upload, role toggles, dice modal, party menu

// ---- PORTRAIT HELPERS ----
function applyPortraitToPreview(url) {
  const prevImg = document.querySelector('#creatorPreviewImg');
  if (!prevImg) return;
  prevImg.src = url;
  prevImg.style.display = '';
  const placeholder = document.querySelector('#creatorPreviewPlaceholder');
  if (placeholder) placeholder.style.display = 'none';
  if (!draft.ap) draft.ap = { ...DEFAULT_AP };
  draft.ap.customPortrait = url;
}

function loadPortraitFromFile(file) {
  if (!file || !file.type.startsWith('image/')) { toast('Solo se aceptan imágenes (PNG, JPG, WebP).'); return; }
  if (file.size > 8 * 1024 * 1024) { toast('Imagen muy grande (máx. 8 MB).'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    applyPortraitToPreview(ev.target.result);
    toast('✓ Retrato cargado. ¡Perfecto!');
  };
  reader.readAsDataURL(file);
}

// ---- DRAG & DROP + FILE INPUT ----
(function() {
  const dz = document.querySelector('#uploadDropzone');
  const fi = document.querySelector('#portraitFileInput');
  if (!dz || !fi) return;
  dz.addEventListener('click', () => fi.click());
  fi.addEventListener('change', e => { if (e.target.files[0]) loadPortraitFromFile(e.target.files[0]); });
  ['dragover','dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag-over'); }));
  ['dragleave','dragend'].forEach(ev => dz.addEventListener(ev, () => dz.classList.remove('drag-over')));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) loadPortraitFromFile(e.dataTransfer.files[0]);
  });
})();

// ---- URL INPUT ----
(function() {
  const btn = document.querySelector('#applyUrlBtn');
  const inp = document.querySelector('#portraitUrlInput');
  if (!btn || !inp) return;
  btn.addEventListener('click', () => {
    const url = inp.value.trim();
    if (!url || !/^https?:\/\//i.test(url)) { toast('Pega una URL válida (https://...).'); return; }
    applyPortraitToPreview(url);
    inp.value = '';
    toast('Retrato cargado desde URL.');
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); btn.click(); } });
})();

// ---- ROL Y MODO DE JUEGO ----
const appMode = { role: 'player', exp: 'novice' };

function applyRoleMode() {
  const isDM = appMode.role === 'dm';
  const isNovice = appMode.exp === 'novice';
  const dmNav = document.querySelector('#directorNavBtn');
  if (dmNav) dmNav.style.display = isDM ? '' : 'none';
  const helpTxt = document.querySelector('#tableHelpText');
  if (helpTxt) helpTxt.style.display = isNovice ? '' : 'none';
  document.querySelector('#rolePlayerBtn')?.classList.toggle('active', !isDM);
  document.querySelector('#roleDmBtn')?.classList.toggle('active', isDM);
  document.querySelector('#expNoviceBtn')?.classList.toggle('active', isNovice);
  document.querySelector('#expExpertBtn')?.classList.toggle('active', !isNovice);
}

document.querySelector('#rolePlayerBtn')?.addEventListener('click', () => { appMode.role = 'player'; applyRoleMode(); toast('Modo Jugador.'); });
document.querySelector('#roleDmBtn')?.addEventListener('click', () => { appMode.role = 'dm'; applyRoleMode(); toast('Modo Dungeon Master.'); });
document.querySelector('#expNoviceBtn')?.addEventListener('click', () => { appMode.exp = 'novice'; applyRoleMode(); toast('Modo Guiado activado.'); });
document.querySelector('#expExpertBtn')?.addEventListener('click', () => { appMode.exp = 'expert'; applyRoleMode(); toast('Modo Experto activado.'); });

applyRoleMode();

// ---- DADOS MODAL ----
(function() {
  const diceModal = document.querySelector('#diceModal');
  if (!diceModal) return;
  document.querySelector('#openDiceBtn')?.addEventListener('click', () => diceModal.classList.toggle('hidden'));
  document.querySelector('#closeDiceBtn')?.addEventListener('click', () => diceModal.classList.add('hidden'));
  diceModal.addEventListener('click', e => { if (e.target === diceModal) diceModal.classList.add('hidden'); });

  document.querySelectorAll('.dice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sides = +btn.dataset.sides;
      let result;
      if (sides === 100) {
        result = (Math.floor(Math.random() * 10) * 10) + (Math.floor(Math.random() * 10));
        if (result === 0) result = 100;
      } else {
        result = Math.floor(Math.random() * sides) + 1;
      }
      const numEl = document.querySelector('#diceResultNum');
      const descEl = document.querySelector('#diceResultDesc');
      if (numEl) {
        numEl.textContent = result;
        numEl.style.transform = 'scale(1.5)';
        setTimeout(() => { if (numEl) numEl.style.transform = ''; }, 220);
      }
      if (descEl) descEl.textContent = `d${sides === 100 ? '%' : sides} → ${result}`;
      addLog(`🎲 d${sides === 100 ? '100' : sides}: <strong>${result}</strong>`);
      saved();
    });
  });
})();

// ---- PARTY MENU (OPCIONES) ----
(function() {
  const partyBtn = document.querySelector('#partyMenuBtn');
  if (!partyBtn) return;
  partyBtn.addEventListener('click', () => {
    if (document.querySelector('#_pm_menu')) { document.querySelector('#_pm_menu').remove(); return; }
    const menu = document.createElement('div');
    menu.id = '_pm_menu';
    menu.style.cssText = 'position:fixed;top:70px;right:20px;z-index:500;background:var(--panel-bg);border:2px solid var(--panel-border);border-radius:12px;padding:12px;min-width:230px;box-shadow:0 16px 48px rgba(0,0,0,.9);display:grid;gap:8px';
    menu.innerHTML = `
      <strong style="font-family:var(--font-dnd);font-size:.78rem;color:var(--gold-bright);padding-bottom:8px;border-bottom:1px solid var(--panel-border)">⚙️ Opciones de Partida</strong>
      <button class="btn ghost full" id="_pm_export">⇩ Exportar partida (JSON)</button>
      <label class="btn ghost full" style="cursor:pointer;text-align:center;margin:0">⇧ Cargar partida (JSON)<input type="file" accept=".json" id="_pm_import" style="display:none"></label>
      <hr style="border:0;border-top:1px solid var(--panel-border);margin:0">
      <button class="btn danger full" id="_pm_restart">⚠ Reiniciar aventura</button>
      <button class="btn ghost full" id="_pm_close" style="font-size:.74rem;color:var(--text-muted)">Cerrar</button>
    `;
    document.body.appendChild(menu);
    menu.querySelector('#_pm_export').onclick = () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `cronica-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url); toast('Crónica exportada.'); menu.remove();
    };
    menu.querySelector('#_pm_import').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r2 = new FileReader();
      r2.onload = ev => {
        try { const loaded = JSON.parse(ev.target.result); if (!loaded.tokens) throw 0; Object.assign(state, loaded); renderAll(); toast('¡Partida cargada!'); saved(); }
        catch { toast('Archivo inválido.'); }
      };
      r2.readAsText(f); menu.remove();
    };
    menu.querySelector('#_pm_restart').onclick = () => {
      if (confirm('⚠ ¿Reiniciar toda la aventura? El progreso se perderá.')) {
        state = clone(defaultState); localStorage.removeItem('manitasRpgState'); renderAll(); openCreatorModal(); toast('Nueva aventura iniciada.');
      }
      menu.remove();
    };
    menu.querySelector('#_pm_close').onclick = () => menu.remove();
    setTimeout(() => document.addEventListener('click', function oc(ev) {
      if (!menu.contains(ev.target) && ev.target !== partyBtn) { menu.remove(); document.removeEventListener('click', oc); }
    }), 80);
  });
})();

// ---- REINICIAR desde panel Director ----
document.querySelector('#restartGameBtn')?.addEventListener('click', () => {
  if (confirm('⚠ ¿Reiniciar la aventura completa?')) {
    state = clone(defaultState); localStorage.removeItem('manitasRpgState'); renderAll(); openCreatorModal(); toast('Nueva aventura iniciada.');
  }
});

// ---- EDITAR HÉROE ----
document.querySelector('#editHeroBtn')?.addEventListener('click', () => {
  if (state.chMeta) {
    draft = { cl: state.chMeta.cl, sp: state.chMeta.sp, bg: state.chMeta.bg, nm: state.chMeta.nm, ap: { ...state.chMeta.ap } };
    const nameEl = document.querySelector('#newName'); if (nameEl) nameEl.value = draft.nm;
    const spEl = document.querySelector('#newSpecies'); if (spEl) spEl.value = draft.sp;
    const bgEl = document.querySelector('#newBackground'); if (bgEl) bgEl.value = draft.bg;
    const clRadio = document.querySelector(`input[name="presetClass"][value="${draft.cl}"]`); if (clRadio) clRadio.checked = true;
    if (draft.ap.customPortrait) applyPortraitToPreview(draft.ap.customPortrait);
  }
  openCreatorModal();
});

// ---- OPEN/CLOSE CREATOR MODAL (safe, no duplicate listener) ----
function openCreatorModal() {
  const m = document.querySelector('#creatorModal');
  if (!m) return;
  m.classList.remove('hidden');
}

document.querySelector('#openCreatorBtn')?.addEventListener('click', openCreatorModal);
document.querySelector('#closeCreatorBtn')?.addEventListener('click', () => document.querySelector('#creatorModal')?.classList.add('hidden'));
document.querySelector('#cancelCreatorBtn')?.addEventListener('click', () => document.querySelector('#creatorModal')?.classList.add('hidden'));
document.querySelector('#creatorModal')?.addEventListener('click', e => { if (e.target.id === 'creatorModal') e.target.classList.add('hidden'); });
document.querySelector('#newSpecies')?.addEventListener('change', e => { draft.sp = e.target.value; });
document.querySelector('#newBackground')?.addEventListener('change', e => { draft.bg = e.target.value; });

// ---- SAVE INDICATOR ----
const _origSaved = typeof saved === 'function' ? saved : () => {};
function saved() {
  persistLocal();
  programarGuardado();
}

// Kickoff
renderAll();
if (!state.chMeta) openCreatorModal();
