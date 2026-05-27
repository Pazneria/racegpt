import { clamp, shortestAngleDelta } from "../core/math";
import type { InputSnapshot } from "../input/InputManager";
import type { Car, CarTelemetry } from "./Car";
import type { Track } from "./Track";

export function getAutopilotInput(
  base: InputSnapshot,
  car: Car,
  track: Track,
  telemetry: CarTelemetry
): InputSnapshot {
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
