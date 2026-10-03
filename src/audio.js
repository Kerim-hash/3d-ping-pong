// Tiny synthesized sounds: paddle "pock", table bounce, net thud. Created lazily on first use so
// the AudioContext starts after a user gesture.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        this.enabled = false;
        return null;
      }
    }
    if (this.ctx.state !== 'running') {
      // Browsers only let audio start after a user gesture; try once per call, stay quiet until then.
      if (!this.resuming) {
        this.resuming = true;
        this.ctx.resume().catch(() => {}).finally(() => { this.resuming = false; });
      }
      return null;
    }
    return this.ctx;
  }

  tone({ freq, decay, gain, type = 'sine', noise = 0 }) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(gain, t0);
    out.gain.exponentialRampToValueAtTime(0.001, t0 + decay);
    out.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t0 + decay);
    osc.connect(out);
    osc.start(t0);
    osc.stop(t0 + decay);

    if (noise > 0) {
      const len = Math.floor(ctx.sampleRate * decay);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq * 2;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = noise;
      src.connect(bp).connect(g).connect(out);
      src.start(t0);
    }
  }

  paddle(speed) {
    const k = Math.min(1, speed / 14);
    this.tone({ freq: 700 + 500 * k, decay: 0.07, gain: 0.25 + 0.35 * k, noise: 0.6 });
  }

  bounce() {
    this.tone({ freq: 1400, decay: 0.05, gain: 0.18, noise: 0.4 });
  }

  net() {
    this.tone({ freq: 180, decay: 0.12, gain: 0.2, type: 'triangle', noise: 0.5 });
  }

  point(win) {
    this.tone({ freq: win ? 660 : 220, decay: 0.25, gain: 0.15, type: 'triangle' });
    if (win) setTimeout(() => this.tone({ freq: 990, decay: 0.3, gain: 0.12, type: 'triangle' }), 110);
  }
}
