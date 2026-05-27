export interface InputSnapshot {
  steer: number;
  throttle: number;
  brake: number;
  checkpointResetPressed: boolean;
  fullRestartPressed: boolean;
  pausePressed: boolean;
  confirmPressed: boolean;
  anyGamepad: boolean;
}

const GAMEPAD_RESET_BUTTON = 0;
const GAMEPAD_RESTART_BUTTON = 1;
const GAMEPAD_PAUSE_BUTTON = 9;

export class InputManager {
  private readonly heldKeys = new Set<string>();
  private readonly pressedKeys = new Set<string>();
  private previousGamepadButtons: boolean[] = [];

  constructor() {
    window.addEventListener("keydown", (event) => {
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
      if (this.shouldPreventDefault(key)) event.preventDefault();
    });
  }

  snapshot(): InputSnapshot {
    const gamepad = this.readGamepad();
    const steerKeyboard =
      (this.isHeld("d") || this.isHeld("arrowright") ? 1 : 0) -
      (this.isHeld("a") || this.isHeld("arrowleft") ? 1 : 0);
    const throttleKeyboard = this.isHeld("w") || this.isHeld("arrowup") ? 1 : 0;
    const brakeKeyboard =
      this.isHeld("s") || this.isHeld("arrowdown") || this.isHeld(" ") ? 1 : 0;

    const snapshot: InputSnapshot = {
      steer: Math.abs(gamepad.steer) > 0.08 ? gamepad.steer : steerKeyboard,
      throttle: Math.max(gamepad.throttle, throttleKeyboard ? 1 : 0),
      brake: Math.max(gamepad.brake, brakeKeyboard ? 1 : 0),
      checkpointResetPressed:
        this.wasPressed("r") || gamepad.buttonsPressed[GAMEPAD_RESET_BUTTON] === true,
      fullRestartPressed:
        this.wasPressed("enter") || gamepad.buttonsPressed[GAMEPAD_RESTART_BUTTON] === true,
      pausePressed:
        this.wasPressed("escape") || gamepad.buttonsPressed[GAMEPAD_PAUSE_BUTTON] === true,
      confirmPressed:
        this.wasPressed("enter") || gamepad.buttonsPressed[GAMEPAD_RESET_BUTTON] === true,
      anyGamepad: gamepad.connected
    };

    this.pressedKeys.clear();
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
