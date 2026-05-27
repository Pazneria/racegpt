import { Vector3 } from "three";
import { clamp, damp, inverseLerp, lerp, shortestAngleDelta } from "../core/math";
import type { InputSnapshot } from "../input/InputManager";
import type { Track, TrackContact, TrackPose } from "./Track";

export interface CarSnapshot {
  position: Vector3;
  velocity: Vector3;
  yaw: number;
  timeMs: number;
  gear: number;
  rpmNormalized: number;
}

export interface CarTelemetry {
  speedMps: number;
  speedKmh: number;
  driftAmount: number;
  slipAmount: number;
  onRoad: boolean;
  barrierHit: boolean;
  engineLoad: number;
  steerInput: number;
  gear: number;
  rpmNormalized: number;
  shiftPulse: number;
}

const WORLD_UP = new Vector3(0, 1, 0);
const RIDE_HEIGHT = 0.04;
const COLLISION_HALF_WIDTH = 1.42;
const SHIFT_DURATION = 0.24;
const UP_SHIFT_HOLD_SECONDS = 0.36;
const DOWN_SHIFT_HOLD_SECONDS = 0.14;
const DRAG_COEFFICIENT = 0.00044;
const ROLLING_RESISTANCE = 0.0065;

interface GearDefinition {
  readonly maxSpeedMps: number;
  readonly upSpeedMps: number;
  readonly downSpeedMps: number;
  readonly torque: number;
}

const GEARS: GearDefinition[] = [
  { maxSpeedMps: 20, upSpeedMps: 17, downSpeedMps: 0, torque: 16.5 },
  { maxSpeedMps: 32, upSpeedMps: 29, downSpeedMps: 12, torque: 13.8 },
  { maxSpeedMps: 47, upSpeedMps: 43, downSpeedMps: 23, torque: 11.6 },
  { maxSpeedMps: 70, upSpeedMps: 64, downSpeedMps: 36, torque: 10.2 },
  { maxSpeedMps: 96, upSpeedMps: 88, downSpeedMps: 54, torque: 9.4 },
  { maxSpeedMps: 122, upSpeedMps: 114, downSpeedMps: 75, torque: 10.1 },
  { maxSpeedMps: 145, upSpeedMps: Number.POSITIVE_INFINITY, downSpeedMps: 98, torque: 13.4 }
];

export class Car {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  yaw = 0;
  driftBlend = 0;
  private gear = 1;
  private rpmNormalized = 0.24;
  private shiftCooldown = 0;
  private shiftPulse = 0;
  private upshiftHold = 0;
  private downshiftHold = 0;
  private lastContact: TrackContact | null = null;

  resetTo(pose: TrackPose, timeMs = 0): CarSnapshot {
    this.position.copy(pose.position);
    this.position.addScaledVector(pose.sample.normal, RIDE_HEIGHT);
    this.velocity.set(0, 0, 0);
    this.yaw = pose.yaw;
    this.driftBlend = 0;
    this.resetDrivetrain();
    return this.snapshot(timeMs);
  }

  applySnapshot(snapshot: CarSnapshot): void {
    this.position.copy(snapshot.position);
    this.velocity.copy(snapshot.velocity);
    this.yaw = snapshot.yaw;
    this.driftBlend = 0;
    this.gear = snapshot.gear;
    this.rpmNormalized = snapshot.rpmNormalized;
    this.shiftCooldown = 0;
    this.shiftPulse = 0;
    this.upshiftHold = 0;
    this.downshiftHold = 0;
  }

  snapshot(timeMs: number): CarSnapshot {
    return {
      position: this.position.clone(),
      velocity: this.velocity.clone(),
      yaw: this.yaw,
      timeMs,
      gear: this.gear,
      rpmNormalized: this.rpmNormalized
    };
  }

  update(
    input: InputSnapshot,
    track: Track,
    dt: number,
    controlsEnabled: boolean
  ): CarTelemetry {
    const contactBefore = track.getClosestContact(this.position);
    this.lastContact = contactBefore;

    const throttle = controlsEnabled ? clamp(input.throttle, 0, 1) : 0;
    const brake = controlsEnabled ? clamp(input.brake, 0, 1) : 0;
    const steer = controlsEnabled ? clamp(input.steer, -1, 1) : 0;

    const forward = this.getForward();
    const right = this.getRight();
    const speed = this.velocity.length();
    const localForwardSpeed = this.velocity.dot(forward);
    let localSideSpeed = this.velocity.dot(right);

    const wantsDrift =
      brake > 0.1 && Math.abs(steer) > 0.18 && speed > 10 && localForwardSpeed > 4;
    this.driftBlend = damp(this.driftBlend, wantsDrift ? 1 : 0, wantsDrift ? 7 : 3.5, dt);

    const drivetrain = this.updateDrivetrain(
      Math.max(0, localForwardSpeed),
      throttle,
      brake,
      steer,
      dt,
      controlsEnabled
    );

    if (controlsEnabled) {
      if (throttle > 0) {
        this.velocity.addScaledVector(forward, drivetrain.driveForce * dt);
      }

      if (brake > 0) {
        if (localForwardSpeed > 1.2) {
          this.velocity.addScaledVector(forward, -brake * 42 * dt);
        } else {
          this.velocity.addScaledVector(forward, -brake * 15 * dt);
        }
      }

      const steerAuthority = clamp(speed / 18, 0, 1);
      const highSpeedFalloff = lerp(1, 0.24, inverseLerp(26, 128, speed));
      const driftYawBonus = lerp(1, 1.22, this.driftBlend);
      this.yaw += steer * steerAuthority * highSpeedFalloff * driftYawBonus * 1.48 * dt;
    }

    const currentForward = this.getForward();
    const currentRight = this.getRight();
    const forwardSpeed = this.velocity.dot(currentForward);
    localSideSpeed = this.velocity.dot(currentRight);

    const lateralGrip = lerp(11.5, 2.45, this.driftBlend);
    const forwardGrip = contactBefore.onRoad ? 0.16 : 1.4;
    localSideSpeed *= Math.exp(-lateralGrip * dt);
    let rebuiltForwardSpeed = forwardSpeed * Math.exp(-forwardGrip * dt * 0.08);

    if (!contactBefore.onRoad) {
      rebuiltForwardSpeed *= Math.exp(-0.42 * dt);
    }

    this.velocity
      .copy(currentForward)
      .multiplyScalar(rebuiltForwardSpeed)
      .addScaledVector(currentRight, localSideSpeed);

    const currentSpeed = this.velocity.length();
    const drag = DRAG_COEFFICIENT * currentSpeed * currentSpeed + ROLLING_RESISTANCE * currentSpeed;
    if (drag > 0) {
      this.velocity.addScaledVector(this.velocity.clone().normalize(), -drag * dt);
    }

    this.position.addScaledVector(this.velocity, dt);

    const contactAfter = track.getClosestContact(this.position);
    const barrierHit = this.resolveBarrier(contactAfter, track.wallInnerOffset);
    const grounded = track.getClosestContact(this.position);
    this.position.y = grounded.surfacePoint.y + grounded.sample.normal.y * RIDE_HEIGHT;
    this.lastContact = grounded;

    const newSpeed = this.velocity.length();
    const slipAmount = clamp(Math.abs(localSideSpeed) / 9, 0, 1);

    return {
      speedMps: newSpeed,
      speedKmh: newSpeed * 3.6,
      driftAmount: this.driftBlend,
      slipAmount,
      onRoad: grounded.onRoad,
      barrierHit,
      engineLoad: Math.max(throttle * drivetrain.shiftPower, brake * 0.25, this.rpmNormalized * 0.35),
      steerInput: steer,
      gear: this.gear,
      rpmNormalized: this.rpmNormalized,
      shiftPulse: this.shiftPulse
    };
  }

  getForward(): Vector3 {
    return new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
  }

  getRight(): Vector3 {
    return new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
  }

  getContact(track: Track): TrackContact {
    this.lastContact = track.getClosestContact(this.position);
    return this.lastContact;
  }

  getRenderBasis(track: Track): { forward: Vector3; right: Vector3; up: Vector3 } {
    const contact = this.lastContact ?? track.getClosestContact(this.position);
    const up = contact.sample.normal.clone().normalize();
    const flatForward = this.getForward();
    const forward = flatForward.addScaledVector(up, -flatForward.dot(up)).normalize();
    if (forward.lengthSq() < 0.001) forward.copy(contact.sample.tangent);
    const right = new Vector3().crossVectors(up, forward).normalize();
    return { forward, right, up };
  }

  private resolveBarrier(contact: TrackContact, wallInnerOffset: number): boolean {
    const limit = wallInnerOffset - COLLISION_HALF_WIDTH;
    if (contact.absLateral <= limit) return false;

    const sign = Math.sign(contact.lateral) || 1;
    const forwardOffset = this.position.clone().sub(contact.sample.center).dot(contact.sample.tangent);
    this.position
      .copy(contact.sample.center)
      .addScaledVector(contact.sample.tangent, forwardOffset)
      .addScaledVector(contact.sample.side, sign * limit);

    const outward = contact.sample.side.clone().multiplyScalar(sign).normalize();
    const outwardVelocity = this.velocity.dot(outward);
    const forwardAlongTrack = this.velocity.dot(contact.sample.tangent);
    const wallBounce = outwardVelocity > 0 ? outwardVelocity * 1.22 : 0;
    const hardHit = outwardVelocity > 4.5 || contact.absLateral > limit + 0.45;
    const impactFriction = 0.08 + clamp(Math.abs(outwardVelocity) / 42, 0, 0.3);
    this.velocity
      .addScaledVector(outward, -wallBounce)
      .addScaledVector(contact.sample.tangent, -forwardAlongTrack * (hardHit ? impactFriction + 0.1 : impactFriction));

    const correctedVelocity = this.velocity.lengthSq() > 0.001
      ? Math.atan2(this.velocity.x, this.velocity.z)
      : Math.atan2(contact.sample.tangent.x, contact.sample.tangent.z);
    this.yaw += shortestAngleDelta(this.yaw, correctedVelocity) * 0.16;

    return outwardVelocity > 1.1 || contact.absLateral > limit + 0.22;
  }

  private resetDrivetrain(): void {
    this.gear = 1;
    this.rpmNormalized = 0.24;
    this.shiftCooldown = 0;
    this.shiftPulse = 0;
    this.upshiftHold = 0;
    this.downshiftHold = 0;
  }

  private updateDrivetrain(
    forwardSpeed: number,
    throttle: number,
    brake: number,
    steer: number,
    dt: number,
    controlsEnabled: boolean
  ): { driveForce: number; shiftPower: number } {
    this.shiftCooldown = Math.max(0, this.shiftCooldown - dt);
    this.shiftPulse = Math.max(0, this.shiftPulse - dt * 4.4);
    this.rpmNormalized = damp(
      this.rpmNormalized,
      this.computeRpm(forwardSpeed, this.gear),
      16,
      dt
    );

    if (controlsEnabled) {
      this.updateAutomaticGear(forwardSpeed, throttle, brake, steer, dt);
    } else if (forwardSpeed < 1.5) {
      this.gear = 1;
      this.upshiftHold = 0;
      this.downshiftHold = 0;
    }

    this.rpmNormalized = damp(
      this.rpmNormalized,
      this.computeRpm(forwardSpeed, this.gear),
      18,
      dt
    );

    const gear = GEARS[this.gear - 1];
    const shiftPower = lerp(1, 0.62, clamp(this.shiftCooldown / SHIFT_DURATION, 0, 1));
    const driveForce = controlsEnabled
      ? throttle * gear.torque * torqueCurve(this.rpmNormalized) * shiftPower
      : 0;

    return { driveForce, shiftPower };
  }

  private updateAutomaticGear(
    forwardSpeed: number,
    throttle: number,
    brake: number,
    steer: number,
    dt: number
  ): void {
    if (this.shiftCooldown > 0) return;

    const gear = GEARS[this.gear - 1];
    const loadedTurn = forwardSpeed > 18 && Math.abs(steer) > 0.42;
    if (
      this.gear < GEARS.length &&
      throttle > 0.2 &&
      forwardSpeed >= gear.upSpeedMps &&
      !loadedTurn
    ) {
      this.upshiftHold += dt;
    } else {
      this.upshiftHold = Math.max(0, this.upshiftHold - dt * 1.8);
    }

    const previousGear = GEARS[Math.max(0, this.gear - 2)];
    const brakeDownshiftPoint = previousGear ? previousGear.upSpeedMps * 0.82 : 0;
    if (
      this.gear > 1 &&
      (forwardSpeed <= gear.downSpeedMps || (brake > 0.18 && forwardSpeed <= brakeDownshiftPoint))
    ) {
      this.downshiftHold += dt;
    } else {
      this.downshiftHold = Math.max(0, this.downshiftHold - dt * 2.2);
    }

    if (this.upshiftHold >= UP_SHIFT_HOLD_SECONDS) {
      this.shiftTo(this.gear + 1);
      return;
    }

    if (this.downshiftHold >= DOWN_SHIFT_HOLD_SECONDS) {
      this.shiftTo(this.gear - 1);
    }
  }

  private shiftTo(nextGear: number): void {
    const clampedGear = clamp(Math.round(nextGear), 1, GEARS.length);
    if (clampedGear === this.gear) return;
    this.gear = clampedGear;
    this.shiftCooldown = SHIFT_DURATION;
    this.shiftPulse = 1;
    this.upshiftHold = 0;
    this.downshiftHold = 0;
  }

  private computeRpm(forwardSpeed: number, gear: number): number {
    const definition = GEARS[gear - 1] ?? GEARS[0];
    return clamp(0.22 + (forwardSpeed / definition.maxSpeedMps) * 0.86, 0.22, 1.08);
  }
}

function torqueCurve(rpmNormalized: number): number {
  if (rpmNormalized < 0.32) {
    return lerp(0.68, 1, inverseLerp(0.22, 0.32, rpmNormalized));
  }
  if (rpmNormalized < 0.92) return 1;
  return lerp(1, 0.78, inverseLerp(0.92, 1.08, rpmNormalized));
}
