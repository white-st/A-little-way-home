(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LightMotion = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const QUARTER = Math.PI / 2;
  const TURN_MS = 260;
  const CONNECT_MS = TURN_MS;
  const clamp = value => Math.max(0, Math.min(1, value));
  const easeOut = value => 1 - (1 - value) ** 3;
  const position = (turn, now) => turn.duration ? turn.from + (turn.to - turn.from) * easeOut(clamp((now - turn.start) / turn.duration)) : turn.to;
  const tint = (fade, now) => {
    const t=fade.duration?clamp((now-fade.start)/fade.duration):1;
    return fade.from+(fade.to-fade.from)*t*t*(3-2*t);
  };

  // Presentation only: no timers, gameplay mutations or persisted animation data.
  // Both clients render immediately after an action, so rapid taps are captured
  // even when several clicks fall between two display frames.
  class SceneMotion {
    constructor() { this.game = null; }
    reset(game, now) {
      this.game = game;
      this.time = now;
      this.moves = game.moves;
      this.turns = new Map(game.pieces.map(piece => {
        const angle = piece.orientation * QUARTER;
        return [`${piece.x},${piece.y}`, { orientation: piece.orientation, from: angle, to: angle, start: now, duration: 0 }];
      }));
      const lit = new Set(game.result.lit);
      this.fades = game.pieces.map((_,index)=>{
        const value=lit.has(index)?1:0;
        return {from:value,to:value,start:now,duration:0};
      });
    }
    update(game, now, reducedMotion = false) {
      if (this.game !== game) this.reset(game, now);
      // Prevent a backwards wall clock adjustment from rewinding native effects.
      now = Math.max(this.time, now);
      const undo = game.moves < this.moves;
      const angles = new Map();
      for (const piece of game.pieces) {
        const key = `${piece.x},${piece.y}`;
        const turn = this.turns.get(key);
        if (piece.orientation !== turn.orientation) {
          const quarters = undo ? -((turn.orientation - piece.orientation + 4) % 4) : (piece.orientation - turn.orientation + 4) % 4;
          turn.from = position(turn, now);
          turn.to += quarters * QUARTER;
          turn.orientation = piece.orientation;
          turn.start = now;
          turn.duration = TURN_MS + Math.min(160, Math.max(0, Math.abs(turn.to - turn.from) / QUARTER - 1) * 80);
        }
        if (reducedMotion) { turn.from = turn.to; turn.duration = 0; }
        angles.set(key, position(turn, now));
      }
      const lit = new Set(game.result.lit);
      const connections = this.fades.map((fade,index)=>{
        const target=lit.has(index)?1:0;
        if(target!==fade.to) {
          // Retarget from the visible colour when taps or undo interrupt a fade.
          fade.from=tint(fade,now);fade.to=target;fade.start=now;fade.duration=CONNECT_MS;
        }
        if(reducedMotion || now-fade.start>=fade.duration) {fade.from=fade.to;fade.duration=0;}
        return tint(fade,now);
      });
      this.moves = game.moves;
      this.time = now;
      return { angles, connections, time: reducedMotion ? 0 : now };
    }
  }
  return { SceneMotion, TURN_MS, CONNECT_MS };
}));
