const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../miniprogram/core/engine');
const Renderer = require('../miniprogram/core/renderer');
const levels = require('../miniprogram/core/levels');
const { SceneMotion, TURN_MS, CONNECT_MS } = require('../miniprogram/core/motion');
const quarter = Math.PI / 2;
const rotationGame = (orientation = 0) => Engine.createGame({
  size: 5, par: 1, source: { x: 0, y: 4, direction: 0 }, 
  pieces: [{ x: 2, y: 2, type: 'wire', ports: 3, orientation }]
});
const angle = (motion, game, time, reduced = false) => motion.update(game, time, reduced).angles.get('2,2');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('a clockwise turn interpolates continuously through the up-to-right wrap', () => {
  const game = rotationGame(3), motion = new SceneMotion();
  close(angle(motion, game, 0), quarter * 3);
  Engine.rotate(game, 2, 2);
  close(angle(motion, game, 10), quarter * 3);
  const mid = angle(motion, game, 10 + TURN_MS / 2);
  assert.ok(mid > quarter * 3 && mid < Math.PI * 2);
  close(angle(motion, game, 10 + TURN_MS), Math.PI * 2);
  assert.equal(game.pieces[0].orientation, 0);
  assert.equal(game.moves, 1, 'visual frames must not create game actions');
});

test('rapid clicks retain a full revolution and retarget from the currently displayed angle', () => {
  const game = rotationGame(), motion = new SceneMotion();
  angle(motion, game, 0);
  for (let i = 0; i < 4; i++) {
    const before = angle(motion, game, 20 + i * 30);
    Engine.rotate(game, 2, 2);
    close(angle(motion, game, 20 + i * 30), before);
  }
  close(angle(motion, game, 1000), Math.PI * 2);
  assert.equal(game.moves, 4);
  assert.equal(game.pieces[0].orientation, 0);
});

test('undo reverses an unfinished turn smoothly and also reverses across the zero angle', () => {
  const game = rotationGame(3), motion = new SceneMotion();
  angle(motion, game, 0);
  Engine.rotate(game, 2, 2); angle(motion, game, 10);
  const interrupted = angle(motion, game, 100);
  Engine.undo(game);
  close(angle(motion, game, 100), interrupted);
  assert.ok(angle(motion, game, 200) < interrupted);
  close(angle(motion, game, 600), quarter * 3);
  Engine.rotate(game, 2, 2); angle(motion, game, 610);
  close(angle(motion, game, 900), quarter * 4);
  Engine.undo(game); angle(motion, game, 910);
  close(angle(motion, game, 1200), quarter * 3);
});

test('connection colours fade continuously and retarget from the visible colour on disconnect and reconnect', () => {
  const game=Engine.createGame(levels[4]), motion=new SceneMotion(); game.result.lit=[0];
  assert.equal(motion.update(game,0).connections[0],1);
  game.result.lit=[0,1,2];
  assert.deepEqual(motion.update(game,10).connections.slice(0,3),[1,0,0]);
  close(motion.update(game,10+CONNECT_MS/2).connections[1],.5);
  game.result.lit=[0];close(motion.update(game,10+CONNECT_MS/2).connections[1],.5);
  const fading=motion.update(game,10+CONNECT_MS).connections[1];
  assert.ok(fading>0&&fading<.5);
  game.result.lit=[0,1];close(motion.update(game,10+CONNECT_MS).connections[1],fading);
  close(motion.update(game,10+CONNECT_MS*2).connections[1],1);
  assert.deepEqual(motion.update(game,5000).connections.slice(0,3),[1,1,0]);
  assert.equal(motion.fades.length,game.pieces.length,'fixed per-piece state does not accumulate effects');
});

test('reset and level switching discard in-flight effects and snap to the new initial layout', () => {
  const game = Engine.createGame(levels[4]), motion = new SceneMotion();
  motion.update(game, 0); Engine.rotate(game, 1, 1); motion.update(game, 10);
  const reset = Engine.createGame(levels[4]);
  const resetFrame = motion.update(reset, 20);
  assert.deepEqual(resetFrame.connections,reset.pieces.map((_,i)=>Number(reset.result.lit.includes(i))));
  for (const p of reset.pieces.filter(p => p.type === 'wire')) close(resetFrame.angles.get(`${p.x},${p.y}`), p.orientation * quarter);
  const next = Engine.createGame(levels[5]);
  const nextFrame = motion.update(next, 30);
  assert.deepEqual(nextFrame.connections,next.pieces.map((_,i)=>Number(next.result.lit.includes(i))));
  assert.equal(nextFrame.angles.size, next.pieces.filter(p => p.type === 'wire').length);
});

test('reduced motion settles orientation and connection colour immediately, without replay on re-enable', () => {
  const game = Engine.createGame(levels[0]), motion = new SceneMotion();
  const initial = game.pieces[4].orientation * quarter;
  motion.update(game, 0); Engine.rotate(game, 1, 1); motion.update(game, 10);
  const reduced = motion.update(game, 20, true);
  close(reduced.angles.get('1,1'), initial + quarter);
  assert.deepEqual(reduced.connections,game.pieces.map(()=>1));
  assert.equal(reduced.time, 0);
  assert.deepEqual(motion.update(game,30).connections,reduced.connections);
});

test('road colour is continuous during rotation, with no light flash or blurred road strokes', () => {
  const rotations = [], arcs = [], gradients=[], strokes=[];
  const ctx = new Proxy({
    shadowBlur:0,
    rotate: value => rotations.push(value), arc: (...values) => arcs.push(values),
    stroke:()=>strokes.push(ctx.shadowBlur),
    createLinearGradient: () => {const stops=[];gradients.push(stops);return {addColorStop:(at,color)=>stops.push([at,color])};}
  }, { get: (object, key) => key in object?object[key]:(() => {}) });
  const game = Engine.createGame(levels[0]);
  const initial = game.pieces[4].orientation * quarter;
  Renderer.render(ctx, 350, game, 0);
  const firstColour=gradients[0][1][1];gradients.length=0;
  Engine.rotate(game, 1, 1); Renderer.render(ctx, 350, game, 10);
  assert.equal(gradients[0][1][1],firstColour,'colour does not jump on the action frame');
  rotations.length = 0; arcs.length = 0;gradients.length=0;
  Renderer.render(ctx, 350, game, 100);
  assert.ok(rotations[4] > initial && rotations[4] < initial + quarter);
  const midColour=gradients[0][1][1];assert.notEqual(midColour,firstColour);
  const withEffect = arcs.length;
  gradients.length=0;Renderer.render(ctx,350,game,10+CONNECT_MS);
  const finalColour=gradients[0][1][1];assert.notEqual(midColour,finalColour);
  gradients.length=0;Renderer.render(ctx,350,game,2000);
  assert.equal(gradients[0][1][1],finalColour,'settled colour stays stable after the old flash duration');
  Renderer.resetMotion(ctx);
  rotations.length = 0; arcs.length = 0;
  Renderer.render(ctx, 350, game, 110);
  close(rotations[4], game.pieces[4].orientation * quarter);
  assert.equal(arcs.length, withEffect, 'connecting paths adds no radial particle or ring geometry');
  assert.ok(strokes.every(value=>value===0),'road strokes do not require per-tile blur passes');
  assert.equal(game.result.solved, true);
});

test('undo during a connection fade is continuous and a backwards clock never rewinds it',()=>{
  const game=Engine.createGame(levels[0]),motion=new SceneMotion();
  Engine.rotate(game,0,2);motion.update(game,0);
  Engine.rotate(game,1,1);motion.update(game,10);
  const connected=motion.update(game,120).connections;
  assert.ok(connected.some(n=>n>0&&n<1));
  assert.ok(Engine.undo(game));
  assert.deepEqual(motion.update(game,120).connections,connected);
  assert.deepEqual(motion.update(game,90).connections,connected);
  const final=motion.update(game,120+CONNECT_MS).connections;
  assert.deepEqual(final,game.pieces.map((_,i)=>Number(game.result.lit.includes(i))));
});
