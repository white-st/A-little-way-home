// Short effects use WeChat's WebAudio driver; the long music loop stays native.
// System mute behavior is left at WeChat's default.
function createVoice(wx, file, onError, loop, volume) {
  let audio, errorHandler, played = false, failed = false, disposed = false;
  function release() {
    if (!audio) return;
    audio.offError(errorHandler);
    audio.destroy();
    audio = null;
  }
  function create() {
    const current = wx.createInnerAudioContext({ useWebAudioImplement: !loop });
    audio = current;
    played = false;
    failed = false;
    current.autoplay = false;
    current.loop = loop;
    current.volume = volume;
    errorHandler = error => {
      if (disposed || current !== audio) return;
      failed = true;
      onError({ errCode: error.errCode, errMsg: error.errMsg || error.message, file });
    };
    current.onError(errorHandler);
    current.src = `assets/audio/${file}`;
  }
  create();
  return {
    setVolume(value) { volume = value; if (!disposed && audio) audio.volume = value; },
    play() {
      if (disposed) return;
      // Retry a failed native context only on the next explicit playback action.
      if (failed || !audio) { release(); create(); }
      // Do not stop a newly loading sound. Rewind reused effects without a stop/play race.
      if (!loop && played) audio.seek(0);
      played = true;
      audio.play();
    },
    pause() { if (!disposed && audio) audio.pause(); },
    stop() { if (!disposed && audio) { played = false; audio.stop(); } },
    destroy() { if (disposed) return; disposed = true; release(); }
  };
}
const createWechatSoundVoice = (wx, file, onError, volume = .65) => createVoice(wx, file, onError, false, volume);
const createWechatMusicVoice = (wx, file, onError, volume = .28) => createVoice(wx, file, onError, true, volume);
module.exports = { createWechatSoundVoice, createWechatMusicVoice };
