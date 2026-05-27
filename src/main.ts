import "./style.css";
import { AudioManager } from "./audio/AudioManager";
import type { InputSnapshot } from "./input/InputManager";
import { InputManager } from "./input/InputManager";
import { Car, type CarSnapshot, type CarTelemetry } from "./game/Car";
import { getAutopilotInput } from "./game/Autopilot";
import {
  loadBestRun,
  loadSettings,
  saveBestRun,
  saveSettings,
  type GameSettings,
  type GhostRecording,
  type GhostSample
} from "./game/Storage";
import { Track } from "./game/Track";
import { SceneRenderer } from "./render/SceneRenderer";
import { UI } from "./ui/UI";

type GameMode = "menu" | "countdown" | "running" | "paused" | "finished" | "settings";

const FIXED_DT = 1 / 120;
const MAX_STEPS = 6;

class ChromeDriftApp {
  private readonly track = new Track();
  private readonly car = new Car();
  private readonly input = new InputManager();
  private readonly audio = new AudioManager();
  private readonly renderer: SceneRenderer;
  private readonly ui: UI;
  private readonly urlParams = new URLSearchParams(window.location.search);
  private readonly autoplay = this.urlParams.has("autoplay");
  private readonly muted = this.urlParams.has("muted");

  private settings: GameSettings = loadSettings();
  private bestRun: GhostRecording | null = loadBestRun();
  private mode: GameMode = "menu";
  private settingsReturnMode: GameMode = "menu";
  private telemetry: CarTelemetry = {
    speedMps: 0,
    speedKmh: 0,
    driftAmount: 0,
    slipAmount: 0,
    onRoad: true,
    barrierHit: false,
    engineLoad: 0,
    steerInput: 0,
    gear: 1,
    rpmNormalized: 0.24,
    shiftPulse: 0
  };

  private lastFrame = performance.now();
  private accumulator = 0;
  private runTimeMs = 0;
  private checkpointMs: number | null = null;
  private passedCheckpoint = false;
  private lastTrackS = 0;
  private countdownRemaining = 0;
  private countdownLastNumber = 0;
  private goFlashRemaining = 0;
  private controlLockRemaining = 0;
  private restoreBuffer: CarSnapshot[] = [];
  private checkpointRestore: CarSnapshot | null = null;
  private lastCheckpointResetAt = 0;
  private currentRecording: GhostSample[] = [];
  private recordAccumulator = 0;

  constructor() {
    const canvas = document.getElementById("game-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Missing game canvas");
    }

    this.renderer = new SceneRenderer(canvas, this.track);
    this.ui = new UI({
      startRun: () => this.startRunFromGesture(),
      resume: () => this.resumeFromPause(),
      restart: () => this.restartFromGesture(),
      openSettings: () => this.openSettings(),
      closeSettings: () => this.closeSettings(),
      mainMenu: () => this.returnToMenu(),
      returnToArcade: () => this.returnToArcade(),
      setVolume: (volume) => this.updateVolume(volume),
      setGhostEnabled: (enabled) => this.updateGhostEnabled(enabled)
    });

    this.audio.setVolume(this.muted ? 0 : this.settings.volume);
    this.ui.syncSettings(this.settings);
    this.configureShowcaseBanner();
    this.car.resetTo(this.track.startPose, 0);
    this.lastTrackS = this.track.startS;
    this.ui.showMenu();
    this.updateHud();
    this.publishDebugState();
    requestAnimationFrame((time) => this.frame(time));
  }

  private startRunFromGesture(): void {
    this.audio.menuClick();
    void this.audio.resume(this.settings);
    this.beginCountdown();
  }

  private restartFromGesture(): void {
    this.audio.menuClick();
    void this.audio.resume(this.settings);
    this.beginCountdown();
  }

  private beginCountdown(): void {
    this.mode = "countdown";
    this.runTimeMs = 0;
    this.checkpointMs = null;
    this.passedCheckpoint = false;
    this.countdownRemaining = 3;
    this.countdownLastNumber = 0;
    this.goFlashRemaining = 0;
    this.controlLockRemaining = 0;
    this.restoreBuffer = [];
    this.checkpointRestore = null;
    this.currentRecording = [];
    this.recordAccumulator = 0;
    this.car.resetTo(this.track.startPose, 0);
    this.lastTrackS = this.track.startS;
    this.ui.showGame();
    this.ui.setCountdown("3");
    this.audio.countdownTick();
  }

  private resumeFromPause(): void {
    this.audio.menuClick();
    void this.audio.resume(this.settings);
    if (this.mode !== "paused") return;
    this.mode = "running";
    this.ui.showGame();
  }

  private returnToMenu(): void {
    this.audio.menuClick();
    this.mode = "menu";
    this.ui.showMenu();
  }

  private openSettings(): void {
    this.audio.menuClick();
    this.settingsReturnMode = this.mode;
    this.mode = "settings";
    this.ui.syncSettings(this.settings);
    this.ui.showSettings();
  }

  private closeSettings(): void {
    this.audio.menuClick();
    if (this.settingsReturnMode === "paused") {
      this.mode = "paused";
      this.ui.showPause();
      return;
    }
    if (this.settingsReturnMode === "running" || this.settingsReturnMode === "countdown") {
      this.mode = this.settingsReturnMode;
      this.ui.showGame();
      return;
    }
    if (this.settingsReturnMode === "finished") {
      this.mode = "finished";
      this.ui.showFinish(this.runTimeMs, false, this.bestRun?.timeMs ?? null);
      return;
    }
    this.mode = "menu";
    this.ui.showMenu();
  }

  private updateVolume(volume: number): void {
    this.settings = { ...this.settings, volume };
    this.audio.setVolume(this.muted ? 0 : volume);
    saveSettings(this.settings);
  }

  private updateGhostEnabled(ghostEnabled: boolean): void {
    this.settings = { ...this.settings, ghostEnabled };
    saveSettings(this.settings);
  }

  private configureShowcaseBanner(): void {
    const params = new URLSearchParams(window.location.search);
    if (params.get("showcase") !== "1") return;
    this.ui.showShowcaseBanner(
      params.get("showcaseTitle") ?? "FUCK YEAH",
      params.get("showcaseCopy") ?? "Clean autopilot candidate"
    );
  }

  private returnToArcade(): void {
    this.audio.menuClick();
    const params = new URLSearchParams(window.location.search);
    const explicitReturn = params.get("return");
    if (explicitReturn) {
      window.location.href = explicitReturn;
      return;
    }
    if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
      window.location.href = "http://localhost:5510/";
      return;
    }
    window.location.href = "https://pazneria.github.io/arcade/";
  }

  private frame(now: number): void {
    const rawDt = Math.min(0.08, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.accumulator += rawDt;

    const rawInput = this.input.snapshot();
    const input = this.autoplay ? this.getAutopilotInput(rawInput) : rawInput;
    if (this.autoplay && this.mode === "menu") {
      this.beginCountdown();
    }
    this.handleModeInput(input);

    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
      this.fixedStep(input, FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps === MAX_STEPS) this.accumulator = 0;

    const ghost = this.getGhostSample();
    this.renderer.update(this.car, this.telemetry, ghost, rawDt);
    this.audio.update(
      this.telemetry,
      this.mode === "running" || this.mode === "countdown" || this.mode === "paused"
    );
    this.updateHud();
    this.publishDebugState();

    requestAnimationFrame((time) => this.frame(time));
  }

  private handleModeInput(input: InputSnapshot): void {
    if (this.mode === "menu") {
      if (input.confirmPressed) this.startRunFromGesture();
      return;
    }

    if (this.mode === "settings") return;

    if (input.fullRestartPressed) {
      this.restartFromGesture();
      return;
    }

    if (this.mode === "finished") {
      if (input.confirmPressed) this.restartFromGesture();
      return;
    }

    if (input.pausePressed) {
      if (this.mode === "paused") this.resumeFromPause();
      else if (this.mode === "running" || this.mode === "countdown") {
        this.audio.menuClick();
        this.mode = "paused";
        this.ui.showPause();
      }
    }
  }

  private fixedStep(input: InputSnapshot, dt: number): void {
    if (this.mode === "menu" || this.mode === "settings" || this.mode === "finished") {
      this.telemetry = this.car.update(input, this.track, dt, false);
      return;
    }

    if (this.mode === "paused") {
      this.telemetry = this.car.update(input, this.track, dt, false);
      return;
    }

    if (this.mode === "countdown") {
      this.updateCountdown(dt);
      this.telemetry = this.car.update(input, this.track, dt, false);
      return;
    }

    if (this.mode !== "running") return;

    if (input.checkpointResetPressed) {
      this.resetToCheckpoint();
    }

    if (this.controlLockRemaining > 0) {
      this.controlLockRemaining = Math.max(0, this.controlLockRemaining - dt);
    }

    this.runTimeMs += dt * 1000;
    this.telemetry = this.car.update(input, this.track, dt, this.controlLockRemaining <= 0);
    if (this.telemetry.barrierHit) this.audio.barrier();
    this.recordRunSample(dt);
    this.recordRestoreSample();
    this.checkTimingVolumes();
  }

  private updateCountdown(dt: number): void {
    this.countdownRemaining -= dt;
    const number = Math.ceil(Math.max(0, this.countdownRemaining));
    if (number > 0 && number !== this.countdownLastNumber) {
      this.countdownLastNumber = number;
      this.ui.setCountdown(String(number));
      if (number !== 3) this.audio.countdownTick();
    }

    if (this.countdownRemaining <= 0) {
      this.mode = "running";
      this.ui.setCountdown("GO");
      this.goFlashRemaining = 0.45;
      this.audio.go();
      this.currentRecording.push(this.toGhostSample(0));
      this.recordRestoreSample();
    }
  }

  private recordRunSample(dt: number): void {
    this.recordAccumulator += dt;
    if (this.recordAccumulator < 0.05) return;
    this.recordAccumulator = 0;
    this.currentRecording.push(this.toGhostSample(this.runTimeMs));
  }

  private recordRestoreSample(): void {
    this.restoreBuffer.push(this.car.snapshot(this.runTimeMs));
    while (this.restoreBuffer.length > 280) this.restoreBuffer.shift();
  }

  private checkTimingVolumes(): void {
    const contact = this.car.getContact(this.track);
    const crossedCheckpoint =
      !this.passedCheckpoint &&
      this.lastTrackS < this.track.checkpointS &&
      contact.s >= this.track.checkpointS &&
      contact.absLateral <= this.track.roadWidth / 2 + 1.1;

    if (crossedCheckpoint) {
      this.passedCheckpoint = true;
      this.checkpointMs = this.runTimeMs;
      this.checkpointRestore = this.findRestoreSnapshot(this.runTimeMs - 500);
      this.audio.checkpoint();
    }

    const crossedFinish =
      this.lastTrackS < this.track.finishS &&
      contact.s >= this.track.finishS &&
      contact.absLateral <= this.track.roadWidth / 2 + 1.4;

    this.lastTrackS = contact.s;
    if (crossedFinish) this.finishRun();
  }

  private resetToCheckpoint(): void {
    const now = performance.now();
    const doublePress = now - this.lastCheckpointResetAt < 360;
    this.lastCheckpointResetAt = now;

    if (doublePress && this.passedCheckpoint) {
      const pose = this.track.getPoseAtS(this.track.checkpointS + 2.5);
      this.car.resetTo(pose, this.runTimeMs);
    } else if (this.checkpointRestore) {
      this.car.applySnapshot(cloneSnapshot(this.checkpointRestore));
    } else {
      this.car.resetTo(this.track.startPose, this.runTimeMs);
      this.passedCheckpoint = false;
      this.checkpointMs = null;
    }

    this.controlLockRemaining = 0.18;
    this.lastTrackS = this.car.getContact(this.track).s;
    this.audio.checkpoint();
  }

  private findRestoreSnapshot(targetMs: number): CarSnapshot {
    let best = this.restoreBuffer[0] ?? this.car.snapshot(this.runTimeMs);
    for (const sample of this.restoreBuffer) {
      if (sample.timeMs <= targetMs) best = sample;
      else break;
    }
    return cloneSnapshot(best);
  }

  private finishRun(): void {
    if (this.mode !== "running") return;
    this.mode = "finished";
    this.currentRecording.push(this.toGhostSample(this.runTimeMs));
    const previousBest = this.bestRun?.timeMs ?? null;
    const isBest = previousBest == null || this.runTimeMs < previousBest;

    if (isBest) {
      this.bestRun = {
        trackId: this.track.id,
        timeMs: this.runTimeMs,
        checkpointMs: this.checkpointMs,
        samples: this.currentRecording
      };
      saveBestRun(this.bestRun);
    }

    this.audio.finish();
    this.ui.showFinish(this.runTimeMs, isBest, this.bestRun?.timeMs ?? null);
  }

  private getGhostSample(): GhostSample | null {
    if (!this.settings.ghostEnabled || !this.bestRun || this.bestRun.samples.length < 2) {
      return null;
    }
    if (this.mode !== "running" && this.mode !== "countdown") return null;
    const time = this.mode === "countdown" ? 0 : this.runTimeMs;
    const samples = this.bestRun.samples;
    if (time <= samples[0].timeMs) return samples[0];
    if (time >= samples[samples.length - 1].timeMs) return samples[samples.length - 1];

    let low = 0;
    let high = samples.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (samples[mid].timeMs < time) low = mid + 1;
      else high = mid;
    }

    const after = samples[low];
    const before = samples[Math.max(0, low - 1)];
    const span = Math.max(1, after.timeMs - before.timeMs);
    const t = (time - before.timeMs) / span;
    return {
      timeMs: time,
      x: before.x + (after.x - before.x) * t,
      y: before.y + (after.y - before.y) * t,
      z: before.z + (after.z - before.z) * t,
      yaw: before.yaw + (after.yaw - before.yaw) * t
    };
  }

  private toGhostSample(timeMs: number): GhostSample {
    return {
      timeMs,
      x: this.car.position.x,
      y: this.car.position.y,
      z: this.car.position.z,
      yaw: this.car.yaw
    };
  }

  private updateHud(): void {
    if (this.goFlashRemaining > 0) {
      this.goFlashRemaining = Math.max(0, this.goFlashRemaining - 1 / 60);
      if (this.goFlashRemaining <= 0) this.ui.setCountdown(null);
    }

    this.ui.updateHud({
      currentMs: this.runTimeMs,
      bestMs: this.bestRun?.timeMs ?? null,
      splitMs: this.checkpointMs,
      speedKmh: this.telemetry.speedKmh,
      gear: this.telemetry.gear,
      shiftPulse: this.telemetry.shiftPulse,
      hudVisible: this.mode !== "menu" && this.mode !== "settings"
    });
  }

  private getAutopilotInput(base: InputSnapshot): InputSnapshot {
    if (this.mode !== "running" && this.mode !== "countdown") return base;

    return getAutopilotInput(base, this.car, this.track, this.telemetry);
  }

  private publishDebugState(): void {
    const contact = this.car.getContact(this.track);
    const debugState = {
      mode: this.mode,
      runTimeMs: this.runTimeMs,
      checkpointMs: this.checkpointMs,
      bestTimeMs: this.bestRun?.timeMs ?? null,
      trackS: contact.s,
      checkpointS: this.track.checkpointS,
      finishS: this.track.finishS,
      speedKmh: this.telemetry.speedKmh,
      gear: this.telemetry.gear,
      rpmNormalized: this.telemetry.rpmNormalized,
      shiftPulse: this.telemetry.shiftPulse,
      x: this.car.position.x,
      y: this.car.position.y,
      z: this.car.position.z,
      yaw: this.car.yaw,
      passedCheckpoint: this.passedCheckpoint,
      autoplay: this.autoplay
    };
    window.__chromeDriftDebug = debugState;
    document.getElementById("app")?.setAttribute("data-debug-state", JSON.stringify(debugState));
  }
}

function cloneSnapshot(snapshot: CarSnapshot): CarSnapshot {
  return {
    position: snapshot.position.clone(),
    velocity: snapshot.velocity.clone(),
    yaw: snapshot.yaw,
    timeMs: snapshot.timeMs,
    gear: snapshot.gear,
    rpmNormalized: snapshot.rpmNormalized
  };
}

new ChromeDriftApp();

declare global {
  interface Window {
    __chromeDriftDebug?: {
      mode: GameMode;
      runTimeMs: number;
      checkpointMs: number | null;
      bestTimeMs: number | null;
      trackS: number;
      checkpointS: number;
      finishS: number;
      speedKmh: number;
      gear: number;
      rpmNormalized: number;
      shiftPulse: number;
      x: number;
      y: number;
      z: number;
      yaw: number;
      passedCheckpoint: boolean;
      autoplay: boolean;
    };
  }
}
