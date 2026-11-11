// An original, royalty-free soundtrack for the demo video: a mellow lo-fi
// groove in F (electric piano, pad, bass, brushed drums, a bell melody),
// synthesized from scratch so it can be regenerated to any length.
//
//   bun scripts/demo-music.ts <seconds> <out.wav>
//
// The tempo is nudged (around 92 BPM) so that whole four-bar phrases fill the
// video and the final chord lands a few seconds before the end and rings out.

const [secondsArg, outPath] = process.argv.slice(2);
const total = Number(secondsArg);
if (!total || !outPath) {
  console.error("usage: bun scripts/demo-music.ts <seconds> <out.wav>");
  process.exit(2);
}

const SR = 48000;
const tail = 5; // seconds the last chord rings
const bars = Math.max(4, Math.round(((total - tail) * 92) / 240 / 4) * 4);
const bpm = (240 * bars) / (total - tail);
const beat = 60 / bpm;
const bar = 4 * beat;
const N = Math.ceil(total * SR);

const mixL = new Float32Array(N);
const mixR = new Float32Array(N);
const verbL = new Float32Array(N); // reverb send
const verbR = new Float32Array(N);
const duck = new Float32Array(N).fill(1); // kick sidechain, applied to pad and piano

// A seeded random source, so the "human" timing is the same every run.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const jitter = (ms: number) => (rand() - 0.5) * 2 * (ms / 1000);

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function add(
  buf: Float32Array,
  start: number,
  samples: Float32Array,
  gain: number,
  pan: number, // -1 left … 1 right
  send: number,
  other: Float32Array,
  sendL: Float32Array,
  sendR: Float32Array,
) {
  const l = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const r = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  const s0 = Math.round(start * SR);
  for (let i = 0; i < samples.length; i++) {
    const j = s0 + i;
    if (j < 0) continue;
    if (j >= N) break;
    const v = samples[i];
    buf[j] += v * l;
    other[j] += v * r;
    sendL[j] += v * l * send;
    sendR[j] += v * r * send;
  }
}
const place = (start: number, s: Float32Array, gain: number, pan = 0, send = 0) =>
  add(mixL, start, s, gain, pan, send, mixR, verbL, verbR);

// ─── Instruments ─────────────────────────────────────────────────────────────

// FM electric piano: a sine carrier with a decaying 1:1 modulator for the body
// and a quick high "tine" partial for the attack.
function piano(midi: number, len: number, vel: number): Float32Array {
  const f = hz(midi);
  const n = Math.ceil((len + 1.2) * SR);
  const out = new Float32Array(n);
  const decay = 2.2 - (midi - 48) * 0.02;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const release = t > len ? Math.exp(-(t - len) * 6) : 1;
    const env = Math.min(1, t / 0.004) * Math.exp(-t / decay) * release;
    const index = (0.9 + vel * 1.6) * Math.exp(-t * 3.5) + 0.25;
    const mod = Math.sin(2 * Math.PI * f * t) * index;
    const tine = Math.sin(2 * Math.PI * f * 14 * t) * Math.exp(-t * 40) * 0.12 * vel;
    const body = Math.sin(2 * Math.PI * f * t + mod);
    out[i] =
      (body * 0.8 + Math.sin(2 * Math.PI * f * 2 * t) * 0.08 * Math.exp(-t * 2) + tine) * env;
  }
  return out;
}

// A soft additive pad: a few detuned partials with slow attack and release.
function pad(midi: number, len: number): Float32Array {
  const f = hz(midi);
  const n = Math.ceil((len + 1.5) * SR);
  const out = new Float32Array(n);
  const partials = [1, 2, 3, 4];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.9) * (t > len ? Math.exp(-(t - len) * 3) : 1);
    let v = 0;
    for (const p of partials) {
      for (const d of [-0.12, 0.12]) {
        v += Math.sin(2 * Math.PI * f * p * (1 + d / 100) * t + p) / (p * p);
      }
    }
    out[i] = v * env * 0.35;
  }
  return out;
}

// Round, slightly plucked bass: a sine with a touch of second harmonic.
function bass(midi: number, len: number, vel: number): Float32Array {
  const f = hz(midi);
  const n = Math.ceil((len + 0.15) * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env =
      Math.min(1, t / 0.008) *
      (0.55 + 0.45 * Math.exp(-t * 5)) *
      (t > len ? Math.exp(-(t - len) * 30) : 1);
    out[i] =
      (Math.sin(2 * Math.PI * f * t) + 0.22 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 4)) *
      env *
      vel;
  }
  return out;
}

// Marimba-ish bell for the melody.
function bell(midi: number, len: number, vel: number): Float32Array {
  const f = hz(midi);
  const n = Math.ceil((len + 1.5) * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env =
      Math.min(1, t / 0.003) * Math.exp(-t * 2.4) * (t > len ? Math.exp(-(t - len) * 4) : 1);
    out[i] =
      (Math.sin(2 * Math.PI * f * t) +
        0.35 * Math.sin(2 * Math.PI * f * 4 * t) * Math.exp(-t * 9) +
        0.12 * Math.sin(2 * Math.PI * f * 9.8 * t) * Math.exp(-t * 25)) *
      env *
      vel;
  }
  return out;
}

function kick(vel: number): Float32Array {
  const n = Math.ceil(0.45 * SR);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 48 + 85 * Math.exp(-t * 28);
    phase += (2 * Math.PI * f) / SR;
    out[i] = Math.tanh(1.4 * Math.sin(phase)) * Math.exp(-t * 7.5) * vel;
  }
  return out;
}

// Biquad band-pass (RBJ cookbook), for shaping noise.
function bandpass(x: Float32Array, f0: number, q: number): Float32Array {
  const w = (2 * Math.PI * f0) / SR;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - alpha) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

function noise(seconds: number): Float32Array {
  const out = new Float32Array(Math.ceil(seconds * SR));
  for (let i = 0; i < out.length; i++) out[i] = rand() * 2 - 1;
  return out;
}

function snare(vel: number): Float32Array {
  const body = bandpass(noise(0.35), 1800, 0.7);
  for (let i = 0; i < body.length; i++) {
    const t = i / SR;
    body[i] =
      (body[i] * 1.6 * Math.exp(-t * 14) +
        Math.sin(2 * Math.PI * 185 * t) * 0.35 * Math.exp(-t * 30)) *
      vel;
  }
  return body;
}

function hat(vel: number, open = false): Float32Array {
  const s = bandpass(noise(open ? 0.4 : 0.09), 8500, 1.2);
  for (let i = 0; i < s.length; i++) s[i] *= Math.exp(-(i / SR) * (open ? 9 : 55)) * vel;
  return s;
}

// ─── Arrangement ─────────────────────────────────────────────────────────────

// Fmaj9 · Dm9 · Bbmaj9 · C11: upper-structure piano voicings over roots.
const chords = [
  { piano: [57, 60, 64, 67], pad: [53, 60, 64], root: 41 },
  { piano: [57, 60, 64, 65], pad: [50, 57, 65], root: 38 },
  { piano: [57, 60, 62, 65], pad: [46, 57, 62], root: 46 },
  { piano: [55, 58, 62, 65], pad: [48, 55, 65], root: 36 },
];
// [beat in bar, midi, length in beats] over four bars.
const motif: [number, number, number][][] = [
  [
    [0, 81, 1],
    [1, 79, 0.5],
    [1.5, 77, 1.5],
    [3, 74, 1],
  ],
  [
    [0.5, 72, 0.5],
    [1, 74, 1],
    [2, 77, 2],
  ],
  [
    [0, 79, 1],
    [1, 77, 0.5],
    [1.5, 74, 0.5],
    [2, 72, 1],
    [3, 74, 1],
  ],
  [
    [0, 77, 2.5],
    [3, 79, 0.5],
    [3.5, 81, 0.5],
  ],
];
const answer: [number, number, number][][] = [
  [
    [0, 84, 1.5],
    [1.5, 81, 0.5],
    [2, 79, 2],
  ],
  [
    [0, 77, 1],
    [1, 81, 1],
    [2, 79, 2],
  ],
  [
    [0, 74, 1],
    [1, 77, 1],
    [2, 74, 0.5],
    [2.5, 72, 1.5],
  ],
  [[0, 72, 3]],
];
const swing = (b: number) => (b % 1 === 0.5 ? b + 0.08 : b);

const intro = 2; // bars of piano and pad under the title card
for (let b = 0; b < bars; b++) {
  const t0 = b * bar;
  const ch = chords[b % 4];
  const phrase = Math.floor(b / 4);
  const full = b >= intro + 4;
  const groove = b >= intro;
  const lastPhrase = b >= bars - 4;

  // Piano: chord on 1, a softer push on 2&, and again on 4.
  for (const [at, len, vel] of [
    [0, 1.5, 0.85],
    [1.5, 1, 0.5],
    [3, 1, 0.6],
  ] as const) {
    ch.piano.forEach((m, k) => {
      const start = t0 + swing(at) * beat + k * 0.012 + jitter(6);
      place(start, piano(m, len * beat, vel), 0.1 * vel, -0.25 + k * 0.17, 0.35);
    });
  }
  ch.pad.forEach((m, k) => place(t0, pad(m, bar), 0.06, k % 2 ? 0.5 : -0.5, 0.5));

  if (groove) {
    // Bass: root on 1 and 3, a passing note into the next chord.
    const next = chords[(b + 1) % 4].root;
    place(t0 + jitter(4), bass(ch.root, beat * 1.6, 1), 0.16);
    place(t0 + 2 * beat + jitter(4), bass(ch.root + 12, beat * 0.8, 0.7), 0.13);
    place(
      t0 + 3.5 * beat + 0.08 * beat,
      bass(next + (next > ch.root ? -1 : 1), beat * 0.4, 0.6),
      0.12,
    );

    // Hats on swung eighths.
    for (let e = 0; e < 8; e++) {
      const at = swing(e / 2);
      place(t0 + at * beat + jitter(5), hat(e % 2 ? 0.55 : 0.9), 0.06, 0.35, 0.1);
    }
  }
  if (full) {
    for (const at of [0, 2.5]) {
      const start = t0 + swing(at) * beat;
      place(start, kick(at ? 0.75 : 1), 0.4);
      const s0 = Math.round(start * SR);
      for (let i = 0; i < 0.35 * SR && s0 + i < N; i++) {
        duck[s0 + i] = Math.min(duck[s0 + i], 1 - 0.35 * Math.exp(-(i / SR) * 9));
      }
    }
    for (const at of [1, 3]) place(t0 + at * beat + jitter(5), snare(0.8), 0.13, -0.1, 0.4);
    if (b % 4 === 3) place(t0 + 3.5 * beat + 0.08 * beat, hat(0.5, true), 0.05, 0.4, 0.3);
  }

  // The melody sings in alternate phrases once the groove is going, and
  // answers itself on the way out.
  const melodic = full && !lastPhrase && phrase % 2 === 0;
  if (melodic || (full && lastPhrase)) {
    const line = lastPhrase ? answer : phrase % 4 === 2 ? answer : motif;
    for (const [at, m, len] of line[b % 4]) {
      place(
        t0 + swing(at) * beat + jitter(8),
        bell(m, len * beat, 0.8 + rand() * 0.2),
        0.085,
        0.2,
        0.55,
      );
    }
  }
}

// The final Fmaj9, rung out under the end card.
{
  const tEnd = bars * bar;
  [41, 53].forEach((m) => place(tEnd, bass(m, tail, 0.8), 0.13));
  [57, 60, 64, 67, 72].forEach((m, k) =>
    place(tEnd + k * 0.03, piano(m, tail - 1, 0.8), 0.07, -0.3 + k * 0.15, 0.5),
  );
  [53, 60, 64].forEach((m, k) => place(tEnd, pad(m, tail - 1.5), 0.05, k % 2 ? 0.5 : -0.5, 0.5));
  place(tEnd + 0.01, bell(84, 2, 0.7), 0.06, 0.2, 0.6);
}

// ─── Mix ─────────────────────────────────────────────────────────────────────

// Freeverb: parallel damped combs into series all-passes, per channel.
function freeverb(input: Float32Array, spread: number): Float32Array {
  const scale = SR / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((l) => ({
    buf: new Float32Array(Math.round((l + spread) * scale)),
    i: 0,
    store: 0,
  }));
  const alls = [556, 441, 341, 225].map((l) => ({
    buf: new Float32Array(Math.round((l + spread) * scale)),
    i: 0,
  }));
  const out = new Float32Array(input.length);
  const feedback = 0.86;
  const damp = 0.3;
  for (let n = 0; n < input.length; n++) {
    const x = input[n] * 0.015;
    let y = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.store = o * (1 - damp) + c.store * damp;
      c.buf[c.i] = x + c.store * feedback;
      if (++c.i >= c.buf.length) c.i = 0;
      y += o;
    }
    for (const a of alls) {
      const b = a.buf[a.i];
      a.buf[a.i] = y + b * 0.5;
      if (++a.i >= a.buf.length) a.i = 0;
      y = b - y;
    }
    out[n] = y;
  }
  return out;
}

const wetL = freeverb(verbL, 0);
const wetR = freeverb(verbR, 23);

// Gentle low-pass on the master (lo-fi warmth), soft clip, fades.
const out = new Int16Array(N * 2);
let lpL = 0,
  lpR = 0;
const cut = 1 - Math.exp((-2 * Math.PI * 9000) / SR);
let peak = 0;
const master = new Float32Array(N * 2);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fadeIn = Math.min(1, t / 1.2);
  const fadeOut = Math.min(1, Math.max(0, (total - t) / 3.5));
  const d = duck[i];
  lpL += cut * (mixL[i] * d + wetL[i] * 1.2 - lpL);
  lpR += cut * (mixR[i] * d + wetR[i] * 1.2 - lpR);
  master[2 * i] = Math.tanh(lpL * 1.1) * fadeIn * fadeOut;
  master[2 * i + 1] = Math.tanh(lpR * 1.1) * fadeIn * fadeOut;
  peak = Math.max(peak, Math.abs(master[2 * i]), Math.abs(master[2 * i + 1]));
}
const norm = 0.89 / peak; // -1 dBFS
for (let i = 0; i < master.length; i++) out[i] = Math.round(master[i] * norm * 32767);

// 16-bit stereo WAV.
const header = new DataView(new ArrayBuffer(44));
const str = (o: number, s: string) =>
  [...s].forEach((c, k) => header.setUint8(o + k, c.charCodeAt(0)));
str(0, "RIFF");
header.setUint32(4, 36 + out.byteLength, true);
str(8, "WAVE");
str(12, "fmt ");
header.setUint32(16, 16, true);
header.setUint16(20, 1, true);
header.setUint16(22, 2, true);
header.setUint32(24, SR, true);
header.setUint32(28, SR * 4, true);
header.setUint16(32, 4, true);
header.setUint16(34, 16, true);
str(36, "data");
header.setUint32(40, out.byteLength, true);
await Bun.write(outPath, new Blob([header.buffer, out.buffer]));
console.log(
  `  soundtrack: ${bars} bars at ${bpm.toFixed(1)} BPM, ${total.toFixed(1)}s → ${outPath}`,
);
