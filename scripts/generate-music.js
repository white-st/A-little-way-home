// Original eight-bar ambient piece: warm keys over slow, overlapping chords.
// All note tails wrap into the start of the buffer to keep the loop continuous.
const fs = require('node:fs');
const path = require('node:path');
const rate = 22050, beat = .8, bar = beat * 4, duration = bar * 8;
const samples = new Float64Array(Math.round(duration * rate));
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
function note(start, length, midi, gain, pad = false) {
  const offset = Math.round(start * rate), hz = frequency(midi);
  for (let i = 0; i < length * rate; i++) {
    const t = i / rate;
    const attack = Math.min(1, t / (pad ? .65 : .018));
    const release = Math.min(1, (length - t) / (pad ? 1.7 : .65));
    const envelope = attack * attack * release * release * (pad ? 1 : Math.exp(-t / .7));
    const fundamental = Math.sin(2 * Math.PI * hz * t);
    const overtone = Math.sin(2 * Math.PI * hz * 2 * t) * (pad ? .12 : .25 * Math.exp(-t / .25));
    samples[(offset + i) % samples.length] += (fundamental + overtone) * envelope * gain;
  }
}
const chords = [[48,55,64,71],[45,52,60,67],[41,48,57,64],[43,50,57,62]];
const melody = [[76,79,74],[72,76,71],[69,72,76],[74,71,67],[79,76,74],[76,72,71],[72,69,67],[74,71,72]];
for (let b = 0; b < 8; b++) {
  chords[b % 4].forEach((pitch, index) => note(b * bar, bar + 1.7, pitch, index ? .026 : .035, true));
  melody[b].forEach((pitch, index) => note(b * bar + [.2,1.4,2.2][index], 2.3, pitch, [.12,.075,.095][index]));
  note(b * bar + .8, 2.5, chords[b % 4][1] + 12, .045);
}
let peak = 0;
for (const value of samples) peak = Math.max(peak, Math.abs(value));
const scale = .34 / peak;
const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
samples.forEach((value, index) => wav.writeInt16LE(Math.round(value * scale * 32767), 44 + index * 2));
const folder = path.resolve(__dirname, '../miniprogram/assets/audio');
fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(path.join(folder, 'ambient.wav'), wav);
console.log(`ambient: ${duration}s, ${wav.length} bytes, peak 0.34, seam step ${Math.abs(wav.readInt16LE(44) - wav.readInt16LE(wav.length - 2))}`);
