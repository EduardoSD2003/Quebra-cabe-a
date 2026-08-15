// Lógica da sala de jogo: carrega o estado, monta o Puzzle e liga a sincronização.

async function initRoom() {
  const params = new URLSearchParams(location.search);
  const roomId = params.get('room');
  const overlay = document.getElementById('loadingOverlay');

  if (!roomId) {
    location.href = 'index.html';
    return;
  }

  if (!isSupabaseConfigured()) {
    overlay.innerHTML = `Configure o <code>js/config.js</code> com os dados do seu Supabase (veja o README.md) antes de jogar.`;
    return;
  }

  const playerName = sessionStorage.getItem('playerName') || 'Jogador';
  const sync = new RoomSync(roomId, playerName);

  let room;
  try {
    room = await sync.fetchRoom();
  } catch (err) {
    overlay.innerHTML = 'Sala não encontrada. Confira o link com quem te convidou.';
    return;
  }

  document.getElementById('shareLink').textContent = location.href;
  document.getElementById('copyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(location.href);
    document.getElementById('copyBtn').textContent = 'Copiado!';
    setTimeout(() => document.getElementById('copyBtn').textContent = 'Copiar', 1500);
  });

  try {
    await setupGame(room, sync, overlay);
  } catch (err) {
    console.error(err);
    overlay.style.display = 'flex';
    overlay.textContent = 'Não foi possível carregar o quebra-cabeça. Tente recarregar a página (Ctrl+Shift+R).';
  }
}

async function setupGame(room, sync, overlay) {
  const image = new Image();
  image.src = room.image;
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });

  const table = document.getElementById('table');
  const tableScroll = document.getElementById('tableScroll');

  const boardW = room.board_w, boardH = room.board_h;
  // área lógica onde as peças ficam espalhadas. O tamanho mínimo é definido
  // pelo tabuleiro (+ uma margem pra ter onde espalhar peças), mas o lado que
  // sobrar é esticado pra bater com a proporção da tela de quem abriu a sala —
  // assim a área de arrastar usa 100% do espaço visível, sem sobrar faixa
  // cinza vazia dos lados ou embaixo.
  const minTableW = boardW + 380;
  const minTableH = boardH + 280;
  const viewportAspect = (tableScroll.clientWidth || 4) / (tableScroll.clientHeight || 3);
  let tableW, tableH;
  if (minTableW / minTableH > viewportAspect) {
    tableW = minTableW;
    tableH = minTableW / viewportAspect;
  } else {
    tableH = minTableH;
    tableW = minTableH * viewportAspect;
  }
  table.style.width = tableW + 'px';
  table.style.height = tableH + 'px';

  let suppressEmit = false;

  const puzzle = new Puzzle({
    image, rows: room.rows, cols: room.cols,
    boardW, boardH, seed: room.seed,
    tableEl: table,
    onPieceMoved: (pieces, dragging) => {
      if (suppressEmit) return;
      startTimerIfNeeded();
      sync.broadcastMove(pieces, dragging);
      updateProgress();
    },
    onComplete: () => { stopTimer(); showWinBanner(); },
  });

  // escala a mesa inteira (via CSS) pra caber na tela sem precisar rolar,
  // não importa quantas peças o quebra-cabeça tenha
  function fitToScreen() {
    const availW = tableScroll.clientWidth;
    const availH = tableScroll.clientHeight;
    // se a área ainda não tem tamanho (layout não assentou / aba em segundo
    // plano), não aplica escala 0 — tenta de novo no próximo quadro
    if (availW < 10 || availH < 10) {
      requestAnimationFrame(fitToScreen);
      return;
    }
    const scale = Math.min(availW / tableW, availH / tableH);
    table.style.transform = `scale(${scale})`;
    table.style.transformOrigin = 'top left';
    // centraliza a mesa escalada dentro da área visível
    const scaledW = tableW * scale, scaledH = tableH * scale;
    table.style.marginLeft = Math.max(0, (availW - scaledW) / 2) + 'px';
    table.style.marginTop = Math.max(0, (availH - scaledH) / 2) + 'px';
    puzzle.setScale(scale);
  }
  fitToScreen();
  requestAnimationFrame(fitToScreen); // reaplica depois do primeiro layout completo (fontes/imagens)
  window.addEventListener('resize', fitToScreen);

  // carrega estado salvo ou espalha as peças pela primeira vez
  if (room.pieces && room.pieces.length > 0) {
    suppressEmit = true;
    puzzle.loadState(room.pieces);
    suppressEmit = false;
  } else {
    puzzle.scatter();
    suppressEmit = true;
    sync.broadcastMove(puzzle.serializeState(), false);
    suppressEmit = false;
  }

  updateProgress();
  overlay.style.display = 'none';

  sync.onPeerMove = (pieces) => {
    suppressEmit = true;
    for (const p of pieces) puzzle.applyRemote(p.id, p.x, p.y);
    puzzle._recomputeGroups();
    suppressEmit = false;
    updateProgress();
  };

  const cursorsBox = document.createElement('div');
  table.appendChild(cursorsBox);
  const remoteCursors = new Map();

  sync.onPeerCursor = ({ x, y, name, color }) => {
    let el = remoteCursors.get(name);
    if (!el) {
      el = document.createElement('div');
      el.className = 'remote-cursor';
      el.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20"><path d="M1 1 L1 16 L6 12 L9 18 L12 16 L9 10 L15 10 Z" fill="${color}" stroke="#fff" stroke-width="1"/></svg><span class="tag" style="background:${color}">${escapeHtml(name)}</span>`;
      cursorsBox.appendChild(el);
      remoteCursors.set(name, el);
    }
    el.style.transform = `translate(${x}px, ${y}px)`;
  };

  sync.onPresence = (state) => {
    const box = document.getElementById('playersBox');
    const entries = Object.values(state).flat();
    box.innerHTML = entries.map(p =>
      `<span class="player-chip"><span class="player-dot" style="background:${p.color}"></span>${escapeHtml(p.name)}</span>`
    ).join('');
  };

  await sync.connect();

  tableScroll.addEventListener('pointermove', (e) => {
    const rect = table.getBoundingClientRect();
    sync.broadcastCursor((e.clientX - rect.left) / puzzle.scale, (e.clientY - rect.top) / puzzle.scale);
  });

  // ===== imagem-fantasma de referência =====
  const ghostImage = document.getElementById('ghostImage');
  const ghostToggle = document.getElementById('ghostToggle');
  ghostImage.src = room.image;
  ghostToggle.addEventListener('click', () => {
    const visible = ghostImage.classList.toggle('visible');
    ghostToggle.setAttribute('aria-pressed', visible ? 'true' : 'false');
  });

  // ===== cronômetro pessoal =====
  let startTime = null;
  let timerInterval = null;
  let finished = false;

  function startTimerIfNeeded() {
    if (startTime || finished) return;
    startTime = Date.now();
    updateTimerDisplay();
    timerInterval = setInterval(updateTimerDisplay, 1000);
  }

  function updateTimerDisplay() {
    if (!startTime) return;
    document.getElementById('timerText').textContent = formatTime(Date.now() - startTime);
  }

  function stopTimer() {
    finished = true;
    updateTimerDisplay();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }

  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function updateProgress() {
    const total = puzzle.pieces.size;
    const biggest = puzzle.largestGroupSize();
    const percent = total > 1 ? Math.round(((biggest - 1) / (total - 1)) * 100) : 100;
    document.getElementById('percentText').textContent = `${percent}%`;
  }

  function showWinBanner() {
    if (document.getElementById('winBanner')) return;
    const div = document.createElement('div');
    div.className = 'win-banner';
    div.id = 'winBanner';
    const time = document.getElementById('timerText').textContent;
    div.innerHTML = `<div class="box"><h2>🎉 Quebra-cabeça completo!</h2><p>Vocês montaram tudo em ${time}. Bom trabalho em equipe!</p><button onclick="document.getElementById('winBanner').remove()">Fechar</button></div>`;
    document.body.appendChild(div);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
}

document.addEventListener('DOMContentLoaded', initRoom);
