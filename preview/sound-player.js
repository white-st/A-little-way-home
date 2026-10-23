(() => {
  function createVoice(file, onError, loop, volume) {
    const audio = document.createElement('audio');
    audio.src = `/miniprogram/assets/audio/${file}`;
    audio.preload = 'auto';
    audio.volume = volume;
    audio.loop = loop;
    audio.hidden = true;
    audio.addEventListener('error', () => onError(audio.error));
    document.body.append(audio);
    return {
      setVolume(value) { audio.volume = value; },
      play() { if (!loop) { audio.pause(); audio.currentTime = 0; } return audio.play(); },
      pause() { audio.pause(); },
      stop() { audio.pause(); audio.currentTime = 0; },
      destroy() { audio.pause(); audio.removeAttribute('src'); audio.load(); audio.remove(); }
    };
  }
  window.createBrowserSoundVoice = (file, onError, volume = .65) => createVoice(file, onError, false, volume);
  window.createBrowserMusicVoice = (file, onError, volume = .28) => createVoice(file, onError, true, volume);
})();
