(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine'), require('./levels'));
  else root.LightSession = factory(root.LightEngine, root.LightLevels);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine, levels) {
  const STORAGE_KEY = 'follow-the-light-network-progress-v1';
  const modeNames = ['初识', '轻松', '进阶', '专注', '挑战', '复杂', '大师'];
  const MODES = [...new Set(levels.map(level => level.size))].map((size, i) => ({
    size, name: modeNames[i], title: `${size} × ${size}`,
    indices: levels.map((level, index) => level.size === size ? index : -1).filter(index => index >= 0)
  }));
  // Display order is independent of the original save slots and reward IDs.
  const CAMPAIGN = MODES.flatMap(mode => mode.indices);
  // Reward slots use the same stable indices as progress, even after level reordering.
  function mergeProgress(...snapshots) {
    return levels.map((_,index) => Math.max(0,...snapshots.map(saved => {
      const value=Array.isArray(saved) ? saved[index] : 0;
      return Number.isInteger(value) && value>=0 && value<=3 ? value : 0;
    })));
  }
  const hintMessage = cell => `点击光圈中的第 ${cell.y + 1} 行、第 ${cell.x + 1} 列道路 ${cell.turns} 次，再沿接口继续连接。`;
  class Session {
    constructor(saved, size = null) {
      if (size !== null && !MODES.some(mode => mode.size === size)) throw new RangeError('不支持的棋盘尺寸');
      this.modeSize = size;
      this.progress = mergeProgress(saved);
      this.index = this.unlocked();
      this.game = Engine.createGame(levels[this.index]);
      this.message = '';
    }
    indices() {
      return this.modeSize === null ? CAMPAIGN : MODES.find(mode => mode.size === this.modeSize).indices;
    }
    setMode(size) {
      if (!MODES.some(mode => mode.size === size)) return false;
      this.modeSize = size;
      return this.select(this.unlocked());
    }
    modes() {
      return MODES.map(mode => ({
        size: mode.size, name: mode.name, title: mode.title, total: mode.indices.length,
        completed: mode.indices.filter(index => this.progress[index] > 0).length,
        stars: mode.indices.reduce((sum, index) => sum + this.progress[index], 0)
      }));
    }
    unlocked() {
      const indices = this.indices(), index = indices.find(index => this.progress[index] === 0);
      return index === undefined ? indices[indices.length - 1] : index;
    }
    canSelect(index) {
      return this.indices().includes(index) && (this.progress[index] > 0 || index === this.unlocked());
    }
    nextIndex() {
      const indices = this.indices(), next = indices[indices.indexOf(this.index) + 1];
      if (this.canSelect(next)) return next;
      // Old saves may contain completed harder levels beyond the new frontier.
      return indices.some(index => !this.progress[index]) ? this.unlocked() : null;
    }
    select(index) {
      if (!this.canSelect(index)) return false;
      this.index = index;
      this.game = Engine.createGame(levels[index]);
      this.message = '';
      return true;
    }
    act(action, x, y) {
      if (action === 'restart') {
        const indices = this.indices();
        indices.forEach(index => { this.progress[index] = 0; });
        return this.select(indices[0]);
      }
      if (action === 'rotate' && !this.game.result.solved) {
        const piece = this.game.pieces.find(piece => piece.x === x && piece.y === y);
        if (piece && !Engine.canRotate(piece)) {
          this.message = '带圆钉的十字是固定接头，四向始终相通，无需旋转。';
          return false;
        }
      }
      let changed = false;
      if (action === 'rotate') changed = Engine.rotate(this.game, x, y);
      if (action === 'undo') changed = Engine.undo(this.game);
      if (action === 'reset') { this.game = Engine.createGame(levels[this.index]); changed = true; }
      if (action === 'next' && this.game.result.solved) {
        return this.select(this.nextIndex());
      }
      if (action === 'hint') {
        const cell = Engine.hint(this.game);
        if (cell) {
          this.message = hintMessage(cell);
          changed = true;
        }
      } else if (changed) this.message = '';
      if (changed && action === 'rotate' && !this.game.result.solved) {
        const piece = this.game.pieces.find(item => item.x === x && item.y === y);
        this.message = this.game.hintCell ? hintMessage(this.game.hintCell) : `这格${Engine.shapeName(piece)}的接口朝${Engine.portNames(piece)}。相邻两格的接口相对，小动物才能通过。`;
      }
      if (this.game.result.solved) this.progress[this.index] = Math.max(this.progress[this.index], Engine.stars(this.game));
      return changed;
    }
    view() {
      const game = this.game;
      const stars = Engine.stars(game);
      const lamps = game.pieces.map((piece, index) =>
        [1, 2, 4, 8].includes(piece.ports) &&
        !(piece.x === game.level.source.x && piece.y === game.level.source.y) ? index : -1
      ).filter(index => index >= 0);
      const indices = this.indices(), next = this.nextIndex();
      const choices = indices.map((index, position) => ({
        index, number: String(position + 1).padStart(2, '0'), name: levels[index].name,
        size: levels[index].size,
        active: index === this.index, locked: !this.canSelect(index),
        hearts: this.progress[index],
        stars: this.progress[index], starText: this.progress[index] ? '★'.repeat(this.progress[index]) : '未完成',
        statusText: !this.canSelect(index) ? '按顺序通关解锁' : (this.progress[index] ? '已通关 · 可重玩' : '当前可挑战')
      }));
      const sections = [];
      choices.forEach(choice => {
        const index = choice.index, level = levels[index];
        if (!sections[level.section]) sections[level.section] = { index: level.section, name: level.sectionName, title: `第${['一', '二', '三', '四'][level.section]}章 · ${level.sectionName}`, choices: [], completed: 0 };
        sections[level.section].choices.push(choice);
        if (this.progress[index]) sections[level.section].completed += 1;
      });
      return {
        index: this.index, number: String(indices.indexOf(this.index) + 1).padStart(2, '0'),
        total: indices.length, name: game.level.name, chapter: game.level.chapter,
        totalText: String(indices.length).padStart(2, '0'),
        modes: this.modes(), modeSize: this.modeSize,
        modeTitle: `${game.level.size} × ${game.level.size}`,
        overallCompleted: this.progress.filter(value => value > 0).length,
        overallTotal: levels.length,
        totalHearts: this.progress.reduce((total, value) => total + value, 0), maxHearts: levels.length * 3,
        section: game.level.section, sectionTitle: sections[game.level.section].title,
        sections, size: game.level.size,
        description: game.level.description, tip: this.message || game.level.tip,
        moves: game.moves, par: game.level.par, lit: game.result.lit.length,
        lamps: lamps.length, litLamps: lamps.filter(index => game.result.lit.includes(index)).length,
        nodes: game.pieces.length, openPorts: game.result.openPorts, solved: game.result.solved, canUndo: game.history.length > 0 && !game.result.solved,
        stars, starText: '★'.repeat(stars) + '☆'.repeat(3 - stars),
        hearts: stars, bestHearts: this.progress[this.index],
        allComplete: indices.every(index => this.progress[index] > 0),
        last: next === null,
        nextIndex: next, nextNumber: next === null ? null : String(indices.indexOf(next) + 1).padStart(2, '0'),
        nextSize: next === null ? null : levels[next].size,
        completed: indices.filter(index => this.progress[index] > 0).length,
        choices
      };
    }
  }
  return { Session, STORAGE_KEY, mergeProgress };
}));
