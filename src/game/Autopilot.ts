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
  const lookAhead = clamp(12 + telemetry.speedMps * 0.85, 14, 42);
  const target = track.getSampleAtS(contact.s + lookAhead);
  const desiredYaw = Math.atan2(target.tangent.x, target.tangent.z);
  const headingError = shortestAngleDelta(car.yaw, desiredYaw);
  const lateralCorrection = clamp(-contact.lateral / 6.8, -0.72, 0.72);
  const steer = clamp(headingError * 1.72 + lateralCorrection, -1, 1);
  const curvePressure = Math.abs(headingError) + Math.abs(contact.lateral) * 0.035;
  const targetSpeed = curvePressure > 0.56 ? 15 : curvePressure > 0.32 ? 20 : 29;
  const brake =
    telemetry.speedMps > targetSpeed
      ? clamp((telemetry.speedMps - targetSpeed) / 6.5, 0, 0.7)
      : 0;

  return {
    ...base,
    steer,
    throttle: brake > 0.2 ? 0.18 : 1,
    brake,
    checkpointResetPressed: false,
    fullRestartPressed: false,
    pausePressed: false,
    confirmPressed: false
  };
}

