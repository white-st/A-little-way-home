const test = require('node:test');
const assert = require('node:assert/strict');
const { Session } = require('../miniprogram/core/session');
const Engine = require('../miniprogram/core/engine');

test('mode rules reject cross-mode selection and unlock only the next same-size level', () => {
  const session = new Session(undefined, 8);
  assert.equal(session.index, 18);
  assert.deepEqual(session.view().choices.map(choice => choice.locked), [false, ...Array(19).fill(true)]);
  assert.equal(session.select(19), false);
  assert.equal(session.select(3), false);
  assert.equal(session.select(undefined), false);
  assert.equal(session.setMode(12), false);
  assert.equal(session.index, 18);
  const answer = Engine.solve(session.game.level, session.game.pieces);
  for (const change of answer.changes) for (let i = 0; i < change.turns; i++) session.act('rotate', change.x, change.y);
  assert.deepEqual(session.view().choices.map(choice => choice.locked), [false, false, ...Array(18).fill(true)]);
  assert.equal(session.act('next'), true);
  assert.equal(session.game.level.size, 8);
  session.setMode(4);
  assert.equal(session.index, 3);
  assert.deepEqual(session.view().choices.map(choice => choice.locked), [false, ...Array(19).fill(true)]);
  session.setMode(8);
  assert.equal(session.index, 19);
});

test('all old stars stay in their original slots and modes summarize only their own results', () => {
  const old = [3, 2, 3, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const session = new Session(old, 4);
  assert.deepEqual(session.progress.slice(0,24), old);
  assert.deepEqual(session.progress.slice(24), Array(116).fill(0));
  assert.equal(session.index, 5);
  assert.equal(session.view().number, '03');
  assert.equal(session.view().completed, 2);
  assert.equal(session.modes().find(mode => mode.size === 3).completed, 3);
  assert.equal(session.modes().find(mode => mode.size === 8).completed, 0);
  session.act('restart');
  assert.deepEqual(session.progress.slice(0, 3), [3, 2, 3]);
  assert.deepEqual(session.progress.slice(3, 6), [0, 0, 0]);
  assert.deepEqual(old.slice(3, 6), [1, 2, 0], 'the supplied save is not mutated');
});

test('previously completed modes open their first newly added level and retain all old stars', () => {
  const old = Array(24).fill(3);
  for (let size=3;size<=9;size++) {
    const session = new Session(old, size);
    assert.equal(session.view().overallCompleted,24);
    assert.equal(session.view().overallTotal,140);
    assert.equal(session.view().allComplete,false);
    assert.equal(session.game.level.size,size);
    assert.ok(session.index>=24);
    assert.equal(session.select(session.indices()[session.indices().indexOf(session.index)+1]),false);
    assert.deepEqual(session.progress.slice(0,24),old);
  }
});

test('lamp counter excludes wires and source, follows rotations/undo/reset and reaches its total on completion', () => {
  const session = new Session(undefined,8);
  function check() {
    const game=session.game, view=session.view();
    const terminals=game.pieces.map((piece,index)=>({piece,index})).filter(({piece})=>
      [1,2,4,8].includes(piece.ports) && !(piece.x===game.level.source.x && piece.y===game.level.source.y));
    assert.equal(view.lamps,terminals.length);
    assert.equal(view.litLamps,terminals.filter(({index})=>game.result.lit.includes(index)).length);
    assert.ok(view.lamps<view.nodes);
  }
  const initial=session.view().litLamps; check();
  session.act('rotate',0,0);check();
  session.act('undo');check();assert.equal(session.view().litLamps,initial);
  session.act('reset');check();
  const answer=Engine.solve(session.game.level,session.game.pieces);
  for(const change of answer.changes) for(let n=0;n<change.turns;n++) {session.act('rotate',change.x,change.y);check();}
  assert.equal(session.view().solved,true);
  assert.equal(session.view().litLamps,session.view().lamps);
  const powered=session.view().litLamps;
  session.act('reset');assert.ok(session.view().litLamps<powered);
});

test('a one-port power source is not counted as a lamp', () => {
  const session=new Session(undefined,3);
  session.game=Engine.createGame({...session.game.level,size:2,source:{x:0,y:0},pieces:[
    {x:0,y:0,ports:1,orientation:0},
    {x:1,y:0,ports:3,orientation:1},
    {x:1,y:1,ports:1,orientation:3},
    {x:0,y:1,ports:1,orientation:2}
  ]});
  const view=session.view();
  assert.equal(view.nodes,4);assert.equal(view.lit,3);
  assert.equal(view.lamps,2);assert.equal(view.litLamps,1);
  assert.equal(view.solved,false);
});

test('hearts retain old scores, count best results once and update only the improved difference', () => {
  const old=Array(24).fill(0); old[3]=2;
  const session=new Session(old,3);
  assert.equal(session.view().totalHearts,2);assert.equal(session.view().maxHearts,420);
  for(let i=0;i<4;i++) session.act('rotate',0,0);
  session.act('rotate',1,1);
  assert.equal(session.view().hearts,1);assert.equal(session.view().bestHearts,1);
  assert.equal(session.view().totalHearts,3);
  session.act('reset');session.act('hint');session.act('rotate',1,1);
  assert.equal(session.view().hearts,2);assert.equal(session.view().bestHearts,2);
  assert.equal(session.view().totalHearts,4);
  session.act('reset');session.act('rotate',1,1);
  assert.equal(session.view().hearts,3);assert.equal(session.view().bestHearts,3);
  assert.equal(session.view().totalHearts,5);
  session.act('reset');session.act('hint');session.act('rotate',1,1);
  assert.equal(session.view().hearts,2);assert.equal(session.view().bestHearts,3);
  assert.equal(session.view().totalHearts,5,'a lower replay score does not remove or award more hearts');
  session.act('rotate',1,1);session.act('next');
  assert.equal(session.view().totalHearts,5,'repeated actions and next level do not award hearts');
  const restored=new Session(session.progress,3);
  assert.equal(restored.view().totalHearts,5);
  assert.equal(restored.view().choices[0].hearts,3);
  restored.act('restart');assert.equal(restored.view().totalHearts,2);
  assert.equal(restored.progress[3],2,'reset only clears this mode');
});
