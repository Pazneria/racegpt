import { Car, type CarTelemetry } from "../src/game/Car";
import { getAutopilotInput } from "../src/game/Autopilot";
import { Track } from "../src/game/Track";
import type { InputSnapshot } from "../src/input/InputManager";

const trackArg = process.argv.find((arg) => arg.startsWith("--track="));
const track = new Track(trackArg?.slice("--track=".length));
const car = new Car();
let telemetry: CarTelemetry = {
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

car.resetTo(track.startPose, 0);

const dt = 1 / 120;
let timeMs = 0;
let lastS = track.startS;
let checkpointMs: number | null = null;

for (let step = 0; step < 120 * 180; step += 1) {
  const input = getAutopilotInput(neutralInput, car, track, telemetry);
  telemetry = car.update(input, track, dt, true);
  timeMs += dt * 1000;
  const contact = car.getContact(track);

  if (checkpointMs == null && lastS < track.checkpointS && contact.s >= track.checkpointS) {
    checkpointMs = timeMs;
  }

  if (lastS < track.finishS && contact.s >= track.finishS) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          trackId: track.id,
          finishMs: Math.round(timeMs),
          checkpointMs: checkpointMs == null ? null : Math.round(checkpointMs),
          speedKmh: Math.round(telemetry.speedKmh),
          trackS: Math.round(contact.s)
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  lastS = contact.s;
}

const contact = car.getContact(track);
console.error(
  JSON.stringify(
    {
      ok: false,
      trackId: track.id,
      timeMs: Math.round(timeMs),
      checkpointMs: checkpointMs == null ? null : Math.round(checkpointMs),
      speedKmh: Math.round(telemetry.speedKmh),
      trackS: Math.round(contact.s),
      finishS: Math.round(track.finishS),
      x: Number(car.position.x.toFixed(2)),
      y: Number(car.position.y.toFixed(2)),
      z: Number(car.position.z.toFixed(2)),
      yaw: Number(car.yaw.toFixed(3))
    },
    null,
    2
  )
);
process.exit(1);
