(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(
    require('../core/session'), require('../core/renderer'), require('../core/sound'),
    require('../core/music'), require('../core/sound-player'), require('./view'), require('../core/profile'), require('../core/classic'), require('../core/homecoming'), require('../core/engine'));
  else root.LumenGame = factory(root.LightSession, root.LightRenderer, root.LightSound,
    root.LightMusic, root.LumenAudio, root.LumenView, root.LightProfile, root.LightClassic, root.AnimalHomecoming, root.LightEngine);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (SessionModule, Renderer, Sound, Music, Audio, View, ProfileModule, Classic, Homecoming, Engine) {
  function allowsTestSupply(platform) {
    try {
      const info=platform.getAccountInfoSync && platform.getAccountInfoSync();
      const version=info && info.miniProgram && info.miniProgram.envVersion;
      return version==='develop' || version==='trial';
    } catch (error) {
      console.warn('[探索新道路 版本识别] 测试补给已关闭',error);
      return false;
    }
  }
  class GameApp {
    constructor(platform, frames) {
      this.wx = platform;
      this.frames = frames;
      this.testSupplyEnabled = allowsTestSupply(platform);
      this.canvas = platform.getMainCanvas ? platform.getMainCanvas() : platform.createCanvas();
      this.ctx = this.canvas.getContext('2d');
      this.grain = View.createGrain(platform.createCanvas(), this.ctx);
      this.visible = true;
      this.disposed = false;
      this.started = false;
      this.frame = null;
      this.screen = 'home';
      this.settingsReturn = 'home';
      this.levelPage = 0;
      this.notice = '';
      this.celebration = null;
      this.homecoming = null;
      this.touch = null;
      this.buttonPress = null;
      this.failedReads = new Set();
      this.pendingWrites = new Map();
      const savedProgress=this.read(SessionModule.STORAGE_KEY),savedProfile=this.read(ProfileModule.STORAGE_KEY);
      const progress=SessionModule.mergeProgress(savedProgress,savedProfile && savedProfile.version===1 ? savedProfile.rewardedStars : null);
      this.session = new SessionModule.Session(progress);
      this.campaign = this.session;
      this.campaignPaid = false;
      this.recordKind = 'classic';
      this.classicMode = 'relaxed';
      this.energyReturn = 'home';
      this.checkinReturn = 'home';
      this.pendingEnergy = null;
      this.profile = new ProfileModule.Profile(savedProfile, this.campaign.progress);
      // Repair only an actual recovered win; never write an empty default on startup.
      const priorProgress=SessionModule.mergeProgress(savedProgress);
      if (progress.some((stars,i)=>stars>priorProgress[i])) this.saveCampaign();
      this.saveProfile();
      this.sound = new Sound.SoundEffects({
        saved: this.read(Sound.STORAGE_KEY, false), savedVolume: this.read(Sound.VOLUME_KEY),
        createVoice: (file, error, volume) => Audio.createWechatSoundVoice(platform, file, error, volume),
        onError: error => this.audioError('音效', error)
      });
      this.music = new Music.BackgroundMusic({
        saved: this.read(Music.STORAGE_KEY, false), savedVolume: this.read(Music.VOLUME_KEY),
        createVoice: (file, error, volume) => Audio.createWechatMusicVoice(platform, file, error, volume),
        onError: error => this.audioError('背景音乐', error)
      });
      this.sound.setActive(false);
      this.handlers = {
        TouchStart: event => this.touchStart(event),
        TouchMove: event => this.touchMove(event),
        TouchEnd: event => this.touchEnd(event),
        TouchCancel: () => { this.cancelTouch(); this.draw(); },
        Hide: () => this.hide(),
        Show: () => this.show(),
        WindowResize: () => this.resize()
      };
      this.resize();
    }
    read(key, fallback) {
      try { return this.wx.getStorageSync(key); }
      catch (error) { this.failedReads.add(key); this.warn('本地设置读取失败，使用临时设置继续。'); return fallback; }
    }
    write(key, value) {
      const snapshot=JSON.parse(JSON.stringify(value));
      try {
        this.wx.setStorageSync(key, snapshot); this.pendingWrites.delete(key);
        if (!this.pendingWrites.size && this.notice==='设置或进度未能保存，本次操作仍然有效。') this.notice='';
        return true;
      } catch (error) {
        this.pendingWrites.set(key,snapshot);
        this.warn('设置或进度未能保存，本次操作仍然有效。'); return false;
      }
    }
    get storageWarning() {
      if(this.failedReads.has(SessionModule.STORAGE_KEY) || this.failedReads.has(ProfileModule.STORAGE_KEY))
        return '存档读取异常，请重新进入；原记录未覆盖';
      return this.pendingWrites.size ? '进度或设置尚未保存，退后台时会重试' : '';
    }
    flushWrites() {
      for(const [key,value] of [...this.pendingWrites]) this.write(key,value);
    }
    saveCampaign() {
      if(this.failedReads.has(SessionModule.STORAGE_KEY)) return false;
      return this.write(SessionModule.STORAGE_KEY,this.campaign.progress);
    }
    warn(message) { this.notice = message; }
    saveProfile() {
      if (this.failedReads.has(ProfileModule.STORAGE_KEY) || this.failedReads.has(SessionModule.STORAGE_KEY)) {
        this.warn('本机档案暂时无法读取，本次奖励仅临时保留。'); return;
      }
      this.write(ProfileModule.STORAGE_KEY, this.profile.data);
    }
    useEnergy(intent = { type: 'resume' }) {
      // Test resources are a runtime entitlement, never an infinite saved balance.
      if (this.testSupplyEnabled) { this.pendingEnergy=null; return true; }
      if (!this.profile.spendEnergy()) {
        this.pendingEnergy = { ...intent, session: this.session, game: this.session.game };
        this.navigate('energy'); this.notice = '体力不足，可以等待恢复或用钻石补充'; this.draw();
        return false;
      }
      this.pendingEnergy = null;
      this.saveProfile(); return true;
    }
    energyChoice() {
      const view=this.session.view(),pending=this.pendingEnergy;
      let choice=pending && pending.session===this.session && pending.game===this.session.game ? {...pending} : null;
      if (!choice) {
        if (this.traveling()) choice={type:'resume'};
        else if (view.classic && view.solved) choice={type:'classic',size:view.size,mode:this.session.mode};
        else if (!view.classic && view.solved && !view.last) choice={type:'next'};
        else choice={type:'resume'};
      }
      const needsEnergy=choice.type!=='resume' || (this.session===this.campaign && !this.campaignPaid);
      const label=choice.type==='next' ? '继续下一关' : choice.type==='classic' ? '开始下一局'
        : choice.type==='select' ? '进入所选关卡'
        : this.traveling() ? '继续动物回家' : view.solved || view.failed ? '重玩本关' : needsEnergy ? '开始当前关' : '继续游戏';
      const selected=choice.type==='select' && view.choices.find(item=>item.index===choice.index);
      const size=choice.type==='next' ? view.nextSize : selected ? selected.size : view.size;
      const number=choice.type==='next' ? view.nextNumber : selected ? selected.number : view.number;
      const detail=choice.type==='classic' ? `${choice.size} × ${choice.size} · ${Classic.MODES[choice.mode]}`
        : `${size} × ${size} · ${view.classic ? '当前随机棋盘' : `第 ${number} 关`}`;
      return {...choice,label,detail,needsEnergy};
    }
    continueAfterEnergy() {
      if (this.screen!=='energy') return;
      const choice=this.energyChoice();
      if (choice.needsEnergy && !this.testSupplyEnabled && this.profile.view().energy<1) return;
      this.pendingEnergy=null;
      if (choice.type==='next') {
        if (this.act('next')) this.navigate('game');
      } else if (choice.type==='classic') this.startClassic(choice.size,choice.mode);
      else if (choice.type==='select') this.select(choice.index);
      else this.resume();
    }
    canSolveForTesting() {
      return this.testSupplyEnabled && this.visible && !this.disposed && this.screen==='game' &&
        !this.session.game.result.solved && !this.session.failed &&
        (this.session!==this.campaign || this.campaignPaid);
    }
    solveForTesting() {
      if (!this.canSolveForTesting()) return false;
      // Validate the starting solution before resetting this attempt. Replaying the
      // normal rotations keeps scoring and the limited-mode budget consistent.
      const level=this.session.game.level,answer=Engine.solve(level,level.pieces);
      if (!answer || !answer.changes.length) { this.warn('当前棋盘暂时无法自动解谜'); return false; }
      this.session.act('reset');
      for (const step of answer.changes) {
        for (let turn=0;turn<step.turns;turn++) {
          if (this.session.game.result.solved) return true;
          if (!this.session.act('rotate',step.x,step.y)) return false;
        }
      }
      return this.session.game.result.solved;
    }
    audioError(kind, error) {
      const code = error && error.errCode != null ? `（${error.errCode}）` : '';
      this.warn(`${kind}暂时无法播放${code}，游戏仍可继续。`);
      console.warn(`[探索新道路 ${kind}]`, error);
    }
    start() {
      if (this.started || this.disposed) return;
      this.started = true;
      Object.keys(this.handlers).forEach(name => this.wx[`on${name}`](this.handlers[name]));
      this.loop();
    }
    resize(keepButtonFeedback = false) {
      const released=keepButtonFeedback && this.buttonPress && this.buttonPress.releasedAt!==null ? this.buttonPress : null;
      this.cancelTouch();
      this.buttonPress=released;
      const info = this.wx.getWindowInfo();
      const width = info.windowWidth, height = info.windowHeight;
      const capsule = this.wx.getMenuButtonBoundingClientRect();
      const safeTop = Math.max(info.safeArea ? info.safeArea.top : 0, capsule.bottom || 0);
      const safeBottom = info.safeArea ? Math.max(0, height - info.safeArea.bottom) : 0;
      this.scale = Math.min(width / 375, (height - safeTop - safeBottom) / 630, 1.8);
      this.width = Math.min(430, width / this.scale);
      this.height = height / this.scale;
      this.offsetX = (width - this.width * this.scale) / 2;
      this.top = safeTop / this.scale + 12;
      this.bottom = safeBottom / this.scale;
      const ratio = info.pixelRatio;
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.fillStyle = this.profile.view().themeInfo.bg;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.setTransform(ratio * this.scale, 0, 0, ratio * this.scale, this.offsetX * ratio, 0);
      Renderer.resetMotion(this.ctx);
      this.draw();
    }
    loop() {
      if (!this.visible || this.disposed || this.frame !== null) return;
      this.frame = this.frames.request(() => {
        this.frame = null;
        if (!this.visible || this.disposed) return;
        this.draw();
        this.loop();
      });
    }
    draw() {
      if (!this.ctx || this.disposed) return;
      if (this.profile.refresh()) this.saveProfile();
      const now = Date.now();
      if (this.buttonPress && this.buttonPress.releasedAt !== null && now-this.buttonPress.releasedAt>=420) this.buttonPress=null;
      this.updateHomecoming(now);
      this.layout = View.render(this.ctx, this, Renderer, now);
    }
    traveling() {
      return !!(this.homecoming && this.homecoming.game === this.session.game && !this.homecoming.done);
    }
    updateHomecoming(now) {
      const journey = this.homecoming;
      if (!journey) return;
      if (journey.game !== this.session.game) { this.homecoming = null; return; }
      const active = this.visible && this.screen === 'game';
      journey.advance(now, active);
      if (active && journey.done && !journey.presented) {
        this.cancelTouch();
        journey.presented = true;
        this.celebration = { game: journey.game, startedAt: now, reward: journey.reward };
        this.sound.play('complete');
      }
    }
    hide() {
      this.flushWrites();
      this.updateHomecoming(Date.now());
      this.visible = false;
      if (this.homecoming) this.homecoming.advance(Date.now(), false);
      this.cancelTouch();
      this.sound.setActive(false);
      this.music.setActive(false);
      if (this.frame !== null) this.frames.cancel(this.frame);
      this.frame = null;
      Renderer.resetMotion(this.ctx);
    }
    show() {
      if (this.disposed) return;
      this.flushWrites();
      this.visible = true;
      this.sound.setActive(this.screen === 'game' || this.screen === 'settings');
      this.music.setActive(true);
      this.loop();
    }
    destroy() {
      if (this.disposed) return;
      this.hide();
      this.disposed = true;
      this.sound.destroy();
      this.music.destroy();
      this.grain = null;
      if (this.started) Object.keys(this.handlers).forEach(name => this.wx[`off${name}`](this.handlers[name]));
    }
    navigate(screen) {
      this.updateHomecoming(Date.now());
      const resource=screen==='energy'||screen==='diamond',wasResource=this.screen==='energy'||this.screen==='diamond';
      if (resource && !wasResource && !(this.screen==='checkin' && this.checkinReturn===screen)) this.energyReturn=this.screen;
      if (screen === 'checkin' && this.screen !== 'checkin') this.checkinReturn=wasResource?this.screen:'home';
      if (!resource && screen !== 'checkin') this.pendingEnergy=null;
      const resourceFlow=resource || (screen==='checkin' && ['energy','diamond'].includes(this.checkinReturn));
      if (screen !== 'game' && !resourceFlow) this.celebration = null;
      if (screen === 'settings' && this.screen !== 'settings') this.settingsReturn = this.screen;
      if (screen === 'levels') this.levelPage = Math.floor((Number(this.session.view().number) - 1) / View.LEVELS_PER_PAGE);
      this.screen = screen;
      this.notice = '';
      this.cancelTouch();
      this.sound.setActive(this.visible && (screen === 'game' || screen === 'settings'));
      Renderer.resetMotion(this.ctx);
      this.draw();
    }
    act(action, x, y) {
      if (action === 'next') {
        if (this.traveling()) return false;
        if (this.session !== this.campaign || !this.session.game.result.solved || this.session.view().last) return false;
        if (!this.useEnergy({type:'next'})) return false;
        this.campaignPaid = true;
      }
      const before = Sound.snapshot(this.session.game);
      const changed=action==='test-solve' ? this.solveForTesting() : this.session.act(action, x, y);
      if (!changed) { this.draw(); return false; }
      const won = !before.solved && this.session.game.result.solved;
      if (won) {
        const kind = this.session === this.campaign ? 'campaign' : this.session.mode==='limited' ? 'limited' : 'classic';
        const reward = this.profile.complete(kind, kind === 'campaign' ? this.session.index : this.session.runId, this.session.game, this.session.view().stars);
        this.saveProfile();
        this.homecoming = new Homecoming.Journey(this.session.game, Date.now());
        this.homecoming.reward = reward;
        this.celebration = null;
      } else if (before.game !== this.session.game) { this.celebration = null; this.homecoming = null; }
      this.music.interact();
      this.sound.afterAction(before, this.session.game, action, won);
      if (this.session === this.campaign && this.session.game.result.solved) this.saveCampaign();
      this.draw();
      return true;
    }
    select(index) {
      if (this.session !== this.campaign || !this.session.canSelect(index)) return;
      if (index === this.session.index && this.traveling()) return this.navigate('game');
      if (!this.campaignPaid || index !== this.session.index) {
        if (!this.useEnergy({type:'select',index})) return;
        this.campaignPaid = true;
      }
      if (index !== this.session.index || this.session.game.result.solved) {
        if (!this.session.select(index)) return;
      }
      this.music.interact();
      this.sound.stop();
      this.navigate('game');
    }
    openCampaign() {
      this.session = this.campaign;
      this.music.interact();
      this.navigate('levels');
    }
    resume() {
      if (this.traveling()) return this.navigate('game');
      if (this.session !== this.campaign) {
        if (this.session.game.result.solved) return this.startClassic(this.session.modeSize,this.session.mode);
        if (this.session.failed) this.act('reset');
        return this.navigate('game');
      }
      if (this.session.game.result.solved && !this.session.view().last) {
        if (!this.useEnergy({type:'next'})) return;
        this.session.act('next');
      } else if (!this.campaignPaid) {
        if (!this.useEnergy()) return;
      } else if (this.session.game.result.solved) this.session.act('reset');
      this.campaignPaid = true;
      this.music.interact();
      this.navigate('game');
    }
    startClassic(size, mode=this.classicMode) {
      if (!Number.isInteger(size) || size < 5 || size > 9 || !Classic.MODES[mode]) return;
      if (!this.useEnergy({type:'classic',size,mode})) return;
      const id = this.profile.newRun();
      this.classicMode=mode;
      this.session = new Classic.ClassicSession(size, (Date.now() + Math.imul(id, 7919)) >>> 0, id,mode);
      this.saveProfile(); this.music.interact(); this.sound.stop(); this.navigate('game');
    }
    volume(kind, value, persist) {
      const player = this[kind], mod = kind === 'music' ? Music : Sound;
      const wasEnabled=player.enabled;
      player.setVolume(Math.round(Math.max(0, Math.min(1, value)) * 100) / 100);
      if (wasEnabled !== (player.volume>0)) player.setEnabled(player.volume>0);
      if (player.enabled && !wasEnabled) {
        if (kind==='music') player.interact();
        else { if(this.notice.startsWith('音效暂时'))this.notice=''; player.play('rotate'); }
      }
      if (persist) { this.write(mod.VOLUME_KEY, player.volume); this.write(mod.STORAGE_KEY, player.enabled); }
      this.draw();
    }
    command(id) {
      if (id === 'campaign') return this.openCampaign();
      if (id === 'classic-modes') return this.navigate('classic');
      if (id.startsWith('classic-mode:')) {
        const mode=id.split(':')[1];if(!Classic.MODES[mode])return;
        this.classicMode=mode;return this.navigate('classic-size');
      }
      if (id === 'classic-sizes') {
        if(this.session!==this.campaign)this.classicMode=this.session.mode;
        return this.navigate('classic-size');
      }
      if (id === 'energy' || id === 'diamond') return this.navigate(id);
      if (id === 'energy-continue') return this.continueAfterEnergy();
      if (id === 'test-refill' || id === 'ad' || id === 'recharge') return;
      if (['home', 'levels', 'settings', 'game', 'checkin', 'records', 'help'].includes(id)) return this.navigate(id);
      if (id === 'back') return this.navigate(this.screen === 'settings' ? this.settingsReturn : ['energy','diamond'].includes(this.screen) ? this.energyReturn : this.screen === 'checkin' ? this.checkinReturn : this.screen==='classic-size' ? 'classic' : 'home');
      if (id === 'claim') {
        const reward = this.profile.checkin();
        this.notice = reward ? `签到成功，获得 ${reward} 钻石` : '今天已经领取过了'; this.saveProfile(); this.draw(); return;
      }
      if (id === 'refill') {
        if(this.screen!=='energy'||!this.visible||this.disposed)return;
        if(this.testSupplyEnabled)this.notice='测试版体力和钻石无限，无需补充';
        else { this.notice=this.profile.buyEnergy() || '已补充 1 点体力'; this.saveProfile(); }
        this.draw(); return;
      }
      if (id === 'night-mode') { this.profile.toggleNightMode(); this.saveProfile(); this.resize(true); return; }
      if (id==='themes' || id.startsWith('theme:')) return;
      if (id.startsWith('record-kind:')) { this.recordKind = id.split(':')[1]; this.draw(); return; }
      if (id.startsWith('classic:')) return this.startClassic(Number(id.split(':')[1]));
      if (id === 'classic-next') {
        if(this.screen==='game' && this.session!==this.campaign && !this.traveling() && (this.session.game.result.solved||this.session.failed))
          return this.startClassic(this.session.modeSize,this.session.mode);
        return;
      }
      if (id === 'resume') return this.resume();
      if (id === 'celebration-close') { this.celebration = null; this.draw(); return; }
      if (id === 'page-prev' || id === 'page-next') {
        const last = Math.ceil(this.session.view().total / View.LEVELS_PER_PAGE) - 1;
        this.levelPage = Math.max(0, Math.min(last, this.levelPage + (id === 'page-next' ? 1 : -1)));
        this.draw(); return;
      }
      if (id.startsWith('select:')) return this.select(Number(id.split(':')[1]));
      if (id === 'restart' || id === 'confirm') return;
      this.act(id);
    }
    point(touch) {
      return { x: (touch.clientX - this.offsetX) / this.scale, y: touch.clientY / this.scale };
    }
    target(point) {
      return [...this.layout.targets].reverse().find(item => !item.disabled &&
        point.x >= item.x && point.x <= item.x + item.w && point.y >= item.y && point.y <= item.y + item.h);
    }
    cancelTouch() {
      this.touch=null;
      this.buttonPress=null;
    }
    touchStart(event) {
      this.cancelTouch();
      if (!this.visible || this.disposed || event.touches.length !== 1) return;
      const finger = event.touches[0], point = this.point(finger), target = this.target(point);
      this.touch = { ...point, identifier: finger.identifier, target, moved: false };
      if (target && target.kind === 'slider') this.volume(target.id, (point.x - target.trackX) / target.trackW, true);
      else if (target) {
        this.buttonPress={id:target.id,x:target.x,y:target.y,startedAt:Date.now(),releasedAt:null};
        this.draw();
      }
    }
    touchMove(event) {
      if (!this.touch) return;
      if (event.touches.length !== 1) { this.cancelTouch(); this.draw(); return; }
      const finger = event.touches[0];
      if (finger.identifier !== this.touch.identifier) return;
      const point = this.point(finger), target = this.touch.target;
      if (target && target.kind === 'slider') {
        this.volume(target.id, (point.x - target.trackX) / target.trackW, true);
      } else if (Math.hypot(point.x - this.touch.x, point.y - this.touch.y) > 12 ||
        (target && (point.x<target.x || point.x>target.x+target.w || point.y<target.y || point.y>target.y+target.h))) {
        this.touch.moved = true;this.buttonPress=null;this.draw();
      }
    }
    touchEnd(event) {
      const start = this.touch;
      this.touch = null;
      if (!start || !this.visible || this.disposed) { this.buttonPress=null;return; }
      const finger = event.changedTouches.find(item => item.identifier === start.identifier);
      if (!finger) { this.buttonPress=null;return; }
      const point = this.point(finger), target = start.target;
      if (target && target.kind === 'slider') {
        this.volume(target.id, (point.x - target.trackX) / target.trackW, true); return;
      }
      if (start.moved || Math.hypot(point.x - start.x, point.y - start.y) > 12) { this.buttonPress=null;this.draw();return; }
      if (target) {
        const endTarget = this.target(point);
        if (endTarget && endTarget.id === target.id) {
          if(this.buttonPress)this.buttonPress.releasedAt=Date.now();
          this.command(target.id);
        } else {this.buttonPress=null;this.draw();}
        return;
      }
      if (this.screen !== 'game' || this.confirm) return;
      const board = this.layout.board;
      if (!board) return;
      if (point.x < board.x || point.y < board.y || point.x >= board.x + board.w || point.y >= board.y + board.w) return;
      const cell = Renderer.hitTest(board.w, this.session.game.level.size, point.x - board.x, point.y - board.y);
      if (cell) this.act('rotate', cell.x, cell.y);
    }
  }
  return { GameApp };
}));
