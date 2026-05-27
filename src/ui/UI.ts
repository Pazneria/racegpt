import { clamp, formatTime } from "../core/math";
import type { GameSettings } from "../game/Storage";

export interface HudState {
  currentMs: number;
  bestMs: number | null;
  splitMs: number | null;
  speedKmh: number;
  gear: number;
  shiftPulse: number;
  hudVisible: boolean;
  inputOverlayVisible: boolean;
  inputSource: string;
  inputSteer: number;
  inputThrottle: number;
  inputBrake: number;
}

export interface UIActions {
  startRun: () => void;
  resume: () => void;
  restart: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  mainMenu: () => void;
  returnToArcade: () => void;
  setVolume: (volume: number) => void;
  setCodexGhostEnabled: (enabled: boolean) => void;
  setInputOverlayEnabled: (enabled: boolean) => void;
  setTrack: (trackId: string) => void;
}

export interface TrackMenuItem {
  id: string;
  label: string;
  name: string;
  menuDescription: string;
}

type ScreenId = "menu" | "pause" | "finish" | "settings" | "none";

export class UI {
  private readonly screens: Record<Exclude<ScreenId, "none">, HTMLElement>;
  private readonly hud: HTMLElement;
  private readonly currentTime: HTMLElement;
  private readonly bestTime: HTMLElement;
  private readonly splitTime: HTMLElement;
  private readonly speedValue: HTMLElement;
  private readonly speedNeedle: HTMLElement;
  private readonly gearValue: HTMLElement;
  private readonly speedometerDial: HTMLElement;
  private readonly inputOverlay: HTMLElement;
  private readonly inputSource: HTMLElement;
  private readonly inputSteerFill: HTMLElement;
  private readonly inputSteerDot: HTMLElement;
  private readonly inputThrottleFill: HTMLElement;
  private readonly inputBrakeFill: HTMLElement;
  private readonly countdown: HTMLElement;
  private readonly pauseTrackName: HTMLElement;
  private readonly showcaseBanner: HTMLElement;
  private readonly showcaseTitle: HTMLElement;
  private readonly showcaseCopy: HTMLElement;
  private readonly finishTime: HTMLElement;
  private readonly finishCopy: HTMLElement;
  private readonly volumeSlider: HTMLInputElement;
  private readonly codexGhostToggle: HTMLInputElement;
  private readonly inputOverlayToggle: HTMLInputElement;
  private readonly trackButtons: HTMLButtonElement[];

  constructor(private readonly actions: UIActions) {
    this.screens = {
      menu: getElement("menu-screen"),
      pause: getElement("pause-screen"),
      finish: getElement("finish-screen"),
      settings: getElement("settings-screen")
    };
    this.hud = getElement("hud");
    this.currentTime = getElement("current-time");
    this.bestTime = getElement("best-time");
    this.splitTime = getElement("split-time");
    this.speedValue = getElement("speed-value");
    this.speedNeedle = getElement("speed-needle");
    this.gearValue = getElement("gear-value");
    this.speedometerDial = getElement("speedometer-dial");
    this.inputOverlay = getElement("input-overlay");
    this.inputSource = getElement("input-source");
    this.inputSteerFill = getElement("input-steer-fill");
    this.inputSteerDot = getElement("input-steer-dot");
    this.inputThrottleFill = getElement("input-throttle-fill");
    this.inputBrakeFill = getElement("input-brake-fill");
    this.countdown = getElement("countdown");
    this.pauseTrackName = getElement("pause-track-name");
    this.showcaseBanner = getElement("showcase-banner");
    this.showcaseTitle = getElement("showcase-title");
    this.showcaseCopy = getElement("showcase-copy");
    this.finishTime = getElement("finish-time");
    this.finishCopy = getElement("finish-copy");
    this.volumeSlider = getInput("volume-slider");
    this.codexGhostToggle = getInput("codex-ghost-toggle");
    this.inputOverlayToggle = getInput("input-overlay-toggle");
    this.trackButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".track-option"));

    this.bindButtons();
  }

  syncSettings(settings: GameSettings): void {
    this.volumeSlider.value = String(settings.volume);
    this.codexGhostToggle.checked = settings.codexGhostEnabled;
    this.inputOverlayToggle.checked = settings.inputOverlayEnabled;
  }

  syncTracks(currentTrackId: string, tracks: readonly TrackMenuItem[]): void {
    const selected = tracks.find((track) => track.id === currentTrackId) ?? tracks[0];
    this.pauseTrackName.textContent = selected.name;
    for (const button of this.trackButtons) {
      const track = tracks.find((candidate) => candidate.id === button.dataset.trackId);
      const selectedButton = button.dataset.trackId === selected.id;
      button.classList.toggle("track-option--selected", selectedButton);
      button.setAttribute("aria-pressed", String(selectedButton));
      if (!track) continue;
      const label = button.querySelector(".track-card__label");
      const name = button.querySelector("strong");
      const description = button.querySelector("span:last-child");
      if (label) label.textContent = track.label;
      if (name) name.textContent = track.name;
      if (description) description.textContent = track.menuDescription;
    }
  }

  show(screen: ScreenId): void {
    for (const [name, element] of Object.entries(this.screens)) {
      element.classList.toggle("screen--visible", name === screen);
    }
  }

  showMenu(): void {
    this.show("menu");
    this.setHudVisible(false);
    this.setCountdown(null);
  }

  showGame(): void {
    this.show("none");
    this.setHudVisible(true);
  }

  showPause(): void {
    this.show("pause");
    this.setHudVisible(true);
  }

  showSettings(): void {
    this.show("settings");
  }

  showFinish(timeMs: number, isBest: boolean, bestMs: number | null): void {
    this.finishTime.textContent = formatTime(timeMs);
    this.finishCopy.textContent = isBest
      ? "New local best saved."
      : `Run complete. Best remains ${formatTime(bestMs)}.`;
    this.show("finish");
    this.setHudVisible(true);
    this.setCountdown(null);
  }

  updateHud(state: HudState): void {
    this.currentTime.textContent = formatTime(state.currentMs);
    this.bestTime.textContent = formatTime(state.bestMs);
    this.splitTime.textContent = formatTime(state.splitMs);
    const speed = Math.round(state.speedKmh);
    const angle = -132 + Math.min(1, speed / 500) * 264;
    this.speedValue.textContent = String(speed);
    this.gearValue.textContent = String(state.gear);
    this.speedNeedle.style.transform = `translate(-50%, -100%) rotate(${angle}deg)`;
    this.speedometerDial.classList.toggle("speedometer__dial--shift", state.shiftPulse > 0.15);
    this.inputOverlay.classList.toggle(
      "input-overlay--visible",
      state.hudVisible && state.inputOverlayVisible
    );
    this.inputSource.textContent = state.inputSource;
    const steer = clamp(state.inputSteer, -1, 1);
    const visualSteer = -steer;
    const steerFillFromCenter = visualSteer >= 0 ? "50%" : "auto";
    const steerFillToCenter = visualSteer >= 0 ? "auto" : "50%";
    this.inputSteerFill.style.left = steerFillFromCenter;
    this.inputSteerFill.style.right = steerFillToCenter;
    this.inputSteerFill.style.transformOrigin = visualSteer >= 0 ? "left center" : "right center";
    this.inputSteerFill.style.transform = `scaleX(${Math.abs(visualSteer)})`;
    this.inputSteerDot.style.transform = `translate(${visualSteer * 60}px, -50%)`;
    this.inputThrottleFill.style.transform = `scaleY(${clamp(state.inputThrottle, 0, 1)})`;
    this.inputBrakeFill.style.transform = `scaleY(${clamp(state.inputBrake, 0, 1)})`;
    this.setHudVisible(state.hudVisible);
  }

  setCountdown(value: string | null): void {
    if (!value) {
      this.countdown.textContent = "";
      this.countdown.classList.remove("countdown--visible");
      this.countdown.setAttribute("aria-hidden", "true");
      return;
    }
    this.countdown.textContent = value;
    this.countdown.classList.add("countdown--visible");
    this.countdown.setAttribute("aria-hidden", "false");
  }

  showShowcaseBanner(title: string, copy: string, durationMs = 4200): void {
    this.showcaseTitle.textContent = title;
    this.showcaseCopy.textContent = copy;
    this.showcaseBanner.classList.add("showcase-banner--visible");
    this.showcaseBanner.setAttribute("aria-hidden", "false");
    window.setTimeout(() => {
      this.showcaseBanner.classList.remove("showcase-banner--visible");
      this.showcaseBanner.setAttribute("aria-hidden", "true");
    }, durationMs);
  }

  private setHudVisible(visible: boolean): void {
    this.hud.classList.toggle("hud--visible", visible);
  }

  private bindButtons(): void {
    bind("start-button", this.actions.startRun);
    bind("settings-button", this.actions.openSettings);
    bind("return-button", this.actions.returnToArcade);
    bind("resume-button", this.actions.resume);
    bind("pause-restart-button", this.actions.restart);
    bind("pause-settings-button", this.actions.openSettings);
    bind("pause-return-button", this.actions.returnToArcade);
    bind("finish-restart-button", this.actions.restart);
    bind("finish-menu-button", this.actions.mainMenu);
    bind("settings-back-button", this.actions.closeSettings);

    this.volumeSlider.addEventListener("input", () => {
      this.actions.setVolume(Number(this.volumeSlider.value));
    });
    this.codexGhostToggle.addEventListener("change", () => {
      this.actions.setCodexGhostEnabled(this.codexGhostToggle.checked);
    });
    this.inputOverlayToggle.addEventListener("change", () => {
      this.actions.setInputOverlayEnabled(this.inputOverlayToggle.checked);
    });
    for (const button of this.trackButtons) {
      button.addEventListener("click", () => {
        const trackId = button.dataset.trackId;
        if (trackId) this.actions.setTrack(trackId);
      });
    }
  }
}

function getElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

function getInput(id: string): HTMLInputElement {
  const element = getElement(id);
  if (!(element instanceof HTMLInputElement)) throw new Error(`#${id} is not an input`);
  return element;
}

function bind(id: string, callback: () => void): void {
  getElement(id).addEventListener("click", () => callback());
}
