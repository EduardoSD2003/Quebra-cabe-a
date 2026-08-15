// Motor do quebra-cabeça: gera as peças a partir de uma imagem, desenha, arrasta e encaixa
// SOMENTE peça com peça (não existe um "tabuleiro alvo" fixo).
//
// Importante: quais peças estão "conectadas" (e por isso se movem juntas) NUNCA é
// sincronizado pela rede como um dado à parte — é sempre recalculado a partir das
// posições x/y atuais de cada peça (que são sincronizadas de forma simples e
// confiável). Isso garante que dois jogadores nunca "discordem" sobre quais peças
// estão encaixadas, mesmo arrastando peças ao mesmo tempo.

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
    this.groups = new Map(); // groupId -> Set(pieceId) — sempre recalculado, nunca sincronizado
    this.pieceGroup = new Map(); // pieceId -> groupId
    this.selected = new Set(); // seleção por retângulo (só local, não sincroniza)
    this.zTop = 10;

    this._buildEdges();
    this._buildDom();
    this._recomputeGroups();
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

  _tableBounds() {
    return {
      w: this.tableEl.clientWidth || this.boardW * 1.6,
      h: this.tableEl.clientHeight || this.boardH * 1.5,
    };
  }

  /** Aplica posição vinda da rede sem re-emitir evento local. */
  applyRemote(id, x, y) {
    const piece = this.pieces.get(id);
    if (!piece) return;
    this._setPiecePos(piece, x, y);
  }

  /**
   * Recalcula do zero quais peças estão conectadas, olhando só as posições
   * atuais e comparando cada peça com seus vizinhos de grade. Determinístico:
   * sempre dá o mesmo resultado em qualquer cliente que tenha as mesmas
   * posições, então nunca diverge entre jogadores.
   */
  _recomputeGroups() {
    this.groups = new Map();
    this.pieceGroup = new Map();
    for (const id of this.pieces.keys()) {
      this.groups.set(id, new Set([id]));
      this.pieceGroup.set(id, id);
    }
    for (const piece of this.pieces.values()) {
      for (const n of this._gridNeighbors(piece.r, piece.c)) {
        const np = this.pieces.get(n.id);
        const expectedX = np.x - n.dc * this.pieceW;
        const expectedY = np.y - n.dr * this.pieceH;
        if (Math.hypot(expectedX - piece.x, expectedY - piece.y) < this.snapTolerance) {
          const gA = this.pieceGroup.get(piece.id);
          const gB = this.pieceGroup.get(n.id);
          if (gA !== gB) this._mergeGroups(gA, gB);
        }
      }
    }
    this._checkComplete();
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

  _clearSelection() {
    for (const id of this.selected) {
      const p = this.pieces.get(id);
      if (p) p.el.classList.remove('selected');
    }
    this.selected.clear();
  }

  /** Une o conjunto de peças selecionadas com quem estiver encaixado em cada uma delas. */
  _expandWithGroups(idSet) {
    const result = new Set();
    for (const id of idSet) {
      const gid = this.pieceGroup.get(id);
      const grp = this.groups.get(gid);
      if (grp) for (const mid of grp) result.add(mid);
      else result.add(id);
    }
    return [...result];
  }

  _attachGlobalDrag() {
    let dragging = false;
    let selecting = false;
    let activeId = null;
    let pointerId = null;
    let startX, startY, origins;
    let selStartX, selStartY, selectionBoxEl;

    // converte coordenadas de tela (px reais) pra coordenadas lógicas do tabuleiro,
    // desfazendo a escala visual aplicada via CSS transform no tableEl
    const tableXY = (ev) => {
      const rect = this.tableEl.getBoundingClientRect();
      return { x: (ev.clientX - rect.left) / this.scale, y: (ev.clientY - rect.top) / this.scale };
    };

    const ensureSelectionBox = () => {
      if (!selectionBoxEl) {
        selectionBoxEl = document.createElement('div');
        selectionBoxEl.className = 'selection-box';
        this.tableEl.appendChild(selectionBoxEl);
      }
      return selectionBoxEl;
    };

    const updateSelectionBox = (x0, y0, x1, y1) => {
      const box = ensureSelectionBox();
      const left = Math.min(x0, x1), top = Math.min(y0, y1);
      const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
      box.style.left = left + 'px';
      box.style.top = top + 'px';
      box.style.width = w + 'px';
      box.style.height = h + 'px';
      box.style.display = 'block';
      return { left, top, right: left + w, bottom: top + h };
    };

    const applyLiveSelection = (rect) => {
      for (const p of this.pieces.values()) {
        const cx = p.x + this.canvasW / 2, cy = p.y + this.canvasH / 2;
        const inside = cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
        p.el.classList.toggle('selecting', inside);
      }
    };

    this.tableEl.addEventListener('pointerdown', (ev) => {
      const { x, y } = tableXY(ev);
      const hit = this._hitTest(x, y);
      pointerId = ev.pointerId;

      if (!hit) {
        // clicou/segurou numa área vazia: começa a seleção por retângulo (laço)
        ev.preventDefault();
        selecting = true;
        selStartX = x; selStartY = y;
        try { this.tableEl.setPointerCapture(pointerId); } catch (e) {}
        updateSelectionBox(x, y, x, y);
        return;
      }

      ev.preventDefault();
      dragging = true;
      activeId = hit.id;
      try { this.tableEl.setPointerCapture(pointerId); } catch (e) {}
      this.tableEl.style.cursor = 'grabbing';
      startX = ev.clientX;
      startY = ev.clientY;

      let members;
      if (this.selected.has(hit.id) && this.selected.size > 1) {
        // a peça clicada faz parte da seleção atual: arrasta a seleção inteira
        members = this._expandWithGroups(this.selected);
      } else {
        this._clearSelection();
        const groupId = this.pieceGroup.get(hit.id);
        members = [...this.groups.get(groupId)];
      }
      origins = members.map(mid => {
        const p = this.pieces.get(mid);
        return { id: mid, x: p.x, y: p.y };
      });
      this.zTop += 1;
      for (const m of members) this.pieces.get(m).el.style.zIndex = this.zTop;
    });

    this.tableEl.addEventListener('pointermove', (ev) => {
      if (selecting) {
        const { x, y } = tableXY(ev);
        const rect = updateSelectionBox(selStartX, selStartY, x, y);
        applyLiveSelection(rect);
        return;
      }
      if (!dragging) {
        const { x, y } = tableXY(ev);
        this.tableEl.style.cursor = this._hitTest(x, y) ? 'grab' : 'default';
        return;
      }
      let dx = (ev.clientX - startX) / this.scale;
      let dy = (ev.clientY - startY) / this.scale;

      // não deixa o grupo arrastado sair da área de jogo
      const { w: tableW, h: tableH } = this._tableBounds();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const o of origins) {
        minX = Math.min(minX, o.x); maxX = Math.max(maxX, o.x);
        minY = Math.min(minY, o.y); maxY = Math.max(maxY, o.y);
      }
      dx = Math.min(Math.max(dx, -minX), Math.max(0, tableW - this.canvasW - maxX));
      dy = Math.min(Math.max(dy, -minY), Math.max(0, tableH - this.canvasH - maxY));

      for (const o of origins) {
        const p = this.pieces.get(o.id);
        this._setPiecePos(p, o.x + dx, o.y + dy);
      }
      this._emitMove(this.pieces.get(activeId), true);
    });

    const endDrag = (ev) => {
      if (selecting) {
        selecting = false;
        try { this.tableEl.releasePointerCapture(pointerId); } catch (e) {}
        if (selectionBoxEl) selectionBoxEl.style.display = 'none';
        this._clearSelection();
        for (const p of this.pieces.values()) {
          if (p.el.classList.contains('selecting')) {
            p.el.classList.remove('selecting');
            p.el.classList.add('selected');
            this.selected.add(p.id);
          }
        }
        return;
      }
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
      return { id: mid, x: p.x, y: p.y };
    });
    this.onPieceMoved(payload, dragging);
  }

  /** Ajusta a posição exata (encaixe visual) se o grupo arrastado ficou perto
   *  o bastante de um vizinho, e recalcula as conexões a partir disso. */
  _trySnap(piece) {
    const groupId = this.pieceGroup.get(piece.id);
    const members = [...this.groups.get(groupId)];
    for (const mid of members) {
      const p = this.pieces.get(mid);
      for (const n of this._gridNeighbors(p.r, p.c)) {
        const np = this.pieces.get(n.id);
        if (this.pieceGroup.get(n.id) === groupId) continue;
        const expectedX = np.x - n.dc * this.pieceW;
        const expectedY = np.y - n.dr * this.pieceH;
        const dist = Math.hypot(expectedX - p.x, expectedY - p.y);
        if (dist < this.snapTolerance) {
          const shiftX = expectedX - p.x;
          const shiftY = expectedY - p.y;
          for (const gm of members) {
            const gp = this.pieces.get(gm);
            this._setPiecePos(gp, gp.x + shiftX, gp.y + shiftY);
          }
          this._recomputeGroups();
          this._emitMove(this.pieces.get(mid), false);
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
    return [...this.pieces.values()].map(p => ({ id: p.id, x: p.x, y: p.y }));
  }

  loadState(list) {
    for (const item of list) this.applyRemote(item.id, item.x, item.y);
    this._recomputeGroups();
  }
}
