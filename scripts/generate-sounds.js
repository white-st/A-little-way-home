// Original synthesized effects, generated offline with no external samples.
const fs = require('node:fs');
const path = require('node:path');
const rate = 44100;
function tone(samples, start, duration, frequency, gain, decay, shimmer = 0) {
  const offset = Math.round(start * rate);
  for (let i = 0; i < duration * rate && offset + i < samples.length; i++) {
    const t = i / rate;
    const envelope = Math.min(1, t / .006) * Math.exp(-t / decay) * Math.min(1, (duration - t) / .035);
    const wave = Math.sin(2 * Math.PI * frequency * t) + shimmer * Math.sin(2 * Math.PI * frequency * 2.006 * t);
    samples[offset + i] += wave * gain * envelope;
  }
}
function make(name, duration, notes) {
  const samples = new Float64Array(Math.ceil(duration * rate));
  for (const note of notes) tone(samples, ...note);
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
  let peak = 0;
  samples.forEach((sample, index) => {
    peak = Math.max(peak, Math.abs(sample));
    if (Math.abs(sample) > .8) throw new Error(`${name}: excessive peak`);
    wav.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
  });
  const folder = path.resolve(__dirname, '../miniprogram/assets/audio');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, `${name}.wav`), wav);
  console.log(`${name}: ${duration}s, ${wav.length} bytes, peak ${peak.toFixed(3)}`);
}
// Muted glass/wood tick, a clear two-note glint, then a warm C-major cadence.
make('rotate', .16, [[0,.15,740,.23,.027,.15],[.018,.11,1110,.065,.022,.1]]);
make('light', .62, [[0,.56,1318.51,.21,.17,.26],[.055,.54,1975.53,.1,.14,.2]]);
make('complete', 1.45, [[.12,.65,523.25,.15,.24,.12],[.24,.65,659.25,.14,.24,.12],[.36,.8,783.99,.14,.29,.12],[.52,.9,1046.5,.15,.32,.16],[.52,.9,523.25,.07,.3,0],[.52,.9,659.25,.07,.3,0]]);
