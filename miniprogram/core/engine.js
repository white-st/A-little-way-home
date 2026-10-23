(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LightEngine = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Port bits, clockwise: east, south, west, north. BOTH adjacent ports must exist.
  const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const DIRECTION_NAMES = ['右', '下', '左', '上'];
  const key = (x, y) => `${x},${y}`;
  function rotateMask(mask, turns) {
    const n = ((turns % 4) + 4) % 4;
    return ((mask << n) | (mask >> (4 - n))) & 15;
  }
  const ports = piece => rotateMask(piece.ports, piece.orientation);
  const canRotate = piece => rotateMask(piece.ports, 1) !== piece.ports;
  const portNames = piece => DIRECTION_NAMES.filter((name, direction) => ports(piece) & (1 << direction)).join('、');
  const shapeName = piece => {
    const mask = piece.ports;
    const count = DIRECTIONS.filter((_, direction) => mask & (1 << direction)).length;
    return count === 1 ? '终端' : count === 3 ? '分叉' : count === 4 ? '十字' : mask === 5 || mask === 10 ? '直线' : '弯线';
  };
  function network(level, pieces) {
    const cells = new Map(pieces.map((piece, index) => [key(piece.x, piece.y), index]));
    const masks = pieces.map(ports);
    let openPorts = 0;
    const neighbors = pieces.map((piece, index) => {
      const matched = [];
      DIRECTIONS.forEach(([dx, dy], direction) => {
        if (!(masks[index] & (1 << direction))) return;
        const x = piece.x + dx, y = piece.y + dy;
        const next = x >= 0 && y >= 0 && x < level.size && y < level.size ? cells.get(key(x, y)) : undefined;
        if (next === undefined || !(masks[next] & (1 << ((direction + 2) % 4)))) openPorts++;
        else matched.push(next);
      });
      return matched;
    });
    const source = cells.get(key(level.source.x, level.source.y));
    const lit = source === undefined ? [] : [source];
    const visited = new Set(lit);
    const parents = new Map(source === undefined ? [] : [[source, source]]);
    for (let cursor = 0; cursor < lit.length; cursor++) {
      for (const next of neighbors[lit[cursor]]) if (!visited.has(next)) {
        visited.add(next); parents.set(next, lit[cursor]); lit.push(next);
      }
    }
    return { lit, openPorts, parents, source, solved: pieces.length > 0 && lit.length === pieces.length && openPorts === 0 };
  }
  function trace(level, pieces) {
    const { lit, openPorts, solved } = network(level, pieces);
    return { lit, openPorts, solved };
  }
  function homeRoutes(level, pieces) {
    const graph = network(level, pieces);
    if (!graph.solved) return [];
    return pieces.flatMap((piece, index) => {
      if (index === graph.source || ![1, 2, 4, 8].includes(piece.ports)) return [];
      const path = [index];
      while (path[path.length - 1] !== graph.source) path.push(graph.parents.get(path[path.length - 1]));
      return [{ index, path: path.map(i => ({ x: pieces[i].x, y: pieces[i].y })) }];
    });
  }
  // Shipped boards include a verified reference network. Hints respect symmetric
  // straight tiles; any other fully connected solution is accepted by trace().
  function solve(level, pieces) {
    if (!level.solution || level.solution.length !== pieces.length) return null;
    const trial = pieces.map(piece => ({ ...piece }));
    const changes = [];
    let moves = 0;
    trial.forEach((piece, index) => {
      const target = rotateMask(piece.ports, level.solution[index]);
      let turns = 0;
      while (turns < 4 && rotateMask(ports(piece), turns) !== target) turns++;
      if (turns === 4) return;
      if (turns) changes.push({ x: piece.x, y: piece.y, orientation: (piece.orientation + turns) % 4, turns });
      moves += turns;
      piece.orientation = (piece.orientation + turns) % 4;
    });
    if (!trace(level, trial).solved) return null;
    const order = new Map(trace(level, trial).lit.map((index, rank) => [key(trial[index].x, trial[index].y), rank]));
    changes.sort((a, b) => order.get(key(a.x, a.y)) - order.get(key(b.x, b.y)));
    return { pieces: trial, changes, moves };
  }
  function createGame(level) {
    const pieces = level.pieces.map(piece => ({ ...piece }));
    return { level, pieces, moves: 0, hints: 0, history: [], result: trace(level, pieces), hintCell: null };
  }
  function rotate(game, x, y) {
    if (game.result.solved) return false;
    const piece = game.pieces.find(item => item.x === x && item.y === y);
    if (!piece || !canRotate(piece)) return false;
    game.history.push({ x, y, orientation: piece.orientation });
    piece.orientation = (piece.orientation + 1) % 4;
    game.moves++;
    const hint = game.hintCell;
    const remaining = hint && hint.x === x && hint.y === y ? (hint.orientation - piece.orientation + 4) % 4 : 0;
    game.hintCell = remaining ? { ...hint, turns: remaining } : null;
    game.result = trace(game.level, game.pieces);
    return true;
  }
  function undo(game) {
    if (game.result.solved || !game.history.length) return false;
    const previous = game.history.pop();
    game.pieces.find(piece => piece.x === previous.x && piece.y === previous.y).orientation = previous.orientation;
    game.moves--;
    game.hintCell = null;
    game.result = trace(game.level, game.pieces);
    return true;
  }
  function hint(game) {
    if (game.result.solved) return null;
    const solution = solve(game.level, game.pieces);
    if (!solution || !solution.changes.length) return null;
    const cell = solution.changes[0];
    if (!game.hintCell || game.hintCell.x !== cell.x || game.hintCell.y !== cell.y) game.hints++;
    game.hintCell = cell;
    return cell;
  }
  function stars(game) {
    if (!game.result.solved) return 0;
    if (game.hints === 0 && game.moves <= game.level.par) return 3;
    return game.moves <= game.level.par + 2 ? 2 : 1;
  }
  return { DIRECTIONS, DIRECTION_NAMES, rotateMask, ports, canRotate, portNames, shapeName, trace, homeRoutes, solve, createGame, rotate, undo, hint, stars };
}));
