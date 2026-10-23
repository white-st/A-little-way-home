const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const Engine = require('../miniprogram/core/engine');
const levels = require('../miniprogram/core/levels');
const Sound = require('../miniprogram/core/sound');
const Music = require('../miniprogram/core/music');
const { STORAGE_KEY: PROGRESS_KEY } = require('../miniprogram/core/session');

function harness(saved) {
  const voices = [], errors = [];
  const sound = new Sound.SoundEffects({ saved, onError: error => errors.push(error), createVoice: (file, onError) => {
    const voice = { file, onError, plays: 0, stops: 0, destroyed: false, play() { this.plays++; }, stop() { this.stops++; }, destroy() { this.destroyed = true; } };
    voices.push(voice); return voice;
  } });
  return { sound, voices, errors };
}

test('audio cues distinguish rotation, new connections and a single completed transition', () => {
  const game = { moves:0, result:{lit:[0],solved:false} };
  let before=Sound.snapshot(game); game.moves++; game.result.lit=[0,1,2];
  assert.deepEqual(Sound.cues(before,game,'rotate'),['rotate','light']);
  before=Sound.snapshot(game); game.moves++; game.result.lit=[0];
  assert.deepEqual(Sound.cues(before,game,'rotate'),['rotate']);
  before=Sound.snapshot(game); game.moves--; game.result.lit=[0,1,2];
  assert.deepEqual(Sound.cues(before,game,'undo'),['rotate','light']);
  before=Sound.snapshot(game); game.moves++; game.result={lit:[0,1,2,3],solved:true};
  assert.deepEqual(Sound.cues(before,game,'rotate'),['rotate','light','complete']);
  before=Sound.snapshot(game);
  assert.deepEqual(Sound.cues(before,game,'rotate'),[]);
  assert.deepEqual(Sound.cues(before,Engine.createGame(levels[0]),'reset'),[]);
});

test('one network action emits a single connection chime; hints and invalid actions stay silent', () => {
  const game=Engine.createGame(levels[0]);
  let before=Sound.snapshot(game); Engine.rotate(game,-1,-1);
  assert.deepEqual(Sound.cues(before,game,'rotate'),[]);
  Engine.hint(game); assert.deepEqual(Sound.cues(before,game,'hint'),[]);
  before=Sound.snapshot(game); Engine.rotate(game,1,1);
  assert.equal(game.result.lit.length,9);
  assert.deepEqual(Sound.cues(before,game,'rotate'),['rotate','light','complete']);
});

test('rapid taps use a bounded pool; mute, hide, reset and disposal stop all voices without replay', () => {
  const { sound, voices } = harness();
  assert.equal(voices.length, 0, 'no audio is created or played on page load');
  for (let i = 0; i < 12; i++) sound.play('rotate');
  sound.play('light'); sound.play('complete');
  assert.equal(voices.length, 4);
  assert.equal(voices.reduce((sum, voice) => sum + voice.plays, 0), 14);
  sound.setEnabled(false);
  assert.ok(voices.every(voice => voice.stops === 1));
  sound.play('complete'); sound.setEnabled(true);
  assert.equal(voices[3].plays, 1);
  sound.setActive(false); sound.play('light'); sound.setActive(true);
  assert.equal(voices[2].plays, 1);
  const game = Engine.createGame(levels[0]);
  sound.afterAction(Sound.snapshot(game), Engine.createGame(levels[1]), 'next');
  assert.ok(voices.every(voice => voice.stops === 3));
  sound.destroy(); sound.play('rotate');
  assert.ok(voices.every(voice => voice.destroyed));
  assert.equal(sound.voices.size, 0);
});

test('a saved off preference prevents audio allocation; malformed or missing preferences default on', () => {
  const muted = harness(false);
  muted.sound.play('rotate'); muted.sound.play('light'); muted.sound.play('complete');
  assert.equal(muted.voices.length, 0);
  for (const saved of [undefined, null, true, 'false', [], {}]) assert.equal(harness(saved).sound.enabled, true);
});

test('playback failures are reported once and pending plays cancelled by mute never report or replay', async () => {
  const first = harness();
  first.sound.play('rotate');
  first.voices[0].onError(new Error('decode'));
  first.voices[0].onError(new Error('decode again'));
  assert.equal(first.errors.length, 1);
  let reject;
  const errors = [];
  const sound = new Sound.SoundEffects({ onError: error => errors.push(error), createVoice: () => ({ play: () => new Promise((resolve, fail) => { reject = fail; }), stop() {}, destroy() {} }) });
  sound.play('rotate'); sound.setEnabled(false); reject(new Error('cancelled during load'));
  await Promise.resolve(); assert.equal(errors.length, 0);
  sound.setEnabled(true); sound.play('rotate'); reject(new Error('autoplay blocked'));
  await Promise.resolve(); assert.equal(errors.length, 1);
});

function nativePage(saved, failStorage = false, failVolumeReads = false) {
  const file = path.resolve(__dirname, '../miniprogram/pages/game/game.js');
  const store = new Map([[Music.STORAGE_KEY, false], ...(saved || [])]), audio = []; let page;
  const wx = {
    getStorageSync: key => { if (failVolumeReads && key.includes('-volume-')) throw new Error('storage unavailable'); return store.get(key); },
    setStorageSync: (key, value) => { if (failStorage) throw new Error('storage full'); store.set(key, value); },
    pageScrollTo() {},
    createInnerAudioContext() {
      const voice = { plays: 0, stops: 0, pauses: 0, currentTime: 0, paused: true, dead: false, play() { this.plays++; this.paused = false; }, seek(time) { this.currentTime = time; }, pause() { this.pauses++; this.paused = true; }, stop() { this.stops++; this.paused = true; this.currentTime = 0; }, onError(fn) { this.error = fn; }, offError() { this.error = null; }, destroy() { this.dead = true; } };
      audio.push(voice); return voice;
    }
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { require: createRequire(file), Date, wx, Page: value => { page = value; } });
  page.setData = data => Object.assign(page.data, data);
  page.onLoad(); page.onShow();
  return { page, store, audio };
}

test('native actions play bundled effects, persist mute separately, stop on hide and destroy on unload', () => {
  const { page, store, audio } = nativePage();
  assert.equal(audio.length, 0);
  page.act('rotate', 1, 1);
  assert.deepEqual(audio.map(voice => voice.src), ['assets/audio/rotate.wav', 'assets/audio/light.wav', 'assets/audio/complete.wav']);
  assert.ok(audio.every(voice => voice.plays === 1 && voice.autoplay === false && voice.loop === false));
  assert.equal(store.get(PROGRESS_KEY)[0], 3);
  page.toggleSound(); assert.equal(store.get(Sound.STORAGE_KEY), false);
  assert.equal(page.data.soundEnabled, false);
  page.act('reset'); page.act('rotate', 1, 1);
  assert.ok(audio.every(voice => voice.plays === 1));
  page.toggleSound();
  page.onHide(); const stops = audio.map(voice => voice.stops);
  page.onShow(); assert.deepEqual(audio.map(voice => voice.stops), stops);
  assert.ok(audio.every(voice => voice.plays === 1), 'returning must not replay completed effects');
  page.toggleLevels(); assert.equal(page.sound.active, false);
  page.onSelect({ currentTarget: { dataset: { index: 0 } } }); assert.equal(page.sound.active, true);
  page.onUnload(); assert.ok(audio.every(voice => voice.dead && voice.error === null));
});

test('native saved mute survives restart and storage failure leaves the immediate toggle effective', () => {
  const muted = nativePage([[Sound.STORAGE_KEY, false], [PROGRESS_KEY, [3]]]);
  assert.equal(muted.page.data.soundEnabled, false);
  muted.page.act('restart'); muted.page.act('rotate', 1, 1);
  assert.equal(muted.audio.length, 0);
  assert.equal(muted.store.get(Sound.STORAGE_KEY), false);
  assert.equal(nativePage([...muted.store]).page.data.soundEnabled, false);
  const failure = nativePage(undefined, true);
  failure.page.toggleSound();
  assert.equal(failure.page.data.soundEnabled, false);
  assert.match(failure.page.data.soundWarning, /未能保存/);
  failure.page.act('rotate', 1, 1);
  assert.equal(failure.audio.length, 0);
  assert.equal(failure.page.data.view.solved, true);
});

test('three bundled WAV files contain different short non-clipping PCM effects with silent endpoints', () => {
  const bytes = Object.values(Sound.FILES).map(file => fs.readFileSync(path.resolve(__dirname, '../miniprogram/assets/audio', file)));
  for (const wav of bytes) {
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt32LE(4), wav.length - 8); assert.equal(wav.readUInt32LE(24), 44100);
    assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readInt16LE(44), 0); assert.ok(Math.abs(wav.readInt16LE(wav.length - 2)) < 10);
    let peak = 0; for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
    assert.ok(peak > 3000 && peak < 12000);
  }
  assert.ok(bytes[0].length < bytes[1].length && bytes[1].length < bytes[2].length);
});

test('native music loops independently, survives level actions and resumes its position after hide', () => {
  const { page, audio, store } = nativePage([[Music.STORAGE_KEY, true]]);
  assert.equal(audio.length, 0);
  page.act('rotate', 1, 1);
  const music = audio.find(voice => voice.loop);
  const effects = audio.filter(voice => !voice.loop);
  assert.equal(music.src, 'assets/audio/ambient.wav');
  assert.equal(music.plays, 1); assert.equal(music.stops, 0);
  assert.ok(music.volume < effects[0].volume);
  music.currentTime = 7.5;
  page.toggleSound();
  assert.equal(music.paused, false); assert.equal(store.get(Sound.STORAGE_KEY), false);
  page.act('next'); page.act('reset');
  assert.equal(music.plays, 1); assert.equal(music.currentTime, 7.5);
  page.toggleLevels(); page.toggleLevels();
  assert.equal(music.paused, false, 'level browsing does not interrupt music');
  page.onHide(); assert.equal(music.paused, true); assert.equal(music.currentTime, 7.5);
  page.onShow(); assert.equal(music.paused, false); assert.equal(music.plays, 2); assert.equal(music.currentTime, 7.5);
  page.toggleMusic(); assert.equal(music.paused, true); assert.equal(store.get(Music.STORAGE_KEY), false);
  page.toggleSound();
  const effectPlays = audio.filter(voice => voice.src.endsWith('/rotate.wav')).reduce((sum, voice) => sum + voice.plays, 0);
  page.act('rotate', 2, 2);
  assert.equal(music.paused, true); assert.equal(audio.filter(voice => voice.src.endsWith('/rotate.wav')).reduce((sum, voice) => sum + voice.plays, 0), effectPlays + 1);
  page.onUnload(); assert.ok(audio.every(voice => voice.dead));
});

test('native music and effects persist all four combinations, and music storage failure stays local', () => {
  for (const musicOn of [false, true]) for (const soundOn of [false, true]) {
    const initial = [[Music.STORAGE_KEY, !musicOn], [Sound.STORAGE_KEY, !soundOn], [PROGRESS_KEY, [3]]];
    const state = nativePage(initial);
    state.page.toggleMusic(); state.page.toggleSound();
    const reloaded = nativePage([...state.store]);
    assert.equal(reloaded.page.data.musicEnabled, musicOn);
    assert.equal(reloaded.page.data.soundEnabled, soundOn);
    reloaded.page.act('restart'); reloaded.page.act('rotate', 1, 1);
    assert.equal(reloaded.audio.filter(voice => voice.loop).length, musicOn ? 1 : 0);
    assert.equal(reloaded.audio.filter(voice => !voice.loop).length, soundOn ? 3 : 0);
    assert.equal(state.store.get(PROGRESS_KEY)[0], 3);
    state.page.onUnload(); reloaded.page.onUnload();
  }
  const failure = nativePage([[Music.STORAGE_KEY, true]], true);
  failure.page.toggleMusic();
  assert.equal(failure.page.data.musicEnabled, false);
  assert.equal(failure.page.data.soundEnabled, true);
  assert.match(failure.page.data.musicWarning, /未能保存/);
});

test('native volume changes are live, independent, remembered at zero, and do not restart or unmute', () => {
  const { page, audio, store } = nativePage([[Music.STORAGE_KEY,true],[Music.VOLUME_KEY,.43],[Sound.VOLUME_KEY,.81],['follow-the-light-progress-v1',[3,3,3]]]);
  assert.equal(page.data.view.completed,0,'legacy laser progress is not reinterpreted');
  assert.equal(page.data.musicVolume,43); assert.equal(page.data.soundVolume,81);
  page.act('rotate',1,1);
  const music=audio.find(v=>v.loop), effects=audio.filter(v=>!v.loop);
  assert.equal(music.volume,.43); assert.ok(effects.every(v=>v.volume===.81));
  music.currentTime=9;
  const change=(kind,value)=>page.onVolume({currentTarget:{dataset:{kind}},detail:{value}});
  change('music',12);
  assert.equal(music.volume,.12); assert.equal(music.currentTime,9); assert.equal(music.plays,1);
  assert.ok(effects.every(v=>v.volume===.81));
  change('sound',0);
  assert.ok(effects.every(v=>v.volume===0)); assert.equal(music.volume,.12);
  assert.equal(page.sound.enabled,true,'zero volume and off are separate preferences');
  page.toggleMusic(); change('music',37);
  assert.equal(music.paused,true); assert.equal(music.plays,1); assert.equal(music.volume,.37);
  page.act('reset'); page.act('rotate',1,1);
  assert.ok(audio.filter(v=>!v.loop).every(v=>v.volume===0),'new voices inherit volume');
  page.act('restart');
  const reloaded=nativePage([...store]);
  assert.equal(reloaded.page.data.musicVolume,37); assert.equal(reloaded.page.data.musicEnabled,false);
  assert.equal(reloaded.page.data.soundVolume,0); assert.equal(reloaded.page.data.soundEnabled,true);
  assert.deepEqual(store.get('follow-the-light-progress-v1'),[3,3,3]);
  page.onUnload(); reloaded.page.onUnload();
});
test('volume storage failure keeps the chosen live volume effective', () => {
  const {page,audio}=nativePage([[Music.STORAGE_KEY,true]],true);
  page.act('rotate',1,1);
  for(const kind of ['music','sound']) {
    page.onVolume({currentTarget:{dataset:{kind}},detail:{value:0}});
    assert.equal(page.data[`${kind}Volume`],0); assert.match(page.data[`${kind}Warning`],/未能保存/);
  }
  assert.ok(audio.every(v=>v.volume===0)); assert.equal(page.data.view.solved,true); page.onUnload();
});
test('invalid volume defaults safely, numeric values clamp, and zero survives', () => {
  for(const [Module,Class] of [[Sound,Sound.SoundEffects],[Music,Music.BackgroundMusic]]) {
    for(const invalid of [undefined,null,false,'0',NaN,Infinity,{},[]]) assert.equal(new Class({savedVolume:invalid}).volume,Module.DEFAULT_VOLUME);
    for(const [input,expected] of [[0,0],[-1,0],[2,1],[.36,.36]]) {
      const player=new Class({savedVolume:input}); assert.equal(player.volume,expected);
      player.setVolume(NaN); assert.equal(player.volume,expected);
    }
  }
});

test('native volume read failures show a warning and use safe defaults without blocking play', () => {
  const {page,audio}=nativePage([[Music.STORAGE_KEY,true]],false,true);
  assert.match(page.data.storageWarning,/音量设置读取失败/);
  assert.equal(page.data.musicVolume,28); assert.equal(page.data.soundVolume,65);
  page.act('rotate',1,1);
  assert.equal(page.data.view.solved,true);
  assert.equal(audio.find(v=>v.loop).volume,.28);
  assert.ok(audio.filter(v=>!v.loop).every(v=>v.volume===.65));
  page.onUnload();
});
