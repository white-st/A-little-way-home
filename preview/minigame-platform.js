// Browser-only bridge. It previews the actual game UI, not the WeChat runtime.
window.LumenAudio = {
  createWechatSoundVoice: (_, file, error, volume) => createBrowserSoundVoice(file, error, volume),
  createWechatMusicVoice: (_, file, error, volume) => createBrowserMusicVoice(file, error, volume)
};
window.createMinigamePreviewPlatform = canvas => {
  const listeners = {};
  const wx = {
    // Native WeChat creates the screen canvas first, then offscreen canvases.
    // The browser preview reuses its DOM screen when a demo is restarted.
    getMainCanvas: () => canvas,
    createCanvas: () => document.createElement('canvas'),
    getAccountInfoSync: () => ({miniProgram:{envVersion:'develop'}}),
    getStorageSync: key => JSON.parse(localStorage.getItem(`minigame-preview:${key}`)),
    setStorageSync: (key, value) => localStorage.setItem(`minigame-preview:${key}`, JSON.stringify(value)),
    getWindowInfo: () => {
      const box = canvas.getBoundingClientRect();
      return { windowWidth: box.width, windowHeight: box.height, pixelRatio: devicePixelRatio, safeArea: { top: 24, bottom: box.height - 16 } };
    },
    getMenuButtonBoundingClientRect: () => ({ bottom: 52 })
  };
  ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Show', 'Hide', 'WindowResize'].forEach(name => {
    wx[`on${name}`] = handler => { listeners[name] = handler; };
    wx[`off${name}`] = () => { delete listeners[name]; };
  });
  const fingers = new Map();
  function event(event, name, ended) {
    const box = canvas.getBoundingClientRect();
    const touch = { identifier: event.pointerId, clientX: event.clientX - box.left, clientY: event.clientY - box.top };
    if (ended) fingers.delete(event.pointerId); else fingers.set(event.pointerId, touch);
    if (listeners[name]) listeners[name]({ touches: [...fingers.values()], changedTouches: [touch] });
  }
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); event(e, 'TouchStart', false); });
  canvas.addEventListener('pointermove', e => { if (fingers.has(e.pointerId)) event(e, 'TouchMove', false); });
  canvas.addEventListener('pointerup', e => event(e, 'TouchEnd', true));
  canvas.addEventListener('pointercancel', e => event(e, 'TouchCancel', true));
  document.addEventListener('visibilitychange', () => {
    fingers.clear(); const handler = listeners[document.hidden ? 'Hide' : 'Show']; if (handler) handler();
  });
  window.addEventListener('resize', () => { if (listeners.WindowResize) listeners.WindowResize(); });
  return wx;
};
