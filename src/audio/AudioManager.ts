import type { CarTelemetry } from "../game/Car";
import type { GameSettings } from "../game/Storage";

export class AudioManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private tireGain: GainNode | null = null;
  private volume = 0.65;
  private lastGear = 1;

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.context) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.03);
    }
  }

  async resume(settings: GameSettings): Promise<void> {
    this.setVolume(settings.volume);
    this.ensureGraph();
    if (this.context?.state === "suspended") {
      await this.context.resume();
    }
  }

  update(telemetry: CarTelemetry, active: boolean): void {
    if (!this.context || !this.engineOsc || !this.engineGain || !this.tireGain) return;
    const now = this.context.currentTime;
    if (active && telemetry.gear !== this.lastGear) {
      this.shiftCue(telemetry.gear);
    }
    this.lastGear = telemetry.gear;

    const rpm = Math.max(0, Math.min(1.08, telemetry.rpmNormalized));
    const shiftDip = telemetry.shiftPulse * 16;
    const frequency = 48 + rpm * 178 + telemetry.engineLoad * 24 - shiftDip;
    const engineLevel = active ? 0.048 + telemetry.engineLoad * 0.072 : 0.022;
    const tireLevel = active ? Math.max(telemetry.slipAmount, telemetry.driftAmount * 0.75) * 0.07 : 0;

    this.engineOsc.frequency.setTargetAtTime(frequency, now, 0.035);
    this.engineGain.gain.setTargetAtTime(engineLevel, now, 0.045);
    this.tireGain.gain.setTargetAtTime(tireLevel, now, 0.04);
  }

  menuClick(): void {
    this.tone(360, 0.035, 0.035, "triangle");
  }

  countdownTick(): void {
    this.tone(620, 0.09, 0.075, "sine");
  }

  go(): void {
    this.tone(880, 0.15, 0.09, "sine");
  }

  checkpoint(): void {
    this.tone(640, 0.075, 0.035, "triangle");
    window.setTimeout(() => this.tone(820, 0.055, 0.024, "triangle"), 64);
  }

  finish(): void {
    this.tone(520, 0.09, 0.08, "sine");
    window.setTimeout(() => this.tone(760, 0.09, 0.075, "sine"), 95);
    window.setTimeout(() => this.tone(1040, 0.16, 0.075, "sine"), 190);
  }

  barrier(): void {
    this.tone(120, 0.045, 0.08, "sawtooth");
  }

  private shiftCue(gear: number): void {
    this.tone(170 + gear * 18, 0.035, 0.024, "triangle");
  }

  private ensureGraph(): void {
    if (this.context) return;

    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.volume;
    this.masterGain.connect(this.context.destination);

    this.engineOsc = this.context.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineGain = this.context.createGain();
    this.engineGain.gain.value = 0;
    const engineFilter = this.context.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 360;
    this.engineOsc.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);
    this.engineOsc.start();

    const noiseBuffer = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    const noise = this.context.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const tireFilter = this.context.createBiquadFilter();
    tireFilter.type = "bandpass";
    tireFilter.frequency.value = 1650;
    tireFilter.Q.value = 1.9;
    this.tireGain = this.context.createGain();
    this.tireGain.gain.value = 0;
    noise.connect(tireFilter);
    tireFilter.connect(this.tireGain);
    this.tireGain.connect(this.masterGain);
    noise.start();
  }

  private tone(
    frequency: number,
    duration: number,
    level: number,
    type: OscillatorType = "sine"
  ): void {
    this.ensureGraph();
    if (!this.context || !this.masterGain) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
}
