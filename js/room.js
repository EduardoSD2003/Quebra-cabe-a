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

  const image = new Image();
  image.src = room.image;
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });

  const table = document.getElementById('table');
  const tableScroll = document.getElementById('tableScroll');

  const boardW = room.board_w, boardH = room.board_h;
  // área lógica onde as peças ficam espalhadas (fixa pra todo mundo, garante
  // que a sincronização de posição faça sentido em qualquer tamanho de tela)
  const tableW = Math.max(boardW * 1.7, boardW + 380);
  const tableH = Math.max(boardH * 1.6, boardH + 280);
  table.style.width = tableW + 'px';
  table.style.height = tableH + 'px';

  let suppressEmit = false;

  const puzzle = new Puzzle({
    image, rows: room.rows, cols: room.cols,
    boardW, boardH, seed: room.seed,
    tableEl: table,
    onPieceMoved: (pieces, dragging) => {
      if (suppressEmit) return;
      sync.broadcastMove(pieces, dragging);
      updateProgress();
    },
    onComplete: () => showWinBanner(),
  });

  // escala a mesa inteira (via CSS) pra caber na tela sem precisar rolar,
  // não importa quantas peças o quebra-cabeça tenha
  function fitToScreen() {
    const availW = tableScroll.clientWidth;
    const availH = tableScroll.clientHeight;
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
    for (const p of pieces) puzzle.applyRemote(p.id, p.x, p.y, p.groupId);
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

  function updateProgress() {
    const total = puzzle.pieces.size;
    const biggest = puzzle.largestGroupSize();
    document.getElementById('progressText').textContent =
      biggest >= total ? `Quebra-cabeça completo!` : `Maior grupo encaixado: ${biggest} / ${total} peças`;
  }

  function showWinBanner() {
    if (document.getElementById('winBanner')) return;
    const div = document.createElement('div');
    div.className = 'win-banner';
    div.id = 'winBanner';
    div.innerHTML = `<div class="box"><h2>🎉 Quebra-cabeça completo!</h2><p>Vocês montaram tudo. Bom trabalho em equipe!</p><button onclick="document.getElementById('winBanner').remove()">Fechar</button></div>`;
    document.body.appendChild(div);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
}

document.addEventListener('DOMContentLoaded', initRoom);
