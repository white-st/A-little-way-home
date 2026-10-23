(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./motion'), require('./animals'));
  else root.LightRenderer = factory(root.LightMotion, root.AnimalArt);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Motion, Art) {
  const scenes = new WeakMap();
  const directions = [[1,0],[0,1],[-1,0],[0,-1]];
  const roadColours=[
    {edge:['#947b5c','#5f472f'],face:['#baa17f','#80603e'],top:['#cdb793','#a08054']},
    {edge:['#ac906c','#725337'],face:['#d0b38b','#967047'],top:['#e0c9a4','#b49365']}
  ].map(tones=>{
    const channels=hex=>[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16));
    const blends=Object.entries(tones).map(([key,pair])=>[key,pair.map(channels)]);
    // Small precomputed ramps avoid allocating/parsing colour strings each frame.
    return Array.from({length:65},(_,step)=>Object.fromEntries(blends.map(([key,[from,to]])=>[
      key,'#'+from.map((value,i)=>Math.round(value+(to[i]-value)*step/64).toString(16).padStart(2,'0')).join('')
    ])));
  });
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
  function roadPath(ctx, ports, cell) {
    const exits=directions.filter((_,direction)=>ports & (1 << direction)), half=cell*.5;
    ctx.beginPath();
    if(exits.length===2) {
      const [a,b]=exits, bend=cell*.12;
      ctx.moveTo(a[0]*half,a[1]*half);
      if(a[0]*b[0]+a[1]*b[1]===0) {
        ctx.lineTo(a[0]*bend,a[1]*bend);
        ctx.quadraticCurveTo(0,0,b[0]*bend,b[1]*bend);
      }
      ctx.lineTo(b[0]*half,b[1]*half);
    } else {
      exits.forEach(([dx,dy])=>{ctx.moveTo(0,0);ctx.lineTo(dx*half,dy*half);});
    }
  }
  function grass(ctx, cell, index, light) {
    // Sparse tufts live in the corners, leaving road joints and animals clear.
    ctx.lineCap='round';ctx.lineWidth=Math.max(.6,cell*.012);
    for(let n=0;n<3;n++) {
      const corner=(index+n)%4,dx=corner%2?1:-1,dy=corner<2?-1:1;
      const x=dx*cell*(.28+((index*7+n*3)%5)*.018),y=dy*cell*.3;
      const blade=Math.max(1.4,cell*.055);
      ctx.strokeStyle=light?'rgba(84,132,53,.42)':'rgba(143,183,103,.34)';
      ctx.beginPath();ctx.moveTo(x-blade,y-blade*.8);ctx.lineTo(x,y);
      ctx.lineTo(x+blade*.3,y-blade*1.5);ctx.moveTo(x,y);ctx.lineTo(x+blade,y-blade*.65);ctx.stroke();
      ctx.strokeStyle=light?'rgba(229,246,185,.66)':'rgba(167,199,125,.28)';
      ctx.beginPath();ctx.moveTo(x+blade*.35,y);ctx.lineTo(x+blade*.7,y-blade*.65);ctx.stroke();
    }
  }
  function render(ctx, width, game, time = 0, options = {}) {
    if (!scenes.has(ctx)) scenes.set(ctx, new Motion.SceneMotion());
    const motion = scenes.get(ctx).update(game, time, options.reducedMotion);
    const { padding, cell } = geometry(width, game.level.size);
    const active = new Set(game.result.lit);
    const palette = options.light ? {
      bg: '#e4f1cc', inset: '#a6cb7c', tile: '#b5d88c', litTile: '#b5d88c', edge: '#add184', litEdge: '#add184',
      hint: '#a17628'
    } : {
      bg: '#0c171d', inset: '#345333', tile: '#40613c', litTile: '#40613c', edge: '#3d5c38', litEdge: '#3d5c38',
      hint: '#f1d799'
    };
    ctx.clearRect(0, 0, width, width);
    ctx.save();
    ctx.fillStyle = options.background || palette.bg; ctx.fillRect(0, 0, width, width);
    ctx.fillStyle = palette.inset;
    roundRect(ctx, padding, padding, width - padding * 2, width - padding * 2, 6); ctx.fill();
    // Lay every tile first so the next tile cannot cover an existing road end.
    const gutter=Math.max(1.4,Math.min(2.5,cell*.045));
    for (let index = 0; index < game.pieces.length; index++) {
      const piece = game.pieces[index], lit = active.has(index);
      const x = padding + (piece.x + .5) * cell, y = padding + (piece.y + .5) * cell;
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = lit ? palette.litTile : palette.tile;
      ctx.strokeStyle = lit ? palette.litEdge : palette.edge; ctx.lineWidth = .7;
      roundRect(ctx, -cell / 2 + gutter, -cell / 2 + gutter, cell - gutter*2, cell - gutter*2, Math.min(7, cell * .12)); ctx.fill(); ctx.stroke();
      grass(ctx,cell,index,options.light);
      if (piece.ports === 15) {
        // Four corner rivets distinguish a fixed junction from a rotatable wire.
        for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
          circle(ctx, dx * cell * .29, dy * cell * .29, Math.max(1.2, cell * .035), lit ? '#8fb7a4' : '#536874');
        }
      }
      if (game.hintCell && game.hintCell.x === piece.x && game.hintCell.y === piece.y) {
        ctx.lineWidth = 2; circle(ctx, 0, 0, cell * .4, null, palette.hint);
      }
      ctx.restore();
    }
    // Slender, softly bent paths still meet at the exact grid-edge midpoints.
    for (let index = 0; index < game.pieces.length; index++) {
      const piece=game.pieces[index],tone=roadColours[options.light?1:0][Math.round(motion.connections[index]*64)];
      ctx.save();ctx.translate(padding+(piece.x+.5)*cell,padding+(piece.y+.5)*cell);
      ctx.save(); ctx.rotate(motion.angles.get(`${piece.x},${piece.y}`));
      roadPath(ctx,piece.ports,cell);
      ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
      const thickness = Math.max(3.2,Math.min(8.6,cell*.12)), border=Math.max(.65,Math.min(1.1,cell*.018));
      ctx.lineWidth=thickness+border*2+1.1;ctx.strokeStyle='#fffdf7';
      // Keep the thin white rim; blurred road shadows/glow add cost and flash on connection.
      ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.stroke();
      ctx.lineWidth = thickness + border*2; ctx.strokeStyle = tone.edge; ctx.stroke();
      const road=ctx.createLinearGradient(0,-thickness,0,thickness);
      road.addColorStop(0,tone.top);
      road.addColorStop(.48,tone.face);road.addColorStop(1,tone.edge);
      ctx.lineWidth = thickness; ctx.strokeStyle = road;
      ctx.stroke();
      // Fixed soil flecks rotate with each tile, staying inside its path arms.
      directions.forEach(([dx,dy],direction)=>{
        if(!(piece.ports & (1 << direction)))return;
        for(let n=0;n<3;n++) {
          const distance=cell*(.22+n*.095),offset=((index+direction+n)%3-1)*thickness*.2;
          ctx.fillStyle=n%2?'rgba(105,75,44,.24)':'rgba(255,237,200,.4)';
          ctx.fillRect(dx*distance-dy*offset,dy*distance+dx*offset,Math.max(.6,thickness*.15),Math.max(.5,thickness*.1));
        }
      });
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
