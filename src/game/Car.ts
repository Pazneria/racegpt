import { Vector3 } from "three";
import { clamp, damp, inverseLerp, lerp, shortestAngleDelta } from "../core/math";
import type { InputSnapshot } from "../input/InputManager";
import type { Track, TrackContact, TrackPose } from "./Track";

export interface CarSnapshot {
  position: Vector3;
  velocity: Vector3;
  yaw: number;
  timeMs: number;
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
}

const WORLD_UP = new Vector3(0, 1, 0);
const RIDE_HEIGHT = 0.04;
const COLLISION_HALF_WIDTH = 1.42;

export class Car {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  yaw = 0;
  driftBlend = 0;
  private lastContact: TrackContact | null = null;

  resetTo(pose: TrackPose, timeMs = 0): CarSnapshot {
    this.position.copy(pose.position);
    this.position.addScaledVector(pose.sample.normal, RIDE_HEIGHT);
    this.velocity.set(0, 0, 0);
    this.yaw = pose.yaw;
    this.driftBlend = 0;
    return this.snapshot(timeMs);
  }

  applySnapshot(snapshot: CarSnapshot): void {
    this.position.copy(snapshot.position);
    this.velocity.copy(snapshot.velocity);
    this.yaw = snapshot.yaw;
    this.driftBlend = 0;
  }

  snapshot(timeMs: number): CarSnapshot {
    return {
      position: this.position.clone(),
      velocity: this.velocity.clone(),
      yaw: this.yaw,
      timeMs
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

    if (controlsEnabled) {
      const throttlePower = lerp(32, 11.5, inverseLerp(0, 56, Math.max(0, localForwardSpeed)));
      if (throttle > 0 && localForwardSpeed < 56) {
        this.velocity.addScaledVector(forward, throttle * throttlePower * dt);
      }

      if (brake > 0) {
        if (localForwardSpeed > 1.2) {
          this.velocity.addScaledVector(forward, -brake * 42 * dt);
        } else {
          this.velocity.addScaledVector(forward, -brake * 15 * dt);
        }
      }

      const steerAuthority = clamp(speed / 18, 0, 1);
      const highSpeedFalloff = lerp(1, 0.52, inverseLerp(26, 52, speed));
      const driftYawBonus = lerp(1, 1.22, this.driftBlend);
      this.yaw += steer * steerAuthority * highSpeedFalloff * driftYawBonus * 1.48 * dt;
    }

    const currentForward = this.getForward();
    const currentRight = this.getRight();
    const forwardSpeed = this.velocity.dot(currentForward);
    localSideSpeed = this.velocity.dot(currentRight);

    const lateralGrip = lerp(11.5, 2.45, this.driftBlend);
    const forwardGrip = contactBefore.onRoad ? 0.62 : 1.4;
    localSideSpeed *= Math.exp(-lateralGrip * dt);
    let rebuiltForwardSpeed = forwardSpeed * Math.exp(-forwardGrip * dt * 0.08);

    if (!contactBefore.onRoad) {
      rebuiltForwardSpeed *= Math.exp(-0.42 * dt);
    }

    this.velocity
      .copy(currentForward)
      .multiplyScalar(rebuiltForwardSpeed)
      .addScaledVector(currentRight, localSideSpeed);

    const drag = 0.0054 * this.velocity.lengthSq();
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
      engineLoad: Math.max(throttle, brake * 0.25, inverseLerp(0, 52, Math.abs(rebuiltForwardSpeed)) * 0.45),
      steerInput: steer
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
    this.velocity
      .addScaledVector(outward, -wallBounce)
      .addScaledVector(contact.sample.tangent, -forwardAlongTrack * (hardHit ? 0.18 : 0.08));

    const correctedVelocity = this.velocity.lengthSq() > 0.001
      ? Math.atan2(this.velocity.x, this.velocity.z)
      : Math.atan2(contact.sample.tangent.x, contact.sample.tangent.z);
    this.yaw += shortestAngleDelta(this.yaw, correctedVelocity) * 0.16;

    return outwardVelocity > 1.1 || contact.absLateral > limit + 0.22;
  }
}
