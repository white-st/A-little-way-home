(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./motion'), require('./animals'));
  else root.LightRenderer = factory(root.LightMotion, root.AnimalArt);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Motion, Art) {
  const scenes = new WeakMap();
  const directions = [[1,0],[0,1],[-1,0],[0,-1]];
  function resetMotion(ctx) { if (ctx) scenes.delete(ctx); }
  function geometry(width, size) {
    const padding = width * (size >= 8 ? .025 : .045);
    return { padding, cell: (width - padding * 2) / size };
  }
  function hitTest(width, size, x, y) {
    const { padding, cell } = geometry(width, size);
    const col = Math.floor((x - padding) / cell), row = Math.floor((y - padding) / cell);
    return col >= 0 && row >= 0 && col < size && row < size ? { x: col, y: row } : null;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function circle(ctx, x, y, r, fill, stroke) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function render(ctx, width, game, time = 0, options = {}) {
    if (!scenes.has(ctx)) scenes.set(ctx, new Motion.SceneMotion());
    const motion = scenes.get(ctx).update(game, time, options.reducedMotion);
    const { padding, cell } = geometry(width, game.level.size);
    const active = new Set(game.result.lit);
    const palette = options.light ? {
      bg: '#e4f1cc', inset: '#cddfb4', tile: '#dce9c5', litTile: '#e8f1d1', edge: '#bed1a6', litEdge: '#a4bf8e',
      roadEdge: '#b0c397', litRoadEdge: '#91ad72', road: '#829c6e', litRoad: '#d5e7a3', hint: '#a17628'
    } : {
      bg: '#0c171d', inset: '#152a29', tile: '#1c302e', litTile: '#233c32', edge: '#2b423d', litEdge: '#355043',
      roadEdge: '#142825', litRoadEdge: '#49634b', road: '#60776a', litRoad: '#b6c39a', hint: '#f1d799'
    };
    ctx.clearRect(0, 0, width, width);
    ctx.save();
    ctx.fillStyle = options.background || palette.bg; ctx.fillRect(0, 0, width, width);
    ctx.fillStyle = palette.inset;
    roundRect(ctx, padding, padding, width - padding * 2, width - padding * 2, 6); ctx.fill();
    // Paths join edge to edge. Connectivity only gives a quiet glow, never a beam.
    for (let index = 0; index < game.pieces.length; index++) {
      const piece = game.pieces[index], lit = active.has(index);
      const x = padding + (piece.x + .5) * cell, y = padding + (piece.y + .5) * cell;
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = lit ? palette.litTile : palette.tile;
      ctx.strokeStyle = lit ? palette.litEdge : palette.edge; ctx.lineWidth = 1;
      roundRect(ctx, -cell / 2 + 1, -cell / 2 + 1, cell - 2, cell - 2, Math.min(5, cell * .08)); ctx.fill(); ctx.stroke();
      if (piece.ports === 15) {
        // Four corner rivets distinguish a fixed junction from a rotatable wire.
        for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
          circle(ctx, dx * cell * .29, dy * cell * .29, Math.max(1.2, cell * .035), lit ? '#8fb7a4' : '#536874');
        }
      }
      if (game.hintCell && game.hintCell.x === piece.x && game.hintCell.y === piece.y) {
        ctx.lineWidth = 2; circle(ctx, 0, 0, cell * .4, null, palette.hint);
      }
      ctx.save(); ctx.rotate(motion.angles.get(`${piece.x},${piece.y}`));
      ctx.beginPath();
      directions.forEach(([dx, dy], direction) => {
        if (piece.ports & (1 << direction)) { ctx.moveTo(0, 0); ctx.lineTo(dx * cell * .5, dy * cell * .5); }
      });
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const thickness = Math.max(4, cell * .18);
      ctx.lineWidth = thickness + 3; ctx.strokeStyle = lit ? palette.litRoadEdge : palette.roadEdge; ctx.stroke();
      ctx.lineWidth = thickness; ctx.strokeStyle = lit ? palette.litRoad : palette.road;
      ctx.shadowColor = '#c0d8a5'; ctx.shadowBlur = lit ? 2 : 0; ctx.stroke(); ctx.shadowBlur = 0;
      // This historical geometry comparison does not replay retired light pulses.
      ctx.restore();
      ctx.restore();
    }
    const home = game.level.source;
    Art.drawHome(ctx, padding + (home.x + .5) * cell, padding + (home.y + .5) * cell,
      cell * .37, game.result.solved);
    const journey = options.journey;
    const animals = journey ? journey.animals : game.result.solved ? [] : game.pieces.flatMap((p,index) =>
      [1,2,4,8].includes(p.ports) && !(p.x === home.x && p.y === home.y) ? [{index,x:p.x,y:p.y,alpha:1,scale:1}] : []);
    for (const animal of animals) {
      if (animal.alpha <= 0) continue;
      const origin = game.pieces[animal.index], kind = (origin.x + origin.y * 3) % 4;
      ctx.save();ctx.globalAlpha = animal.alpha;
      Art.drawAnimal(ctx,padding+(animal.x+.5)*cell,padding+(animal.y+.5)*cell,
        cell*.31*animal.scale,kind,animal.stride,animal.walking,animal.dx < 0 ? -1 : 1);
      ctx.restore();
    }
    ctx.restore();
  }
  return { geometry, hitTest, render, resetMotion, drawAnimal:Art.drawAnimal, drawHome:Art.drawHome };
}));
