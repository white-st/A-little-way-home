const { GameApp } = require('./src/application');

const game = new GameApp(wx, {
  request: callback => requestAnimationFrame(callback),
  cancel: id => cancelAnimationFrame(id)
});
game.start();
