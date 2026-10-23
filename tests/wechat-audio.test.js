const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Audio = require('../miniprogram/core/sound-player');

function platform() {
  const voices = [];
  const wx = {
    createInnerAudioContext(options) {
      const voice = {
        options, calls: [], loading: true, dead: false,
        onError(fn) { this.error = fn; },
        offError(fn) { assert.equal(fn, this.error); this.error = null; },
        play() { this.calls.push('play'); this.loading = false; },
        seek(time) { this.calls.push(['seek', time]); },
        stop() {
          assert.equal(this.loading, false, 'do not stop the first load before playback');
          this.calls.push('stop');
        },
        pause() { this.calls.push('pause'); },
        destroy() { this.dead = true; }
      };
      voices.push(voice);
      return voice;
    }
  };
  return { wx, voices };
}

test('WeChat short effects start without cancelling their first load and rewind on rapid reuse', () => {
  const { wx, voices } = platform();
  const sound = Audio.createWechatSoundVoice(wx, 'rotate.wav', assert.fail, .43);
  const native = voices[0];
  assert.equal(native.options.useWebAudioImplement, true);
  assert.ok(fs.existsSync(path.resolve(__dirname, '../minigame', native.src)));
  sound.play(); sound.play(); sound.play();
  assert.deepEqual(native.calls, ['play', ['seek', 0], 'play', ['seek', 0], 'play']);
  assert.equal(native.volume, .43);
  sound.stop(); sound.play();
  assert.deepEqual(native.calls.slice(-2), ['stop', 'play']);
  sound.destroy();
  assert.equal(native.dead, true);
});

test('WeChat failed contexts retry on the next action, preserving zero volume and discarding stale errors', () => {
  const { wx, voices } = platform(), errors = [];
  const sound = Audio.createWechatSoundVoice(wx, 'light.wav', error => errors.push(error), .65);
  sound.play();
  const old = voices[0], lateError = old.error;
  old.error({ errCode: 10004, errMsg: 'unable to load audio' });
  assert.deepEqual(errors, [{ errCode: 10004, errMsg: 'unable to load audio', file: 'light.wav' }]);
  assert.equal(voices.length, 1, 'an error does not schedule an automatic replay');
  sound.setVolume(0); sound.play();
  assert.equal(old.dead, true);
  assert.equal(old.error, null);
  assert.equal(voices.length, 2);
  assert.equal(voices[1].volume, 0);
  assert.deepEqual(voices[1].calls, ['play']);
  lateError({ errCode: 10002 });
  assert.equal(errors.length, 1, 'a released context cannot report a new failure');
  sound.destroy(); sound.play();
  assert.equal(voices.length, 2);
  assert.equal(voices[1].dead, true);
});

test('WeChat music retains the streaming driver and resumes without seeking or stopping', () => {
  const { wx, voices } = platform();
  const music = Audio.createWechatMusicVoice(wx, 'ambient.wav', assert.fail, .28);
  assert.equal(voices[0].options.useWebAudioImplement, false);
  assert.equal(voices[0].loop, true);
  music.play(); music.pause(); music.setVolume(.12); music.play();
  assert.deepEqual(voices[0].calls, ['play', 'pause', 'play']);
  assert.equal(voices[0].volume, .12);
  music.destroy();
});
