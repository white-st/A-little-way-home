const { Session, STORAGE_KEY } = require('../../core/session');
const Renderer = require('../../core/renderer');
const Sound = require('../../core/sound');
const Music = require('../../core/music');
const { createWechatSoundVoice, createWechatMusicVoice } = require('../../core/sound-player');

Page({
  data: { view: null, showLevels: false, restartConfirm: false, error: '', storageWarning: '', soundEnabled: true, soundVolume: 65, soundWarning: '', musicEnabled: true, musicVolume: 28, musicWarning: '' },
  onLoad() {
    let saved;
    try { saved = wx.getStorageSync(STORAGE_KEY); }
    catch (error) { this.setData({ storageWarning: '进度读取失败，本次仍可正常游玩。' }); }
    this.session = new Session(saved);
    let soundSaved;
    try { soundSaved = wx.getStorageSync(Sound.STORAGE_KEY); }
    catch (error) { soundSaved = false; this.setData({ soundWarning: '音效设置读取失败，已暂时静音，可手动开启。' }); }
    this.sound = new Sound.SoundEffects({ saved: soundSaved, savedVolume: this.readVolume(Sound.VOLUME_KEY), createVoice: (file, onError, volume) => createWechatSoundVoice(wx, file, onError, volume), onError: () => this.setData({ soundWarning: '音效暂时无法播放，游戏仍可继续。' }) });
    this.setData({ soundEnabled: this.sound.enabled, soundVolume: Math.round(this.sound.volume * 100) });
    let musicSaved;
    try { musicSaved = wx.getStorageSync(Music.STORAGE_KEY); }
    catch (error) { musicSaved = false; this.setData({ musicWarning: '音乐设置读取失败，已暂时关闭，可手动开启。' }); }
    this.music = new Music.BackgroundMusic({ saved: musicSaved, savedVolume: this.readVolume(Music.VOLUME_KEY), createVoice: (file, onError, volume) => createWechatMusicVoice(wx, file, onError, volume), onError: () => this.setData({ musicWarning: '背景音乐暂时无法播放，游戏仍可继续。' }) });
    this.setData({ musicEnabled: this.music.enabled, musicVolume: Math.round(this.music.volume * 100) });
    this.refresh();
  },
  onReady() { this.setupCanvas(); },
  onShow() { this.visible = true; this.sound.setActive(!this.data.showLevels); this.music.setActive(true); this.startAnimation(); },
  onHide() { this.visible = false; this.sound.setActive(false); this.music.setActive(false); this.stopAnimation(); },
  onUnload() { this.visible = false; this.disposed = true; this.sound.destroy(); this.music.destroy(); this.stopAnimation(); },
  onResize() { this.setupCanvas(); },
  setupCanvas() {
    this.stopAnimation();
    this.createSelectorQuery().select('#board').fields({ node: true, size: true }).exec(results => {
      if (this.disposed) return;
      const info = results[0];
      if (!info || !info.node) { this.setData({ error: '画布加载失败，请更新微信后重新打开。' }); return; }
      this.canvas = info.node;
      this.context = this.canvas.getContext('2d');
      this.width = info.width;
      const ratio = wx.getWindowInfo().pixelRatio;
      this.canvas.width = info.width * ratio;
      this.canvas.height = info.width * ratio;
      this.context.scale(ratio, ratio);
      this.draw();
      this.startAnimation();
    });
  },
  draw() { if (this.context) Renderer.render(this.context, this.width, this.session.game, Date.now()); },
  startAnimation() {
    if (!this.visible || !this.canvas || this.frame != null) return;
    const tick = () => {
      this.frame = null;
      if (!this.visible || this.disposed || this.data.showLevels) return;
      this.draw();
      this.frame = this.canvas.requestAnimationFrame(tick);
    };
    this.frame = this.canvas.requestAnimationFrame(tick);
  },
  stopAnimation() {
    if (this.canvas && this.frame != null) this.canvas.cancelAnimationFrame(this.frame);
    this.frame = null;
    Renderer.resetMotion(this.context);
  },
  refresh() { this.setData({ view: this.session.view() }); this.draw(); },
  act(action, x, y) {
    const before = Sound.snapshot(this.session.game);
    if (!this.session.act(action, x, y)) return;
    this.music.interact();
    this.sound.afterAction(before, this.session.game, action);
    if (this.session.game.result.solved || action === 'restart') {
      try { wx.setStorageSync(STORAGE_KEY, this.session.progress); }
      catch (error) { this.setData({ storageWarning: '进度未能保存，关闭后可能丢失。' }); }
    }
    this.refresh();
    if (action === 'next' || action === 'restart') wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },
  onBoardStart(event) {
    this.touchStart = event.touches.length === 1 ? { x: event.touches[0].x, y: event.touches[0].y } : null;
  },
  onBoardCancel() { this.touchStart = null; },
  onBoardTouch(event) {
    const start = this.touchStart;
    this.touchStart = null;
    if (!this.width || this.data.showLevels) return;
    const touch = event.changedTouches[0];
    if (!touch || !start || Math.hypot(touch.x - start.x, touch.y - start.y) > 12) return;
    const cell = Renderer.hitTest(this.width, this.session.game.level.size, touch.x, touch.y);
    if (cell) this.act('rotate', cell.x, cell.y);
  },
  onAction(event) { this.act(event.currentTarget.dataset.action); },
  readVolume(key) {
    try { return wx.getStorageSync(key); }
    catch (error) { this.setData({ storageWarning: '音量设置读取失败，已使用默认音量。' }); }
  },
  onVolume(event) {
    const kind = event.currentTarget.dataset.kind;
    if (!['music', 'sound'].includes(kind)) return;
    const player = this[kind], module = kind === 'music' ? Music : Sound;
    player.setVolume(event.detail.value / 100);
    this.setData({ [`${kind}Volume`]: Math.round(player.volume * 100) });
    try { wx.setStorageSync(module.VOLUME_KEY, player.volume); }
    catch (error) { this.setData({ [`${kind}Warning`]: '音量未能保存，本次调整仍然有效。' }); }
  },
  toggleSound() {
    this.sound.setEnabled(!this.sound.enabled);
    this.setData({ soundEnabled: this.sound.enabled });
    try { wx.setStorageSync(Sound.STORAGE_KEY, this.sound.enabled); }
    catch (error) { this.setData({ soundWarning: '音效设置未能保存，本次切换仍然有效。' }); }
  },
  toggleMusic() {
    this.music.setEnabled(!this.music.enabled);
    if (this.music.enabled) this.music.interact();
    this.setData({ musicEnabled: this.music.enabled });
    try { wx.setStorageSync(Music.STORAGE_KEY, this.music.enabled); }
    catch (error) { this.setData({ musicWarning: '音乐设置未能保存，本次切换仍然有效。' }); }
  },
  toggleLevels() {
    this.setData({ showLevels: !this.data.showLevels, restartConfirm: false });
    this.sound.setActive(this.visible && !this.data.showLevels);
    if (this.data.showLevels) this.stopAnimation(); else this.startAnimation();
  },
  askRestart() { this.setData({ restartConfirm: true }); },
  cancelRestart() { this.setData({ restartConfirm: false }); },
  confirmRestart() {
    this.act('restart');
    this.setData({ showLevels: false, restartConfirm: false });
    this.sound.setActive(this.visible);
    this.startAnimation();
  },
  onSelect(event) {
    if (this.session.select(Number(event.currentTarget.dataset.index))) {
      this.music.interact();
      this.sound.stop(); this.sound.setActive(this.visible);
      this.setData({ showLevels: false, restartConfirm: false }); this.refresh(); this.startAnimation();
      wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    }
  }
});
