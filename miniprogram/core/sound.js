(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LightSound = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STORAGE_KEY = 'follow-the-light-sound-v1';
  const VOLUME_KEY = 'follow-the-light-sound-volume-v1';
  const DEFAULT_VOLUME = .65;
  const volumeValue = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
  const FILES = { rotate: 'rotate.wav', light: 'light.wav', complete: 'complete.wav' };
  const snapshot = game => ({ game, moves: game.moves, lit: [...game.result.lit], solved: game.result.solved });
  function cues(before, game, action) {
    if (before.game !== game || !['rotate', 'undo'].includes(action) || before.moves === game.moves) return [];
    const result = ['rotate'];
    if (game.result.lit.some(index => !before.lit.includes(index))) result.push('light');
    if (!before.solved && game.result.solved) result.push('complete');
    return result;
  }
  // Audio is an output of successful actions, never a source of game state.
  class SoundEffects {
    constructor({ saved, savedVolume, createVoice, onError }) {
      this.enabled = saved !== false;
      this.volume = volumeValue(savedVolume, DEFAULT_VOLUME);
      this.active = true;
      this.disposed = false;
      this.generation = 0;
      this.voices = new Map();
      this.rotationSlot = 0;
      this.createVoice = createVoice;
      this.onError = onError;
      this.reported = false;
    }
    report(error) {
      if (!this.disposed && this.active && this.enabled && !this.reported) {
        this.reported = true;
        this.onError(error);
      }
    }
    play(kind) {
      if (!this.enabled || !this.active || this.disposed) return;
      // Two short rotation voices preserve quick taps without unbounded overlap.
      const key = kind === 'rotate' ? `rotate-${this.rotationSlot++ % 2}` : kind;
      const generation = this.generation;
      try {
        if (!this.voices.has(key)) this.voices.set(key, this.createVoice(FILES[kind], error => this.report(error), this.volume));
        const pending = this.voices.get(key).play();
        if (pending && pending.catch) pending.catch(error => {
          if (generation === this.generation && error.name !== 'AbortError') this.report(error);
        });
      } catch (error) { this.report(error); }
    }
    afterAction(before, game, action, deferComplete = false) {
      if (before.game !== game) { this.stop(); return; }
      for (const kind of cues(before, game, action)) if (kind !== 'complete' || !deferComplete) this.play(kind);
    }
    stop() {
      this.generation += 1;
      for (const voice of this.voices.values()) {
        try { voice.stop(); } catch (error) { this.report(error); }
      }
    }
    setEnabled(enabled) {
      if (enabled && !this.enabled) this.reported = false;
      this.enabled = enabled;
      if (!enabled) this.stop();
    }
    setVolume(value) {
      this.volume = volumeValue(value, this.volume);
      if (this.disposed) return;
      for (const voice of this.voices.values()) {
        try { voice.setVolume(this.volume); } catch (error) { this.report(error); }
      }
    }
    setActive(active) {
      this.active = active;
      if (!active) this.stop();
    }
    destroy() {
      this.disposed = true;
      this.stop();
      for (const voice of this.voices.values()) voice.destroy();
      this.voices.clear();
    }
  }
  return { STORAGE_KEY, VOLUME_KEY, DEFAULT_VOLUME, FILES, snapshot, cues, SoundEffects };
}));
