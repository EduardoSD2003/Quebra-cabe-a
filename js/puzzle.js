// Motor do quebra-cabeça: gera as peças a partir de uma imagem, desenha, arrasta e encaixa
// SOMENTE peça com peça (não existe um "tabuleiro alvo" fixo).

class Puzzle {
  /**
   * @param {Object} opts
   * @param {HTMLImageElement} opts.image
   * @param {number} opts.rows
   * @param {number} opts.cols
   * @param {number} opts.boardW - largura de referência (define o tamanho das peças) em px lógicos
   * @param {number} opts.boardH
   * @param {number} opts.seed
   * @param {HTMLElement} opts.tableEl - container onde tudo é desenhado (pode estar escalado via CSS)
   * @param {Function} opts.onPieceMoved - (piecesPayload, dragging) => void
   * @param {Function} opts.onComplete - () => void
   */
  constructor(opts) {
    Object.assign(this, opts);
    this.pieceW = this.boardW / this.cols;
    this.pieceH = this.boardH / this.rows;
    this.pad = Math.max(this.pieceW, this.pieceH) * 0.55;
    this.canvasW = this.pieceW + this.pad * 2;
    this.canvasH = this.pieceH + this.pad * 2;
    this.snapTolerance = Math.min(this.pieceW, this.pieceH) * 0.32;
    this.scale = 1; // fator de escala visual aplicado via CSS no tableEl (não afeta coordenadas lógicas)

    this.pieces = new Map(); // id -> peça
    this.groups = new Map(); // groupId -> Set(pieceId)
    this.pieceGroup = new Map(); // pieceId -> groupId
    this.zTop = 10;

    this._buildEdges();
    this._buildDom();
    this._attachGlobalDrag();
  }

  _buildEdges() {
    this.edges = createEdgeMatrices(this.rows, this.cols, this.seed);
  }

  static idOf(r, c) { return `${r}_${c}`; }

  setScale(scale) {
    this.scale = scale;
  }

  _buildDom() {
    for (const el of [...this.tableEl.querySelectorAll('.piece')]) el.remove();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this._createPiece(r, c);
      }
    }
  }

  _createPiece(r, c) {
    const id = Puzzle.idOf(r, c);
    const tabs = getPieceTabs(this.edges, this.rows, this.cols, r, c);
    const pathD = buildPiecePath(this.pieceW, this.pieceH, this.pad, tabs);

    const canvas = document.createElement('canvas');
    canvas.className = 'piece';
    canvas.width = this.canvasW;
    canvas.height = this.canvasH;
    canvas.style.width = this.canvasW + 'px';
    canvas.style.height = this.canvasH + 'px';
    canvas.dataset.id = id;

    const ctx = canvas.getContext('2d');
    const path2d = new Path2D(pathD);

    ctx.save();
    ctx.clip(path2d);
    const sx = c * this.pieceW - this.pad;
    const sy = r * this.pieceH - this.pad;
    ctx.drawImage(
      this.image,
      (sx / this.boardW) * this.image.naturalWidth,
      (sy / this.boardH) * this.image.naturalHeight,
      (this.canvasW / this.boardW) * this.image.naturalWidth,
      (this.canvasH / this.boardH) * this.image.naturalHeight,
      0, 0, this.canvasW, this.canvasH
    );
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke(path2d);
    ctx.restore();

    canvas.style.zIndex = this.zTop++;
    this.tableEl.appendChild(canvas);

    const piece = { id, r, c, el: canvas, path2d, ctx, x: 0, y: 0 };
    this.pieces.set(id, piece);
    this.groups.set(id, new Set([id]));
    this.pieceGroup.set(id, id);
  }

  /** Espalha as peças aleatoriamente dentro da área lógica do tableEl. */
  scatter() {
    const tableW = this.tableEl.clientWidth || this.boardW * 1.6;
    const tableH = this.tableEl.clientHeight || this.boardH * 1.5;
    for (const piece of this.pieces.values()) {
      const x = Math.random() * Math.max(0, tableW - this.canvasW);
      const y = Math.random() * Math.max(0, tableH - this.canvasH);
      this._setPiecePos(piece, x, y);
    }
  }

  _setPiecePos(piece, x, y) {
    piece.x = x;
    piece.y = y;
    piece.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  /** Aplica posição vinda da rede sem re-emitir evento local */
  applyRemote(id, x, y, groupId) {
    const piece = this.pieces.get(id);
    if (!piece) return;
    this._setPiecePos(piece, x, y);
    if (groupId && this.pieceGroup.get(id) !== groupId) {
      this._forceGroup(id, groupId);
    }
    this._checkComplete();
  }

  _forceGroup(id, groupId) {
    const old = this.pieceGroup.get(id);
    this.groups.get(old)?.delete(id);
    if (this.groups.get(old)?.size === 0) this.groups.delete(old);
    this.pieceGroup.set(id, groupId);
    if (!this.groups.has(groupId)) this.groups.set(groupId, new Set());
    this.groups.get(groupId).add(id);
  }

  // Encontra a peça "de cima pra baixo" (por z-index) cujo formato real
  // (não o retângulo do canvas) contém o ponto — assim cliques na área
  // transparente ao redor da peça, ou em cima de outra peça, não a arrastam.
  _hitTest(px, py) {
    const candidates = [...this.pieces.values()]
      .sort((a, b) => (parseInt(b.el.style.zIndex) || 0) - (parseInt(a.el.style.zIndex) || 0));
    for (const p of candidates) {
      const localX = px - p.x;
      const localY = py - p.y;
      if (localX < 0 || localY < 0 || localX > this.canvasW || localY > this.canvasH) continue;
      if (p.ctx.isPointInPath(p.path2d, localX, localY)) return p;
    }
    return null;
  }

  _attachGlobalDrag() {
    let dragging = false;
    let activeId = null;
    let pointerId = null;
    let startX, startY, origins;

    // converte coordenadas de tela (px reais) pra coordenadas lógicas do tabuleiro,
    // desfazendo a escala visual aplicada via CSS transform no tableEl
    const tableXY = (ev) => {
      const rect = this.tableEl.getBoundingClientRect();
      return { x: (ev.clientX - rect.left) / this.scale, y: (ev.clientY - rect.top) / this.scale };
    };

    this.tableEl.addEventListener('pointerdown', (ev) => {
      const { x, y } = tableXY(ev);
      const hit = this._hitTest(x, y);
      if (!hit) return;
      ev.preventDefault();
      dragging = true;
      activeId = hit.id;
      pointerId = ev.pointerId;
      this.tableEl.setPointerCapture(pointerId);
      this.tableEl.style.cursor = 'grabbing';
      startX = ev.clientX;
      startY = ev.clientY;
      const groupId = this.pieceGroup.get(hit.id);
      const members = [...this.groups.get(groupId)];
      origins = members.map(mid => {
        const p = this.pieces.get(mid);
        return { id: mid, x: p.x, y: p.y };
      });
      this.zTop += 1;
      for (const m of members) this.pieces.get(m).el.style.zIndex = this.zTop;
    });

    this.tableEl.addEventListener('pointermove', (ev) => {
      if (!dragging) {
        const { x, y } = tableXY(ev);
        this.tableEl.style.cursor = this._hitTest(x, y) ? 'grab' : 'default';
        return;
      }
      const dx = (ev.clientX - startX) / this.scale;
      const dy = (ev.clientY - startY) / this.scale;
      for (const o of origins) {
        const p = this.pieces.get(o.id);
        this._setPiecePos(p, o.x + dx, o.y + dy);
      }
      this._emitMove(this.pieces.get(activeId), true);
    });

    const endDrag = (ev) => {
      if (!dragging) return;
      dragging = false;
      this.tableEl.style.cursor = 'default';
      try { this.tableEl.releasePointerCapture(pointerId); } catch (e) {}
      const piece = this.pieces.get(activeId);
      this._trySnap(piece);
      this._emitMove(piece, false);
      activeId = null;
    };

    this.tableEl.addEventListener('pointerup', endDrag);
    this.tableEl.addEventListener('pointercancel', endDrag);
  }

  _emitMove(piece, dragging) {
    if (!this.onPieceMoved) return;
    const groupId = this.pieceGroup.get(piece.id);
    const members = [...this.groups.get(groupId)];
    const payload = members.map(mid => {
      const p = this.pieces.get(mid);
      return { id: mid, x: p.x, y: p.y, groupId };
    });
    this.onPieceMoved(payload, dragging);
  }

  _emitGroup(groupId) {
    if (!this.onPieceMoved) return;
    const members = [...this.groups.get(groupId)];
    const payload = members.map(mid => {
      const p = this.pieces.get(mid);
      return { id: mid, x: p.x, y: p.y, groupId };
    });
    this.onPieceMoved(payload, false);
  }

  /** Tenta encaixar o grupo da peça arrastada com alguma peça vizinha solta. */
  _trySnap(piece) {
    const groupId = this.pieceGroup.get(piece.id);
    const members = [...this.groups.get(groupId)];
    for (const mid of members) {
      const p = this.pieces.get(mid);
      const neighbors = this._gridNeighbors(p.r, p.c);
      for (const n of neighbors) {
        const np = this.pieces.get(n.id);
        const otherGroup = this.pieceGroup.get(n.id);
        if (otherGroup === groupId) continue;
        const expectedX = np.x - (n.dc * this.pieceW);
        const expectedY = np.y - (n.dr * this.pieceH);
        const dist = Math.hypot(expectedX - p.x, expectedY - p.y);
        if (dist < this.snapTolerance) {
          const shiftX = expectedX - p.x;
          const shiftY = expectedY - p.y;
          for (const gm of members) {
            const gp = this.pieces.get(gm);
            this._setPiecePos(gp, gp.x + shiftX, gp.y + shiftY);
          }
          const mergedGroup = this._mergeGroups(groupId, otherGroup);
          this._checkComplete();
          this._emitGroup(mergedGroup);
          return;
        }
      }
    }
  }

  _gridNeighbors(r, c) {
    const list = [];
    if (r > 0) list.push({ id: Puzzle.idOf(r - 1, c), dr: -1, dc: 0 });
    if (r < this.rows - 1) list.push({ id: Puzzle.idOf(r + 1, c), dr: 1, dc: 0 });
    if (c > 0) list.push({ id: Puzzle.idOf(r, c - 1), dr: 0, dc: -1 });
    if (c < this.cols - 1) list.push({ id: Puzzle.idOf(r, c + 1), dr: 0, dc: 1 });
    return list;
  }

  _mergeGroups(gA, gB) {
    const setA = this.groups.get(gA);
    const setB = this.groups.get(gB);
    const [big, small] = setA.size >= setB.size ? [gA, gB] : [gB, gA];
    for (const id of this.groups.get(small)) {
      this.groups.get(big).add(id);
      this.pieceGroup.set(id, big);
    }
    this.groups.delete(small);
    return big;
  }

  /** Quantas peças tem no maior grupo já conectado — usado como indicador de progresso. */
  largestGroupSize() {
    let max = 0;
    for (const set of this.groups.values()) max = Math.max(max, set.size);
    return max;
  }

  _checkComplete() {
    if (this.groups.size === 1 && this.onComplete) this.onComplete();
  }

  serializeState() {
    return [...this.pieces.values()].map(p => ({
      id: p.id, x: p.x, y: p.y, groupId: this.pieceGroup.get(p.id)
    }));
  }

  loadState(list) {
    for (const item of list) {
      this.applyRemote(item.id, item.x, item.y, item.groupId);
    }
  }
}
