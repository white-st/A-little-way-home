const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { BackgroundMusic, FILE } = require('../miniprogram/core/music');

function setup(saved) {
  const voices = [], errors = [];
  const music = new BackgroundMusic({ saved, onError: error => errors.push(error), createVoice: (file, fail) => {
    const voice = { file, fail, plays: 0, pauses: 0, destroyed: false, play() { this.plays++; }, pause() { this.pauses++; }, destroy() { this.destroyed = true; } };
    voices.push(voice); return voice;
  } });
  return { music, voices, errors };
}

test('music waits for a gesture, uses one loop, and repeated actions do not restart it', () => {
  const { music, voices } = setup();
  music.setActive(true); assert.equal(voices.length, 0);
  music.interact();
  for (let i = 0; i < 20; i++) music.interact();
  assert.equal(voices.length, 1); assert.equal(voices[0].file, FILE); assert.equal(voices[0].plays, 1);
});

test('disabled music stays unallocated; mute and visibility pause, with no resume while still muted', () => {
  const { music, voices } = setup(false);
  music.interact(); music.setActive(false); music.setActive(true);
  assert.equal(voices.length, 0);
  music.setEnabled(true); assert.equal(voices[0].plays, 1);
  music.setActive(false); assert.equal(voices[0].pauses, 1);
  music.setActive(true); assert.equal(voices[0].plays, 2);
  music.setEnabled(false); music.setActive(false); music.setActive(true);
  assert.equal(voices[0].plays, 2);
  music.setEnabled(true); assert.equal(voices[0].plays, 3);
  music.destroy(); music.interact(); music.setActive(true);
  assert.equal(voices[0].destroyed, true); assert.equal(voices[0].plays, 3);
});

test('pending loads are deduplicated and stale rejection cannot cancel a later resume', async () => {
  const rejections = [], errors = [];
  let plays = 0;
  const music = new BackgroundMusic({ onError: error => errors.push(error), createVoice: () => ({
    play() { plays++; return new Promise((resolve, reject) => rejections.push(reject)); }, pause() {}, destroy() {}
  }) });
  music.interact(); music.interact(); assert.equal(plays, 1);
  music.setEnabled(false); music.setEnabled(true); assert.equal(plays, 2);
  rejections[0](new Error('old request interrupted'));
  await Promise.resolve(); music.interact(); assert.equal(plays, 2); assert.equal(errors.length, 0);
});

test('autoplay refusal retries on the next gesture; actual media failures report without changing preferences', async () => {
  let reject;
  const errors = [];
  const music = new BackgroundMusic({ onError: error => errors.push(error), createVoice: () => ({
    play: () => new Promise((resolve, fail) => { reject = fail; }), pause() {}, destroy() {}
  }) });
  music.interact(); reject({ name: 'NotAllowedError' });
  await Promise.resolve(); assert.equal(music.requested, false); assert.equal(errors.length, 0);
  music.interact(); assert.equal(music.requested, true);
  reject(new Error('decode failed')); await Promise.resolve();
  assert.equal(errors.length, 1); assert.equal(music.enabled, true);
});

test('browser adapter loops quietly and pauses without rewinding, while effects still restart', () => {
  const elements = [];
  const window = {};
  const document = { createElement: () => ({ currentTime: 8, paused: true, addEventListener() {}, play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; }, removeAttribute() {}, load() {}, remove() {} }), body: { append: audio => elements.push(audio) } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../preview/sound-player.js'), 'utf8'), { window, document });
  const music = window.createBrowserMusicVoice(FILE, () => {});
  const effect = window.createBrowserSoundVoice('rotate.wav', () => {});
  music.play(); music.pause(); music.play(); effect.play();
  assert.equal(elements[0].loop, true); assert.equal(elements[0].currentTime, 8);
  assert.equal(elements[1].loop, false); assert.equal(elements[1].currentTime, 0);
  assert.ok(elements[0].volume < elements[1].volume);
  music.setVolume(.17); effect.setVolume(0);
  assert.equal(elements[0].volume,.17); assert.equal(elements[1].volume,0);
  assert.equal(elements[0].currentTime,8); assert.equal(elements[0].paused,false);
  music.pause(); music.setVolume(.62);
  assert.equal(elements[0].paused,true); assert.equal(elements[0].currentTime,8);
  const silent = window.createBrowserMusicVoice(FILE, () => {}, 0);
  silent.play(); assert.equal(elements[2].volume,0,'saved zero applies before first playback');
});

test('original music is a compact non-clipping loop with a continuous boundary', () => {
  const wav = fs.readFileSync(path.resolve(__dirname, '../miniprogram/assets/audio', FILE));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt32LE(4), wav.length - 8);
  assert.equal(wav.readUInt32LE(24), 22050); assert.equal(wav.readUInt16LE(22), 1);
  assert.equal((wav.length - 44) / 44100, 25.6);
  let peak = 0, squares = 0;
  for (let i = 44; i < wav.length; i += 2) { const v = wav.readInt16LE(i); peak = Math.max(peak, Math.abs(v)); squares += v * v; }
  assert.ok(peak < 12000 && peak > 9000);
  const rms = Math.sqrt(squares / ((wav.length - 44) / 2));
  assert.ok(rms > 1500 && rms < 5000);
  assert.ok(Math.abs(wav.readInt16LE(44) - wav.readInt16LE(wav.length - 2)) < 150);
});
