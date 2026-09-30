export interface InputSnapshot {
  steer: number;
  throttle: number;
  brake: number;
  checkpointResetPressed: boolean;
  fullRestartPressed: boolean;
  pausePressed: boolean;
  inputOverlayPressed: boolean;
  confirmPressed: boolean;
  anyGamepad: boolean;
  anyTouch?: boolean;
}

type DriveControl = "left" | "right" | "gas" | "brake";
type DriveAction = "reset" | "pause";

const GAMEPAD_RESET_BUTTON = 0;
const GAMEPAD_RESTART_BUTTON = 1;
const GAMEPAD_PAUSE_BUTTON = 9;

export class InputManager {
  private readonly heldKeys = new Set<string>();
  private readonly pressedKeys = new Set<string>();
  private previousGamepadButtons: boolean[] = [];
  private readonly touchPointers = new Map<number, { action: DriveControl; button: HTMLElement }>();
  private readonly touchPressed = new Set<DriveAction>();

  constructor() {
    const clear = () => this.clearHeldInput();
    window.addEventListener("blur", clear);
    window.addEventListener("resize", clear);
    window.addEventListener("orientationchange", clear);
    window.addEventListener("pagehide", clear);
    document.addEventListener("visibilitychange", clear);
    document.querySelectorAll<HTMLElement>("[data-drive]").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        if (button.closest("[inert]") || (event.pointerType === "mouse" && event.button !== 0)) return;
        event.preventDefault();
        const action = button.dataset.drive as DriveControl;
        button.setPointerCapture(event.pointerId);
        this.touchPointers.set(event.pointerId, { action, button });
        button.classList.add("drive-held");
      });
      const release = (event: PointerEvent) => {
        this.touchPointers.delete(event.pointerId);
        if (![...this.touchPointers.values()].some((held) => held.button === button)) {
          button.classList.remove("drive-held");
        }
      };
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
    });
    document.querySelectorAll<HTMLElement>("[data-drive-action]").forEach((button) => {
      const activate = () => {
        if (button.closest("[inert]")) return;
        this.touchPressed.add(button.dataset.driveAction as DriveAction);
      };
      // Secondary fingers do not synthesize clicks. React to the pointer itself.
      button.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        activate();
      });
      button.addEventListener("click", (event) => {
        // Keyboard and assistive activation have no pointer press; avoid double taps.
        if (event.detail === 0) activate();
      });
    });
    window.addEventListener("keydown", (event) => {
      // Focused controls own their keys (for example Enter activates Return to Arcade).
      if (this.isUiTarget(event.target) || event.repeat) return;
      const key = this.normalizeKey(event.key);
      if (!this.heldKeys.has(key)) {
        this.pressedKeys.add(key);
      }
      this.heldKeys.add(key);
      if (this.shouldPreventDefault(key)) event.preventDefault();
    });

    window.addEventListener("keyup", (event) => {
      const key = this.normalizeKey(event.key);
      this.heldKeys.delete(key);
      if (!this.isUiTarget(event.target) && this.shouldPreventDefault(key)) event.preventDefault();
    });
  }

  clearHeldInput(): void {
    this.heldKeys.clear();
    this.pressedKeys.clear();
    const heldPointers = [...this.touchPointers];
    this.touchPointers.clear();
    this.touchPressed.clear();
    for (const [pointerId, { button }] of heldPointers) {
      if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
    }
    document.querySelectorAll(".drive-held").forEach((button) => button.classList.remove("drive-held"));
  }

  private isUiTarget(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest(
      'button, input, select, textarea, a[href], [contenteditable]:not([contenteditable="false"])'
    );
  }

  snapshot(): InputSnapshot {
    const gamepad = this.readGamepad();
    const touch = new Set([...this.touchPointers.values()].map((held) => held.action));
    const steerTouch = (touch.has("left") ? 1 : 0) - (touch.has("right") ? 1 : 0);
    const steerKeyboard =
      (this.isHeld("a") || this.isHeld("arrowleft") ? 1 : 0) -
      (this.isHeld("d") || this.isHeld("arrowright") ? 1 : 0);
    const throttleKeyboard = this.isHeld("w") || this.isHeld("arrowup") ? 1 : 0;
    const brakeKeyboard =
      this.isHeld("s") || this.isHeld("arrowdown") || this.isHeld(" ") ? 1 : 0;

    const snapshot: InputSnapshot = {
      steer: Math.abs(gamepad.steer) > 0.08
        ? gamepad.steer
        : touch.has("left") || touch.has("right") ? steerTouch : steerKeyboard,
      throttle: Math.max(gamepad.throttle, throttleKeyboard ? 1 : 0, touch.has("gas") ? 1 : 0),
      brake: Math.max(gamepad.brake, brakeKeyboard ? 1 : 0, touch.has("brake") ? 1 : 0),
      checkpointResetPressed:
        this.touchPressed.has("reset") || this.wasPressed("r") || gamepad.buttonsPressed[GAMEPAD_RESET_BUTTON] === true,
      fullRestartPressed:
        this.wasPressed("enter") || gamepad.buttonsPressed[GAMEPAD_RESTART_BUTTON] === true,
      pausePressed:
        this.touchPressed.has("pause") || this.wasPressed("escape") || gamepad.buttonsPressed[GAMEPAD_PAUSE_BUTTON] === true,
      inputOverlayPressed: this.wasPressed("i"),
      confirmPressed:
        this.wasPressed("enter") || gamepad.buttonsPressed[GAMEPAD_RESET_BUTTON] === true,
      anyGamepad: gamepad.connected,
      anyTouch: touch.size > 0 || this.touchPressed.size > 0
    };

    this.pressedKeys.clear();
    this.touchPressed.clear();
    return snapshot;
  }

  private readGamepad(): {
    connected: boolean;
    steer: number;
    throttle: number;
    brake: number;
    buttonsPressed: boolean[];
  } {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((candidate) => candidate && candidate.connected) ?? null;
    if (!pad) {
      this.previousGamepadButtons = [];
      return { connected: false, steer: 0, throttle: 0, brake: 0, buttonsPressed: [] };
    }

    const buttons = pad.buttons.map((button) => button.pressed);
    const buttonsPressed = buttons.map(
      (pressed, index) => pressed && this.previousGamepadButtons[index] !== true
    );
    this.previousGamepadButtons = buttons;

    return {
      connected: true,
      steer: Math.abs(pad.axes[0] ?? 0) < 0.08 ? 0 : -(pad.axes[0] ?? 0),
      throttle: pad.buttons[7]?.value ?? 0,
      brake: pad.buttons[6]?.value ?? 0,
      buttonsPressed
    };
  }

  private isHeld(key: string): boolean {
    return this.heldKeys.has(key);
  }

  private wasPressed(key: string): boolean {
    return this.pressedKeys.has(key);
  }

  private normalizeKey(key: string): string {
    return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
  }

  private shouldPreventDefault(key: string): boolean {
    return [
      " ",
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
      "enter",
      "escape"
    ].includes(key);
  }
}
