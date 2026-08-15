// Lógica da tela inicial: upload de imagem, criação e entrada em sala.

// Maior que antes pra dar detalhe suficiente por peça nos quebra-cabeças com
// muitas peças (até 1500) — ainda gera um arquivo leve o bastante pro plano
// gratuito do Supabase.
const MAX_IMG_DIM = 1800;

let selectedImageDataUrl = null;

function initSetupWarning() {
  if (isSupabaseConfigured()) return;
  const box = document.getElementById('setupWarning');
  box.innerHTML = `<div class="setup-warning">
    ⚠️ O site ainda não foi configurado. Abra <code>js/config.js</code> e cole a URL e a chave
    do seu projeto Supabase (gratuito). Veja o <code>README.md</code> para o passo a passo.
  </div>`;
}

function resizeImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { naturalWidth: w, naturalHeight: h } = img;
        const scale = Math.min(1, MAX_IMG_DIM / Math.max(w, h));
        w = Math.round(w * scale);
        h = Math.round(h * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.85), width: w, height: h });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function setupLobby() {
  initSetupWarning();

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const previewImg = document.getElementById('previewImg');
  const dropzoneContent = document.getElementById('dropzoneContent');
  const createBtn = document.getElementById('createBtn');
  let pendingImage = null;

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  async function handleFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecione um arquivo de imagem.');
      return;
    }
    createBtn.disabled = true;
    createBtn.textContent = 'Processando imagem…';
    try {
      pendingImage = await resizeImageToDataUrl(file);
      previewImg.src = pendingImage.dataUrl;
      previewImg.style.display = 'block';
      dropzoneContent.style.display = 'none';
      createBtn.disabled = false;
    } catch (err) {
      alert('Não foi possível carregar essa imagem.');
    } finally {
      createBtn.textContent = 'Criar sala e obter link';
    }
  }

  createBtn.addEventListener('click', async () => {
    if (!pendingImage) return;
    if (!isSupabaseConfigured()) {
      alert('Configure o js/config.js antes de criar uma sala (veja o README.md).');
      return;
    }
    createBtn.disabled = true;
    createBtn.textContent = 'Criando sala…';

    const [cols, rows] = document.getElementById('difficulty').value.split('x').map(Number);
    const name = document.getElementById('playerName1').value.trim() || 'Jogador 1';
    const roomId = randomRoomId();
    const seed = Math.floor(Math.random() * 2 ** 31);

    // define o tamanho do tabuleiro na tela mantendo a proporção da imagem
    const maxBoardW = 1000, maxBoardH = 700;
    let boardW = pendingImage.width, boardH = pendingImage.height;
    const scale = Math.min(1, maxBoardW / boardW, maxBoardH / boardH);
    boardW = Math.round(boardW * scale);
    boardH = Math.round(boardH * scale);

    const sync = new RoomSync(roomId, name);
    try {
      await sync.createRoom({ image: pendingImage.dataUrl, rows, cols, boardW, boardH, seed });
    } catch (err) {
      console.error(err);
      alert('Erro ao criar a sala. Verifique se o js/config.js está correto e se o SQL do README foi executado no Supabase.');
      createBtn.disabled = false;
      createBtn.textContent = 'Criar sala e obter link';
      return;
    }

    sessionStorage.setItem('playerName', name);
    location.href = `room.html?room=${roomId}`;
  });

  document.getElementById('joinBtn').addEventListener('click', doJoin);
  document.getElementById('joinCode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doJoin();
  });

  function doJoin() {
    const raw = document.getElementById('joinCode').value.trim();
    if (!raw) return;
    const name = document.getElementById('playerName2').value.trim() || 'Jogador 2';
    let code = raw;
    try {
      if (raw.includes('room.html')) {
        const url = new URL(raw, location.href);
        code = url.searchParams.get('room') || raw;
      }
    } catch (e) { /* usa raw mesmo */ }
    sessionStorage.setItem('playerName', name);
    location.href = `room.html?room=${encodeURIComponent(code)}`;
  }
}

document.addEventListener('DOMContentLoaded', setupLobby);
