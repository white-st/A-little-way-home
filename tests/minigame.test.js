const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { GameApp } = require('../minigame/src/application');
const { STORAGE_KEY } = require('../minigame/core/session');
const Engine = require('../minigame/core/engine');
const Sound = require('../minigame/core/sound');
const Music = require('../minigame/core/music');
const Renderer = require('../minigame/core/renderer');

function fixture(options = {}) {
  const store = options.store || new Map(), listeners = {}, frames = new Map(), audio = [];
  let nextFrame = 0;
  const texts = [], canvases=[], patterns=[];
  const ctx = new Proxy({
    createLinearGradient: () => ({ addColorStop() {} }),
    createPattern: (source,repeat) => {const pattern={source,repeat};patterns.push(pattern);return pattern;},
    measureText: value => ({ width: [...value].length * 7 }),
    fillText: (value, x, y) => texts.push({ value, x, y })
  }, { get: (object, key) => key in object ? object[key] : () => {} });
  const info = { windowWidth: 375, windowHeight: 812, pixelRatio: 2, safeArea: { top: 44, bottom: 778 }, ...options.info };
  const wx = {
    getAccountInfoSync: () => {
      if(options.accountError)throw Error('version lookup');
      return {miniProgram:{envVersion:Object.hasOwn(options,'envVersion')?options.envVersion:'release'}};
    },
    createCanvas: () => {const canvas={getContext:()=>ctx};canvases.push(canvas);return canvas;},
    getWindowInfo: () => info,
    getMenuButtonBoundingClientRect: () => ({ bottom: 56 }),
    getStorageSync: key => { if (options.readError || options.readErrorKey === key) throw Error('disk'); return store.get(key); },
    setStorageSync: (key, value) => { if (options.writeError || options.writeErrorKeys?.has(key)) throw Error('disk'); store.set(key, structuredClone(value)); },
    createInnerAudioContext: () => {
      const voice = { played: 0, paused: 0, stopped: 0, destroyed: 0, onError(fn) { this.error = fn; }, offError() {},
        play() { this.played++; }, seek() {}, pause() { this.paused++; }, stop() { this.stopped++; }, destroy() { this.destroyed++; } };
      audio.push(voice); return voice;
    }
  };
  if(options.accountMissing)delete wx.getAccountInfoSync;
  ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show', 'WindowResize'].forEach(name => {
    wx[`on${name}`] = fn => { listeners[name] = fn; };
    wx[`off${name}`] = fn => { assert.equal(listeners[name], fn); delete listeners[name]; };
  });
  const scheduler = { request: fn => { frames.set(++nextFrame, fn); return nextFrame; }, cancel: id => frames.delete(id) };
  const app = new GameApp(wx, scheduler);
  app.start();
  function finger(x, y, id = 1) { return { clientX: x * app.scale + app.offsetX, clientY: y * app.scale, identifier: id }; }
  function tap(x, y) {
    const touch = finger(x, y);
    listeners.TouchStart({ touches: [touch] });
    listeners.TouchEnd({ touches: [], changedTouches: [touch] });
  }
  function click(id) {
    const item = app.layout.targets.find(item => item.id === id && item.kind !== 'slider');
    assert.ok(item, `button ${id} exists`);
    tap(item.x + item.w / 2, item.y + item.h / 2);
  }
  function cell(x, y) {
    const board = app.layout.board, size = app.session.game.level.size;
    const { padding, cell: unit } = Renderer.geometry(board.w, size);
    return { x: board.x + padding + (x + .5) * unit, y: board.y + padding + (y + .5) * unit };
  }
  return { app, wx, ctx, info, frames, listeners, audio, store, canvas:app.canvas, canvases, patterns, texts, tap, click, cell, finger };
}
function enter(f) { f.click('campaign'); f.click('resume'); }
function selectCard(f,index) {
  if(f.app.screen!=='levels') f.click('campaign');
  const page=Math.floor(f.app.session.indices().indexOf(index)/6);
  while(f.app.levelPage<page)f.click('page-next');
  while(f.app.levelPage>page)f.click('page-prev');
  f.click('select:'+index);
}
function beforeSize(size) {
  return require('../minigame/core/levels').map(level=>level.size<size?3:0);
}
function finishHomecoming(f) {
  const journey=f.app.homecoming;
  assert.ok(journey,'solving the roads starts a homecoming');
  journey.advance(journey.lastTime+journey.duration,true);f.app.draw();
}

test('raised controls press without acting and release once without moving their hit areas',t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  const f=fixture();enter(f);
  const command=f.app.command;let commands=0;
  t.mock.method(f.app,'command',function(id){commands++;return command.call(this,id);});
  const target=f.app.layout.targets.find(v=>v.id==='hint'),point=f.finger(target.x+target.w/2,target.y+target.h/2);
  const energy=f.app.profile.data.energy,moves=f.app.session.game.moves;
  f.listeners.TouchStart({touches:[point]});now+=150;f.app.draw();
  assert.equal(f.app.buttonPress.id,'hint');assert.equal(f.app.buttonPress.releasedAt,null);
  assert.equal(f.app.session.game.hintCell,null);assert.equal(f.app.session.game.moves,moves);
  assert.deepEqual(f.app.layout.targets.find(v=>v.id==='hint'),target,'pressed face keeps its original hit area');
  f.listeners.TouchEnd({changedTouches:[point]});
  assert.ok(f.app.session.game.hintCell,'action executes on release, without a delayed timer');
  assert.equal(f.app.buttonPress.releasedAt,now);
  assert.equal(commands,1);
  f.listeners.TouchEnd({changedTouches:[point]});assert.equal(commands,1);
  f.click('reset');now+=150;f.click('hint');now+=500;f.app.draw();
  assert.ok(f.app.session.game.hintCell);assert.equal(f.app.buttonPress,null);
  assert.equal(f.app.profile.data.energy,energy);assert.equal(f.frames.size,1,'feedback reuses the existing frame loop');
  f.app.destroy();
});

test('button holds cancel on drag, multitouch, interruption, resize and navigation',()=>{
  const f=fixture();enter(f);
  function hold(id='hint') {
    const target=f.app.layout.targets.find(v=>v.id===id),point=f.finger(target.x+target.w/2,target.y+target.h/2);
    f.listeners.TouchStart({touches:[point]});return point;
  }
  for(const cancel of [
    p=>f.listeners.TouchMove({touches:[{...p,clientX:p.clientX+90}]}),
    p=>f.listeners.TouchMove({touches:[p,{...p,identifier:2}]}),
    ()=>f.listeners.TouchCancel(),()=>{f.listeners.Hide();f.listeners.Show();},
    ()=>f.listeners.WindowResize(),()=>{f.app.navigate('settings');f.app.navigate('game');}
  ]) {
    const p=hold();cancel(p);assert.equal(f.app.buttonPress,null);
    f.listeners.TouchEnd({changedTouches:[p]});assert.equal(f.app.session.game.hintCell,null);
  }
  hold('undo');assert.equal(f.app.buttonPress,null,'disabled controls never depress');
  f.listeners.TouchCancel();f.click('settings');
  const slider=f.app.layout.targets.find(v=>v.kind==='slider'&&v.id==='music');
  const p=f.finger(slider.trackX+slider.trackW*.7,slider.y+slider.h/2);
  f.listeners.TouchStart({touches:[p]});assert.equal(f.app.buttonPress,null);
  f.listeners.TouchEnd({changedTouches:[p]});assert.ok(Math.abs(f.app.music.volume-.7)<.001);
  f.click('night-mode');assert.equal(f.app.buttonPress.id,'night-mode','changing appearance retains the release bounce');
  f.listeners.WindowResize();assert.equal(f.app.buttonPress,null);
  f.app.destroy();assert.equal(f.frames.size,0);
});

test('game toolbar uses named icons, omits repeated titles and expands the compact board',()=>{
  const f=fixture({envVersion:'develop',info:{windowWidth:320,windowHeight:568,safeArea:{top:24,bottom:552}}});enter(f);
  f.texts.length=0;f.app.draw();
  assert.ok(!f.texts.some(v=>v.value==='探索新道路'||v.value===f.app.session.view().name||v.value.startsWith('动物回家')));
  assert.ok(f.texts.some(v=>v.value===`第 ${f.app.session.view().number} 关`));
  for(const id of ['home','levels','settings','undo','reset','hint','test-solve'])
    assert.ok(f.app.layout.targets.find(v=>v.id===id).label,'icon keeps a descriptive action name');
  const previous=Math.min(f.app.width-28,f.app.height-f.app.top-f.app.bottom-270);
  assert.ok(f.app.layout.board.w>previous+40);
  f.app.destroy();
});

test('one-tap test solve follows homecoming, rewards, unlocking and cold-start storage',()=>{
  const f=fixture({envVersion:'develop'});enter(f);const energy=f.app.profile.data.energy;
  f.click('test-solve');assert.equal(f.app.session.game.result.solved,true);
  assert.equal(f.app.profile.data.energy,energy);assert.ok(f.app.traveling());
  assert.equal(f.store.get(STORAGE_KEY)[0],3);assert.equal(f.app.profile.data.diamonds,15);
  assert.equal(f.app.campaign.canSelect(f.app.campaign.nextIndex()),true);
  const game=f.app.session.game,journey=f.app.homecoming;
  f.app.command('test-solve');assert.equal(f.app.session.game,game);assert.equal(f.app.homecoming,journey);
  assert.equal(f.app.profile.data.diamonds,15);finishHomecoming(f);assert.ok(f.app.celebration);
  f.click('next');assert.equal(f.app.campaign.view().number,'02');assert.equal(f.app.profile.data.energy,energy);
  const restored=fixture({store:new Map(JSON.parse(JSON.stringify([...f.store])))});
  assert.equal(restored.app.campaign.progress[0],3);restored.app.destroy();f.app.destroy();
});

test('test solve is gated for both UI and commands and cannot run outside an active paid game',t=>{
  t.mock.method(console,'warn',()=>{});
  for(const options of [{envVersion:'develop'},{envVersion:'trial'},{envVersion:'release'},{envVersion:'unknown'},{envVersion:undefined},{accountMissing:true},{accountError:true}]) {
    const f=fixture(options),allowed=['develop','trial'].includes(options.envVersion);
    f.app.command('test-solve');assert.equal(f.app.session.game.result.solved,false);
    f.app.navigate('game');f.app.act('test-solve');assert.equal(f.app.session.game.result.solved,false);
    f.app.navigate('home');enter(f);
    assert.equal(f.app.layout.targets.some(t=>t.id==='test-solve'),allowed);
    f.click('settings');f.app.command('test-solve');assert.equal(f.app.session.game.result.solved,false);f.click('back');
    f.listeners.Hide();f.app.command('test-solve');assert.equal(f.app.session.game.result.solved,false);f.listeners.Show();
    f.app.command('test-solve');assert.equal(f.app.session.game.result.solved,allowed);
    f.app.destroy();
  }
});

test('test solve handles all 140 campaign boards without extra energy or unfinished routes',()=>{
  const f=fixture({envVersion:'develop',store:new Map([[STORAGE_KEY,Array(140).fill(3)]])});
  f.app.campaignPaid=true;const energy=f.app.profile.data.energy;
  for(const index of f.app.campaign.indices()) {
    f.app.session.select(index);f.app.homecoming=null;f.app.navigate('game');
    f.click('test-solve');assert.equal(f.app.session.game.result.solved,true,`level ${index}`);
    assert.ok(Engine.homeRoutes(f.app.session.game.level,f.app.session.game.pieces).length>0);
    assert.ok(f.app.traveling());assert.equal(f.app.profile.data.energy,energy);
  }
  f.app.destroy();
});

test('test solve restarts the same classic board then completes both modes within their budget',()=>{
  for(const mode of ['limited','relaxed'])for(const size of [5,6,7,8,9]) {
    const f=fixture({envVersion:'develop'});f.app.startClassic(size,mode);
    const level=f.app.session.level,run=f.app.session.runId,energy=f.app.profile.data.energy;
    const limit=f.app.session.view().moveLimit;
    if(limit)for(let i=0;i<limit-1;i++)f.app.session.act('rotate',0,0);
    else {f.app.act('rotate',0,0);f.app.act('hint');}
    f.app.draw();f.click('test-solve');
    assert.equal(f.app.session.game.level,level);assert.equal(f.app.session.runId,run);
    assert.equal(f.app.session.game.result.solved,true);assert.equal(f.app.session.failed,false);
    assert.equal(f.app.session.view().stars,3);assert.equal(f.app.profile.data.energy,energy);
    assert.equal(f.app.profile.data.classicCleared,1);assert.equal(f.app.profile.data.diamonds,5);
    assert.ok(f.app.campaign.progress.every(n=>n===0));finishHomecoming(f);
    f.click('reset');f.click('test-solve');assert.equal(f.app.profile.data.diamonds,5);
    f.app.destroy();
  }
});

test('test solve control fits small and large screens without shrinking the board',()=>{
  for(const [width,height] of [[320,568],[375,812],[768,1024]]) {
    const f=fixture({envVersion:'develop',info:{windowWidth:width,windowHeight:height,safeArea:{top:24,bottom:height-20}}});enter(f);
    const targets=['undo','reset','hint','test-solve'].map(id=>f.app.layout.targets.find(t=>t.id===id));
    for(let i=0;i<targets.length;i++) {
      const t=targets[i];assert.ok(t.x>=0&&t.x+t.w<=f.app.width);assert.ok(t.y+t.h<=f.app.height-f.app.bottom);
      if(i)assert.ok(targets[i-1].x+targets[i-1].w<t.x);
    }
    const board=f.app.layout.board.w;f.app.testSupplyEnabled=false;f.app.draw();assert.equal(f.app.layout.board.w,board);
    f.app.destroy();
  }
});

test('unreadable campaign storage cannot be overwritten by temporary progress',()=>{
  const saved=Array(140).fill(0);saved[0]=3;saved[1]=2;
  const f=fixture({store:new Map([[STORAGE_KEY,saved]]),readErrorKey:STORAGE_KEY});
  enter(f);f.app.act('rotate',1,1);
  assert.deepEqual(f.store.get(STORAGE_KEY),saved);
  f.listeners.Hide();f.app.destroy();assert.deepEqual(f.store.get(STORAGE_KEY),saved);
});

test('missing campaign progress recovers exact stars from paid rewards without granting them again',()=>{
  const {Profile,STORAGE_KEY:key}=require('../minigame/core/profile');
  const progress=Array(140).fill(0);progress[0]=3;progress[1]=2;progress[30]=1;
  const saved=new Profile(null,progress).data;saved.diamonds=7;
  const f=fixture({store:new Map([[key,saved]])});
  assert.deepEqual(f.app.campaign.progress,progress);assert.deepEqual(f.store.get(STORAGE_KEY),progress);
  assert.equal(f.app.profile.data.diamonds,7);assert.equal(f.app.campaign.canSelect(30),true);
  f.click('campaign');selectCard(f,0);f.app.act('rotate',1,1);assert.equal(f.app.profile.data.diamonds,7);
  f.app.destroy();
});

test('valid campaign stars survive partial older reward records and malformed reward values',()=>{
  const {Profile,STORAGE_KEY:key}=require('../minigame/core/profile');
  const progress=Array(140).fill(0);progress[0]=3;
  const saved=new Profile(null,progress).data;saved.rewardedStars[0]=1;saved.rewardedStars[1]=2;
  saved.rewardedStars[2]=99;saved.rewardedStars[3]='3';saved.rewardedStars[4]=-1;
  const f=fixture({store:new Map([[STORAGE_KEY,progress],[key,saved]])});
  assert.deepEqual(f.app.campaign.progress.slice(0,5),[3,2,0,0,0]);f.app.destroy();
  const restarted=fixture({store:new Map(JSON.parse(JSON.stringify([...f.store])))});
  assert.deepEqual(restarted.app.campaign.progress.slice(0,5),[3,2,0,0,0]);restarted.app.destroy();
});

test('a failed win save retries on hide, and cold restart before the celebration keeps progress',()=>{
  const errors=new Set([STORAGE_KEY]);const f=fixture({writeErrorKeys:errors});
  enter(f);f.app.act('rotate',1,1);assert.ok(f.app.traveling());
  assert.match(f.app.storageWarning,/保存/);
  errors.clear();f.listeners.Hide();assert.equal(f.store.get(STORAGE_KEY)[0],3);
  const disk=new Map(JSON.parse(JSON.stringify([...f.store])));
  const restarted=fixture({store:disk});assert.equal(restarted.app.campaign.progress[0],3);
  assert.equal(restarted.app.campaign.view().number,'02');assert.equal(restarted.app.campaign.view().totalHearts,3);
  assert.equal(restarted.app.profile.data.diamonds,15);assert.equal(restarted.app.storageWarning,'');
  restarted.app.destroy();f.app.destroy();
});

test('terminating immediately after winning can recover a failed progress write from the reward record',()=>{
  const f=fixture({writeErrorKeys:new Set([STORAGE_KEY])});enter(f);f.app.act('rotate',1,1);
  // Copy disk only: do not fire hide, show or destroy before launching a new process.
  const disk=new Map(JSON.parse(JSON.stringify([...f.store]))),restarted=fixture({store:disk});
  assert.equal(restarted.app.campaign.progress[0],3);assert.equal(restarted.app.profile.data.diamonds,15);
  restarted.app.destroy();f.app.destroy();
});

test('night mode is free, replaces theme navigation and survives a serialized cold restart',()=>{
  const f=fixture();assert.ok(!f.app.layout.targets.some(t=>t.id==='themes'));
  const diamonds=f.app.profile.data.diamonds;f.click('settings');f.click('night-mode');
  assert.equal(f.app.profile.view().nightMode,true);assert.equal(f.app.profile.view().themeInfo.light,false);
  assert.equal(f.app.profile.data.diamonds,diamonds);assert.equal(f.app.screen,'settings');
  f.click('back');assert.equal(f.app.screen,'home');
  const restarted=fixture({store:new Map(JSON.parse(JSON.stringify([...f.store])))});
  assert.equal(restarted.app.profile.view().nightMode,true);
  restarted.click('settings');restarted.click('night-mode');assert.equal(restarted.app.profile.view().themeInfo.light,true);
  restarted.app.command('themes');assert.equal(restarted.app.screen,'settings');
  restarted.app.command('theme:ocean');assert.equal(restarted.app.profile.data.diamonds,diamonds);
  restarted.app.destroy();f.app.destroy();
});

test('only develop and trial have unlimited resources, with no infinite balances saved',t=>{
  t.mock.method(console,'warn',()=>{});
  const {Profile,STORAGE_KEY:key}=require('../minigame/core/profile');
  for(const options of [{envVersion:'develop'},{envVersion:'trial'},{envVersion:'release'},{envVersion:'unknown'},{envVersion:undefined},{accountMissing:true},{accountError:true}]) {
    const p=new Profile(null,Array(140).fill(0)).data;p.energy=0;p.diamonds=7;p.testSupplyEnabled=true;
    const f=fixture({...options,store:new Map([[key,p]])}),allowed=['develop','trial'].includes(options.envVersion);
    f.texts.length=0;f.app.draw();assert.equal(f.texts.filter(t=>t.value==='∞').length,allowed?2:0);
    enter(f);assert.equal(f.app.screen,allowed?'game':'energy');
    if(allowed)f.app.command('energy');
    f.app.command('test-refill');f.app.command('refill');
    assert.equal(f.app.profile.data.energy,0);assert.equal(f.app.profile.data.diamonds,7);
    assert.equal(f.store.get(key).energy,0);assert.equal(f.store.get(key).diamonds,7);
    const restored=fixture({...options,store:f.store});enter(restored);
    assert.equal(restored.app.screen,allowed?'game':'energy');restored.app.destroy();f.app.destroy();
  }
});

test('test resources cover repeated classic and campaign starts and disappear in release',()=>{
  const {Profile,STORAGE_KEY:key}=require('../minigame/core/profile');
  const p=new Profile(null,Array(140).fill(0)).data;p.energy=0;p.diamonds=0;
  for(const envVersion of ['develop','trial']) {
    const f=fixture({envVersion,store:new Map([[key,structuredClone(p)]])});
    for(let i=0;i<12;i++) {
      f.app.startClassic(5,i%2?'limited':'relaxed');assert.equal(f.app.screen,'game');
      assert.equal(f.app.profile.data.serial,i+1);assert.equal(f.app.profile.data.energy,0);assert.equal(f.app.profile.data.diamonds,0);
    }
    f.click('home');enter(f);f.click('test-solve');finishHomecoming(f);f.click('next');
    assert.equal(f.app.campaign.view().number,'02');assert.equal(f.app.profile.data.energy,0);
    assert.equal(f.app.profile.data.diamonds,15,'actual reward ledger is still finite and accurate');
    f.app.command('energy');f.app.command('refill');assert.equal(f.app.profile.data.diamonds,15);
    f.click('back');f.click('levels');f.click('select:0');assert.equal(f.app.screen,'game');
    assert.equal(f.app.profile.data.energy,0);
    const released=fixture({envVersion:'release',store:f.store});
    assert.equal(released.app.testSupplyEnabled,false);assert.equal(released.app.profile.data.diamonds,15);
    enter(released);assert.equal(released.app.screen,'energy');assert.equal(released.app.profile.data.energy,0);
    released.app.destroy();f.app.destroy();
  }
});

test('classic entrance separates modes, supports only 5–9, and purchased supply preserves both selected modes',()=>{
  for(const mode of ['limited','relaxed']) {
    const f=fixture();f.app.profile.data.energy=0;f.click('classic-modes');
    assert.ok(f.app.layout.targets.some(t=>t.id==='classic-mode:limited'));
    assert.ok(f.app.layout.targets.some(t=>t.id==='classic-mode:relaxed'));
    assert.ok(!f.app.layout.targets.some(t=>t.id.startsWith('classic:')));
    f.click('classic-mode:'+mode);
    assert.deepEqual(f.app.layout.targets.filter(t=>t.id.startsWith('classic:')).map(t=>t.id),[5,6,7,8,9].map(s=>'classic:'+s));
    f.app.command('classic:4');assert.equal(f.app.screen,'classic-size');assert.equal(f.app.profile.data.serial,0);
    f.click('classic:7');assert.equal(f.app.screen,'energy');assert.equal(f.app.energyChoice().mode,mode);
    f.click('checkin');f.click('claim');f.click('back');f.click('refill');f.click('energy-continue');
    assert.equal(f.app.session.mode,mode);assert.equal(f.app.session.modeSize,7);assert.equal(f.app.profile.data.energy,0);
    const session=f.app.session;f.click('home');assert.ok(!f.app.layout.targets.some(t=>t.id==='resume'));
    f.click('classic-modes');f.click('resume');assert.equal(f.app.session,session);assert.equal(f.app.profile.data.energy,0);
    f.click('classic-sizes');assert.equal(f.app.classicMode,mode);f.click('back');assert.equal(f.app.screen,'classic');
    f.app.destroy();
  }
});

test('limited failure has no reward or celebration; retry and successful next keep mode and deduplicate rewards',()=>{
  const f=fixture();f.click('classic-modes');f.click('classic-mode:limited');f.click('classic:5');
  const session=f.app.session,initial=JSON.stringify(session.game.pieces),energy=f.app.profile.data.energy;
  const point=f.cell(0,0),limit=session.view().moveLimit;
  for(let i=0;i<limit;i++)f.tap(point.x,point.y);
  assert.equal(session.failed,true);assert.equal(f.app.layout.board,null);
  assert.equal(f.app.homecoming,null);assert.equal(f.app.celebration,null);assert.equal(f.app.profile.data.diamonds,0);
  assert.equal(f.app.profile.data.classicCleared,0);assert.equal(f.app.profile.data.records.length,0);
  assert.ok(f.texts.some(t=>t.value==='挑战失败'));
  f.app.command('undo');f.app.act('rotate',1,1);assert.equal(session.game.moves,limit);
  f.click('reset');assert.equal(session.failed,false);assert.equal(f.app.profile.data.energy,energy);
  assert.equal(JSON.stringify(session.game.pieces),initial);
  const solve=()=>{const answer=Engine.solve(session.level,session.game.pieces);for(const c of answer.changes)for(let i=0;i<c.turns;i++)f.app.act('rotate',c.x,c.y);};
  solve();assert.equal(session.view().stars,3);assert.equal(f.app.profile.data.diamonds,5);
  assert.equal(f.app.profile.data.records[0].kind,'limited');assert.ok(f.app.traveling());finishHomecoming(f);
  assert.ok(f.app.celebration);f.click('reset');solve();assert.equal(f.app.profile.data.diamonds,5);finishHomecoming(f);
  f.click('classic-next');assert.equal(f.app.session.mode,'limited');assert.equal(f.app.profile.data.energy,energy-1);
  f.app.command('classic-next');assert.equal(f.app.profile.data.energy,energy-1);
  assert.ok(f.app.campaign.progress.every(n=>n===0));f.app.destroy();
});

test('paper texture uses one independent offscreen tile across frames, pages and resizing',()=>{
  const f=fixture();const grain=f.app.grain;
  assert.equal(f.canvases.length,2);assert.equal(f.patterns.length,1);
  assert.notEqual(f.patterns[0].source,f.canvas);
  assert.equal(f.patterns[0].source.width,256);assert.equal(f.canvas.width,750);
  for(let i=0;i<60;i++)f.app.draw();
  f.click('campaign');f.click('page-next');f.listeners.Hide();f.listeners.Show();
  f.info.windowWidth=320;f.listeners.WindowResize();
  assert.equal(f.canvas.width,640);assert.equal(f.patterns[0].source.width,256);
  assert.equal(f.app.grain,grain);assert.equal(f.canvases.length,2);assert.equal(f.patterns.length,1);
  f.app.destroy();assert.equal(f.app.grain,null);
});

test('minigame real entry starts without Page, DOM, WXML or a browser adapter', () => {
  const f = fixture();
  f.app.destroy();
  const file = path.resolve(__dirname, '../minigame/game.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require: createRequire(file), wx: f.wx, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {}
  });
  assert.equal(Object.keys(f.listeners).length, 7);
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../project.config.json')));
  assert.equal(config.appid, 'wxbfabe98c965e5401');
  // Current desktop tools normalize the documented "minigame" value to "game".
  assert.ok(['game', 'minigame'].includes(config.compileType));
  assert.ok(fs.existsSync(path.resolve(__dirname, '..', config.miniprogramRoot, 'game.json')));
});

test('one campaign entrance unlocks all 140 levels in ascending size order through real touches', t => {
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  const f=fixture();assert.equal(f.app.screen,'home');f.click('campaign');
  assert.equal(f.app.screen,'levels');assert.equal(f.app.session.modeSize,null);
  assert.ok(!f.app.layout.targets.some(t=>t.id.startsWith('mode:')));
  const indices=f.app.session.indices().slice();f.click('resume');
  let previousSize=3;
  for(const [position,index] of indices.entries()) {
    now+=30*60*1000;f.app.draw();
    assert.equal(f.app.session.index,index);assert.equal(f.app.session.unlocked(),index);
    assert.equal(f.app.session.view().number,String(position+1).padStart(2,'0'));
    assert.ok(f.app.session.game.level.size>=previousSize);previousSize=f.app.session.game.level.size;
    f.click('levels');const locked=f.app.layout.targets.find(t=>t.id==='select:'+indices[position+1]);
    if(locked){const energy=f.app.profile.data.energy;f.click(locked.id);assert.equal(f.app.screen,'levels');assert.equal(f.app.profile.data.energy,energy);}
    f.click('resume');const answer=Engine.solve(f.app.session.game.level,f.app.session.game.pieces);
    for(const c of answer.changes)for(let n=0;n<c.turns;n++){const p=f.cell(c.x,c.y);f.tap(p.x,p.y);}
    assert.equal(f.app.session.game.result.solved,true);assert.equal(f.store.get(STORAGE_KEY)[index],3);
    finishHomecoming(f);if(position<139)f.click('next');
  }
  assert.equal(f.app.session.view().allComplete,true);assert.equal(f.app.session.act('next'),false);
  assert.equal(f.app.session.view().totalHearts,420);
  const restored=fixture({store:f.store});assert.equal(restored.app.session.view().totalHearts,420);
  assert.equal(restored.app.session.view().number,'140');
  f.click('home');selectCard(f,0);assert.equal(f.app.session.index,0);assert.equal(f.app.session.game.result.solved,false);
  restored.app.destroy();f.app.destroy();
});

test('minigame rejects drags, second fingers, cancellation and stale touches after hiding', () => {
  const f = fixture(); enter(f);
  const point = f.cell(1, 1), start = f.finger(point.x, point.y);
  f.listeners.TouchStart({ touches: [start] });
  f.listeners.TouchMove({ touches: [f.finger(point.x + 50, point.y)] });
  f.listeners.TouchMove({ touches: [start] });
  f.listeners.TouchEnd({ changedTouches: [start] });
  assert.equal(f.app.session.game.moves, 0);
  f.listeners.TouchStart({ touches: [start] });
  f.listeners.TouchStart({ touches: [start, f.finger(point.x, point.y, 2)] });
  f.listeners.TouchEnd({ changedTouches: [start] });
  assert.equal(f.app.session.game.moves, 0);
  f.listeners.TouchStart({ touches: [start] }); f.listeners.TouchCancel();
  f.listeners.TouchEnd({ changedTouches: [start] });
  assert.equal(f.app.session.game.moves, 0);
  f.listeners.TouchStart({ touches: [start] }); f.listeners.Hide(); f.listeners.Show();
  f.listeners.TouchEnd({ changedTouches: [start] });
  assert.equal(f.app.session.game.moves, 0);
  f.tap(point.x, point.y);
  assert.equal(f.app.session.game.result.solved, true);
  finishHomecoming(f);
  assert.ok(f.audio.some(voice => voice.src.endsWith('complete.wav') && voice.played === 1));
  f.app.destroy();
});

test('settings sliders mute at zero, restore sound, persist independently and omit old controls',()=>{
  const f=fixture();enter(f);f.click('settings');f.texts.length=0;f.app.draw();
  assert.ok(!f.app.layout.targets.some(t=>['music','sound'].includes(t.id)&&t.kind!=='slider'));
  assert.ok(!f.texts.some(t=>String(t.value).includes('偏好')||String(t.value).includes('安心游玩')||t.value==='探索新道路'));
  assert.ok(f.app.layout.targets.find(t=>t.id==='back').x<f.app.width/2);
  assert.equal(f.texts.find(t=>t.value==='设置').x,f.app.width/2);
  const slider=f.app.layout.targets.find(t=>t.id==='music');
  f.tap(slider.trackX,slider.y+22);assert.equal(f.app.music.enabled,false);
  f.tap(slider.trackX+slider.trackW*.4,slider.y+22);assert.equal(f.app.music.enabled,true);
  assert.equal(f.app.music.volume,.4);
  const music=f.audio.find(v=>v.loop),played=music.played;
  f.tap(slider.trackX+slider.trackW*.6,slider.y+22);assert.equal(music.played,played,'changing positive volume does not restart music');
  const effects=f.app.layout.targets.find(t=>t.id==='sound'),finger=f.finger(effects.trackX+effects.trackW,effects.y+22);
  f.listeners.TouchStart({touches:[finger]});const zero=f.finger(effects.trackX,effects.y+22);
  f.listeners.TouchMove({touches:[zero]});f.listeners.TouchEnd({changedTouches:[zero]});
  assert.equal(f.app.sound.enabled,false);assert.equal(f.app.sound.volume,0);assert.equal(f.app.music.volume,.6);
  const resumed=fixture({store:f.store});assert.equal(resumed.app.music.enabled,true);assert.equal(resumed.app.music.volume,.6);
  assert.equal(resumed.app.sound.enabled,false);assert.equal(resumed.app.sound.volume,0);
  f.click('back');assert.equal(f.app.screen,'game');f.app.destroy();resumed.app.destroy();
});

test('minigame lifecycle has one frame loop, pauses sounds and releases all listeners', () => {
  const f = fixture(); enter(f);
  const p = f.cell(1, 1);
  f.tap(p.x, p.y); f.app.start();
  assert.equal(f.frames.size, 1);
  const music = f.audio.find(voice => voice.loop);
  f.listeners.Hide(); assert.equal(f.frames.size, 0); assert.equal(music.paused, 1);
  f.listeners.Show(); f.listeners.Show();
  assert.equal(f.frames.size, 1); assert.equal(music.played, 2);
  f.info.windowWidth = 390; f.info.windowHeight = 844;
  f.listeners.WindowResize();
  assert.equal(f.canvas.width, 780); assert.equal(f.frames.size, 1);
  f.app.destroy();
  assert.equal(f.frames.size, 0); assert.equal(Object.keys(f.listeners).length, 0);
  assert.ok(f.audio.every(voice => voice.destroyed === 1));
});

test('minigame storage failures and audio failure do not prevent playing or change live volume', () => {
  const f = fixture({ readError: true, writeError: true });
  enter(f);
  assert.equal(f.app.music.enabled, false);
  assert.equal(f.app.sound.enabled, false);
  f.click('settings');
  const slider = f.app.layout.targets.find(item => item.kind === 'slider' && item.id === 'music');
  f.tap(slider.trackX + slider.trackW * .4, slider.y + 22);
  f.tap(slider.trackX, slider.y + 22);
  assert.equal(f.app.music.volume, 0);
  assert.match(f.app.notice, /未能保存/);
  f.audio[0].error(Error('decode'));
  f.click('back'); const p = f.cell(1, 1); f.tap(p.x, p.y);
  assert.equal(f.app.session.game.result.solved, true);
  f.app.destroy();
});

test('minigame controls fit small, tall, tablet and landscape windows below the native menu', () => {
  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [768, 1024], [844, 390]]) {
    const f = fixture({ info: { windowWidth: width, windowHeight: height, safeArea: { top: 24, bottom: height - 24 } } });
    for (const screen of ['home', 'game', 'settings', 'levels', 'classic', 'classic-size', 'checkin', 'records', 'energy', 'diamond', 'help']) {
      f.app.navigate(screen);
      for (const target of f.app.layout.targets) {
        assert.ok(target.y >= f.app.top, `${width}x${height} ${target.id} clears menu`);
        assert.ok(target.y + target.h <= f.app.height - f.app.bottom, `${width}x${height} ${screen} ${target.id} on screen`);
        assert.ok(target.x >= 0 && target.x + target.w <= f.app.width);
      }
    }
    for(const size of [8,9]) {
      f.app.startClassic(size);
      const board=f.app.layout.board;
      assert.ok(board.x>=0 && board.x+board.w<=f.app.width);
      assert.ok(board.y+board.w<f.app.layout.targets.find(item=>item.id==='hint').y);
      for(const target of f.app.layout.targets) assert.ok(target.y+target.h<=f.app.height-f.app.bottom);
      const answer=Engine.solve(f.app.session.game.level,f.app.session.game.pieces);
      for(const change of answer.changes) for(let turn=0;turn<change.turns;turn++) f.app.act('rotate',change.x,change.y);
      finishHomecoming(f);
      const next=f.app.layout.targets.find(item=>item.id==='classic-next');
      assert.ok(next && next.y+next.h<=f.app.height-f.app.bottom,`${size}x${size} solved controls fit`);
    }
    f.app.destroy();
  }
});

test('old disabled audio appears muted and raising its slider restores it without changing the other channel',t=>{
  t.mock.method(console,'warn',()=>{});
  const f=fixture({store:new Map([[Sound.STORAGE_KEY,false],[Sound.VOLUME_KEY,.4],[Music.STORAGE_KEY,false]])});
  f.click('settings');f.texts.length=0;f.app.draw();assert.equal(f.texts.filter(t=>t.value==='0%').length,2);
  assert.equal(f.store.get(Sound.VOLUME_KEY),.4,'viewing old preferences does not rewrite them');
  const slider=f.app.layout.targets.find(t=>t.id==='sound'),set=value=>f.tap(slider.trackX+slider.trackW*value,slider.y+22);
  set(.4);assert.equal(f.app.sound.enabled,true);assert.equal(f.store.get(Sound.STORAGE_KEY),true);
  assert.equal(f.audio.length,1);assert.equal(f.audio[0].played,1);assert.equal(f.audio[0].volume,.4);
  assert.equal(f.app.music.enabled,false);f.audio[0].error({errCode:10004,errMsg:'load failed'});
  assert.match(f.app.notice,/音效暂时无法播放（10004）/);set(0);assert.equal(f.app.sound.enabled,false);
  set(.4);assert.equal(f.app.notice,'');assert.equal(f.app.sound.volume,.4);
  f.listeners.Hide();assert.equal(f.app.sound.active,false);f.listeners.Show();assert.equal(f.app.sound.active,true);
  assert.equal(f.audio.reduce((n,v)=>n+v.played,0),2);f.app.destroy();
});

test('campaign navigation preserves old scattered scores, live boards and all settings without a reset-progress control', () => {
  const saved=Array(24).fill(0);saved[0]=3;saved[3]=2;saved[18]=1;
  const f=fixture({store:new Map([[STORAGE_KEY,saved],[Music.VOLUME_KEY,.17],[Sound.VOLUME_KEY,0]])});
  assert.equal(f.app.session.view().overallCompleted,3);assert.equal(f.app.session.index,1);
  f.click('settings');f.click('back');selectCard(f,18);
  assert.equal(f.app.session.index,18,'previously completed hard levels remain replayable');
  const p=f.cell(0,0);f.tap(p.x,p.y);const board=f.app.session.game;
  f.click('home');f.click('settings');f.click('back');f.click('campaign');f.click('resume');
  assert.equal(f.app.session.game,board);f.click('settings');f.click('back');assert.equal(f.app.screen,'game');
  f.click('levels');assert.ok(!f.app.layout.targets.some(t=>t.id==='restart'));
  f.app.command('restart');f.app.command('confirm');assert.deepEqual(f.store.get(STORAGE_KEY),saved);
  assert.equal(f.app.session.canSelect(19),false,'a completed old hard level does not bypass the new frontier');
  selectCard(f,18);f.click('reset');assert.equal(f.app.session.progress[18],1);
  assert.equal(f.store.get(Music.VOLUME_KEY),.17);assert.equal(f.store.get(Sound.VOLUME_KEY),0);f.app.destroy();
});

test('large boards use the freed space, hide lamp counts and show only requested hints', () => {
  for(const size of [8,9]) {
    const f=fixture({store:new Map([[STORAGE_KEY,beforeSize(size)]]),info:{windowWidth:375,windowHeight:667,safeArea:{top:24,bottom:643}}});
    enter(f); f.texts.length=0; f.app.draw();
    const oldWidth=Math.min(f.app.width-32,f.app.height-f.app.top-f.app.bottom-350);
    const unit=Renderer.geometry(f.app.layout.board.w,size).cell;
    assert.ok(unit>oldWidth*.91/size*1.25,'cells are at least 25% larger on a compact phone');
    assert.ok(f.app.session.game.pieces.every(piece=>piece.ports!==15));
    assert.ok(!f.texts.some(item=>/圆钉|固定|一点灵感|轻触线路|先看边缘/.test(item.value)));
    assert.ok(!f.texts.some(item=>item.value.startsWith('亮灯 ')));
    f.click('hint'); assert.ok(f.texts.some(item=>/第 \d+ 行 · 第 \d+ 列，再转/.test(item.value)));
    for(const [x,y] of [[0,0],[size-1,0],[0,size-1],[size-1,size-1]]) {
      const point=f.cell(x,y), before=f.app.session.game.moves;
      f.tap(point.x,point.y);assert.equal(f.app.session.game.moves,before+1);
    }
    f.app.destroy();
  }
});

test('all 24 card pages are reachable, locked taps are free, and entering returns to the current page', () => {
  const f=fixture();f.click('campaign');const seen=[];f.click('page-prev');assert.equal(f.app.levelPage,0);
  for(let page=0;page<24;page++) {
    f.texts.length=0;f.app.draw();
    assert.ok(!f.texts.some(t=>/由简入难|已完成|您已通关|^\d+\s*\/\s*\d+$/.test(t.value)), 'navigation hides totals and never reports completion before playing');
    assert.equal(f.app.levelPage,page);const cards=f.app.layout.targets.filter(t=>t.id.startsWith('select:'));
    assert.equal(cards.length,page===23?2:6);seen.push(...cards.map(t=>t.id));
    const locked=cards.find(t=>t.disabled),energy=f.app.profile.data.energy;f.click(locked.id);
    assert.equal(f.app.screen,'levels');assert.equal(f.app.profile.data.energy,energy);
    f.click('page-next');assert.equal(f.app.levelPage,Math.min(page+1,23));
  }
  assert.equal(new Set(seen).size,140);f.click('resume');assert.equal(f.app.session.view().number,'01');
  f.click('levels');assert.equal(f.app.levelPage,0);f.app.destroy();
});

test('winning opens one celebration, isolates touches, preserves rewards across lifecycle and dismisses safely', t => {
  let now=1000;t.mock.method(Date,'now',()=>now);
  const f=fixture();enter(f);
  const p=f.cell(1,1);f.tap(p.x,p.y);
  assert.equal(f.app.celebration,null,'animals travel before the result appears');
  now+=f.app.homecoming.duration;f.app.draw();
  assert.ok(f.app.celebration);assert.equal(f.app.layout.board,null);
  assert.ok(f.texts.some(item=>item.value==='恭喜你过关了'));
  assert.ok(f.texts.some(item=>item.value==='本次获得 3 颗星'));
  assert.deepEqual(f.app.layout.targets.map(item=>item.id),['next','reset','celebration-close','home']);
  const reward=f.store.get(STORAGE_KEY).slice(), effect=f.app.celebration, startedAt=effect.startedAt;
  const sounds=f.audio.reduce((n,voice)=>n+voice.played,0);
  f.tap(2,f.app.top+2);assert.equal(f.app.celebration,effect,'taps outside the panel are ignored');
  now=3000;f.app.draw();f.app.draw();
  assert.deepEqual(f.store.get(STORAGE_KEY),reward);
  assert.equal(f.audio.reduce((n,voice)=>n+voice.played,0),sounds,'animation frames do not replay sound');
  f.listeners.Hide();now=10000;f.listeners.Show();f.app.draw();
  assert.equal(f.app.celebration.startedAt,startedAt,'returning never restarts the burst');
  let foreground=false,confettiCount=0;
  const originalText=f.ctx.fillText;
  f.ctx.fillText=(value,x,y)=>{originalText(value,x,y);if(value==='回到首页')foreground=true;};
  f.ctx.fillRect=()=>{if(foreground)confettiCount++;};
  const diamonds=f.app.profile.data.diamonds,played=f.audio.reduce((n,voice)=>n+voice.played,0);
  for(const elapsed of [2000,5000,60000,3600000]) {
    now=effect.startedAt+elapsed;foreground=false;confettiCount=0;f.app.draw();
    if(elapsed===2000)assert.ok(confettiCount>128&&confettiCount<=385,'one dense burst appears in the foreground');
    else assert.ok(confettiCount<=1,'paper has dispersed and does not restart; only the grain overlay may remain');
    assert.equal(f.app.profile.data.diamonds,diamonds);assert.deepEqual(f.store.get(STORAGE_KEY),reward);
    assert.equal(f.audio.reduce((n,voice)=>n+voice.played,0),played,'finishing the burst never replays rewards or sounds');
  }
  f.click('celebration-close');assert.equal(f.app.celebration,null);assert.ok(f.app.layout.board);
  foreground=false;confettiCount=0;f.app.draw();assert.equal(confettiCount,0);
  f.click('settings');f.click('back');assert.equal(f.app.celebration,null);
  f.click('home');assert.ok(f.texts.some(item=>item.value.includes('收集 3 颗星')));
  const restored=fixture({store:f.store});assert.equal(restored.app.session.view().totalHearts,3);
  assert.equal(restored.app.celebration,null,'stored scores do not open a new celebration');
  f.app.destroy();restored.app.destroy();
});

test('replaying a completed level celebrates current stars without accumulating extra rewards', () => {
  const saved=Array(140).fill(0);saved[0]=3;
  const f=fixture({store:new Map([[STORAGE_KEY,saved]])});
  f.click('campaign');f.click('select:0');f.click('hint');
  const p=f.cell(1,1);f.tap(p.x,p.y);
  finishHomecoming(f);
  assert.ok(f.texts.some(item=>item.value==='本次获得 2 颗星'));
  assert.ok(f.texts.some(item=>item.value==='本关最佳 3 颗 · 累计收集 3 颗'));
  assert.equal(f.app.session.view().totalHearts,3);
  f.click('next');assert.equal(f.app.celebration,null);assert.equal(f.app.session.view().number,'02');
  f.app.destroy();
});

test('the final level celebration offers home and replay and fits every supported viewport', () => {
  for (const [width,height] of [[320,568],[375,667],[390,844],[768,1024],[844,390]]) {
    const saved=Array(140).fill(3);
    saved[139]=0;
    const f=fixture({store:new Map([[STORAGE_KEY,saved]]),info:{windowWidth:width,windowHeight:height,safeArea:{top:24,bottom:height-24}}});
    f.click('campaign');f.click('resume');
    assert.equal(f.app.session.view().number,'140');
    assert.ok(!f.texts.some(t=>t.value==='您已通关'));
    const answer=Engine.solve(f.app.session.game.level,f.app.session.game.pieces);
    for(const change of answer.changes) for(let i=0;i<change.turns;i++) {const p=f.cell(change.x,change.y);f.tap(p.x,p.y);}
    finishHomecoming(f);
    assert.ok(f.texts.some(t=>t.value==='您已通关'));
    assert.ok(f.texts.some(t=>t.value==='所有小伙伴都回家啦'));
    assert.deepEqual(f.app.layout.targets.map(item=>item.id),['home','reset','celebration-close']);
    for(const target of f.app.layout.targets) {
      assert.ok(target.x>=0 && target.x+target.w<=f.app.width);
      assert.ok(target.y>=f.app.top && target.y+target.h<=f.app.height-f.app.bottom);
    }
    assert.equal(f.app.session.view().totalHearts,420);
    f.click('reset');assert.equal(f.app.celebration,null);assert.equal(f.app.session.game.moves,0);
    assert.equal(f.app.session.view().totalHearts,420);
    f.app.destroy();
  }
});

test('new lobby drives sign-in, supplies, night mode and real personal records with persisted values',()=>{
  const f=fixture();
  assert.ok(f.texts.some(t=>t.value==='闯关模式'));assert.ok(f.texts.some(t=>t.value==='经典模式'));
  f.click('checkin');f.click('claim');assert.equal(f.app.profile.data.diamonds,20);
  f.click('claim');assert.equal(f.app.profile.data.diamonds,20);
  f.click('home');f.click('settings');f.click('night-mode');assert.equal(f.app.profile.data.diamonds,20);
  f.click('back');enter(f);assert.equal(f.app.profile.data.energy,4);
  const p=f.cell(1,1);f.tap(p.x,p.y);assert.equal(f.app.profile.data.diamonds,35);
  finishHomecoming(f);
  const reward=f.app.profile.data.diamonds,energy=f.app.profile.data.energy,index=f.app.session.index;
  f.click('reset');assert.equal(f.app.celebration,null);assert.equal(f.app.session.index,index);
  assert.equal(f.app.session.game.moves,0);assert.equal(f.app.profile.data.energy,energy);
  const again=f.cell(1,1);f.tap(again.x,again.y);assert.equal(f.app.profile.data.diamonds,reward);
  f.click('home');f.click('records');f.click('record-kind:campaign');
  assert.ok(f.texts.some(t=>t.value==='本机纪录'));
  assert.ok(f.texts.some(t=>t.value==='1 次旋转'));
  f.click('back');f.click('energy');f.click('refill');assert.equal(f.app.profile.data.energy,5);assert.equal(f.app.profile.data.diamonds,15);
  const restored=fixture({store:f.store});assert.equal(restored.app.profile.data.diamonds,15);assert.equal(restored.app.profile.data.energy,5);
  assert.equal(restored.app.profile.view().canClaim,false);assert.equal(restored.app.campaign.progress[0],3);
  restored.app.destroy();f.app.destroy();
});

test('classic touch play, free replay and next puzzle keep campaign progress isolated',()=>{
  const saved=Array(140).fill(0);saved[0]=2;
  const f=fixture({store:new Map([[STORAGE_KEY,saved]])});
  f.click('classic-modes');f.click('classic-mode:relaxed');f.click('classic:5');
  assert.equal(f.app.profile.data.energy,4);assert.equal(f.app.session.view().classic,true);
  const run=f.app.session.runId,initial=JSON.stringify(f.app.session.game.pieces);
  const solve=()=>{const answer=Engine.solve(f.app.session.game.level,f.app.session.game.pieces);for(const c of answer.changes)for(let i=0;i<c.turns;i++){const p=f.cell(c.x,c.y);f.tap(p.x,p.y);}};
  solve();assert.equal(f.app.profile.data.classicCleared,1);assert.equal(f.app.profile.data.diamonds,15);
  assert.deepEqual(f.store.get(STORAGE_KEY),saved);
  f.click('classic-sizes');f.click('resume');assert.equal(f.app.session.runId,run);assert.ok(f.app.traveling());
  assert.equal(f.app.profile.data.energy,4,'returning to a solved but travelling classic game is free');
  f.click('reset');assert.equal(f.app.session.runId,run);assert.equal(f.app.profile.data.energy,4);assert.equal(JSON.stringify(f.app.session.game.pieces),initial);
  solve();assert.equal(f.app.profile.data.diamonds,15);assert.equal(f.app.profile.data.classicCleared,1);
  finishHomecoming(f);
  f.click('classic-next');assert.equal(f.app.session.runId,run+1);assert.equal(f.app.profile.data.energy,3);
  f.click('home');f.click('campaign');assert.equal(f.app.session,f.app.campaign);assert.equal(f.app.session.progress[0],2);
  f.app.destroy();
});

test('no energy prevents new puzzles without mutating saves and time restores access',t=>{
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  const f=fixture();f.click('classic-modes');f.click('classic-mode:relaxed');
  for(let i=0;i<5;i++){f.click('classic:5');f.click('home');f.click('classic-modes');f.click('classic-mode:relaxed');}
  assert.equal(f.app.profile.data.energy,0);const before=f.app.session;
  f.click('classic:5');assert.equal(f.app.screen,'energy');assert.equal(f.app.session,before);
  f.click('back');assert.equal(f.app.screen,'classic-size');
  now+=30*60*1000;f.app.draw();assert.equal(f.app.profile.data.energy,1);
  f.click('classic:5');assert.equal(f.app.screen,'game');assert.equal(f.app.profile.data.energy,0);
  f.click('home');f.click('campaign');f.click('resume');
  assert.equal(f.app.screen,'energy');assert.ok(f.app.campaign.progress.every(n=>n===0));
  f.app.destroy();
});

test('an unreadable player profile is never overwritten by temporary defaults or rewards',()=>{
  const {Profile,STORAGE_KEY:profileKey}=require('../minigame/core/profile');
  const saved=new Profile(null,Array(140).fill(0)).data;saved.diamonds=90;saved.owned.push('violet');saved.theme='violet';
  const f=fixture({store:new Map([[profileKey,structuredClone(saved)]]),readErrorKey:profileKey});
  f.click('checkin');f.click('claim');
  assert.deepEqual(f.store.get(profileKey),saved);assert.match(f.app.notice,/仅临时保留/);
  f.click('home');enter(f);const p=f.cell(1,1);f.tap(p.x,p.y);
  assert.deepEqual(f.store.get(profileKey),saved);f.app.destroy();
});

test('resource dialogs block background input, retain their type through sign-in and close to their origin',()=>{
  for(const id of ['energy','diamond']) {
    const f=fixture({envVersion:'trial'}),settings=f.app.layout.targets.find(t=>t.id==='settings');
    f.click(id);assert.equal(f.app.screen,id);assert.equal(f.app.layout.board,null);
    assert.ok(!f.app.layout.targets.some(t=>['campaign','settings','home'].includes(t.id)));
    const moves=f.app.session.game.moves,energy=f.app.profile.data.energy,diamonds=f.app.profile.data.diamonds;
    f.tap(settings.x+settings.w/2,settings.y+settings.h/2);assert.equal(f.app.screen,id);
    f.click('ad');f.app.command('ad');
    if(id==='diamond'){f.click('recharge');f.app.command('recharge');}
    assert.equal(f.app.profile.data.energy,energy);assert.equal(f.app.profile.data.diamonds,diamonds);
    assert.equal(f.app.session.game.moves,moves);assert.equal(f.app.screen,id);
    f.click('checkin');f.click('claim');f.click('back');assert.equal(f.app.screen,id);
    assert.equal(f.app.energyReturn,'home');f.click('back');assert.equal(f.app.screen,'home');f.app.destroy();
  }
});

test('closing insufficient-energy dialog restores the win panel and reopening keeps the next-level intent',()=>{
  const {Profile,STORAGE_KEY:key}=require('../minigame/core/profile');
  const p=new Profile(null,Array(140).fill(0)).data;p.energy=1;p.diamonds=30;
  const f=fixture({store:new Map([[key,p]])});enter(f);f.app.act('rotate',1,1);finishHomecoming(f);
  const celebration=f.app.celebration,game=f.app.session.game,next=f.app.session.nextIndex();
  f.click('next');assert.equal(f.app.screen,'energy');assert.equal(f.app.layout.board,null);
  f.click('back');assert.equal(f.app.screen,'game');assert.equal(f.app.celebration,celebration);
  assert.equal(f.app.session.game,game);assert.equal(f.app.pendingEnergy,null);
  f.click('next');assert.equal(f.app.pendingEnergy.type,'next');
  f.click('checkin');f.click('back');assert.equal(f.app.energyReturn,'game');
  f.click('refill');f.click('energy-continue');assert.equal(f.app.session.index,next);
  assert.equal(f.app.profile.data.energy,0);assert.equal(f.app.celebration,null);f.app.destroy();
});

test('resource dialog pauses an active journey, survives resize and resumes the same board without charges',t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  const f=fixture();enter(f);f.app.act('rotate',1,1);now+=400;f.app.draw();
  const journey=f.app.homecoming,energy=f.app.profile.data.energy,game=f.app.session.game;
  f.app.command('energy');const elapsed=journey.elapsed;
  now+=30000;f.app.draw();assert.equal(journey.elapsed,elapsed);assert.equal(f.app.layout.board,null);
  f.listeners.WindowResize();f.listeners.Hide();now+=50000;f.listeners.Show();f.app.draw();
  assert.equal(journey.elapsed,elapsed);f.click('back');assert.equal(f.app.screen,'game');
  assert.equal(f.app.session.game,game);assert.equal(f.app.profile.data.energy,energy);
  now+=100;f.app.draw();assert.equal(journey.elapsed,elapsed+100);f.app.destroy();
});

test('refilling after a blocked next level continues directly and spends exactly once',()=>{
  const {Profile,STORAGE_KEY:profileKey}=require('../minigame/core/profile');
  const profile=new Profile(null,Array(140).fill(0)).data;profile.energy=1;profile.diamonds=40;
  const f=fixture({store:new Map([[profileKey,profile]])});enter(f);
  const p=f.cell(1,1);f.tap(p.x,p.y);const old=f.app.session.index,next=f.app.session.indices()[1];
  finishHomecoming(f);
  f.click('next');assert.equal(f.app.screen,'energy');assert.equal(f.app.pendingEnergy.type,'next');
  assert.ok(f.app.layout.targets.find(t=>t.id==='energy-continue').disabled);
  f.click('energy-continue');assert.equal(f.app.session.index,old);
  f.click('refill');assert.equal(f.app.profile.data.energy,1);assert.equal(f.app.profile.data.diamonds,35);
  assert.equal(f.app.energyChoice().label,'继续下一关');
  f.click('energy-continue');assert.equal(f.app.screen,'game');assert.equal(f.app.session.index,next);
  assert.equal(f.app.profile.data.energy,0);assert.equal(f.app.pendingEnergy,null);
  f.app.command('energy-continue');assert.equal(f.app.profile.data.energy,0);assert.equal(f.app.session.index,next);
  assert.equal(f.app.session.progress[old],3);f.app.destroy();
});

test('check-in round trip and natural recovery retain the requested classic size',t=>{
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  const {Profile,STORAGE_KEY:profileKey}=require('../minigame/core/profile');
  const profile=new Profile(null,Array(140).fill(0),now).data;profile.energy=0;
  const f=fixture({store:new Map([[profileKey,profile]])});
  f.click('classic-modes');f.click('classic-mode:relaxed');f.click('classic:7');assert.equal(f.app.screen,'energy');
  f.click('checkin');assert.equal(f.app.checkinReturn,'energy');f.click('claim');f.click('back');
  assert.equal(f.app.screen,'energy');assert.equal(f.app.energyChoice().size,7);
  now+=30*60*1000;f.app.draw();assert.equal(f.app.profile.data.energy,1);
  assert.equal(f.app.layout.targets.find(t=>t.id==='energy-continue').disabled,false);
  f.click('energy-continue');assert.equal(f.app.screen,'game');assert.equal(f.app.session.modeSize,7);
  assert.equal(f.app.session.view().classic,true);assert.equal(f.app.profile.data.energy,0);
  assert.equal(f.app.profile.data.serial,1);assert.equal(f.app.profile.data.diamonds,20);f.app.destroy();
});

test('supply continuation preserves selected levels and leaving the flow cancels the pending selection',()=>{
  const {Profile,STORAGE_KEY:profileKey}=require('../minigame/core/profile');
  const saved=Array(140).fill(0);saved[0]=saved[1]=3;
  const profile=new Profile(null,saved).data;profile.energy=0;profile.diamonds=60;
  const f=fixture({store:new Map([[profileKey,profile],[STORAGE_KEY,saved]])});
  f.click('campaign');f.click('select:1');assert.equal(f.app.screen,'energy');
  assert.equal(f.app.energyChoice().index,1);f.click('refill');f.click('energy-continue');
  assert.equal(f.app.session.index,1);assert.equal(f.app.profile.data.energy,0);
  f.click('levels');f.click('select:0');assert.equal(f.app.pendingEnergy.type,'select');
  f.click('back');assert.equal(f.app.screen,'levels');assert.equal(f.app.pendingEnergy,null);
  assert.equal(f.app.session.progress[0],3);assert.equal(f.app.session.progress[1],3);
  f.click('select:0');f.click('refill');f.click('energy-continue');assert.equal(f.app.screen,'game');
  assert.equal(f.app.session.index,0);assert.equal(f.app.session.view().totalHearts,6);
  assert.equal(f.app.profile.data.energy,0);assert.equal(f.app.profile.data.diamonds,20);f.app.destroy();
});

test('animals finish their journey before stars and sound, pause across pages, and resume without skipping or charging',t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  const f=fixture();enter(f);const p=f.cell(1,1);f.tap(p.x,p.y);
  const journey=f.app.homecoming,energy=f.app.profile.data.energy,reward=f.app.profile.data.diamonds,game=f.app.session.game;
  assert.ok(f.app.traveling());assert.equal(f.app.celebration,null);assert.ok(f.app.layout.board);
  assert.ok(!f.app.layout.targets.some(target=>target.id==='next'));
  assert.ok(!f.audio.some(voice=>voice.src.endsWith('complete.wav')&&voice.played>0));
  const moves=game.moves;f.tap(p.x,p.y);f.app.command('next');
  assert.equal(game.moves,moves);assert.equal(f.app.session.game,game);assert.equal(f.app.profile.data.energy,energy);
  now+=700;f.app.draw();assert.ok(journey.view().animals.some(a=>a.walking));
  f.click('settings');const elapsed=journey.elapsed;now+=60000;f.app.draw();f.click('back');assert.equal(journey.elapsed,elapsed);
  now+=100;f.app.draw();assert.equal(journey.elapsed,elapsed+100);
  f.listeners.Hide();const hidden=journey.elapsed;now+=60000;f.listeners.Show();f.app.draw();assert.equal(journey.elapsed,hidden);
  f.click('home');assert.ok(!f.app.layout.targets.some(t=>t.id==='resume'));
  now+=60000;f.click('campaign');f.click('resume');assert.equal(f.app.session.game,game);assert.equal(journey.elapsed,hidden);
  f.click('levels');f.click('resume');assert.equal(f.app.session.game,game);assert.equal(f.app.profile.data.energy,energy);
  now+=journey.duration;f.app.draw();
  assert.ok(journey.done);assert.equal(journey.view().arrived,journey.routes.length);assert.ok(f.app.celebration);
  assert.equal(f.audio.filter(v=>v.src.endsWith('complete.wav')).reduce((n,v)=>n+v.played,0),1);
  assert.equal(f.app.profile.data.diamonds,reward);assert.ok(f.app.layout.targets.some(target=>target.id==='next'));
  const celebration=f.app.celebration;now+=50000;f.app.draw();f.listeners.Hide();f.listeners.Show();f.app.draw();
  assert.equal(f.app.celebration,celebration);assert.equal(f.audio.filter(v=>v.src.endsWith('complete.wav')).reduce((n,v)=>n+v.played,0),1);
  f.click('celebration-close');f.click('settings');f.click('back');assert.equal(f.app.celebration,null);
  f.app.destroy();
});

test('replaying or switching a board cancels the old journey; solving again never duplicates rewards',t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);const f=fixture();enter(f);
  const p=f.cell(1,1);f.tap(p.x,p.y);const reward=f.app.profile.data.diamonds,energy=f.app.profile.data.energy;
  f.click('reset');assert.equal(f.app.homecoming,null);assert.equal(f.app.session.game.result.solved,false);
  now+=20000;f.app.draw();assert.equal(f.app.celebration,null);assert.equal(f.app.profile.data.energy,energy);
  f.tap(p.x,p.y);assert.equal(f.app.profile.data.diamonds,reward);
  f.click('home');f.click('classic-modes');f.click('classic-mode:relaxed');f.click('classic:9');assert.equal(f.app.homecoming,null);
  now+=20000;f.app.draw();assert.equal(f.app.celebration,null);assert.equal(f.app.session.view().classic,true);
  assert.equal(f.app.session.game.result.solved,false);assert.equal(f.app.campaign.progress[0],3);f.app.destroy();
});

test('a size boundary continues through supplies into the next global level and persists on relaunch',()=>{
  const {Session}=require('../minigame/core/session');const order=new Session().indices();
  const saved=Array(140).fill(0);order.slice(0,19).forEach(i=>saved[i]=3);
  const {Profile,STORAGE_KEY:profileKey}=require('../minigame/core/profile');
  const profile=new Profile(null,saved).data;profile.energy=1;profile.diamonds=40;
  const f=fixture({store:new Map([[STORAGE_KEY,saved],[profileKey,profile]])});enter(f);
  assert.equal(f.app.session.view().number,'20');assert.equal(f.app.session.game.level.size,3);
  const answer=Engine.solve(f.app.session.game.level,f.app.session.game.pieces);
  for(const c of answer.changes)for(let i=0;i<c.turns;i++)f.app.act('rotate',c.x,c.y);
  finishHomecoming(f);f.click('next');assert.equal(f.app.screen,'energy');
  assert.equal(f.app.energyChoice().detail,'4 × 4 · 第 21 关');
  f.click('refill');f.click('energy-continue');assert.equal(f.app.screen,'game');
  assert.equal(f.app.session.index,order[20]);assert.equal(f.app.session.game.level.size,4);
  assert.equal(f.app.profile.data.energy,0);assert.equal(f.app.session.progress[order[19]],3);
  const restored=fixture({store:f.store});assert.equal(restored.app.session.index,order[20]);
  assert.equal(restored.app.session.view().totalHearts,60);
  assert.equal(restored.app.profile.data.diamonds,f.app.profile.data.diamonds,'relaunch does not reissue rewards');
  restored.app.destroy();f.app.destroy();
});
