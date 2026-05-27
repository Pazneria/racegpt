import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3
} from "three";
import { clamp, lerp, smoothstep } from "../core/math";

export interface TrackSample {
  index: number;
  t: number;
  s: number;
  center: Vector3;
  tangent: Vector3;
  side: Vector3;
  normal: Vector3;
  width: number;
  bank: number;
}

export interface TrackContact {
  sample: TrackSample;
  s: number;
  lateral: number;
  absLateral: number;
  onRoad: boolean;
  onShoulder: boolean;
  surfacePoint: Vector3;
}

export interface TrackPose {
  position: Vector3;
  yaw: number;
  sample: TrackSample;
}

const UP = new Vector3(0, 1, 0);
const SAMPLE_COUNT = 640;
const BANK_EDGE_CLEARANCE = 0.18;

export class Track {
  readonly id = "banked-shakedown";
  readonly name = "Banked Shakedown";
  readonly roadWidth = 22;
  readonly shoulderWidth = 3.5;
  readonly curbWidth = 1.05;
  readonly wallInnerOffset = this.roadWidth / 2 + this.curbWidth;
  readonly wallOuterOffset = this.wallInnerOffset + 0.75;
  readonly barrierOffset = (this.wallInnerOffset + this.wallOuterOffset) / 2;
  readonly checkpointS: number;
  readonly finishS: number;
  readonly startS = 5;
  readonly samples: TrackSample[];
  readonly length: number;

  constructor() {
    this.samples = this.buildSamples();
    this.length = this.samples[this.samples.length - 1].s;
    this.checkpointS = this.length * 0.46;
    this.finishS = this.length - 7;
  }

  get startPose(): TrackPose {
    const pose = this.getPoseAtS(this.startS);
    return pose;
  }

  getPoseAtS(s: number): TrackPose {
    const sample = this.getSampleAtS(s);
    return {
      position: sample.center.clone(),
      yaw: Math.atan2(sample.tangent.x, sample.tangent.z),
      sample
    };
  }

  getSampleAtS(s: number): TrackSample {
    const clampedS = clamp(s, 0, this.length);
    let low = 0;
    let high = this.samples.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.samples[mid].s < clampedS) low = mid + 1;
      else high = mid;
    }
    const next = this.samples[low];
    const previous = this.samples[Math.max(0, low - 1)];
    const span = Math.max(0.0001, next.s - previous.s);
    const blend = clamp((clampedS - previous.s) / span, 0, 1);
    const tangent = previous.tangent.clone().lerp(next.tangent, blend).normalize();
    const side = previous.side.clone().lerp(next.side, blend).normalize();
    const normal = previous.normal.clone().lerp(next.normal, blend).normalize();

    return {
      index: previous.index,
      t: lerp(previous.t, next.t, blend),
      s: clampedS,
      center: previous.center.clone().lerp(next.center, blend),
      tangent,
      side,
      normal,
      width: this.roadWidth,
      bank: lerp(previous.bank, next.bank, blend)
    };
  }

  getClosestContact(position: Vector3): TrackContact {
    let best = this.samples[0];
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const sample of this.samples) {
      const dx = position.x - sample.center.x;
      const dy = (position.y - sample.center.y) * 0.35;
      const dz = position.z - sample.center.z;
      const distance = dx * dx + dy * dy + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = sample;
      }
    }

    const offset = position.clone().sub(best.center);
    const lateral = offset.dot(best.side);
    const forward = offset.dot(best.tangent);
    const s = clamp(best.s + forward, 0, this.length);
    const refined = this.getSampleAtS(s);
    const refinedOffset = position.clone().sub(refined.center);
    const refinedLateral = refinedOffset.dot(refined.side);
    const absLateral = Math.abs(refinedLateral);
    const surfacePoint = this.getSurfacePoint(refined, refinedLateral);

    return {
      sample: refined,
      s,
      lateral: refinedLateral,
      absLateral,
      onRoad: absLateral <= this.roadWidth / 2,
      onShoulder: absLateral <= this.roadWidth / 2 + this.shoulderWidth,
      surfacePoint
    };
  }

  getSurfacePoint(sample: TrackSample, lateral: number): Vector3 {
    return sample.center.clone().addScaledVector(sample.side, lateral);
  }

  createRoadMesh(): Mesh {
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    this.samples.forEach((sample, index) => {
      const left = this.getSurfacePoint(sample, -this.roadWidth / 2);
      const right = this.getSurfacePoint(sample, this.roadWidth / 2);
      vertices.push(left.x, left.y + 0.01, left.z, right.x, right.y + 0.01, right.z);
      uvs.push(0, sample.s / 18, 1, sample.s / 18);

      if (index < this.samples.length - 1) {
        const base = index * 2;
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    });

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new MeshStandardMaterial({
      color: 0x343a3f,
      roughness: 0.82,
      metalness: 0.02
    });
    const mesh = new Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  createPaintedLine(s: number, color: number, depth = 3.2): Mesh {
    const sample = this.getSampleAtS(s);
    const geometry = new PlaneGeometry(this.roadWidth + 0.35, depth);
    const material = new MeshStandardMaterial({
      color,
      roughness: 0.58,
      metalness: 0.0,
      emissive: color,
      emissiveIntensity: 0.08
    });
    const mesh = new Mesh(geometry, material);
    const basis = new Matrix4().makeBasis(sample.side, sample.tangent, sample.normal);
    mesh.quaternion.setFromRotationMatrix(basis);
    mesh.position.copy(sample.center).addScaledVector(sample.normal, 0.045);
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildSamples(): TrackSample[] {
    const curve = new CatmullRomCurve3(
      [
        new Vector3(0, 0, 0),
        new Vector3(0, 0, 82),
        new Vector3(24, 2, 126),
        new Vector3(78, 8, 158),
        new Vector3(138, 12, 148),
        new Vector3(188, 12, 112),
        new Vector3(225, 9, 70),
        new Vector3(228, 6, 18),
        new Vector3(205, 3, -33),
        new Vector3(168, 1, -76),
        new Vector3(160, 0, -176),
        new Vector3(190, 0, -262),
        new Vector3(256, 4, -318),
        new Vector3(332, 10, -300),
        new Vector3(386, 13, -236),
        new Vector3(412, 13, -160),
        new Vector3(398, 10, -88),
        new Vector3(448, 6, -28),
        new Vector3(498, 2, 58),
        new Vector3(500, 0, 154),
        new Vector3(462, 0, 244)
      ],
      false,
      "catmullrom",
      0.35
    );

    const rawPoints = curve.getSpacedPoints(SAMPLE_COUNT - 1);
    const points = rawPoints.map((point, index) =>
      this.liftBankedPoint(point, rawPoints, index)
    );
    let runningS = 0;

    return points.map((point, index) => {
      if (index > 0) runningS += point.distanceTo(points[index - 1]);

      const previous = points[Math.max(0, index - 1)];
      const next = points[Math.min(points.length - 1, index + 1)];
      const tangent = next.clone().sub(previous).normalize();
      const flatTangent = new Vector3(tangent.x, 0, tangent.z).normalize();
      const baseSide = new Vector3().crossVectors(UP, flatTangent).normalize();
      const t = index / (points.length - 1);
      const bank = this.bankAt(t);
      const bankRotation = new Quaternion().setFromAxisAngle(tangent, bank);
      const side = baseSide.clone().applyQuaternion(bankRotation).normalize();
      const normal = new Vector3().crossVectors(tangent, side).normalize();

      return {
        index,
        t,
        s: runningS,
        center: point.clone(),
        tangent,
        side,
        normal,
        width: this.roadWidth,
        bank
      };
    });
  }

  private bankAt(t: number): number {
    const rightTurn = smoothstep(0.12, 0.26, t) - smoothstep(0.48, 0.61, t);
    const downhillLeft = smoothstep(0.40, 0.48, t) - smoothstep(0.58, 0.67, t);
    const bridgeSweeper = smoothstep(0.63, 0.72, t) - smoothstep(0.82, 0.9, t);
    return rightTurn * -0.18 + downhillLeft * 0.08 + bridgeSweeper * -0.12;
  }

  private liftBankedPoint(point: Vector3, points: Vector3[], index: number): Vector3 {
    const lifted = point.clone();
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const tangent = next.clone().sub(previous).normalize();
    const flatTangent = new Vector3(tangent.x, 0, tangent.z).normalize();
    const baseSide = new Vector3().crossVectors(UP, flatTangent).normalize();
    const t = index / (points.length - 1);
    const bank = this.bankAt(t);
    const side = baseSide
      .applyQuaternion(new Quaternion().setFromAxisAngle(tangent, bank))
      .normalize();
    const leftY = point.y - side.y * (this.roadWidth / 2);
    const rightY = point.y + side.y * (this.roadWidth / 2);
    const bankLift = Math.max(0, BANK_EDGE_CLEARANCE - Math.min(leftY, rightY));
    lifted.y += bankLift * smoothstep(0.02, 0.12, Math.abs(bank));
    lifted.y = Math.max(lifted.y, 0.02);
    return lifted;
  }
}
