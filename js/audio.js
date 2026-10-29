/* =========================================================
   ASTRAL RIFT — procedural audio engine
   No external samples. Everything is synthesized live.
   ========================================================= */
(function () {
  'use strict';

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.sfxBus = null;
      this.musicBus = null;
      this.delay = null;
      this.noise = null;
      this.muted = false;
      this.musicEnabled = true;
      this.started = false;
      this.intensity = 0;
      this._timer = null;
      this._nextNote = 0;
      this._step = 0;
      this._last = {};
      this._musicNodes = [];
      this._scale = [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66];
      this._arp = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];
    }

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      const master = this.master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.72;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 20;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.25;
      master.connect(compressor);
      compressor.connect(ctx.destination);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.58;
      this.sfxBus.connect(master);

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicEnabled ? 0.34 : 0;
      this.musicBus.connect(master);

      this.delay = ctx.createDelay(1.2);
      this.delay.delayTime.value = 0.36;
      const fb = ctx.createGain();
      fb.gain.value = 0.28;
      const wet = ctx.createGain();
      wet.gain.value = 0.24;
      this.delay.connect(fb);
      fb.connect(this.delay);
      this.delay.connect(wet);
      wet.connect(this.musicBus);
      this._delayIn = this.delay;

      this.noise = this._makeNoise(2.2);
    }

    _makeNoise(seconds) {
      const ctx = this.ctx;
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2 + white * 0.35;
      }
      return buffer;
    }

    async unlock() {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        try { await this.ctx.resume(); } catch (e) { /* ignore */ }
      }
      if (!this.started && this.musicEnabled && this.ctx.state === 'running') this.startMusic();
    }

    setMuted(value) {
      this.muted = !!value;
      if (!this.master) return;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.72, t, 0.03);
    }

    setMusicEnabled(value) {
      this.musicEnabled = !!value;
      if (!this.musicBus) return;
      const t = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setTargetAtTime(this.musicEnabled ? 0.34 : 0, t, 0.25);
      if (this.musicEnabled && !this.started) this.startMusic();
    }

    setIntensity(value) {
      this.intensity = Math.max(0, Math.min(2, value));
    }

    startMusic() {
      if (!this.ctx || this.started || this.ctx.state !== 'running') return;
      this.started = true;
      this._nextNote = this.ctx.currentTime + 0.08;
      this._buildDrone();
      this._timer = setInterval(() => this._schedule(), 70);
    }

    _buildDrone() {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 240;
      filter.Q.value = 2.5;

      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.gain.exponentialRampToValueAtTime(0.055, t + 4);

      [55, 55.5, 82.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = i === 2 ? 'triangle' : 'sawtooth';
        osc.frequency.value = freq;
        osc.detune.value = i * 3 - 3;
        const g = ctx.createGain();
        g.gain.value = i === 2 ? 0.28 : 0.4;
        osc.connect(g);
        g.connect(filter);
        osc.start(t);
        this._musicNodes.push(osc);
      });

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.055;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 90;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start(t);
      this._musicNodes.push(lfo);

      const shimmer = ctx.createOscillator();
      shimmer.type = 'sine';
      shimmer.frequency.value = 880;
      const shimmerGain = ctx.createGain();
      shimmerGain.gain.value = 0.008;
      shimmer.connect(shimmerGain);
      shimmerGain.connect(this.musicBus);
      shimmer.start(t);
      this._musicNodes.push(shimmer);

      filter.connect(gain);
      gain.connect(this.musicBus);
      this._musicNodes.push(filter, gain);
    }

    _schedule() {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const lookahead = this.ctx.currentTime + 0.18;
      while (this._nextNote < lookahead) {
        this._playStep(this._step, this._nextNote);
        const beat = this.intensity > 1.2 ? 0.28 : this.intensity > 0.4 ? 0.38 : 0.5;
        this._nextNote += beat;
        this._step++;
      }
    }

    _playStep(step, time) {
      const ctx = this.ctx;
      const inten = this.intensity;
      const arpOn = inten > 0.3 || step % 4 === 0;
      if (arpOn && step % 2 === 0) {
        const idx = [0, 2, 4, 5, 4, 2, 1, 3][step % 8];
        const freq = this._arp[idx] * (step % 16 < 8 ? 1 : 0.75);
        this._pluck(freq, time, 0.026 + inten * 0.012);
      }
      if (inten > 0.75) {
        if (step % 4 === 0) this._kick(time, 0.03 * inten);
        if (step % 8 === 4) this._hat(time, 0.012);
        if (step % 8 === 6) this._bass(time, this._scale[step % 3], 0.045);
      }
      if (inten > 1.35 && step % 2 === 1) this._hat(time, 0.008);
    }

    _pluck(freq, time, vol) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      filter.type = 'lowpass';
      filter.frequency.value = 2200;
      filter.Q.value = 2;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(vol, time + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.9);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicBus);
      if (this._delayIn) gain.connect(this._delayIn);
      osc.start(time);
      osc.stop(time + 1);
    }

    _bass(time, freq, vol) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq / 2;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(vol, time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.5);
      osc.connect(gain);
      gain.connect(this.musicBus);
      osc.start(time);
      osc.stop(time + 0.55);
    }

    _kick(time, vol) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(110, time);
      osc.frequency.exponentialRampToValueAtTime(38, time + 0.15);
      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
      osc.connect(gain);
      gain.connect(this.musicBus);
      osc.start(time);
      osc.stop(time + 0.26);
    }

    _hat(time, vol) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 7200;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicBus);
      src.start(time, Math.random() * 1.2, 0.09);
    }

    _throttle(name, ms) {
      const now = performance.now();
      if (this._last[name] && now - this._last[name] < ms) return false;
      this._last[name] = now;
      return true;
    }

    _tone(opts) {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t = (opts.when || 0) + ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      let node = osc;
      if (opts.filter) {
        const filter = ctx.createBiquadFilter();
        filter.type = opts.filterType || 'lowpass';
        filter.frequency.setValueAtTime(opts.filter, t);
        if (opts.filterTo) filter.frequency.exponentialRampToValueAtTime(opts.filterTo, t + opts.dur);
        filter.Q.value = opts.q || 1;
        node.connect(filter);
        node = filter;
      }
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(Math.max(20, opts.freq), t);
      if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + opts.dur);
      if (opts.detune) osc.detune.value = opts.detune;
      const vol = opts.vol == null ? 0.08 : opts.vol;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + (opts.attack || 0.006));
      gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
      node.connect(gain);
      gain.connect(opts.music ? this.musicBus : this.sfxBus);
      if (opts.delay && this._delayIn) gain.connect(this._delayIn);
      osc.start(t);
      osc.stop(t + opts.dur + 0.03);
    }

    _noiseBurst(opts) {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t = (opts.when || 0) + ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.playbackRate.value = opts.rate || 1;
      const filter = ctx.createBiquadFilter();
      filter.type = opts.type || 'lowpass';
      filter.frequency.setValueAtTime(opts.freq || 800, t);
      if (opts.to) filter.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur);
      filter.Q.value = opts.q || 0.8;
      const gain = ctx.createGain();
      const vol = opts.vol == null ? 0.1 : opts.vol;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + (opts.attack || 0.006));
      gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(opts.music ? this.musicBus : this.sfxBus);
      src.start(t, Math.random() * 1.3, opts.dur + 0.08);
    }

    sfx(name, data) {
      if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
      const d = data || {};
      switch (name) {
        case 'click':
          if (!this._throttle('click', 50)) return;
          this._tone({ freq: 520, to: 680, dur: 0.045, vol: 0.025, type: 'triangle' });
          break;
        case 'place':
          this._tone({ freq: 160, to: 340, dur: 0.18, vol: 0.09, type: 'triangle' });
          this._tone({ freq: 740, to: 980, dur: 0.22, vol: 0.035, type: 'sine', when: 0.03 });
          this._noiseBurst({ freq: 1200, to: 300, dur: 0.15, vol: 0.045 });
          break;
        case 'upgrade':
          [0, 0.07, 0.14].forEach((w, i) => this._tone({ freq: 340 + i * 180, to: 460 + i * 240, dur: 0.24, vol: 0.06, type: 'triangle', when: w }));
          this._tone({ freq: 920, to: 1380, dur: 0.3, vol: 0.028, type: 'sine', when: 0.12 });
          break;
        case 'sell':
          this._tone({ freq: 420, to: 140, dur: 0.22, vol: 0.055, type: 'triangle' });
          this._noiseBurst({ freq: 600, to: 160, dur: 0.2, vol: 0.04 });
          break;
        case 'error':
          if (!this._throttle('error', 160)) return;
          this._tone({ freq: 130, to: 90, dur: 0.14, vol: 0.06, type: 'square' });
          break;
        case 'shoot_pulse':
          if (!this._throttle('sp', 45)) return;
          this._tone({ freq: d.pitch || 980, to: 430, dur: 0.055, vol: 0.028, type: 'sawtooth', filter: 2800 });
          break;
        case 'shoot_prism':
          if (!this._throttle('spr', 70)) return;
          this._noiseBurst({ type: 'bandpass', freq: 2400, to: 900, dur: 0.1, vol: 0.04 });
          this._tone({ freq: 1300, to: 720, dur: 0.11, vol: 0.022, type: 'sine' });
          break;
        case 'shoot_mortar':
          this._tone({ freq: 90, to: 55, dur: 0.18, vol: 0.12, type: 'sine' });
          this._noiseBurst({ freq: 380, to: 180, dur: 0.16, vol: 0.07 });
          break;
        case 'shoot_rail':
          this._noiseBurst({ type: 'highpass', freq: 1600, to: 5000, dur: 0.22, vol: 0.055 });
          this._tone({ freq: 220, to: 1500, dur: 0.2, vol: 0.06, type: 'sawtooth', filter: 2400 });
          break;
        case 'hit':
          if (!this._throttle('hit', 42)) return;
          this._noiseBurst({ type: 'bandpass', freq: 1600, to: 600, dur: 0.06, vol: 0.022 });
          break;
        case 'kill':
          if (!this._throttle('kill', 65)) return;
          this._tone({ freq: 260 + Math.random() * 80, to: 90, dur: 0.18, vol: 0.055, type: 'triangle' });
          this._noiseBurst({ freq: 900, to: 180, dur: 0.17, vol: 0.05 });
          break;
        case 'explode':
          if (!this._throttle('explode', 55)) return;
          this._noiseBurst({ freq: 500, to: 60, dur: 0.34, vol: 0.1, rate: 0.7 });
          this._tone({ freq: 70, to: 38, dur: 0.28, vol: 0.11, type: 'sine' });
          break;
        case 'leak':
          this._tone({ freq: 130, to: 80, dur: 0.2, vol: 0.13, type: 'square', filter: 800 });
          this._tone({ freq: 240, to: 120, dur: 0.35, vol: 0.06, type: 'sawtooth', when: 0.12 });
          this._noiseBurst({ freq: 300, to: 100, dur: 0.35, vol: 0.08 });
          break;
        case 'wave':
          this._tone({ freq: 110, to: 220, dur: 1.2, vol: 0.07, type: 'sawtooth', filter: 200, filterTo: 1400, q: 3 });
          this._tone({ freq: 440, to: 880, dur: 1.1, vol: 0.025, type: 'sine', when: 0.1 });
          this._noiseBurst({ type: 'highpass', freq: 400, to: 3000, dur: 0.8, vol: 0.035 });
          break;
        case 'boss':
          this._tone({ freq: 58, to: 44, dur: 1.8, vol: 0.14, type: 'sawtooth', filter: 160 });
          this._tone({ freq: 220, to: 180, dur: 1.6, vol: 0.04, type: 'square', filter: 500, when: 0.2 });
          this._noiseBurst({ freq: 240, to: 80, dur: 1.5, vol: 0.08 });
          break;
        case 'draft':
          [660, 880, 1100].forEach((f, i) => this._tone({ freq: f, to: f * 1.01, dur: 0.7, vol: 0.03, type: 'sine', when: i * 0.09, delay: true }));
          break;
        case 'pick':
          this._tone({ freq: 320, to: 640, dur: 0.2, vol: 0.06, type: 'triangle' });
          this._tone({ freq: 960, to: 1440, dur: 0.55, vol: 0.035, type: 'sine', when: 0.06, delay: true });
          break;
        case 'nova':
          this._tone({ freq: 60, to: 32, dur: 1.5, vol: 0.16, type: 'sine' });
          this._noiseBurst({ freq: 600, to: 80, dur: 1.2, vol: 0.11 });
          this._tone({ freq: 220, to: 1800, dur: 0.9, vol: 0.035, type: 'sawtooth', filter: 500, filterTo: 6000 });
          break;
        case 'overclock':
          [0, 0.08, 0.16, 0.24].forEach((w, i) => this._tone({ freq: 260 + i * 120, to: 420 + i * 180, dur: 0.5, vol: 0.035, type: 'triangle', when: w }));
          this._noiseBurst({ type: 'highpass', freq: 900, to: 5000, dur: 0.6, vol: 0.03 });
          break;
        case 'chrono':
          this._tone({ freq: 900, to: 160, dur: 1.2, vol: 0.05, type: 'sine' });
          this._tone({ freq: 450, to: 80, dur: 1.4, vol: 0.04, type: 'triangle', when: 0.1 });
          this._noiseBurst({ type: 'lowpass', freq: 2000, to: 200, dur: 1.1, vol: 0.04 });
          break;
        case 'orbital':
          this._tone({ freq: 1400, to: 180, dur: 0.5, vol: 0.04, type: 'sawtooth', filter: 4000, filterTo: 500 });
          this._tone({ freq: 80, to: 45, dur: 0.7, vol: 0.1, type: 'sine' });
          break;
        case 'waveclear':
          [440, 554, 659, 880].forEach((f, i) => this._tone({ freq: f, to: f * 1.02, dur: 0.8, vol: 0.035, type: 'triangle', when: i * 0.1, delay: true }));
          break;
        case 'victory':
          [220, 330, 440, 554, 660, 880].forEach((f, i) => this._tone({ freq: f, to: f, dur: 1.6, vol: 0.045, type: 'triangle', when: i * 0.14, delay: true }));
          this._tone({ freq: 55, to: 110, dur: 3, vol: 0.07, type: 'sine' });
          break;
        case 'defeat':
          [300, 240, 180, 120].forEach((f, i) => this._tone({ freq: f, to: f * 0.8, dur: 1, vol: 0.06, type: 'sawtooth', filter: 600, when: i * 0.22 }));
          this._noiseBurst({ freq: 400, to: 50, dur: 2, vol: 0.09 });
          break;
        default:
          break;
      }
    }
  }

  window.AudioEngine = AudioEngine;
  window.audioEngine = new AudioEngine();
})();
