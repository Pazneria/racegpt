import { Vector3 } from "three";
import { Car } from "../src/game/Car";
import { Track } from "../src/game/Track";
import type { InputSnapshot } from "../src/input/InputManager";

const neutralInput: InputSnapshot = {
  steer: 0,
  throttle: 0,
  brake: 0,
  checkpointResetPressed: false,
  fullRestartPressed: false,
  pausePressed: false,
  inputOverlayPressed: false,
  confirmPressed: false,
  anyGamepad: false
};

const track = new Track("jump-speedcheck");
const gapSample = track.samples.find((sample) => !sample.hasRoad);
if (!gapSample) throw new Error("jump-speedcheck should include a road gap");

const car = new Car();
car.resetTo(track.startPose, 0);
car.applySnapshot({
  position: gapSample.center.clone().setY(0.08),
  velocity: new Vector3(18, -12, 0),
  yaw: Math.atan2(gapSample.tangent.x, gapSample.tangent.z),
  timeMs: 0,
  gear: 3,
  rpmNormalized: 0.5,
  airborne: true
});

const telemetry = car.update(neutralInput, track, 1 / 60, false);

assertEqual(telemetry.airborne, false, "missed jump should settle on fallback ground");
assertEqual(telemetry.onRoad, false, "fallback ground should not count as road contact");
assertNear(car.position.y, 0.04, 0.0001, "fallback ground should clamp to ground height");
assertNear(telemetry.verticalSpeedMps, 0, 0.0001, "ground impact should clear vertical speed");
assertLessThan(telemetry.speedMps, 9, "ground impact should scrub horizontal speed");

console.log("car physics tests passed");

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertNear(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertLessThan(actual: number, limit: number, message: string): void {
  if (!(actual < limit)) {
    throw new Error(`${message}: expected less than ${limit}, got ${actual}`);
  }
}
