(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LightMusic = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STORAGE_KEY = 'follow-the-light-music-v1';
  const VOLUME_KEY = 'follow-the-light-music-volume-v1';
  const DEFAULT_VOLUME = .28;
  const volumeValue = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
  const FILE = 'ambient.wav';
  // One loop per page, independent of game resets and the effects switch.
  class BackgroundMusic {
    constructor({ saved, savedVolume, createVoice, onError }) {
      this.enabled = saved !== false;
      this.volume = volumeValue(savedVolume, DEFAULT_VOLUME);
      this.active = true;
      this.unlocked = false;
      this.requested = false;
      this.disposed = false;
      this.generation = 0;
      this.voice = null;
      this.createVoice = createVoice;
      this.onError = onError;
      this.reported = false;
    }
    fail(error) {
      this.requested = false;
      if (this.disposed || !this.active || !this.enabled) return;
      // A browser may require a fresh gesture after restoring a page.
      // The next game action retries; there is no delayed autoplay queue.
      if (error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) return;
      if (!this.reported) { this.reported = true; this.onError(error); }
    }
    resume() {
      if (!this.enabled || !this.active || !this.unlocked || this.disposed || this.requested) return;
      const generation = this.generation;
      try {
        if (!this.voice) this.voice = this.createVoice(FILE, error => this.fail(error), this.volume);
        this.requested = true;
        const pending = this.voice.play();
        if (pending && pending.catch) pending.catch(error => {
          if (generation === this.generation) this.fail(error);
        });
      } catch (error) { this.fail(error); }
    }
    interact() { this.unlocked = true; this.resume(); }
    pause() {
      this.generation += 1;
      this.requested = false;
      if (this.voice) {
        try { this.voice.pause(); } catch (error) { this.fail(error); }
      }
    }
    setEnabled(enabled) {
      this.enabled = enabled;
      if (enabled) this.resume(); else this.pause();
    }
    setVolume(value) {
      this.volume = volumeValue(value, this.volume);
      if (this.voice && !this.disposed) {
        try { this.voice.setVolume(this.volume); }
        catch (error) {
          if (!this.reported) { this.reported = true; this.onError(error); }
        }
      }
    }
    setActive(active) {
      this.active = active;
      if (active) this.resume(); else this.pause();
    }
    destroy() {
      this.disposed = true;
      this.pause();
      if (this.voice) { this.voice.destroy(); this.voice = null; }
    }
  }
  return { STORAGE_KEY, VOLUME_KEY, DEFAULT_VOLUME, FILE, BackgroundMusic };
}));
