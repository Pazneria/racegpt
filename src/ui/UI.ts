import { formatTime } from "../core/math";
import type { GameSettings } from "../game/Storage";

export interface HudState {
  currentMs: number;
  bestMs: number | null;
  splitMs: number | null;
  speedKmh: number;
  gear: number;
  shiftPulse: number;
  hudVisible: boolean;
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
  setGhostEnabled: (enabled: boolean) => void;
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
  private readonly countdown: HTMLElement;
  private readonly showcaseBanner: HTMLElement;
  private readonly showcaseTitle: HTMLElement;
  private readonly showcaseCopy: HTMLElement;
  private readonly finishTime: HTMLElement;
  private readonly finishCopy: HTMLElement;
  private readonly volumeSlider: HTMLInputElement;
  private readonly ghostToggle: HTMLInputElement;

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
    this.countdown = getElement("countdown");
    this.showcaseBanner = getElement("showcase-banner");
    this.showcaseTitle = getElement("showcase-title");
    this.showcaseCopy = getElement("showcase-copy");
    this.finishTime = getElement("finish-time");
    this.finishCopy = getElement("finish-copy");
    this.volumeSlider = getInput("volume-slider");
    this.ghostToggle = getInput("ghost-toggle");

    this.bindButtons();
  }

  syncSettings(settings: GameSettings): void {
    this.volumeSlider.value = String(settings.volume);
    this.ghostToggle.checked = settings.ghostEnabled;
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
      ? "New local best saved. Your ghost is ready for the next run."
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
    this.ghostToggle.addEventListener("change", () => {
      this.actions.setGhostEnabled(this.ghostToggle.checked);
    });
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
