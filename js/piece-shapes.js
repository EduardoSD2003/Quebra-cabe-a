// Gera o formato (bordas com "orelhas") de cada peça do quebra-cabeça.
// Cada aresta interna do grid recebe aleatoriamente um sentido (para fora / para dentro),
// compartilhado pelas duas peças vizinhas, para que elas se encaixem perfeitamente.

function createEdgeMatrices(rows, cols, seed) {
  const rand = mulberry32(seed);

  // horizontal[r][c] = aresta vertical entre a peça (r,c) e (r,c+1) -> cols-1 colunas
  const horizontal = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols - 1; c++) {
      row.push(rand() > 0.5 ? 1 : -1);
    }
    horizontal.push(row);
  }

  // vertical[r][c] = aresta horizontal entre a peça (r,c) e (r+1,c) -> rows-1 linhas
  const vertical = [];
  for (let r = 0; r < rows - 1; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push(rand() > 0.5 ? 1 : -1);
    }
    vertical.push(row);
  }

  // jitter sutil por aresta, pra peças não ficarem todas idênticas
  const jitterH = horizontal.map(row => row.map(() => (rand() - 0.5) * 0.06));
  const jitterV = vertical.map(row => row.map(() => (rand() - 0.5) * 0.06));

  return { horizontal, vertical, jitterH, jitterV };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Retorna os 4 tabs (top, right, bottom, left) de uma peça: 0 = reto (borda do quebra-cabeça)
function getPieceTabs(edges, rows, cols, r, c) {
  const top = r === 0 ? 0 : -edges.vertical[r - 1][c];
  const bottom = r === rows - 1 ? 0 : edges.vertical[r][c];
  const left = c === 0 ? 0 : -edges.horizontal[r][c - 1];
  const right = c === cols - 1 ? 0 : edges.horizontal[r][c];
  const jTop = r === 0 ? 0 : edges.jitterV[r - 1][c];
  const jBottom = r === rows - 1 ? 0 : edges.jitterV[r][c];
  const jLeft = c === 0 ? 0 : edges.jitterH[r][c - 1];
  const jRight = c === cols - 1 ? 0 : edges.jitterH[r][c];
  return { top, right, bottom, left, jTop, jRight, jBottom, jLeft };
}

// Desenha uma aresta (com ou sem "orelha") de (x1,y1) até (x2,y2) dentro do path
function addEdge(path, x1, y1, x2, y2, tab, jitter) {
  if (tab === 0) {
    path.push(`L ${x2} ${y2}`);
    return;
  }
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const nx = -uy * tab, ny = ux * tab;

  const pt = (t, o) => {
    const tt = t;
    const px = x1 + ux * len * tt + nx * len * o;
    const py = y1 + uy * len * tt + ny * len * o;
    return `${px.toFixed(2)} ${py.toFixed(2)}`;
  };

  const t1 = 0.30 + jitter, t2 = 0.70 + jitter;
  const head = 0.26;

  const A = pt(t1, 0);
  const B1 = pt(t1 + 0.08, 0.06);
  const B2 = pt(0.42, head);
  const P1 = pt(0.5, head);
  const B3 = pt(0.58, head);
  const B4 = pt(t2 - 0.08, 0.06);
  const A2 = pt(t2, 0);

  path.push(`L ${A}`);
  path.push(`C ${B1}, ${B2}, ${P1}`);
  path.push(`C ${B3}, ${B4}, ${A2}`);
  path.push(`L ${x2} ${y2}`);
}

// Monta o path SVG completo (em coordenadas locais, com padding) de uma peça
function buildPiecePath(pieceW, pieceH, pad, tabs) {
  const x0 = pad, y0 = pad, x1 = pad + pieceW, y1 = pad + pieceH;
  const path = [`M ${x0} ${y0}`];
  addEdge(path, x0, y0, x1, y0, tabs.top, tabs.jTop);
  addEdge(path, x1, y0, x1, y1, tabs.right, tabs.jRight);
  addEdge(path, x1, y1, x0, y1, -tabs.bottom, -tabs.jBottom);
  addEdge(path, x0, y1, x0, y0, -tabs.left, -tabs.jLeft);
  path.push('Z');
  return path.join(' ');
}
