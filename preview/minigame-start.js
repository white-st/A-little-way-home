const gameCanvas = document.getElementById('game');
const miniGameApp = new LumenGame.GameApp(createMinigamePreviewPlatform(gameCanvas), {
  request: callback => requestAnimationFrame(callback),
  cancel: id => cancelAnimationFrame(id)
});
miniGameApp.start();
window.addEventListener('pagehide', () => miniGameApp.destroy());
