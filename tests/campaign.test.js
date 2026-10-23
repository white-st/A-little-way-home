const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../miniprogram/core/engine');
const levels = require('../miniprogram/core/levels');
const {Session,STORAGE_KEY} = require('../miniprogram/core/session');
// Independent verifier: expand port arrays, create an undirected adjacency list,
// and flood from the source without calling the production tracer or bit rotator.
function verify(board, pieces) {
  const directions=[[1,0],[0,1],[-1,0],[0,-1]];
  const cells=pieces.map(p=>({x:p.x,y:p.y,ports:[0,1,2,3].filter(d=>p.ports&(2**d)).map(d=>(d+p.orientation)%4)}));
  const neighbors=cells.map(p=>p.ports.map(d=>{
    const [dx,dy]=directions[d];
    return cells.findIndex(n=>n.x===p.x+dx&&n.y===p.y+dy&&n.ports.includes((d+2)%4));
  }));
  assert.ok(neighbors.every(list=>list.every(i=>i>=0)),'no dangling ends');
  const reached=new Set([cells.findIndex(p=>p.x===board.source.x&&p.y===board.source.y)]);
  let previous=-1;
  while(previous!==reached.size){previous=reached.size; for(const i of [...reached]) for(const n of neighbors[i]) reached.add(n);}
  assert.equal(reached.size,pieces.length,'every cell is powered');
  assert.equal(neighbors.flat().length/2,pieces.length-1,'reference network is a tree');
}
for(const board of levels) test(`network level ${board.id}: full board, valid reference, playable and within star target`,()=>{
  assert.equal(board.pieces.length,board.size**2);
  assert.equal(new Set(board.pieces.map(p=>`${p.x},${p.y}`)).size,board.size**2);
  assert.ok(board.pieces.every(piece => [1,3,5,7].includes(piece.ports)), 'no cross or empty tiles');
  const game=E.createGame(board), before=JSON.stringify(board);
  assert.equal(game.result.solved,false);
  const answer=E.solve(board,game.pieces); assert.ok(answer); verify(board,answer.pieces);
  for(const c of answer.changes) for(let n=0;n<c.turns;n++) E.rotate(game,c.x,c.y);
  assert.equal(game.result.solved,true); assert.equal(E.stars(game),3); assert.ok(game.moves<=board.par);
  assert.equal(JSON.stringify(board),before,'playing never mutates level definitions');
});
test('seven modes each contain 20 unique cross-free networks with increasing difficulty',()=>{
  assert.equal(levels.length,140);
  assert.deepEqual(levels.slice(0,24).map(level=>level.size),[3,3,3,4,4,4,5,5,5,5,6,6,6,6,7,7,7,7,8,8,8,9,9,9]);
  assert.deepEqual(levels.map(level=>level.id), Array.from({length:140},(_,i)=>i+1));
  for (let size=3; size<=9; size++) {
    const boards=levels.filter(level=>level.size===size);
    assert.equal(boards.length,20);
    const solutions=boards.map(board=>E.solve(board,board.pieces));
    assert.equal(new Set(solutions.map(answer=>answer.pieces.map(E.ports).join(','))).size,20,'different solved layouts, not just different scrambling');
    for(let i=1;i<boards.length;i++) {
      assert.ok(boards[i].branches>=boards[i-1].branches);
      assert.ok(boards[i].par>=boards[i-1].par);
      assert.ok(solutions[i].changes.length>=solutions[i-1].changes.length);
    }
  }
});
test('entire campaign unlocks exactly one next level, persists stars, resets and finishes',()=>{
  const session=new Session();
  assert.notEqual(STORAGE_KEY,'follow-the-light-progress-v1');
  assert.equal(session.select(1),false);
  const order=session.indices();
  for(const [position,index] of order.entries()) {
    assert.equal(session.index,index); assert.equal(session.act('next'),false);
    assert.equal(session.select(order[position+1]),false);
    const answer=E.solve(session.game.level,session.game.pieces);
    for(const c of answer.changes) for(let n=0;n<c.turns;n++) session.act('rotate',c.x,c.y);
    assert.equal(session.view().solved,true); assert.equal(session.progress[index],3);
    assert.equal(session.view().completed,position+1);
    const restored=new Session([...session.progress]); assert.equal(restored.index,order[Math.min(position+1,levels.length-1)]);
    if(position<levels.length-1) assert.equal(session.act('next'),true);
  }
  assert.equal(session.view().allComplete,true); assert.equal(session.view().last,true); assert.equal(session.act('next'),false);
  session.act('reset'); assert.equal(session.view().completed,140);
  session.act('restart'); assert.equal(session.index,0); assert.equal(session.view().completed,0); assert.equal(session.select(1),false);
});
test('malformed progress cannot unlock the next level and hints prevent three stars',()=>{
  const session=new Session([-2,'3',NaN,7]); assert.equal(session.index,0); assert.equal(session.select(-1),false); assert.equal(session.select(1.2),false);
  session.act('hint'); session.act('rotate',1,1);
  assert.equal(session.view().solved,true); assert.equal(session.view().stars,2); assert.match(session.view().tip,/中央小屋/);
});

test('linear order keeps legacy save identities and only the first unfinished level open',()=>{
  const saved=Array(24).fill(0);saved[0]=3;saved[3]=2;saved[18]=1;saved[23]=3;
  const session=new Session(saved),order=session.indices();
  assert.equal(new Set(order).size,140);
  assert.deepEqual(order.map(i=>levels[i].size),Array.from({length:140},(_,i)=>3+Math.floor(i/20)));
  assert.deepEqual(session.progress.slice(0,24),saved);
  assert.equal(session.view().totalHearts,9);assert.equal(session.index,1);
  assert.deepEqual(session.view().choices.filter(c=>!c.locked).map(c=>c.index),[0,1,3,18,23]);
  assert.equal(session.select(18),true);assert.equal(session.select(19),false);
  const answer=E.solve(session.game.level,session.game.pieces);
  for(const c of answer.changes)for(let i=0;i<c.turns;i++)session.act('rotate',c.x,c.y);
  assert.equal(session.view().nextNumber,'02');assert.equal(session.act('next'),true);assert.equal(session.index,1);
  session.progress[order[139]]=3;session.select(order[139]);
  assert.equal(session.view().last,false,'an old completed final level does not imply the entire route is complete');
  assert.equal(session.nextIndex(),1);
});
