const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const Engine = require('../miniprogram/core/engine');
const levels = require('../miniprogram/core/levels');

test('mini program adapter: canvas, taps, save, level switching, and animation lifecycle', () => {
  const file = path.resolve(__dirname, '../miniprogram/pages/game/game.js');
  let page; let stored; let frameId = 0;
  const frames = new Map();
  const context = new Proxy({}, { get: (object, key) => object[key] || (() => {}), set: (object, key, value) => { object[key] = value; return true; } });
  context.createLinearGradient = () => ({ addColorStop() {} });
  const canvas = {
    getContext: () => context,
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id)
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require: createRequire(file), Date,
    Page: definition => { page = definition; },
    wx: { getStorageSync: () => stored, setStorageSync: (key, value) => { stored = [...value]; }, getWindowInfo: () => ({ pixelRatio: 2 }), pageScrollTo: () => {} }
  });
  page.setData = update => Object.assign(page.data, update);
  page.createSelectorQuery = () => ({ select() { return this; }, fields() { return this; }, exec(callback) { callback([{ node: canvas, width: 350, height: 350 }]); } });
  page.onLoad(); page.onShow(); page.onReady();
  assert.equal(frames.size, 1);
  assert.equal(canvas.width, 700);
  page.onBoardStart({ touches: [{ x: 0, y: 0 }] });
  page.onBoardTouch({ changedTouches: [{ x: 0, y: 0 }] });
  assert.equal(page.data.view.moves, 0);
  const padding = 350 * .045; const cell = (350 - 2 * padding) / 3;
  page.onBoardStart({ touches: [{ x: 0, y: 0 }] });
  page.onBoardTouch({ changedTouches: [{ x: padding + 1.5 * cell, y: padding + 1.5 * cell }] });
  assert.equal(page.data.view.moves, 0, 'scrolling across a wire must not rotate it');
  page.onBoardStart({ touches: [{ x: padding + 1.5 * cell, y: padding + 1.5 * cell }] });
  page.onBoardTouch({ changedTouches: [{ x: padding + 1.5 * cell, y: padding + 1.5 * cell }] });
  assert.equal(page.data.view.solved, true);
  assert.equal(stored[0], 3);
  page.onAction({ currentTarget: { dataset: { action: 'next' } } });
  assert.equal(page.data.view.index, 1);
  const upper = { x: padding + 2.5 * cell, y: padding + 2.5 * cell };
  const initialOrientation = page.session.game.pieces.find(p => p.x === 2 && p.y === 2).orientation;
  for (const step of [1, 2, 3, 4]) {
    page.onBoardStart({ touches: [upper] });
    page.onBoardTouch({ changedTouches: [upper] });
    assert.equal(page.session.game.pieces.find(p => p.x === 2 && p.y === 2).orientation, (initialOrientation + step) % 4);
    assert.equal(page.data.view.solved, false);
  }
  page.onAction({ currentTarget: { dataset: { action: 'undo' } } });
  assert.equal(page.session.game.pieces.find(p => p.x === 2 && p.y === 2).orientation, (initialOrientation + 3) % 4);
  page.onAction({ currentTarget: { dataset: { action: 'hint' } } });
  assert.match(page.data.view.tip, /点击光圈中的第/);
  page.onAction({ currentTarget: { dataset: { action: 'reset' } } });
  assert.equal(page.data.view.moves, 0);
  page.toggleLevels(); assert.equal(frames.size, 0);
  page.onSelect({ currentTarget: { dataset: { index: 0 } } });
  assert.equal(frames.size, 1);
  assert.equal(page.data.view.index, 0);
  assert.equal(page.data.view.solved, false);
  page.toggleLevels();
  page.askRestart();
  assert.equal(page.data.restartConfirm, true);
  page.cancelRestart();
  assert.equal(page.data.restartConfirm, false);
  assert.equal(stored[0], 3, 'cancel must keep the saved progress');
  page.askRestart(); page.confirmRestart();
  assert.equal(page.data.view.completed, 0);
  assert.equal(page.data.showLevels, false);
  assert.deepEqual(stored, levels.map(() => 0));
  page.onSelect({ currentTarget: { dataset: { index: 1 } } });
  assert.equal(page.data.view.index, 0);
  assert.equal(frames.size, 1);
  page.onHide(); assert.equal(frames.size, 0);
  page.onShow(); assert.equal(frames.size, 1);
  page.onResize(); assert.equal(frames.size, 1);
  page.onUnload(); assert.equal(frames.size, 0);
  assert.equal(Engine.solve(page.session.game.level, page.session.game.pieces).changes.length, 1);
});
