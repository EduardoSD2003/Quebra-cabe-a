// Sincronização multiplayer via Supabase Realtime (broadcast + presence) e persistência em tabela.

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'];

function randomColor() {
  return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
}

function randomRoomId() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let id = '';
  for (let i = 0; i < 10; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

class RoomSync {
  constructor(roomId, playerName) {
    this.roomId = roomId;
    this.playerName = playerName || 'Jogador';
    this.client = getSupabaseClient();
    this.channel = null;
    this.color = randomColor();
    this.onPeerMove = null;
    this.onPeerCursor = null;
    this.onPresence = null;
    this._pending = new Map();
    this._saveTimer = null;
  }

  async createRoom({ image, rows, cols, boardW, boardH, seed }) {
    const { error } = await this.client.from('rooms').insert({
      id: this.roomId, image, rows, cols, board_w: boardW, board_h: boardH, seed, pieces: []
    });
    if (error) throw error;
  }

  async fetchRoom() {
    const { data, error } = await this.client.from('rooms').select('*').eq('id', this.roomId).single();
    if (error) throw error;
    return data;
  }

  connect() {
    this.channel = this.client.channel(`room:${this.roomId}`, {
      config: { presence: { key: this.playerName + '-' + Math.random().toString(36).slice(2, 7) } }
    });

    this.channel.on('broadcast', { event: 'move' }, (msg) => {
      this.onPeerMove && this.onPeerMove(msg.payload.pieces);
    });

    this.channel.on('broadcast', { event: 'cursor' }, (msg) => {
      this.onPeerCursor && this.onPeerCursor(msg.payload);
    });

    this.channel.on('presence', { event: 'sync' }, () => {
      const state = this.channel.presenceState();
      this.onPresence && this.onPresence(state);
    });

    return new Promise((resolve) => {
      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this.channel.track({ name: this.playerName, color: this.color });
          resolve();
        }
      });
    });
  }

  broadcastMove(pieces, dragging) {
    this.channel && this.channel.send({ type: 'broadcast', event: 'move', payload: { pieces } });
    this._scheduleSave(pieces, dragging);
  }

  broadcastCursor(x, y) {
    this.channel && this.channel.send({
      type: 'broadcast', event: 'cursor',
      payload: { x, y, name: this.playerName, color: this.color }
    });
  }

  _scheduleSave(pieces, dragging) {
    for (const p of pieces) this._pending.set(p.id, p);
    if (dragging) {
      if (this._saveTimer) return;
      this._saveTimer = setTimeout(() => this._flushSave(), 1200);
    } else {
      this._flushSave();
    }
  }

  async _flushSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
    if (this._pending.size === 0) return;
    const updates = [...this._pending.values()];
    this._pending.clear();
    const { data } = await this.client.from('rooms').select('pieces').eq('id', this.roomId).single();
    const current = (data && data.pieces) || [];
    const map = new Map(current.map(p => [p.id, p]));
    for (const u of updates) map.set(u.id, u);
    await this.client.from('rooms')
      .update({ pieces: [...map.values()], updated_at: new Date().toISOString() })
      .eq('id', this.roomId);
  }

  disconnect() {
    if (this.channel) this.client.removeChannel(this.channel);
  }
}
