import { Car, type CarTelemetry } from "./Car";
import { getAutopilotInput } from "./Autopilot";
import type { InputSnapshot } from "../input/InputManager";
import type { Track } from "./Track";
import type { GhostRecording, GhostSample } from "./Storage";

export const CODEX_GHOST_NAME = "Codex 5.5";

const FIXED_DT = 1 / 120;
const RECORD_INTERVAL = 0.05;
const MAX_SECONDS = 90;

const NEUTRAL_INPUT: InputSnapshot = {
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

const INITIAL_TELEMETRY: CarTelemetry = {
  speedMps: 0,
  speedKmh: 0,
  verticalSpeedMps: 0,
  driftAmount: 0,
  slipAmount: 0,
  onRoad: true,
  airborne: false,
  barrierHit: false,
  engineLoad: 0,
  steerInput: 0,
  gear: 1,
  rpmNormalized: 0.24,
  shiftPulse: 0
};

export function createCodexGhostRecording(track: Track): GhostRecording {
  const car = new Car();
  const samples: GhostSample[] = [];
  let telemetry = { ...INITIAL_TELEMETRY };
  let timeMs = 0;
  let recordAccumulator = 0;
  let checkpointMs: number | null = null;
  const checkpointMsList: number[] = [];
  let checkpointIndex = 0;
  let lastS = track.startS;

  car.resetTo(track.startPose, 0);
  samples.push(toGhostSample(car, 0));

  for (let step = 0; step < MAX_SECONDS / FIXED_DT; step += 1) {
    const input = getAutopilotInput(NEUTRAL_INPUT, car, track, telemetry);
    telemetry = car.update(input, track, FIXED_DT, true);
    timeMs += FIXED_DT * 1000;
    recordAccumulator += FIXED_DT;

    const contact = car.getContact(track);
    const nextCheckpointS = track.checkpointSs[checkpointIndex];
    if (nextCheckpointS != null && lastS < nextCheckpointS && contact.s >= nextCheckpointS) {
      checkpointMs = timeMs;
      checkpointMsList[checkpointIndex] = timeMs;
      checkpointIndex += 1;
    }

    if (recordAccumulator >= RECORD_INTERVAL) {
      recordAccumulator = 0;
      samples.push(toGhostSample(car, timeMs));
    }

    if (lastS < track.finishS && contact.s >= track.finishS) {
      samples.push(toGhostSample(car, timeMs));
      return {
        trackId: track.id,
        timeMs,
        checkpointMs,
        checkpointMsList,
        samples
      };
    }

    lastS = contact.s;
  }

  return {
    trackId: track.id,
    timeMs,
    checkpointMs,
    checkpointMsList,
    samples
  };
}

function toGhostSample(car: Car, timeMs: number): GhostSample {
  return {
    timeMs,
    x: car.position.x,
    y: car.position.y,
    z: car.position.z,
    yaw: car.yaw
  };
}
