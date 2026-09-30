import assert from "node:assert/strict";
import { InputManager } from "../src/input/InputManager";
import { resolveArcadeReturnUrl } from "../src/ui/navigation";

// Minimal DOM/event fixtures: browser activation is checked separately in Chrome.
class TestElement {
  constructor(private readonly control = false, private readonly parent?: TestElement) {}
  closest(): TestElement | null { return this.control ? this : this.parent?.closest() ?? null; }
}
class TestButton extends TestElement {
  readonly dataset: Record<string, string>;
  readonly listeners = new Map<string, (event: any) => void>();
  readonly captured = new Set<number>();
  readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name)
  };
  inert = false;
  constructor(kind: "drive" | "driveAction", action: string) {
    super(true);
    this.dataset = { [kind]: action };
  }
  override closest(selector = ""): TestElement | null {
    return selector === "[inert]" ? (this.inert ? this : null) : super.closest();
  }
  addEventListener(name: string, listener: (event: any) => void): void { this.listeners.set(name, listener); }
  setPointerCapture(id: number): void { this.captured.add(id); }
  hasPointerCapture(id: number): boolean { return this.captured.has(id); }
  releasePointerCapture(id: number): void {
    this.captured.delete(id);
    this.listeners.get("lostpointercapture")?.({ pointerId: id });
  }
}
const drive = Object.fromEntries(["left", "right", "gas", "brake"].map((action) => [action, new TestButton("drive", action)]));
const actions = Object.fromEntries(["pause", "reset"].map((action) => [action, new TestButton("driveAction", action)]));
const listeners = new Map<string, (event: any) => void>();
const documentListeners = new Map<string, (event?: any) => void>();
let gamepads: any[] = [];
Object.assign(globalThis, {
  Element: TestElement,
  window: { addEventListener: (name: string, listener: (event: any) => void) => listeners.set(name, listener) },
  document: {
    addEventListener: (name: string, listener: (event: any) => void) => documentListeners.set(name, listener),
    querySelectorAll: (selector: string) => selector === "[data-drive]" ? Object.values(drive)
      : selector === "[data-drive-action]" ? Object.values(actions)
      : Object.values(drive).filter((button) => button.classes.has("drive-held"))
  }
});
Object.defineProperty(globalThis, "navigator", {configurable: true, value: {getGamepads: () => gamepads}});
const input = new InputManager();
const body = new TestElement();
const control = new TestElement(true);
const controlChild = new TestElement(false, control);
function key(type: string, value: string, target = body): boolean {
  let prevented = false;
  listeners.get(type)!({key: value, target, preventDefault: () => { prevented = true; }} as unknown as KeyboardEvent);
  return prevented;
}

for (const target of [control, controlChild]) {
  for (const value of ["Enter", " ", "ArrowRight", "w", "r", "i"]) {
    assert.equal(key("keydown", value, target), false, "Focused controls retain native keyboard behavior");
    const state = input.snapshot();
    assert.equal(state.confirmPressed, false);
    assert.equal(state.fullRestartPressed, false);
    assert.equal(state.throttle, 0);
    assert.equal(state.brake, 0);
    assert.equal(state.steer, 0);
    assert.equal(state.checkpointResetPressed, false);
    assert.equal(state.inputOverlayPressed, false);
    assert.equal(key("keyup", value, target), false);
  }
}
assert.equal(key("keydown", "Enter"), true);
assert.equal(input.snapshot().confirmPressed, true, "Enter on the game still starts/restarts a run");
assert.equal(input.snapshot().confirmPressed, false, "Confirmation remains an edge, not a held input");
key("keyup", "Enter");
assert.equal(key("keydown", "Escape"), true);
assert.equal(input.snapshot().pausePressed, true);
key("keyup", "Escape");
key("keydown", "w");
assert.equal(input.snapshot().throttle, 1);
key("keyup", "w", control);
assert.equal(input.snapshot().throttle, 0, "Key release over a control still clears held gameplay input");
assert.equal(key("keydown", " "), true);
assert.equal(input.snapshot().brake, 1);
key("keyup", " ");
assert.equal(input.snapshot().brake, 0);

function pointer(action: string, type: string, pointerId: number, pointerType = "touch", button = 0): boolean {
  let prevented = false;
  drive[action].listeners.get(type)!({ pointerId, pointerType, button, preventDefault: () => { prevented = true; } });
  return prevented;
}
function assertReleased(): void {
  const state = input.snapshot();
  assert.equal(state.steer, 0);
  assert.equal(state.throttle, 0);
  assert.equal(state.brake, 0);
  assert.equal(state.pausePressed, false);
  assert.equal(state.checkpointResetPressed, false);
  for (const button of Object.values(drive)) {
    assert.equal(button.classes.has("drive-held"), false);
    assert.equal(button.captured.size, 0);
  }
}

assert.equal(pointer("gas", "pointerdown", 1), true);
pointer("left", "pointerdown", 2);
assert.equal(input.snapshot().throttle, 1);
assert.equal(input.snapshot().steer, 1, "Two fingers steer while accelerating");
assert.equal(input.snapshot().anyTouch, true);
pointer("brake", "pointerdown", 3);
let state = input.snapshot();
assert.equal(state.throttle, 1);
assert.equal(state.brake, 1, "Steering, gas, and brake coexist");
pointer("right", "pointerdown", 4);
assert.equal(input.snapshot().steer, 0, "Opposite touch steering cancels");
pointer("left", "pointercancel", 2);
drive.left.releasePointerCapture(2);
assert.equal(input.snapshot().steer, -1, "Cancellation releases only that finger");
drive.right.releasePointerCapture(4);
assert.equal(input.snapshot().steer, 0, "Lost pointer capture releases steering");
pointer("gas", "pointerdown", 5);
pointer("gas", "pointerup", 1);
drive.gas.releasePointerCapture(1);
assert.equal(input.snapshot().throttle, 1, "A second finger on Gas remains active");
assert.equal(drive.gas.classes.has("drive-held"), true);
pointer("gas", "pointerup", 5);
drive.gas.releasePointerCapture(5);
assert.equal(input.snapshot().throttle, 0);
assert.equal(drive.gas.classes.has("drive-held"), false);
input.clearHeldInput();
assertReleased();

for (const action of ["pause", "reset"]) {
  actions[action].listeners.get("pointerdown")!({button: 0, preventDefault() {}});
  state = input.snapshot();
  assert.equal(action === "pause" ? state.pausePressed : state.checkpointResetPressed, true);
  state = input.snapshot();
  assert.equal(state.pausePressed, false, "Touch actions fire once per tap");
  assert.equal(state.checkpointResetPressed, false);
  actions[action].listeners.get("click")!({detail: 1});
  state = input.snapshot();
  assert.equal(state.pausePressed, false, "A synthesized click must not fire an action twice");
  assert.equal(state.checkpointResetPressed, false);
  actions[action].listeners.get("click")!({detail: 0});
  state = input.snapshot();
  assert.equal(action === "pause" ? state.pausePressed : state.checkpointResetPressed, true, "Keyboard activation still works");
}

for (const event of ["blur", "resize", "orientationchange", "pagehide", "visibilitychange", "menu transition"]) {
  pointer("gas", "pointerdown", 10);
  pointer("left", "pointerdown", 11);
  key("keydown", " ");
  actions.pause.listeners.get("click")!({detail: 0});
  if (event === "visibilitychange") documentListeners.get(event)!();
  else if (event === "menu transition") input.clearHeldInput();
  else listeners.get(event)!({});
  assertReleased();
}
listeners.get("keydown")!({key: "w", target: body, repeat: true, preventDefault() {}});
assert.equal(input.snapshot().throttle, 0, "Repeats after focus loss do not revive a cleared key");
assert.equal(pointer("gas", "pointerdown", 20, "mouse", 2), false);
assert.equal(input.snapshot().throttle, 0, "Right-click does not drive");
drive.gas.inert = true;
assert.equal(pointer("gas", "pointerdown", 21), false);
assert.equal(input.snapshot().throttle, 0, "Hidden driving controls do not accept pointers");
drive.gas.inert = false;
actions.pause.inert = true;
actions.pause.listeners.get("click")!({detail: 0});
assert.equal(input.snapshot().pausePressed, false);
actions.pause.inert = false;

key("keydown", "a");
pointer("right", "pointerdown", 30);
assert.equal(input.snapshot().steer, -1, "Touch steering takes priority over keyboard steering");
key("keydown", "w");
const buttons = Array.from({length: 10}, () => ({ pressed: false, value: 0 }));
buttons[7].value = 0.4;
buttons[6].value = 0.6;
buttons[0].pressed = true;
gamepads = [{connected: true, axes: [0.5], buttons}];
state = input.snapshot();
assert.equal(state.steer, -0.5, "Gamepad steering retains priority");
assert.equal(state.throttle, 1, "Keyboard throttle can coexist with a gamepad");
assert.equal(state.brake, 0.6);
assert.equal(state.anyGamepad, true);
assert.equal(state.checkpointResetPressed, true);
assert.equal(input.snapshot().checkpointResetPressed, false, "Gamepad actions retain edge detection");
gamepads = [];
input.clearHeldInput();
assertReleased();
console.log("input tests passed (keyboard menus, gameplay keys, simultaneous touch, cancellation, lifecycle release, gamepad coexistence)");

const publicPage = "https://pazneria.github.io/racegpt/";
const withReturn = (value: string) => publicPage + "?return=" + encodeURIComponent(value);
assert.equal(resolveArcadeReturnUrl(publicPage), "https://pazneria.github.io/arcade/");
assert.equal(resolveArcadeReturnUrl("http://127.0.0.1:5178/"), "http://localhost:5510/");
assert.equal(resolveArcadeReturnUrl(withReturn("/arcade/#racegpt")), "https://pazneria.github.io/arcade/#racegpt");
assert.equal(resolveArcadeReturnUrl(withReturn("https://example.com/arcade/?game=racegpt")), "https://example.com/arcade/?game=racegpt");
for (const unsafe of ["javascript:alert(1)", " JaVaScRiPt:\nalert(1)", "data:text/html,<script>alert(1)</script>", "file:///C:/private.txt", "blob:https://example.com/id", "ftp://example.com/", "https://user:password@example.com/", "http://["]) {
  assert.equal(resolveArcadeReturnUrl(withReturn(unsafe)), "https://pazneria.github.io/arcade/", `Unsafe or malformed return URL: ${unsafe}`);
}
console.log("navigation tests passed (relative and explicit web URLs, unsafe schemes, credentials, malformed URLs)");
