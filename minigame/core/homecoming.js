(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine'));
  else root.AnimalHomecoming = factory(root.LightEngine);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine) {
  const DEPART_MS = 180, SETTLE_MS = 320, ENTER_MS = 280;
  // Only a presentation clock. Completion, rewards and persistence stay in their owners.
  class Journey {
    constructor(game, now) {
      if (!game.result.solved) throw new Error('道路尚未全部接通');
      this.game = game;
      this.routes = Engine.homeRoutes(game.level, game.pieces);
      const longest = Math.max(1, ...this.routes.map(route => route.path.length - 1));
      this.stepMs = Math.max(2400, Math.min(5600, longest * 220)) / longest;
      this.duration = DEPART_MS + longest * this.stepMs + SETTLE_MS;
      this.elapsed = 0;
      this.lastTime = now;
      this.active = false;
      this.presented = false;
    }
    advance(now, active) {
      now = Math.max(this.lastTime, now);
      if (active && this.active) this.elapsed = Math.min(this.duration, this.elapsed + now - this.lastTime);
      this.lastTime = now;
      this.active = active;
    }
    get done() { return this.elapsed >= this.duration; }
    view() {
      const distance = Math.max(0, (this.elapsed - DEPART_MS) / this.stepMs);
      const animals = this.routes.map(route => {
        const end = route.path.length - 1, progress = Math.min(end, distance);
        const step = Math.min(end - 1, Math.floor(progress)), fraction = progress - step;
        const from = route.path[step], to = route.path[step + 1];
        const entered = Math.max(0, this.elapsed - DEPART_MS - end * this.stepMs);
        return { index: route.index, x: from.x + (to.x - from.x) * fraction,
          y: from.y + (to.y - from.y) * fraction, dx: to.x - from.x,
          walking: this.elapsed > DEPART_MS && progress < end, arrived: progress === end,
          alpha: 1 - Math.min(1, entered / ENTER_MS), scale: 1 - .5 * Math.min(1, entered / ENTER_MS),
          stride: this.elapsed / 110 + route.index };
      });
      return { animals, arrived: animals.filter(a => a.arrived).length, total: animals.length,
        progress: Math.min(1, distance / Math.max(1, ...this.routes.map(r => r.path.length - 1))), done: this.done };
    }
  }
  return { Journey, DEPART_MS, SETTLE_MS };
}));
