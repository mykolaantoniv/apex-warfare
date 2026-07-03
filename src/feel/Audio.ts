/** Per-vehicle engine voice: a synth profile so a tank rumbles, a jet whines, a heli thrums. */
export type EngineModel = "heli" | "jet" | "tank" | "bike" | "boat" | "soldier";

/** Weapon report voice for muzzle SFX. */
export type WeaponSfx = "mg" | "cannon" | "rifle";

/** Minimal world position (structurally compatible with Babylon's Vector3). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface EngineProfile {
  base: number; // idle oscillator frequency (Hz)
  sub: number; // sub-oscillator frequency (Hz)
  lfo: number; // amplitude tremble rate (Hz) — rotor chop / diesel chug
  lfoDepth: number;
  filterHz: number; // idle lowpass cutoff
  filterSpan: number; // added cutoff at full speed
  osc: OscillatorType;
  gain: number; // idle loudness
  gainSpan: number; // added loudness at full speed
  pitchSpan: number; // added base frequency at full speed
}

// Distinct voices. Player vehicles today are heli/jet/tank; the rest are ready for future use.
const ENGINES: Record<EngineModel, EngineProfile> = {
  heli: { base: 70, sub: 35, lfo: 11, lfoDepth: 0.025, filterHz: 320, filterSpan: 600, osc: "sawtooth", gain: 0.05, gainSpan: 0.05, pitchSpan: 70 },
  tank: { base: 42, sub: 21, lfo: 5, lfoDepth: 0.035, filterHz: 240, filterSpan: 300, osc: "sawtooth", gain: 0.07, gainSpan: 0.05, pitchSpan: 34 },
  jet: { base: 150, sub: 75, lfo: 0, lfoDepth: 0, filterHz: 1200, filterSpan: 1800, osc: "sawtooth", gain: 0.04, gainSpan: 0.08, pitchSpan: 220 },
  bike: { base: 130, sub: 65, lfo: 18, lfoDepth: 0.02, filterHz: 900, filterSpan: 900, osc: "sawtooth", gain: 0.045, gainSpan: 0.05, pitchSpan: 120 },
  boat: { base: 52, sub: 26, lfo: 4, lfoDepth: 0.035, filterHz: 380, filterSpan: 400, osc: "sawtooth", gain: 0.06, gainSpan: 0.05, pitchSpan: 42 },
  soldier: { base: 30, sub: 15, lfo: 2, lfoDepth: 0.01, filterHz: 200, filterSpan: 150, osc: "sine", gain: 0.0, gainSpan: 0.0, pitchSpan: 0 },
};

/**
 * SFX via Web Audio. The engine loop is a per-vehicle synth voice (tank rumble, jet whine,
 * heli thrum); the heli additionally uses a real sample (public/audio/heli.mp3) when present,
 * pitched + volume-scaled by speed. One-shots (fire/hit/explosion) are synthesized and vary
 * by weapon kind. Must be unlocked from a user gesture (the DEPLOY / mission start).
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.5;

  // Engine (sample-based, preferred).
  private engineBuffer: AudioBuffer | null = null;
  private engineReady = false;
  private engineStarted = false;
  private engineSource: AudioBufferSourceNode | null = null;
  private engineGain: GainNode | null = null;

  // Engine (per-vehicle synth voice).
  private model: EngineModel = "heli";
  private profile: EngineProfile = ENGINES.heli;
  private synthOsc: OscillatorNode | null = null;
  private synthSub: OscillatorNode | null = null;
  private synthFilter: BiquadFilterNode | null = null;
  private synthLfo: OscillatorNode | null = null;

  // Spatialization: reverb wet-send bus + a looping wind ambient bed.
  private reverbSend: GainNode | null = null;
  private ambientSrc: AudioBufferSourceNode | null = null;
  private ambientLfo: OscillatorNode | null = null;

  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(0.6);
      // Reverb bus: procedural impulse response (no asset) fed by a wet send from spatial SFX.
      const conv = this.ctx.createConvolver();
      conv.buffer = this.makeImpulse(1.8, 3);
      conv.connect(this.master);
      const send = this.ctx.createGain();
      send.gain.value = 0.16;
      send.connect(conv);
      this.reverbSend = send;
      void this.loadEngineSample();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  /** Position the audio listener at the camera each frame so world SFX pan + attenuate. */
  setListener(pos: Vec3, forward: Vec3): void {
    const l = this.ctx?.listener;
    if (!l) return;
    if ("positionX" in l && l.positionX) {
      l.positionX.value = pos.x;
      l.positionY.value = pos.y;
      l.positionZ.value = pos.z;
      l.forwardX.value = forward.x;
      l.forwardY.value = forward.y;
      l.forwardZ.value = forward.z;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      const legacy = l as AudioListener & {
        setPosition?: (x: number, y: number, z: number) => void;
        setOrientation?: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
      };
      legacy.setPosition?.(pos.x, pos.y, pos.z);
      legacy.setOrientation?.(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  /** Destination node for a one-shot: a positioned panner (world sound) or master (centered). */
  private out(pos?: Vec3): AudioNode {
    const ctx = this.ctx;
    if (!pos || !ctx || !this.master) return this.master ?? ctx!.destination;
    const p = ctx.createPanner();
    p.panningModel = "equalpower"; // cheap + robust across mobile browsers
    p.distanceModel = "inverse";
    p.refDistance = 10;
    p.maxDistance = 150;
    p.rolloffFactor = 0.9;
    if ("positionX" in p && p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else {
      (p as PannerNode & { setPosition?: (x: number, y: number, z: number) => void }).setPosition?.(pos.x, pos.y, pos.z);
    }
    p.connect(this.master);
    if (this.reverbSend) p.connect(this.reverbSend);
    return p;
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  /** Low, gusting wind bed (filtered looping noise) — atmosphere during a mission. */
  private startAmbient(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || this.ambientSrc) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 480;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(filter).connect(g).connect(this.master);
    src.start();
    lfo.start();
    this.ambientSrc = src;
    this.ambientLfo = lfo;
  }

  private stopAmbient(): void {
    for (const n of [this.ambientSrc, this.ambientLfo]) {
      if (n) {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      }
    }
    this.ambientSrc = null;
    this.ambientLfo = null;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  private async loadEngineSample(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const res = await fetch("audio/heli.mp3");
      if (!res.ok) return; // no sample → keep synth
      const arr = await res.arrayBuffer();
      this.engineBuffer = await ctx.decodeAudioData(arr);
      this.engineReady = true;
      // If the heli synth engine is already running, swap to the real rotor sample seamlessly.
      if (this.engineStarted && this.model === "heli" && !this.engineSource) {
        this.stopSynth();
        this.startSample();
      }
    } catch {
      /* decode/network failed → keep synth */
    }
  }

  // ---- Engine loop ----
  startEngine(model: EngineModel = "heli"): void {
    if (!this.ctx || !this.master || this.engineStarted) return;
    this.model = model;
    this.profile = ENGINES[model];
    this.engineStarted = true;
    // Only the heli uses the recorded rotor sample; everything else is its synth voice.
    if (model === "heli" && this.engineReady && this.engineBuffer) this.startSample();
    else this.startSynth();
    this.startAmbient();
  }

  private startSample(): void {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    const src = ctx.createBufferSource();
    src.buffer = this.engineBuffer;
    src.loop = true;
    src.connect(gain).connect(this.master!);
    src.start();
    this.engineSource = src;
    this.engineGain = gain;
  }

  private startSynth(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const p = this.profile;
    const gain = ctx.createGain();
    gain.gain.value = p.gain;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = p.filterHz;
    const osc = ctx.createOscillator();
    osc.type = p.osc;
    osc.frequency.value = p.base;
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = p.sub;
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain).connect(this.master!);
    osc.start(t);
    sub.start(t);
    // Amplitude tremble (rotor chop / diesel chug) — skip for the smooth jet whine.
    if (p.lfo > 0) {
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = p.lfo;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = p.lfoDepth;
      lfo.connect(lfoGain).connect(gain.gain);
      lfo.start(t);
      this.synthLfo = lfo;
    }
    this.synthOsc = osc;
    this.synthSub = sub;
    this.synthFilter = filter;
    this.engineGain = gain;
  }

  private stopSynth(): void {
    const t = this.ctx?.currentTime ?? 0;
    for (const n of [this.synthOsc, this.synthSub, this.synthLfo]) {
      if (n) {
        try {
          n.stop(t);
        } catch {
          /* already stopped */
        }
      }
    }
    this.synthOsc = null;
    this.synthSub = null;
    this.synthFilter = null;
    this.synthLfo = null;
  }

  stopEngine(): void {
    const t = this.ctx?.currentTime ?? 0;
    if (this.engineSource) {
      try {
        this.engineSource.stop(t);
      } catch {
        /* already stopped */
      }
      this.engineSource = null;
    }
    this.stopSynth();
    this.stopAmbient();
    this.engineGain = null;
    this.engineStarted = false;
  }

  setEngine(speed01: number, alive: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.engineGain) return;
    const t = ctx.currentTime;
    if (this.engineSource) {
      this.engineSource.playbackRate.setTargetAtTime(0.82 + speed01 * 0.55, t, 0.08);
      this.engineGain.gain.setTargetAtTime(alive ? 0.35 + speed01 * 0.25 : 0, t, 0.12);
    } else if (this.synthOsc && this.synthSub && this.synthFilter) {
      const p = this.profile;
      const base = p.base + speed01 * p.pitchSpan;
      this.synthOsc.frequency.setTargetAtTime(base, t, 0.06);
      this.synthSub.frequency.setTargetAtTime(base * 0.5, t, 0.06);
      this.synthFilter.frequency.setTargetAtTime(p.filterHz + speed01 * p.filterSpan, t, 0.08);
      this.engineGain.gain.setTargetAtTime(alive ? p.gain + speed01 * p.gainSpan : 0, t, 0.12);
    }
  }

  // ---- One-shots ----
  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private playNoise(gain: number, dur: number, filterHz: number, type: BiquadFilterType, dest?: AudioNode): void {
    const ctx = this.ctx;
    const out = dest ?? this.master;
    if (!ctx || !out || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterHz;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(filter).connect(g).connect(out);
    src.start(t);
    src.stop(t + dur);
  }

  /** Muzzle report, voiced by weapon kind. `pos` spatializes it (enemy shots pan + attenuate). */
  fire(kind: WeaponSfx = "cannon", pos?: Vec3): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const dest = this.out(pos);
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "square";
    if (kind === "mg") {
      // Fast, thin, high — rapid pew.
      o.frequency.setValueAtTime(320 + Math.random() * 60, t);
      o.frequency.exponentialRampToValueAtTime(150, t + 0.04);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.06);
      this.playNoise(0.09, 0.035, 3200, "highpass", dest);
    } else if (kind === "rifle") {
      // Sharp single crack.
      o.frequency.setValueAtTime(520 + Math.random() * 60, t);
      o.frequency.exponentialRampToValueAtTime(180, t + 0.035);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.06);
      this.playNoise(0.14, 0.03, 2600, "highpass", dest);
    } else {
      // Cannon: deep boom with a low body.
      o.frequency.setValueAtTime(200 + Math.random() * 30, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.26, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.13);
      this.playNoise(0.22, 0.09, 1400, "lowpass", dest);
    }
  }

  hit(pos?: Vec3): void {
    this.playNoise(0.25, 0.08, 1800, "bandpass", this.out(pos));
  }

  explosion(power: number, pos?: Vec3): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const dest = this.out(pos);
    const t = ctx.currentTime;
    this.playNoise(0.5 * power, 0.45, 800, "lowpass", dest);
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * power, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.46);
  }
}
