const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../miniprogram/core/engine');
const R = require('../miniprogram/core/renderer');
const levels = require('../miniprogram/core/levels');
const level = (pieces, source = { x: 0, y: 0 }, size = 4) => ({ size, source, pieces: pieces.map(([x,y,ports]) => ({ x,y,ports,type:'wire',orientation:0 })) });
test('all port shapes rotate clockwise, preserve degree and return after four turns', () => {
  for (let mask = 1; mask < 16; mask++) {
    let value = mask;
    for (let i = 0; i < 4; i++) { value = E.rotateMask(value, 1); assert.equal(value.toString(2).replaceAll('0','').length, mask.toString(2).replaceAll('0','').length); }
    assert.equal(value, mask);
  }
  assert.equal(E.rotateMask(1, 1), 2); assert.equal(E.rotateMask(8, 1), 1);
  assert.equal(E.rotateMask(3, 1), 6); assert.equal(E.rotateMask(7, 1), 14);
});
test('power requires reciprocal neighboring ports, never a single pointing wire', () => {
  const board = level([[0,0,1],[1,0,8]]);
  assert.deepEqual(E.trace(board, board.pieces), { lit:[0], openPorts:2, solved:false });
  board.pieces[1].ports = 4;
  assert.deepEqual(E.trace(board, board.pieces), { lit:[0,1], openPorts:0, solved:true });
});
test('edges do not wrap and disconnected closed networks do not count as powered', () => {
  const edges = level([[0,0,4],[3,0,1]]);
  assert.deepEqual(E.trace(edges,edges.pieces).lit,[0]);
  const board = level([[0,0,1],[1,0,4],[2,2,3],[3,2,6],[2,3,9],[3,3,12]]);
  assert.equal(E.trace(board,board.pieces).openPorts,0);
  assert.deepEqual(E.trace(board,board.pieces).lit,[0,1]);
  assert.equal(E.trace(board,board.pieces).solved,false);
});
test('cycles terminate and any fully matched connected network is accepted', () => {
  const board = level([[0,0,3],[1,0,6],[0,1,9],[1,1,12]], {x:0,y:0},2);
  const result = E.trace(board,board.pieces);
  assert.equal(result.lit.length,4); assert.equal(new Set(result.lit).size,4); assert.equal(result.solved,true);
});
test('all powered cells with an unmatched port still cannot finish', () => {
  const board = level([[0,0,3],[1,0,4]]);
  assert.equal(E.trace(board,board.pieces).lit.length,2);
  assert.equal(E.trace(board,board.pieces).solved,false);
});
test('rotation and undo restore exact orientations, moves and connected branches', () => {
  const game = E.createGame(levels[8]), original = JSON.stringify(game.pieces), result = game.result;
  const p = game.pieces[0];
  for(let i=0;i<4;i++) assert.equal(E.rotate(game,p.x,p.y),true);
  assert.equal(JSON.stringify(game.pieces),original);
  for(let i=0;i<4;i++) assert.equal(E.undo(game),true);
  assert.equal(game.moves,0); assert.deepEqual(game.result,result);
  assert.equal(E.undo(game),false); assert.equal(E.rotate(game,-1,-1),false);
});
test('symmetric cross junctions are fixed and do not alter the puzzle or undo history', () => {
  // Legacy symmetric data remains harmless even though shipped levels contain no crosses.
  const board = level([[0,0,15],[1,0,3]], {x:0,y:0},2);
  const game = E.createGame(board), cross = game.pieces[0];
  const other = game.pieces.find(piece => E.canRotate(piece));
  E.rotate(game, other.x, other.y);
  E.hint(game);
  const before = JSON.stringify(game);
  for (let i = 0; i < 4; i++) assert.equal(E.rotate(game, cross.x, cross.y), false);
  assert.equal(JSON.stringify(game), before);
  assert.equal(E.undo(game), true);
  assert.equal(game.moves, 0);
  assert.equal(E.canRotate({ ports: 5 }), true, 'straight wire still changes direction on a quarter turn');
});
test('reference hints handle straight symmetry, count down and repair arbitrary wrong turns', () => {
  for(const board of [levels[0],levels[8],levels[23]]) {
    const game = E.createGame(board);
    for(let i=0;i<17;i++) E.rotate(game, i%board.size, Math.floor(i/board.size)%board.size);
    let steps=0;
    while(!game.result.solved) {
      const h=E.hint(game); assert.ok(h); const used=game.hints;
      E.hint(game); assert.equal(game.hints,used);
      for(let t=h.turns;t>0;t--) { assert.equal(game.hintCell.turns,t); E.rotate(game,h.x,h.y); steps++; }
      assert.equal(game.hintCell,null); assert.ok(steps<board.size*board.size*4);
    }
    assert.equal(E.hint(game),null); assert.equal(E.rotate(game,0,0),false);
  }
});
test('grid hit testing agrees at centers and excludes padding for every board size', () => {
  for(const size of [3,4,5,6,7,8,9]) for(const width of [334,520]) {
    const g=R.geometry(width,size);
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) assert.deepEqual(R.hitTest(width,size,g.padding+(x+.5)*g.cell,g.padding+(y+.5)*g.cell),{x,y});
    assert.equal(R.hitTest(width,size,0,0),null); assert.equal(R.hitTest(width,size,width,width),null);
  }
});
