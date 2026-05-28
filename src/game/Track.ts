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

export interface TrackDefinition {
  id: string;
  label: string;
  name: string;
  menuDescription: string;
  sampleCount: number;
  checkpointRatios: readonly number[];
  finishPadding: number;
  tension: number;
  points: Vector3[];
  bankAt: (t: number) => number;
}

const UP = new Vector3(0, 1, 0);
const BANK_EDGE_CLEARANCE = 0.18;

export const TRACK_DEFINITIONS: TrackDefinition[] = [
  {
    id: "banked-shakedown",
    label: "Track 01",
    name: "Test Track A",
    menuDescription: "30-60 sec target - model ghost - checkpoint split",
    sampleCount: 640,
    checkpointRatios: [0.46],
    finishPadding: 7,
    tension: 0.35,
    points: [
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
    bankAt: bankTestTrackA
  },
  {
    id: "test-track-b",
    label: "Track 02",
    name: "Test Track B",
    menuDescription: "Long route - model ghost - higher speed",
    sampleCount: 1280,
    checkpointRatios: [0.5],
    finishPadding: 8,
    tension: 0.32,
    points: scaleTrackPoints([
      new Vector3(0, 0, 0),
      new Vector3(0, 0, 135),
      new Vector3(46, 2, 260),
      new Vector3(188, 7, 348),
      new Vector3(356, 12, 326),
      new Vector3(520, 12, 228),
      new Vector3(622, 8, 76),
      new Vector3(630, 4, -116),
      new Vector3(534, 1, -282),
      new Vector3(360, 0, -362),
      new Vector3(184, 0, -362),
      new Vector3(74, 0, -498),
      new Vector3(112, 4, -664),
      new Vector3(286, 9, -792),
      new Vector3(520, 13, -816),
      new Vector3(746, 12, -724),
      new Vector3(904, 8, -552),
      new Vector3(946, 4, -344),
      new Vector3(850, 1, -146),
      new Vector3(676, 0, -54),
      new Vector3(610, 0, 112),
      new Vector3(718, 4, 280),
      new Vector3(928, 9, 382),
      new Vector3(1184, 12, 350),
      new Vector3(1368, 10, 202),
      new Vector3(1428, 5, 0),
      new Vector3(1354, 1, -206),
      new Vector3(1174, 0, -342),
      new Vector3(1038, 0, -506),
      new Vector3(1112, 4, -682),
      new Vector3(1320, 8, -806),
      new Vector3(1588, 9, -768),
      new Vector3(1792, 5, -602),
      new Vector3(1884, 1, -374),
      new Vector3(1824, 0, -130),
      new Vector3(1656, 0, 54),
      new Vector3(1612, 0, 244),
      new Vector3(1764, 2, 418),
      new Vector3(2028, 0, 514)
    ], 0.52),
    bankAt: bankTestTrackB
  },
  {
    id: "technical-bowl",
    label: "Track 03",
    name: "Test Track C",
    menuDescription: "Technical speed control - two checkpoints - banked bowl",
    sampleCount: 1440,
    checkpointRatios: [0.35, 0.72],
    finishPadding: 9,
    tension: 0.3,
    points: scaleTrackPoints([
      new Vector3(0, 0, 0),
      new Vector3(0, 0, 210),
      new Vector3(42, 0, 365),
      new Vector3(-24, 0, 515),
      new Vector3(48, 1, 660),
      new Vector3(190, 4, 795),
      new Vector3(390, 8, 780),
      new Vector3(560, 13, 645),
      new Vector3(632, 17, 450),
      new Vector3(555, 20, 262),
      new Vector3(696, 23, 112),
      new Vector3(875, 25, 225),
      new Vector3(1068, 26, 82),
      new Vector3(1235, 25, -92),
      new Vector3(1316, 24, -332),
      new Vector3(1198, 22, -585),
      new Vector3(934, 20, -716),
      new Vector3(632, 18, -638),
      new Vector3(460, 15, -430),
      new Vector3(470, 12, -180),
      new Vector3(610, 9, 30),
      new Vector3(790, 6, -28),
      new Vector3(945, 3, 160),
      new Vector3(1130, 1, 132),
      new Vector3(1320, 0, 255),
      new Vector3(1515, 0, 410),
      new Vector3(1710, 0, 350),
      new Vector3(1905, 0, 508)
    ], 0.72),
    bankAt: bankTestTrackC
  }
];

export function getTrackDefinition(id: string | null | undefined): TrackDefinition {
  return TRACK_DEFINITIONS.find((track) => track.id === id) ?? TRACK_DEFINITIONS[0];
}

function scaleTrackPoints(points: Vector3[], horizontalScale: number): Vector3[] {
  return points.map((point) => new Vector3(point.x * horizontalScale, point.y, point.z * horizontalScale));
}

export class Track {
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly menuDescription: string;
  readonly roadWidth = 22;
  readonly shoulderWidth = 3.5;
  readonly curbWidth = 1.05;
  readonly wallInnerOffset = this.roadWidth / 2 + this.curbWidth;
  readonly wallOuterOffset = this.wallInnerOffset + 0.75;
  readonly barrierOffset = (this.wallInnerOffset + this.wallOuterOffset) / 2;
  readonly checkpointSs: readonly number[];
  readonly checkpointS: number;
  readonly finishS: number;
  readonly startS = 5;
  readonly samples: TrackSample[];
  readonly length: number;
  private readonly definition: TrackDefinition;

  constructor(trackId?: string | null) {
    this.definition = getTrackDefinition(trackId);
    this.id = this.definition.id;
    this.label = this.definition.label;
    this.name = this.definition.name;
    this.menuDescription = this.definition.menuDescription;
    this.samples = this.buildSamples();
    this.length = this.samples[this.samples.length - 1].s;
    this.checkpointSs = this.definition.checkpointRatios.map((ratio) => this.length * ratio);
    this.checkpointS = this.checkpointSs[0] ?? this.length * 0.5;
    this.finishS = this.length - this.definition.finishPadding;
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

  getClosestContact(position: Vector3, hintS?: number, searchWindow = 90): TrackContact {
    let best = this.samples[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    const hinted = hintS != null && Number.isFinite(hintS);
    const centerIndex = hinted ? this.findSampleIndexAtS(hintS) : 0;
    let startIndex = 0;
    let endIndex = this.samples.length - 1;

    if (hinted) {
      const minS = Math.max(0, hintS - searchWindow);
      const maxS = Math.min(this.length, hintS + searchWindow);
      startIndex = centerIndex;
      while (startIndex > 0 && this.samples[startIndex].s > minS) startIndex -= 1;
      endIndex = centerIndex;
      while (endIndex < this.samples.length - 1 && this.samples[endIndex].s < maxS) {
        endIndex += 1;
      }
    }

    for (let index = startIndex; index <= endIndex; index += 1) {
      const sample = this.samples[index];
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

  private findSampleIndexAtS(s: number): number {
    const clampedS = clamp(s, 0, this.length);
    let low = 0;
    let high = this.samples.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.samples[mid].s < clampedS) low = mid + 1;
      else high = mid;
    }
    return low;
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
      this.definition.points,
      false,
      "catmullrom",
      this.definition.tension
    );

    const rawPoints = curve.getSpacedPoints(this.definition.sampleCount - 1);
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
    return this.definition.bankAt(t);
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

function bankTestTrackA(t: number): number {
  const rightTurn = smoothstep(0.12, 0.26, t) - smoothstep(0.48, 0.61, t);
  const downhillLeft = smoothstep(0.40, 0.48, t) - smoothstep(0.58, 0.67, t);
  const bridgeSweeper = smoothstep(0.63, 0.72, t) - smoothstep(0.82, 0.9, t);
  return rightTurn * -0.18 + downhillLeft * 0.08 + bridgeSweeper * -0.12;
}

function bankTestTrackB(t: number): number {
  const opener = smoothstep(0.05, 0.11, t) - smoothstep(0.16, 0.24, t);
  const ridgeSweeper = smoothstep(0.24, 0.32, t) - smoothstep(0.40, 0.48, t);
  const returnClimb = smoothstep(0.50, 0.58, t) - smoothstep(0.64, 0.72, t);
  const finalBend = smoothstep(0.74, 0.82, t) - smoothstep(0.90, 0.97, t);
  return opener * 0.08 + ridgeSweeper * -0.14 + returnClimb * 0.12 + finalBend * -0.1;
}

function bankTestTrackC(t: number): number {
  const loadedBrakeRight = smoothstep(0.12, 0.2, t) - smoothstep(0.27, 0.36, t);
  const uphillEsses = smoothstep(0.31, 0.39, t) - smoothstep(0.47, 0.55, t);
  const bankedBowl = smoothstep(0.46, 0.55, t) - smoothstep(0.67, 0.78, t);
  const downhillChicane = smoothstep(0.72, 0.78, t) - smoothstep(0.84, 0.91, t);
  return loadedBrakeRight * -0.1 + uphillEsses * 0.09 + bankedBowl * 0.19 + downhillChicane * -0.08;
}
