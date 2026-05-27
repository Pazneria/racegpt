import { clamp, shortestAngleDelta } from "../core/math";
import type { InputSnapshot } from "../input/InputManager";
import type { Car, CarTelemetry } from "./Car";
import type { Track } from "./Track";

const TRACK_B_DRIVER = {
  lookBase: -34.7332350679487,
  lookScale: 6.188902682252229,
  lookMin: 74.63539568817244,
  lookMax: 90.63539568817244,
  curveLook: 144.0512598251961,
  steerGain: 9.658410271782433,
  lateralGain: 0.06180205124037339,
  feedForward: -0.2353091283820569,
  baseLateral: 0.19660935018584097,
  turnLateral: -2.644351000647992,
  curveLateral: -4.511822592496874,
  throttle: 0.9855863426313733,
  brakeSpeed: 95.86729394586756,
  brakeAmount: 0.15592443394241853,
  brakeCurve: 0.9063966620147228
};

export function getAutopilotInput(
  base: InputSnapshot,
  car: Car,
  track: Track,
  telemetry: CarTelemetry
): InputSnapshot {
  if (track.id === "test-track-b") {
    return getTrackBInput(base, car, track, telemetry);
  }

  const contact = car.getContact(track);
  const lookAhead = clamp(11.779 + telemetry.speedMps * 4.198, 14, 77.308);
  const target = track.getSampleAtS(contact.s + lookAhead);
  const curveTarget = track.getSampleAtS(contact.s + 190.071);
  const currentYaw = Math.atan2(contact.sample.tangent.x, contact.sample.tangent.z);
  const curveYaw = Math.atan2(curveTarget.tangent.x, curveTarget.tangent.z);
  const turnSign = Math.sign(shortestAngleDelta(currentYaw, curveYaw));
  const targetLateral = -1.694 * turnSign;
  const toTarget = target.center
    .clone()
    .addScaledVector(target.side, targetLateral)
    .sub(car.position);
  const desiredYaw = Math.atan2(toTarget.x, toTarget.z);
  const headingError = shortestAngleDelta(car.yaw, desiredYaw);
  const steer = clamp(
    headingError * 4.607 + (targetLateral - contact.lateral) * 0.0382 - turnSign * 0.1757,
    -1,
    1
  );

  return {
    ...base,
    steer,
    throttle: 1,
    brake: 0,
    checkpointResetPressed: false,
    fullRestartPressed: false,
    pausePressed: false,
    confirmPressed: false
  };
}

function getTrackBInput(
  base: InputSnapshot,
  car: Car,
  track: Track,
  telemetry: CarTelemetry
): InputSnapshot {
  const contact = car.getContact(track);
  const lookAhead = clamp(
    TRACK_B_DRIVER.lookBase + telemetry.speedMps * TRACK_B_DRIVER.lookScale,
    TRACK_B_DRIVER.lookMin,
    TRACK_B_DRIVER.lookMax
  );
  const target = track.getSampleAtS(contact.s + lookAhead);
  const curveTarget = track.getSampleAtS(contact.s + TRACK_B_DRIVER.curveLook);
  const currentYaw = Math.atan2(contact.sample.tangent.x, contact.sample.tangent.z);
  const curveYaw = Math.atan2(curveTarget.tangent.x, curveTarget.tangent.z);
  const curveDelta = shortestAngleDelta(currentYaw, curveYaw);
  const turnSign = Math.sign(curveDelta);
  const curveAmount = Math.min(1, Math.abs(curveDelta) / 1.1);
  const targetLateral = clamp(
    TRACK_B_DRIVER.baseLateral +
      turnSign * (TRACK_B_DRIVER.turnLateral + TRACK_B_DRIVER.curveLateral * curveAmount),
    -8.8,
    8.8
  );
  const toTarget = target.center
    .clone()
    .addScaledVector(target.side, targetLateral)
    .sub(car.position);
  const desiredYaw = Math.atan2(toTarget.x, toTarget.z);
  const headingError = shortestAngleDelta(car.yaw, desiredYaw);
  const steer = clamp(
    headingError * TRACK_B_DRIVER.steerGain +
      (targetLateral - contact.lateral) * TRACK_B_DRIVER.lateralGain +
      turnSign * TRACK_B_DRIVER.feedForward,
    -1,
    1
  );
  const brake =
    telemetry.speedMps > TRACK_B_DRIVER.brakeSpeed && curveAmount > TRACK_B_DRIVER.brakeCurve
      ? TRACK_B_DRIVER.brakeAmount * curveAmount
      : 0;

  return {
    ...base,
    steer,
    throttle: TRACK_B_DRIVER.throttle,
    brake,
    checkpointResetPressed: false,
    fullRestartPressed: false,
    pausePressed: false,
    confirmPressed: false
  };
}
