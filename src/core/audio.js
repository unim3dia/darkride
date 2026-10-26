// Everything you hear is synthesized: rain, a tired V8, hydraulics, the slam.
// Sound is half of game feel; every visual event has an audible twin.

const DRONE_ROOTS = [55, 49, 46.25, 43.65, 41.2, 38.89, 36.71, 46.25, 41.2]; // one root per zone, falling as the city empties

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  start() {
    if (this.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 3);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(3.2, 2.6);
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.5;
    this.verbIn.connect(this.verb).connect(this.master);

    this.noise = this.noiseBuffer(3);
    this.buildRain();
    this.buildEngine();
    this.buildDrone();
    this.buildLoops();
    this.trainGain = this.gain(0);
    this.loopNoise().connect(this.filter('lowpass', 90, 1.2)).connect(this.trainGain).connect(this.master);
    this.nextClack = 0;
    this.clackBeat = 0;
  }

  noiseBuffer(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  impulse(sec, decay) {
    const len = this.ctx.sampleRate * sec;
    const b = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  loopNoise() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    src.start(0, Math.random() * 2);
    return src;
  }

  filter(type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  gain(v = 0) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  buildRain() {
    this.rainGain = this.gain(0.07);
    this.loopNoise().connect(this.filter('highpass', 900)).connect(this.filter('lowpass', 6000)).connect(this.rainGain).connect(this.master);
    this.rumble = this.gain(0.03);
    this.loopNoise().connect(this.filter('lowpass', 140)).connect(this.rumble).connect(this.master);
    // wind past the windows rises with speed
    this.wind = this.gain(0);
    this.windFilter = this.filter('bandpass', 500, 0.6);
    this.loopNoise().connect(this.windFilter).connect(this.wind).connect(this.master);
    // tires on a wet road: the sound of speed you feel in your teeth
    this.tires = this.gain(0);
    this.tireFilter = this.filter('bandpass', 1400, 0.9);
    this.loopNoise().connect(this.tireFilter).connect(this.filter('highshelf', 3000)).connect(this.tires).connect(this.master);
    // fat drops on the roof, only loud from inside
    this.roof = this.gain(0);
    this.roofTicks();
  }

  roofTicks() {
    const sr = this.ctx.sampleRate;
    const b = this.ctx.createBuffer(1, sr * 2, sr);
    const d = b.getChannelData(0);
    for (let k = 0; k < 260; k++) {
      const at = Math.floor(Math.random() * (d.length - 400));
      const amp = 0.2 + Math.random() * 0.8;
      for (let i = 0; i < 300; i++) d[at + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / 40);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    src.connect(this.filter('bandpass', 2200, 0.8)).connect(this.roof).connect(this.master);
    src.start();
  }

  buildEngine() {
    const ctx = this.ctx;
    this.engGain = this.gain(0.0);
    this.engFilter = this.filter('lowpass', 400, 2);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.5); }
    shaper.curve = curve;
    this.engOsc = [ctx.createOscillator(), ctx.createOscillator(), ctx.createOscillator()];
    this.engOsc[0].type = 'sawtooth';
    this.engOsc[1].type = 'square';
    this.engOsc[2].type = 'sine';
    // the V8 lope: amplitude wobble at half the firing rate
    this.lope = ctx.createOscillator();
    this.lopeDepth = this.gain(0.35);
    const lopeAmp = this.gain(0.65);
    this.lope.connect(this.lopeDepth).connect(lopeAmp.gain);
    for (const o of this.engOsc) { o.connect(shaper); o.start(); }
    this.lope.start();
    // no two strokes alike: a little noise rides the amplitude
    const jitter = this.gain(0.18);
    this.loopNoise().connect(this.filter('lowpass', 40)).connect(jitter).connect(lopeAmp.gain);
    shaper.connect(this.engFilter).connect(lopeAmp).connect(this.engGain).connect(this.master);
  }

  buildDrone() {
    const ctx = this.ctx;
    this.droneGain = this.gain(0.0);
    this.droneGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 8);
    const lp = this.filter('lowpass', 380, 1.5);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoAmt = this.gain(160);
    lfo.connect(lfoAmt).connect(lp.frequency);
    lfo.start();
    this.drones = [0, 1.5, 2.0, 3.0].map((ratio, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = DRONE_ROOTS[0] * ratio;
      o.detune.value = (i - 1.5) * 7;
      o.connect(lp);
      o.start();
      return { o, ratio: ratio || 1 };
    });
    this.drones[0].o.frequency.value = DRONE_ROOTS[0];
    // tape wow: the whole bed drifts a few cents, slowly, never in sync
    const wow = ctx.createOscillator();
    wow.frequency.value = 0.27;
    const wowAmt = this.gain(9);
    wow.connect(wowAmt);
    for (const d of this.drones) wowAmt.connect(d.o.detune);
    wow.start();
    lp.connect(this.droneGain).connect(this.master);
    this.droneGain.connect(this.verbIn);
    this.buildRadio();
  }

  // An AM station barely holding on: static, a hum, and chords from somewhere far.
  buildRadio() {
    const ctx = this.ctx;
    this.radio = this.gain(0);
    const band = this.filter('bandpass', 1100, 0.7);
    const crush = ctx.createWaveShaper();
    const curve = new Float32Array(64);
    for (let i = 0; i < 64; i++) curve[i] = Math.round((i / 32 - 1) * 6) / 6;
    crush.curve = curve;
    band.connect(crush).connect(this.radio).connect(this.master);
    this.loopNoise().connect(this.filter('highpass', 600)).connect(this.gain(0.25)).connect(band);
    const hum = ctx.createOscillator();
    hum.frequency.value = 60;
    hum.connect(this.gain(0.06)).connect(band);
    hum.start();
    // fading signal: slow random swells
    const fade = ctx.createOscillator();
    fade.frequency.value = 0.09;
    const fadeAmt = this.gain(0.35);
    this.chordBus = this.gain(0.5);
    fade.connect(fadeAmt).connect(this.chordBus.gain);
    fade.start();
    this.chordBus.connect(band);
    this.chordIndex = 0;
    this.nextChord = 0;
  }

  radioChord() {
    const CHORDS = [[220, 261.6, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [164.8, 207.7, 246.9]];
    const t = this.ctx.currentTime;
    for (const f of CHORDS[this.chordIndex++ % CHORDS.length]) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 30;
      const g = this.gain();
      o.connect(g).connect(this.chordBus);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
      o.start(t);
      o.stop(t + 4.4);
    }
  }

  buildLoops() {
    // hydraulic whine (charging)
    const ctx = this.ctx;
    this.whine = ctx.createOscillator();
    this.whine.type = 'triangle';
    this.whineGain = this.gain(0);
    this.whine.connect(this.whineGain).connect(this.master);
    this.whine.start();
    this.hiss = this.gain(0);
    this.loopNoise().connect(this.filter('bandpass', 2600, 1.2)).connect(this.hiss).connect(this.master);
    // scrape grind
    this.scrape = this.gain(0);
    this.scrapeFilter = this.filter('bandpass', 2400, 3);
    this.loopNoise().connect(this.scrapeFilter).connect(this.scrape).connect(this.master);
    // sodium buzz
    this.buzz = ctx.createOscillator();
    this.buzz.type = 'square';
    this.buzz.frequency.value = 120;
    this.buzzGain = this.gain(0);
    this.buzz.connect(this.filter('bandpass', 240, 4)).connect(this.buzzGain).connect(this.master);
    this.buzz.start();
  }

  setZone(i) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const root = DRONE_ROOTS[i % DRONE_ROOTS.length];
    for (const d of this.drones) d.o.frequency.setTargetAtTime(root * d.ratio, t, 4);
  }

  /** Continuous params, every frame. */
  frame({ speed, throttle, charge, charging, scrape, lampNear, rain, airborne, view, train = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const gear = Math.min(3, Math.floor(speed / 11));
    const local = (speed - gear * 11) / 11;
    const rpm = 0.25 + local * 0.6 + gear * 0.04 + (airborne ? 0.15 * throttle : 0);
    const f = 28 + rpm * 70;
    this.engOsc[0].frequency.setTargetAtTime(f, t, 0.05);
    this.engOsc[1].frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engOsc[2].frequency.setTargetAtTime(f * 0.25, t, 0.05);
    this.lope.frequency.setTargetAtTime(f * 0.25, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(180 + rpm * 500 + throttle * 600, t, 0.08);
    const cabin = view === 'cabin' ? 1.3 : 1;
    this.engGain.gain.setTargetAtTime((0.05 + throttle * 0.07 + speed * 0.0012) * cabin, t, 0.1);

    this.whine.frequency.setTargetAtTime(140 + charge * 520, t, 0.03);
    this.whineGain.gain.setTargetAtTime(charging ? 0.035 + charge * 0.05 : 0, t, 0.03);
    this.hiss.gain.setTargetAtTime(charging ? 0.03 + charge * 0.05 : 0, t, 0.05);
    this.scrape.gain.setTargetAtTime(scrape * 0.35, t, 0.03);
    this.scrapeFilter.frequency.setTargetAtTime(1600 + Math.random() * 2400, t, 0.01);
    this.buzzGain.gain.setTargetAtTime(lampNear * 0.025, t, 0.1);
    this.rainGain.gain.setTargetAtTime((view === 'cabin' ? 0.035 : 0.065) * rain, t, 0.5);
    this.roof.gain.setTargetAtTime((view === 'cabin' ? 0.1 : 0.015) * rain, t, 0.3);
    // the train: a low roar you feel before you see, and the clack of wheels on joints
    this.trainGain.gain.setTargetAtTime(train * train * 0.5, t, 0.3);
    if (train > 0.15 && t > this.nextClack) {
      this.tone(52, 0.25 * train, 0.12, { to: 38, wet: 0.3 });
      this.burst('bandpass', 700, 0.08 * train, 0.05, 3, 0.3);
      this.nextClack = t + (this.clackBeat++ % 2 ? 0.42 : 0.14);
    }
    this.radio.gain.setTargetAtTime(this.noMusic ? 0 : view === 'cabin' ? 0.05 : 0.012, t, 0.4);
    if (t > this.nextChord) { this.radioChord(); this.nextChord = t + 4; }
    const roll = airborne ? 0 : Math.min(1, speed / 30);
    this.tires.gain.setTargetAtTime(roll * 0.13, t, airborne ? 0.02 : 0.08);
    this.tireFilter.frequency.setTargetAtTime(700 + speed * 45, t, 0.1);
    const still = 1 - 0.88 * (this.caveW || 0); // underground, the wind can't reach you
    this.wind.gain.setTargetAtTime((Math.min(0.12, speed * 0.0028) + (this.windBoost || 0) * 0.09) * still, t, 0.4);
    this.rumble.gain.setTargetAtTime(0.03 * still, t, 0.6);
    this.windFilter.frequency.setTargetAtTime(300 + speed * 22, t, 0.2);
  }

  /**
   * The title screen: an ominous, very low beat. A sub that drops like a
   * heartbeat, a bass that grinds a half-step, a tick far off in a big room,
   * and every eight bars a dissonant swell. Fades away when the ride begins.
   */
  menu(on) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (!on) {
      if (!this.menuGain) return;
      this.menuGain.gain.cancelScheduledValues(t);
      this.menuGain.gain.setTargetAtTime(0, t, 1.4);
      clearInterval(this.menuTimer);
      this.menuTimer = null;
      const voices = this.menuBass || [];
      setTimeout(() => voices.forEach((o) => o.stop()), 7000);
      return;
    }
    if (this.menuTimer) return;
    this.menuGain = this.gain(0);
    this.menuGain.connect(this.master);
    this.menuGain.gain.setTargetAtTime(1, t, 1.5);
    const send = this.gain(0.6);
    this.menuGain.connect(send).connect(this.verbIn);
    // the bass: two saws a hair apart plus the octave, driven a little so small
    // speakers still hear its edge, under a lowpass that slowly breathes
    const drive = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.2); }
    drive.curve = curve;
    const bassF = this.filter('lowpass', 240, 3);
    const bassG = this.gain(0.11);
    this.menuBass = [ctx.createOscillator(), ctx.createOscillator(), ctx.createOscillator()];
    this.menuBass.forEach((o, i) => { o.type = 'sawtooth'; o.frequency.value = 36.71 * [1, 1.004, 2][i]; o.connect(drive); o.start(); });
    drive.connect(bassF);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = this.gain(110);
    lfo.connect(lfoAmt).connect(bassF.frequency);
    lfo.start();
    bassF.connect(bassG).connect(this.menuGain);
    // far above it, a dark drone a half-step apart, barely there
    const padG = this.gain(0.018);
    for (const f of [146.83, 155.56]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.connect(padG);
      o.start();
      this.menuBass.push(o);
    }
    padG.connect(this.filter('lowpass', 900)).connect(this.menuGain);
    const BEAT = 60 / 66;
    let next = t + 0.3;
    let step = 0;
    const kick = (at, peak) => {
      const o = ctx.createOscillator();
      const g = this.gain();
      o.frequency.setValueAtTime(120, at);
      o.frequency.exponentialRampToValueAtTime(42, at + 0.32);
      o.connect(g).connect(this.menuGain);
      this.env(g, at, 0.004, peak, 0.9);
      o.start(at);
      o.stop(at + 1.1);
      // the beater: a dull knock so the beat lands even where the sub can't be heard
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      const ng = this.gain();
      n.connect(this.filter('bandpass', 180, 1.2)).connect(ng).connect(this.menuGain);
      this.env(ng, at, 0.002, peak * 0.5, 0.08);
      n.start(at, Math.random() * 2, 0.15);
    };
    const tick = (at, peak) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const g = this.gain();
      src.connect(this.filter('bandpass', 5200, 6)).connect(g).connect(this.menuGain);
      this.env(g, at, 0.002, peak, 0.05);
      src.start(at, Math.random() * 2, 0.1);
    };
    const swell = (at) => {
      for (const f of [73.42, 77.78, 110]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const g = this.gain();
        o.connect(this.filter('lowpass', 320, 1)).connect(g).connect(this.menuGain);
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(0.03, at + BEAT * 4);
        g.gain.linearRampToValueAtTime(0.0001, at + BEAT * 8);
        o.start(at);
        o.stop(at + BEAT * 8 + 0.1);
      }
    };
    const schedule = () => {
      while (next < ctx.currentTime + 0.4) {
        const beat = step % 4;
        const bar = Math.floor(step / 4);
        if (beat === 0) kick(next, 0.55);
        if (beat === 1) kick(next + BEAT * 0.5, 0.32); // the heartbeat's second, softer thump
        if (beat === 2 || beat === 3) tick(next + BEAT * 0.5, 0.09);
        if (step % 32 === 0) swell(next);
        // every four bars the bass grinds up a half-step and back
        if (beat === 0) {
          const f = bar % 8 >= 4 ? 38.89 : 36.71;
          this.menuBass.slice(0, 3).forEach((o, i) => o.frequency.setTargetAtTime(f * [1, 1.004, 2][i], next, 0.4));
        }
        next += BEAT;
        step++;
      }
    };
    schedule();
    this.menuTimer = setInterval(schedule, 100);
  }

  /**
   * Hooves, building: at first a few light patters and glassy chimes in the
   * fog; by the end a ground-shaking roar, a gallop like rolling thunder, a
   * rising drone underneath, and trumpets calling over it.
   */
  stampede(w, near, intensity = 1, vortex = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const I = intensity;
    if (!this.herdBed) {
      this.herdBed = this.gain(0);
      this.loopNoise().connect(this.filter('lowpass', 160, 0.8)).connect(this.herdBed).connect(this.master);
      this.herdDust = this.gain(0);
      this.loopNoise().connect(this.filter('bandpass', 900, 0.5)).connect(this.herdDust).connect(this.master);
      this.herdDrone = [this.ctx.createOscillator(), this.ctx.createOscillator()];
      this.herdDroneGain = this.gain(0);
      const df = this.filter('lowpass', 300, 1.5);
      this.herdDrone.forEach((o, i) => { o.type = 'sawtooth'; o.frequency.value = 36.71 * (i ? 1.5 : 1); o.connect(df); o.start(); });
      df.connect(this.herdDroneGain).connect(this.master);
      this.herdDroneGain.connect(this.verbIn);
      this.nextHoof = 0;
      this.nextCall = t + 3;
      this.nextChime = 0;
    }
    this.herdBed.gain.setTargetAtTime(w * (0.02 + I * 0.16 + near * 0.08 * I), t, 0.4);
    this.herdDust.gain.setTargetAtTime(w * (0.006 + I * 0.03), t, 0.4);
    this.herdDroneGain.gain.setTargetAtTime(w * I * I * 0.06, t, 0.6);
    this.herdDrone.forEach((o, i) => o.frequency.setTargetAtTime(36.71 * (i ? 1.5 : 1) * (1 + I * 0.5), t, 1.2));
    // the vortex sings: 432/8 Hz and its golden ratios, a chord that grows the way shells grow
    if (!this.phiChord) {
      const PHI = (1 + Math.sqrt(5)) / 2;
      this.phiGain = this.gain(0);
      this.phiChord = [1, PHI, PHI * PHI, 2 * PHI].map((r) => {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 54 * r;
        o.connect(this.phiGain);
        o.start();
        return o;
      });
      this.phiGain.connect(this.master);
      this.phiGain.connect(this.verbIn);
    }
    this.phiGain.gain.setTargetAtTime(w * vortex * 0.035, t, 1.0);
    if (w < 0.05) return;
    if (t > this.nextHoof) {
      this.tone(48 + Math.random() * 20 + (1 - I) * 60, (0.03 + I * 0.16 + near * 0.08 * I) * w, 0.14, { to: 32, wet: 0.15 + (1 - I) * 0.5 });
      this.nextHoof = t + (0.5 - I * 0.43) * (0.6 + Math.random() * 0.8);
    }
    // the fragile beginning: high glass in the fog
    if (I < 0.55 && t > this.nextChime) {
      const f = [880, 1046.5, 1174.7, 1318.5, 1568][Math.floor(Math.random() * 5)];
      this.tone(f, 0.02 * w * (1 - I * 1.6), 1.6, { wet: 0.9, attack: 0.01 });
      this.nextChime = t + 0.7 + Math.random() * 1.6;
    }
    if (I > 0.35 && t > this.nextCall) {
      const f = 380 + Math.random() * 160;
      const v = (0.02 + I * 0.05) * w;
      this.tone(f, v, 0.9, { type: 'sawtooth', to: f * 1.35, wet: 0.6, attack: 0.08 });
      this.tone(f * 1.5, v * 0.5, 0.8, { type: 'sawtooth', to: f * 1.9, wet: 0.6, attack: 0.1 });
      this.nextCall = t + (9 - I * 6) * (0.5 + Math.random());
    }
  }

  /** The drive-in's speakers: the film's engines rise and fall, a crash cracks. */
  movie(level, roar, hit) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!this.movieBed) {
      this.movieBed = this.gain(0);
      this.movieFilter = this.filter('bandpass', 400, 0.9);
      this.loopNoise().connect(this.movieFilter).connect(this.filter('lowpass', 2400)).connect(this.movieBed).connect(this.master);
      this.movieEng = this.ctx.createOscillator();
      this.movieEng.type = 'sawtooth';
      this.movieEngGain = this.gain(0);
      this.movieEng.connect(this.filter('lowpass', 500, 2)).connect(this.movieEngGain).connect(this.master);
      this.movieEng.start();
      this.movieHit = 0;
    }
    // tinny: it's coming out of a speaker on a post
    this.movieBed.gain.setTargetAtTime(level * (0.006 + roar * 0.035), t, 0.08);
    this.movieFilter.frequency.setTargetAtTime(500 + roar * 900, t, 0.1);
    this.movieEng.frequency.setTargetAtTime(70 + roar * 60, t, 0.1);
    this.movieEngGain.gain.setTargetAtTime(level * roar * 0.03, t, 0.08);
    if (hit > 0.95 && this.movieHit < 0.95 && level > 0.05) {
      this.burst('lowpass', 900, 0.25 * level, 0.5, 0.7, 0.4);
      this.burst('highpass', 2500, 0.08 * level, 0.25, 0.7, 0.4);
    }
    this.movieHit = hit;
  }

  /** The wash: a deep motor hum, water hiss, and the slap of cloth when it's going. */
  wash(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!this.washGain) {
      this.washGain = this.gain(0);
      this.loopNoise().connect(this.filter('bandpass', 1800, 0.5)).connect(this.washGain).connect(this.master);
      const hum = this.ctx.createOscillator();
      hum.type = 'sawtooth'; hum.frequency.value = 55;
      const hg = this.gain(0.25);
      hum.connect(this.filter('lowpass', 160)).connect(hg).connect(this.washGain);
      hum.start();
      this.washGain.connect(this.verbIn);
    }
    this.washGain.gain.setTargetAtTime(on ? 0.12 : 0, t, on ? 0.6 : 1.2);
    clearInterval(this.washSlap);
    if (on) this.washSlap = setInterval(() => this.burst('lowpass', 400 + Math.random() * 300, 0.06, 0.12, 1, 0.3), 260);
  }

  /** Tires churning mud: a wet low rumble rising with speed, and the squelch of clods. */
  mud(level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!this.mudGain) {
      this.mudGain = this.gain(0);
      this.loopNoise().connect(this.filter('lowpass', 380, 3)).connect(this.mudGain).connect(this.master);
      this.nextSquelch = 0;
    }
    this.mudGain.gain.setTargetAtTime(level * 0.16, t, 0.2);
    if (level > 0.15 && t > this.nextSquelch) {
      this.tone(90 + Math.random() * 60, 0.05 * level, 0.12, { to: 50, wet: 0.1 });
      this.nextSquelch = t + 0.06 + Math.random() * 0.15;
    }
  }

  /**
   * The drive-thru speaker: a recording that has played to nobody for years.
   * Speech-shaped — formant syllables through a cheap speaker, with tape wow.
   */
  drivethru() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.4;
    const out = this.gain(0.9);
    const speaker = this.filter('bandpass', 1300, 0.7);
    const drive = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3); }
    drive.curve = curve;
    out.connect(drive).connect(speaker).connect(this.master);
    speaker.connect(this.verbIn);
    // crackle under it all
    const hiss = this.gain(0.012);
    const n = this.loopNoise();
    n.connect(this.filter('bandpass', 3000, 0.8)).connect(hiss).connect(this.master);
    const VOWELS = [[730, 1090], [270, 2290], [300, 870], [530, 1840], [640, 1190], [490, 1350]];
    const phrases = [9, 7, 6];
    let t = t0;
    for (const syl of phrases) {
      for (let i = 0; i < syl; i++) {
        const dur = 0.11 + Math.random() * 0.12;
        const [f1, f2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
        const src = ctx.createOscillator();
        src.type = 'sawtooth';
        const pitch = 165 * (1 + 0.08 * Math.sin(i * 1.3)) * (i === syl - 1 ? 0.85 : 1);
        src.frequency.setValueAtTime(pitch, t);
        src.frequency.linearRampToValueAtTime(pitch * (0.94 + Math.random() * 0.1), t + dur);
        // tape wow: the whole thing sags and recovers
        const wow = ctx.createOscillator();
        wow.frequency.value = 0.7;
        const wg = this.gain(6);
        wow.connect(wg).connect(src.frequency);
        const g = this.gain(0);
        for (const [f, q] of [[f1, 8], [f2, 10]]) src.connect(this.filter('bandpass', f, q)).connect(g);
        g.connect(out);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.9, t + 0.02);
        g.gain.setValueAtTime(0.9, t + dur * 0.7);
        g.gain.linearRampToValueAtTime(0, t + dur);
        src.start(t); src.stop(t + dur + 0.05); wow.start(t); wow.stop(t + dur + 0.05);
        t += dur + (Math.random() < 0.15 ? 0.12 : 0.02);
      }
      t += 0.55;
    }
    setTimeout(() => { n.stop(); }, (t - ctx.currentTime + 0.5) * 1000);
  }

  /** Hail: a hard, bright rattle on the roof and the road. */
  hail(level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!this.hailGain) {
      this.hailGain = this.gain(0);
      this.loopNoise().connect(this.filter('highpass', 2500)).connect(this.filter('peaking', 5200, 2)).connect(this.hailGain).connect(this.master);
      this.nextStone = 0;
    }
    this.hailGain.gain.setTargetAtTime(level * 0.05, t, 0.4);
    if (level > 0.2 && t > this.nextStone) {
      this.burst('bandpass', 3000 + Math.random() * 3000, 0.04 * level, 0.03, 6, 0.1);
      this.nextStone = t + 0.01 + Math.random() * 0.05;
    }
  }

  /** A cave: a hollow, low room tone and the odd drip ringing off the rock. */
  cave(w) {
    if (!this.ctx) return;
    this.caveW = w;
    const t = this.ctx.currentTime;
    if (!this.caveBed) {
      this.caveBed = this.gain(0);
      this.loopNoise().connect(this.filter('lowpass', 220, 0.5)).connect(this.filter('peaking', 68, 6)).connect(this.caveBed).connect(this.master);
      this.caveSend = this.gain(0);
      this.caveBed.connect(this.caveSend).connect(this.verbIn);
      this.nextDrip = 0;
    }
    this.caveBed.gain.setTargetAtTime(w * 0.05, t, 0.8);
    this.caveSend.gain.setTargetAtTime(w * 0.4, t, 0.8);
    if (w > 0.3 && t > this.nextDrip) {
      const f = 900 + Math.random() * 1600;
      this.tone(f, 0.018 * w, 0.09, { to: f * 0.6, wet: 0.95, attack: 0.002 });
      this.nextDrip = t + 0.6 + Math.random() * 2.8;
    }
  }

  // ------------------------------------------------------------ one-shots

  env(node, t, a, peak, d) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.linearRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  burst(type, freq, peak, dur, q = 0.7, wet = 0.2) {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const g = this.gain();
    src.connect(this.filter(type, freq, q)).connect(g);
    g.connect(this.master);
    if (wet) { const w = this.gain(wet); g.connect(w).connect(this.verbIn); }
    this.env(g, t, 0.004, peak, dur);
    src.start(t, Math.random() * 2);
    src.stop(t + dur + 0.1);
  }

  tone(freq, peak, dur, { type = 'sine', to = null, attack = 0.005, wet = 0.3, delay = 0 } = {}) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.gain();
    o.connect(g).connect(this.master);
    if (wet) { const w = this.gain(wet); g.connect(w).connect(this.verbIn); }
    this.env(g, t, attack, peak, dur);
    o.start(t);
    o.stop(t + attack + dur + 0.1);
  }

  launch(charge) {
    if (!this.ctx) return;
    this.burst('highpass', 3000, 0.12 + charge * 0.1, 0.25, 0.7, 0.1);   // pssht
    this.tone(1900, 0.06, 0.05, { type: 'square', wet: 0.05 });           // valve clack
    this.tone(90, 0.25 * charge + 0.1, 0.18, { to: 60, wet: 0 });
  }

  slam(strength, clean) {
    if (!this.ctx) return;
    const s = Math.min(1.3, strength);
    this.tone(70, 0.6 * s, 0.55, { to: 32, wet: 0.35 });                  // body
    this.burst('lowpass', 500, 0.45 * s, 0.3, 0.7, 0.4);                 // thud
    this.burst('highpass', 1800, 0.18 * s, 0.4, 0.5, 0.2);               // splash
    for (let i = 0; i < 4; i++) {                                         // springs and chrome rattling
      this.tone(600 + Math.random() * 1400, 0.025 * s, 0.08, { type: 'square', delay: 0.04 + i * 0.05 + Math.random() * 0.03, wet: 0.1 });
    }
    if (clean > 0.8) this.tone(220, 0.05, 1.8, { attack: 0.02, wet: 0.9 }); // a clean landing rings
  }

  bump(force) {
    if (!this.ctx) return;
    const s = Math.min(1, force / 12);
    for (const fr of [180, 287, 431, 709]) this.tone(fr * (0.95 + Math.random() * 0.1), 0.12 * s, 0.6, { wet: 0.4 });
    this.burst('lowpass', 300, 0.5 * s, 0.25);
  }

  notice(pan = 0) {
    if (!this.ctx) return;
    this.tone(880, 0.04, 1.6, { attack: 0.15, wet: 0.9 });
    this.tone(1318.5, 0.03, 1.8, { attack: 0.25, wet: 0.9, delay: 0.12 });
  }

  collect() {
    if (!this.ctx) return;
    [220, 330, 440, 493.9, 659.3].forEach((f, i) => this.tone(f, 0.05, 3.2, { attack: 0.4, wet: 1, delay: i * 0.06 }));
    this.burst('bandpass', 5000, 0.05, 1.2, 3, 0.8);
  }

  arrive() {
    if (!this.ctx) return;
    this.tone(1760, 0.035, 1.5, { attack: 0.01, wet: 1 });
    this.tone(110, 0.12, 2.5, { attack: 0.3, wet: 0.6 });
  }

  thunder(distance) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + distance;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const g = this.gain();
    src.connect(this.filter('lowpass', 220 + Math.random() * 200)).connect(g).connect(this.master);
    g.connect(this.verbIn);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    src.start(t);
    src.stop(t + 5);
  }

  joint(strength, rear) {
    if (!this.ctx) return;
    this.tone(rear ? 62 : 70, 0.16 * strength, 0.12, { to: 40, wet: 0 });
    this.burst('bandpass', rear ? 900 : 1100, 0.05 * strength, 0.06, 2, 0);
  }

  /** An old bell phone: two short trills, a pause, again. Volume = how close you are. */
  phone(level, time) {
    if (!this.ctx) return;
    if (!this.ring) {
      this.ring = this.gain(0);
      const bell = this.ctx.createOscillator();
      bell.type = 'square';
      bell.frequency.value = 1020;
      const trill = this.ctx.createOscillator();
      trill.frequency.value = 20;
      const trillAmt = this.gain(0.5);
      const amp = this.gain(0.5);
      trill.connect(trillAmt).connect(amp.gain);
      bell.connect(this.filter('bandpass', 1400, 2)).connect(amp).connect(this.ring);
      this.ring.connect(this.master);
      const w = this.gain(0.6);
      this.ring.connect(w).connect(this.verbIn);
      bell.start();
      trill.start();
    }
    const cycle = time % 4;
    const on = cycle < 0.45 || (cycle > 0.65 && cycle < 1.1);
    this.ring.gain.setTargetAtTime(on ? level * level * 0.06 : 0, this.ctx.currentTime, 0.01);
  }

  pickup() {
    if (!this.ctx) return;
    this.tone(320, 0.08, 0.05, { type: 'square', wet: 0.2 });
    this.burst('bandpass', 900, 0.06, 1.8, 0.8, 0.6); // line hiss
    this.tone(110, 0.15, 3, { attack: 0.5, wet: 1 });
  }

  pop() {
    if (!this.ctx) return;
    this.burst('highpass', 4000, 0.15, 0.12, 0.7, 0.4);
    this.tone(3200, 0.03, 0.2, { type: 'square', wet: 0.4 });
  }

  // ---------------------------------------------------------------- the choir

  /**
   * Voices in pure intervals: each voice is three detuned saws through a bank of
   * vowel formants, with a slow vibrato. Chords glide into one another.
   */
  buildChoir() {
    const ctx = this.ctx;
    this.choirBus = this.gain(0);
    this.choirBus.connect(this.master);
    this.choirBus.connect(this.gain(1.3)).connect(this.verbIn);
    this.voices = [];
    for (let v = 0; v < 5; v++) {
      const vg = this.gain(0);
      const sum = this.gain(1);
      const formants = [0, 1, 2].map((k) => {
        const f = this.filter('bandpass', 800, 7);
        f.connect(this.gain([1, 0.5, 0.22][k])).connect(sum);
        return f;
      });
      sum.connect(vg).connect(this.choirBus);
      const oscs = [-8, 0, 7].map((c) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.detune.value = c + (Math.random() - 0.5) * 6;
        for (const f of formants) o.connect(f);
        o.start();
        return o;
      });
      const vib = ctx.createOscillator();
      vib.frequency.value = 4.4 + Math.random() * 1.2;
      const vibAmt = this.gain(8);
      vib.connect(vibAmt);
      for (const o of oscs) vibAmt.connect(o.detune);
      vib.start();
      this.voices.push({ vg, oscs, formants });
    }
    this.choirDef = null;
    this.choirStep = 0;
    this.nextChoir = 0;
  }

  /** Fade the choir in by `weight` with the pocket's voicing; the road drone steps back. */
  choir(def, weight) {
    if (!this.ctx) return;
    if (!this.voices) this.buildChoir();
    const t = this.ctx.currentTime;
    this.choirBus.gain.setTargetAtTime(this.noMusic ? 0 : weight * 0.05, t, 0.8);
    if (t > 9 && !this.noMusic) this.droneGain.gain.setTargetAtTime(0.06 * (1 - weight * 0.85), t, 1.0);
    this.windBoost = def && def.wind ? def.wind * weight : 0;
    if (!def || weight < 0.01) return;
    const FORMANTS = { ah: [800, 1150, 2900], oo: [325, 700, 2530], oh: [450, 800, 2830], ee: [270, 2140, 2950] };
    if (def !== this.choirDef) {
      this.choirDef = def;
      this.choirStep = 0;
      this.nextChoir = 0;
      for (const v of this.voices) {
        v.formants.forEach((f, k) => f.frequency.setTargetAtTime(FORMANTS[def.formant][k], t, 0.4));
        v.oscs.forEach((o, k) => o.detune.setTargetAtTime([-1, 0, 1][k] * (def.detune || 8), t, 0.5));
      }
    }
    if (t < this.nextChoir) return;
    const chord = def.chords[this.choirStep++ % def.chords.length];
    this.voices.forEach((v, i) => {
      const r = chord[i];
      if (r) {
        for (const o of v.oscs) o.frequency.setTargetAtTime(def.root * r, t, 0.9);
        v.vg.gain.setTargetAtTime(0.25 / Math.sqrt(chord.length), t, 1.4);
      } else v.vg.gain.setTargetAtTime(0, t, 1.2);
    });
    this.nextChoir = t + def.dur;
    if (def.bells && !this.noMusic) this.bell(def.root * chord[Math.floor(Math.random() * chord.length)] * 2, weight);
  }

  /** A struck bowl: inharmonic partials, a long ring into the reverb. */
  bell(f, level = 1) {
    [[1, 1], [2.76, 0.45], [5.4, 0.22], [8.93, 0.1]].forEach(([p, a], i) => {
      this.tone(f * p, 0.05 * a * level, 5 - i, { attack: 0.003, wet: 1, delay: Math.random() * 0.02 });
    });
  }

  /** For recording: cut every musical voice (drone, choir, bells, radio); keep the world's sounds. */
  silenceMusic(on = true) {
    this.noMusic = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.droneGain.gain.cancelScheduledValues(t);
    this.droneGain.gain.setValueAtTime(on ? 0 : 0.06, t);
    this.radio.gain.setValueAtTime(0, t);
    if (this.choirBus) this.choirBus.gain.setValueAtTime(0, t);
  }

  toggleMute() {
    if (!this.ctx) return;
    this.muted = !this.muted;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.1);
  }
}
