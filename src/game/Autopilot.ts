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

const TRACK_C_DRIVER = {
  split1: 1676.818208738072,
  split2: 3010.23197456696,
  split3: 3600.1054152950824,
  sectors: {
    start: {
      lookBase: 14.141006682822788,
      lookScale: 0.8339823655900572,
      lookMin: 55.56322676950339,
      lookMax: 112.22567047815387,
      curveLook: 171.76072948415126,
      steerGain: 5.904656696912638,
      lateralGain: 0.04054387999867911,
      feedForward: -0.15022539761091594,
      baseLateral: 1.132045064104493,
      turnLateral: -2.568300855046658,
      curveLateral: -5.831235969041437,
      throttle: 0.997745620973729,
      brakeSpeed: 80.5195017000455,
      brakeAmount: 0.5149671834582765,
      brakeCurve: 0.7145700962930196,
      curveDiv: 1.5215464276466877,
      latClamp: 8.661341248504867
    },
    middle: {
      lookBase: 9.80799100537396,
      lookScale: 1.0464105497324894,
      lookMin: 62.067305028945306,
      lookMax: 138.30449505164444,
      curveLook: 186.1834404146536,
      steerGain: 5.826447392322659,
      lateralGain: 0.057530302745767925,
      feedForward: 0.04335082037241125,
      baseLateral: 1.776367421899096,
      turnLateral: -0.8799535015776946,
      curveLateral: -4.343004083071295,
      throttle: 0.9996911146303104,
      brakeSpeed: 106.29867903715846,
      brakeAmount: 0.4709787326603551,
      brakeCurve: 0.7864750761965253,
      curveDiv: 1.6067417549970515,
      latClamp: 8.26978851977656
    },
    late: {
      lookBase: 11.704694861844333,
      lookScale: 0.8379466718355401,
      lookMin: 53.11368639504169,
      lookMax: 115.71479183162482,
      curveLook: 165.56222794933583,
      steerGain: 6.077398581538224,
      lateralGain: 0.04744046170412082,
      feedForward: -0.09201819405158054,
      baseLateral: 0.7732297264786089,
      turnLateral: -2.4634607197827605,
      curveLateral: -5.170612297439843,
      throttle: 0.9886673775391843,
      brakeSpeed: 87.78597718659579,
      brakeAmount: 0.6292958915930176,
      brakeCurve: 0.7054068010051296,
      curveDiv: 1.5061117714368053,
      latClamp: 8.034345247206623
    },
    finish: {
      lookBase: 11.500608106930704,
      lookScale: 0.8689921272336969,
      lookMin: 52.78446825855297,
      lookMax: 115.07445399848861,
      curveLook: 161.33241744919573,
      steerGain: 5.983005278881262,
      lateralGain: 0.047361948411057224,
      feedForward: -0.14070662638579726,
      baseLateral: 0.5750058228041562,
      turnLateral: -2.15525954586077,
      curveLateral: -4.998242351148615,
      throttle: 0.9890848080482791,
      brakeSpeed: 93.81259988300636,
      brakeAmount: 0.6295564097082952,
      brakeCurve: 0.7446019274746966,
      curveDiv: 1.5229166707363284,
      latClamp: 8.045922097316975
    }
  }
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
  if (track.id === "technical-bowl") {
    return getTrackCInput(base, car, track, telemetry);
  }
  if (track.id === "jump-speedcheck") {
    return getTrackDInput(base, car, track, telemetry);
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

function getTrackCInput(
  base: InputSnapshot,
  car: Car,
  track: Track,
  telemetry: CarTelemetry
): InputSnapshot {
  const contact = car.getContact(track);
  const driver = getTrackCDriver(contact.s);
  const lookAhead = clamp(
    driver.lookBase + telemetry.speedMps * driver.lookScale,
    driver.lookMin,
    driver.lookMax
  );
  const target = track.getSampleAtS(contact.s + lookAhead);
  const curveTarget = track.getSampleAtS(contact.s + driver.curveLook);
  const currentYaw = Math.atan2(contact.sample.tangent.x, contact.sample.tangent.z);
  const curveYaw = Math.atan2(curveTarget.tangent.x, curveTarget.tangent.z);
  const curveDelta = shortestAngleDelta(currentYaw, curveYaw);
  const turnSign = Math.sign(curveDelta);
  const curveAmount = Math.min(1, Math.abs(curveDelta) / driver.curveDiv);
  const targetLateral = clamp(
    driver.baseLateral + turnSign * (driver.turnLateral + driver.curveLateral * curveAmount),
    -driver.latClamp,
    driver.latClamp
  );
  const toTarget = target.center
    .clone()
    .addScaledVector(target.side, targetLateral)
    .sub(car.position);
  const desiredYaw = Math.atan2(toTarget.x, toTarget.z);
  const headingError = shortestAngleDelta(car.yaw, desiredYaw);
  const steer = clamp(
    headingError * driver.steerGain +
      (targetLateral - contact.lateral) * driver.lateralGain +
      turnSign * driver.feedForward,
    -1,
    1
  );
  const brake =
    telemetry.speedMps > driver.brakeSpeed && curveAmount > driver.brakeCurve
      ? driver.brakeAmount * curveAmount
      : 0;

  return {
    ...base,
    steer,
    throttle: driver.throttle,
    brake,
    checkpointResetPressed: false,
    fullRestartPressed: false,
    pausePressed: false,
    confirmPressed: false
  };
}

function getTrackCDriver(s: number): (typeof TRACK_C_DRIVER)["sectors"]["start"] {
  if (s < TRACK_C_DRIVER.split1) {
    return TRACK_C_DRIVER.sectors.start;
  }
  if (s < TRACK_C_DRIVER.split2) {
    return TRACK_C_DRIVER.sectors.middle;
  }
  if (s < TRACK_C_DRIVER.split3) {
    return TRACK_C_DRIVER.sectors.late;
  }
  return TRACK_C_DRIVER.sectors.finish;
}

function getTrackDInput(
  base: InputSnapshot,
  car: Car,
  track: Track,
  telemetry: CarTelemetry
): InputSnapshot {
  const contact = car.getContact(track);
  const inSpeedcheck = contact.s < 1060;
  const lookAhead = inSpeedcheck
    ? clamp(58 + telemetry.speedMps * 0.45, 72, 112)
    : clamp(22 + telemetry.speedMps * 1.05, 62, 126);
  const target = track.getSampleAtS(contact.s + lookAhead);
  const curveTarget = track.getSampleAtS(contact.s + (inSpeedcheck ? 92 : 176));
  const currentYaw = Math.atan2(contact.sample.tangent.x, contact.sample.tangent.z);
  const curveYaw = Math.atan2(curveTarget.tangent.x, curveTarget.tangent.z);
  const curveDelta = shortestAngleDelta(currentYaw, curveYaw);
  const turnSign = Math.sign(curveDelta);
  const curveAmount = Math.min(1, Math.abs(curveDelta) / 1.45);
  const targetLateral = 0;
  const toTarget = target.center
    .clone()
    .addScaledVector(target.side, targetLateral)
    .sub(car.position);
  const desiredYaw = Math.atan2(toTarget.x, toTarget.z);
  const headingError = shortestAngleDelta(car.yaw, desiredYaw);
  const edgeBias = !inSpeedcheck && contact.absLateral > track.roadWidth / 2 - 5
    ? (0 - contact.lateral) * 0.06
    : 0;
  const steer = clamp(
    headingError * 6.05 +
      (targetLateral - contact.lateral) * 0.11 +
      turnSign * (inSpeedcheck ? -0.03 : -0.02) +
      edgeBias,
    -1,
    1
  );
  const curveBrake =
    !inSpeedcheck && telemetry.speedMps > 58 && curveAmount > 0.36 ? 0.64 * curveAmount : 0;
  const edgeBrake =
    !inSpeedcheck && contact.absLateral > track.roadWidth / 2 - 4 && telemetry.speedMps > 35 ? 0.58 : 0;
  const brake = Math.max(curveBrake, edgeBrake);

  return {
    ...base,
    steer,
    throttle: 1,
    brake,
    checkpointResetPressed: false,
    fullRestartPressed: false,
    pausePressed: false,
    confirmPressed: false
  };
}
