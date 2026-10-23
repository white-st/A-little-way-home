// Build-time only: degree-limited spanning trees, with verified fixed solutions.
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../miniprogram/core/engine');
// Keep the old 24 save slots and sizes. Titles follow the animal-home theme.
const oldSizes = [3,3,3,4,4,4,5,5,5,5,6,6,6,6,7,7,7,7,8,8,8,9,9,9];
const oldNames = ['回家的第一步','转个弯','林间岔路','小路蜿蜒','四方相连','林间小路','枝叶舒展','寻路之间','回环街巷','伙伴相逢','纵横之间','小径汇聚','林中路网','深巷归途','归家小径','繁枝密叶','交错街区','暮色归途','森林地图','远方伙伴','温暖小屋','溪边小径','林海穿行','团圆时刻'];
const names = ['初识小路','沿路同行','转角相逢','渐入佳境','林间起点','穿过小巷','枝叶之间','曲径通幽','回望家园','连成一片','交织小路','纵横小径','层层深入','相伴归途','繁树之间','千回百转','山谷寻路','穿过长街','伙伴齐聚','一起回家'];
const sections = ['启程','林间','山谷','归途'];
function random(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}
function shuffle(items, rng) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
function tree(size, rng, depthBias) {
  const masks = Array(size * size).fill(0), degrees = masks.slice(), seen = new Set(), frontier = [];
  const center = Math.floor(size / 2), source = center * size + center;
  function visit(index) {
    seen.add(index);
    const edges = [];
    Engine.DIRECTIONS.forEach(([dx, dy], d) => {
      const x = index % size + dx, y = Math.floor(index / size) + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) edges.push([index, y * size + x, d]);
    });
    frontier.push(...shuffle(edges, rng));
  }
  visit(source);
  while (frontier.length) {
    const slot = rng() < depthBias ? frontier.length - 1 : Math.floor(rng() * frontier.length);
    const [from, to, d] = frontier.splice(slot, 1)[0];
    if (seen.has(to) || degrees[from] >= 3) continue;
    masks[from] |= 1 << d; masks[to] |= 1 << ((d + 2) % 4);
    degrees[from]++; degrees[to]++;
    visit(to);
  }
  if (seen.size !== size * size) return null;
  return { masks, source: { x: center, y: center }, branches: degrees.filter(n => n === 3).length };
}
function mode(size) {
  const pool = [], used = new Set();
  for (let attempt = 0; attempt < 3000; attempt++) {
    const network = tree(size, random(71933 + size * 19391 + attempt * 7919), (attempt % 11) / 10);
    if (!network) continue;
    const key = network.masks.join(',');
    if (used.has(key)) continue;
    used.add(key); pool.push(network);
  }
  pool.sort((a, b) => a.branches - b.branches);
  if (pool.length < 20) throw new Error(`Not enough unique ${size}x${size} networks`);
  const boards = [];
  for (let position = 0; position < 20; position++) {
    const { masks, source, branches } = pool[Math.floor(position * (pool.length - 1) / 19)];
    const rng = random(91591 + size * 2819 + position * 11113), solution = [];
    const pieces = masks.map((mask, i) => {
      const base = [1,3,5,7].find(value => [0,1,2,3].some(turn => Engine.rotateMask(value, turn) === mask));
      if (base === undefined) throw new Error('Generated a forbidden or empty tile');
      const orientation = [0,1,2,3].find(turn => Engine.rotateMask(base, turn) === mask);
      solution.push(orientation);
      return { x: i % size, y: Math.floor(i / size), type: 'wire', ports: base, orientation };
    });
    const fraction = position / 19, first = size === 3 ? 1 : size - 1;
    const changed = Math.round(first + fraction * (size * size - 1 - first));
    const candidates = shuffle(pieces.map((_, i) => i), rng);
    // Leave enough asymmetric tiles in the selection for gradual 2/3-turn puzzles.
    candidates.sort((a, b) => Number(pieces[a].ports === 5) - Number(pieces[b].ports === 5));
    if (size === 3 && position === 0) candidates.unshift(candidates.splice(candidates.indexOf(source.y * size + source.x), 1)[0]);
    const selected = candidates.slice(0, changed), turns = new Map(selected.map(i => [i, 1]));
    const extra = Math.floor(changed * fraction * .5);
    for (let n = 0; n < extra; n++) {
      const options = selected.filter(i => pieces[i].ports !== 5 && turns.get(i) < 3);
      if (!options.length) throw new Error('Reference move budget exceeds available rotations');
      const i = options[Math.floor(rng() * options.length)];
      turns.set(i, turns.get(i) + 1);
    }
    for (const [i, count] of turns) pieces[i].orientation = (solution[i] - count + 4) % 4;
    const section = Math.floor(position / 5);
    const board = { size, section, sectionName: sections[section],
      chapter: `CHAPTER 0${section + 1} / ${sections[section]}`, name: names[position],
      description: `${size} × ${size} 动物回家 · 转动草地上的泥土路，让动物回到中央的小屋。`,
      tip: size === 3 && position === 0 ? '先点一下中央小屋所在的格子。与房子连通的泥土路会变成深棕色。'
        : '旋转草地上的泥土路，接好所有接口，让小动物一起回到中央的小屋。',
      source, pieces, solution, branches, par: changed + extra };
    const answer = Engine.solve(board, pieces);
    if (!answer || answer.moves !== board.par || Engine.trace(board, pieces).solved) throw new Error(`Invalid ${size}x${size} level ${position + 1}`);
    boards.push(board);
  }
  return boards;
}
const levels = Array(oldSizes.length);
for (let size = 3; size <= 9; size++) {
  const oldIndices = oldSizes.map((value, index) => value === size ? index : -1).filter(index => index >= 0);
  mode(size).forEach((board, position) => {
    const index = position < oldIndices.length ? oldIndices[position] : levels.length;
    levels[index] = { id: index + 1, ...board, name: position < oldIndices.length ? oldNames[index] : board.name };
  });
}
const output = `(function (root, factory) {\n  if (typeof module === 'object' && module.exports) module.exports = factory();\n  else root.LightLevels = factory();\n}(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n  // Generated by scripts/generate-levels.js; fixed puzzles, no runtime randomness.\n  return ${JSON.stringify(levels)};\n}));\n`;
const destination = path.join(__dirname, '../miniprogram/core/levels.js');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(destination, 'utf8') !== output) throw new Error('Shipped levels differ from generated output');
} else fs.writeFileSync(destination, output);
console.log([3,4,5,6,7,8,9].map(size => {
  const boards = levels.filter(level => level.size === size);
  return { size, levels: boards.length, branches: [boards[0].branches, boards.at(-1).branches], moves: [boards[0].par, boards.at(-1).par] };
}));
