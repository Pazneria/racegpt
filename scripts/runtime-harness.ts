import { RaceGptApp } from "../src/main";
import { Car } from "../src/game/Car";
import { createCodexGhostRecording } from "../src/game/CodexGhost";
import { Track } from "../src/game/Track";
import type { InputSnapshot } from "../src/input/InputManager";

export const neutralInput: InputSnapshot = {
  steer: 0, throttle: 0, brake: 0,
  checkpointResetPressed: false, fullRestartPressed: false, pausePressed: false,
  inputOverlayPressed: false, confirmPressed: false, anyGamepad: false
};

const noop = () => {};
globalThis.requestAnimationFrame = () => 0;

// Run the real app methods without constructing WebGL, DOM, or audio devices.
// The private members are deliberately accessible only in this test harness.
export function createRuntimeHarness(trackId: string, driver: string, autoplay = true) {
  const app = Object.create(RaceGptApp.prototype);
  const track = new Track(trackId);
  Object.assign(app, {
    track, car: new Car(), autoplay, autopilotVariant: driver,
    mode: "menu", lastFrame: 0, accumulator: 0, bestRun: null,
    codexGhost: createCodexGhostRecording(track),
    settings: { codexGhostEnabled: true, playerGhostEnabled: true },
    input: { snapshot: () => neutralInput },
    audio: new Proxy({}, { get: () => noop }),
    ui: new Proxy({}, { get: () => noop }),
    renderer: { update: noop }, displayInput: neutralInput
  });
  app.getGhosts = () => [];
  app.updateHud = noop;
  app.publishDebugState = noop;
  return app;
}
