import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer
} from "three";
import type { Car, CarTelemetry } from "../game/Car";
import type { GhostSample } from "../game/Storage";
import type { Track, TrackSample } from "../game/Track";

const CLEAR_COLOR = new Color(0xdfe5ea);

export class SceneRenderer {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(62, 1, 0.1, 1200);
  readonly renderer: WebGLRenderer;

  private readonly carGroup: Group;
  private readonly ghostGroup: Group;
  private readonly cameraTarget = new Vector3();
  private readonly cameraPosition = new Vector3(0, 7, -14);
  private readonly wheelMeshes: Mesh[] = [];

  constructor(canvas: HTMLCanvasElement, private readonly track: Track) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(CLEAR_COLOR, 1);
    this.renderer.shadowMap.enabled = true;
    this.scene.background = CLEAR_COLOR;

    this.addLighting();
    this.addWorld();
    this.carGroup = this.createCarModel(false);
    this.ghostGroup = this.createCarModel(true);
    this.ghostGroup.visible = false;
    this.scene.add(this.carGroup, this.ghostGroup);

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  update(car: Car, telemetry: CarTelemetry, ghostSample: GhostSample | null, dt: number): void {
    this.updateCarGroup(this.carGroup, car.position, car.yaw, car.getRenderBasis(this.track));
    this.updateWheels(telemetry.speedMps, dt);

    if (ghostSample) {
      const position = new Vector3(ghostSample.x, ghostSample.y, ghostSample.z);
      const contact = this.track.getClosestContact(position);
      const basis = basisFromYaw(ghostSample.yaw, contact.sample);
      this.updateCarGroup(this.ghostGroup, position, ghostSample.yaw, basis);
      this.ghostGroup.visible = true;
    } else {
      this.ghostGroup.visible = false;
    }

    this.updateCamera(car, dt);
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    this.renderer.setSize(width, height, false);
  }

  private addLighting(): void {
    const ambient = new AmbientLight(0xffffff, 1.35);
    this.scene.add(ambient);

    const sun = new DirectionalLight(0xffffff, 2.6);
    sun.position.set(-120, 170, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 420;
    sun.shadow.camera.left = -180;
    sun.shadow.camera.right = 180;
    sun.shadow.camera.top = 180;
    sun.shadow.camera.bottom = -180;
    this.scene.add(sun);
  }

  private addWorld(): void {
    const ground = new Mesh(
      new PlaneGeometry(720, 720, 1, 1),
      new MeshStandardMaterial({ color: 0x51614d, roughness: 0.95, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(75, -0.08, -10);
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.scene.add(this.track.createRoadMesh());
    this.scene.add(this.track.createPaintedLine(this.track.startS + 1, 0xf3f5f7, 2.6));
    this.scene.add(this.track.createPaintedLine(this.track.checkpointS, 0xf5c542, 3.6));
    this.scene.add(this.track.createPaintedLine(this.track.finishS, 0xf3f5f7, 3.2));

    this.addBarriers();
    this.addIndustrialScenery();
  }

  private addBarriers(): void {
    const barrierMaterial = new MeshStandardMaterial({
      color: 0xd7d9db,
      roughness: 0.64,
      metalness: 0.08
    });
    const railGeometry = new BoxGeometry(0.45, 0.55, 3.8);

    for (let index = 4; index < this.track.samples.length - 4; index += 3) {
      const sample = this.track.samples[index];
      for (const sign of [-1, 1]) {
        const rail = new Mesh(railGeometry, barrierMaterial);
        const basis = new Matrix4().makeBasis(sample.side, sample.normal, sample.tangent);
        rail.quaternion.setFromRotationMatrix(basis);
        rail.position
          .copy(sample.center)
          .addScaledVector(sample.side, sign * this.track.barrierOffset)
          .addScaledVector(sample.normal, 0.28);
        rail.castShadow = true;
        rail.receiveShadow = true;
        this.scene.add(rail);
      }
    }
  }

  private addIndustrialScenery(): void {
    const buildingMaterial = new MeshStandardMaterial({
      color: 0xa6adb3,
      roughness: 0.85,
      metalness: 0.12
    });
    const darkMaterial = new MeshStandardMaterial({
      color: 0x4c5358,
      roughness: 0.8,
      metalness: 0.18
    });

    const hangar = new Mesh(new BoxGeometry(56, 14, 26), buildingMaterial);
    hangar.position.set(-44, 7, 88);
    hangar.castShadow = true;
    hangar.receiveShadow = true;
    this.scene.add(hangar);

    const controlRoom = new Mesh(new BoxGeometry(20, 9, 18), darkMaterial);
    controlRoom.position.set(104, 4.5, -62);
    controlRoom.castShadow = true;
    controlRoom.receiveShadow = true;
    this.scene.add(controlRoom);

    const boardTexture = makeTextTexture("LEADERBOARD\nCOMING SOON");
    const board = new Mesh(
      new PlaneGeometry(22, 8),
      new MeshBasicMaterial({ map: boardTexture, side: DoubleSide })
    );
    board.position.set(116, 8.8, -88);
    board.rotation.y = -0.35;
    this.scene.add(board);

    const poleMaterial = new MeshStandardMaterial({ color: 0x596169, roughness: 0.52, metalness: 0.35 });
    const poleGeometry = new CylinderGeometry(0.28, 0.34, 16, 10);
    for (const sampleIndex of [28, 76, 126, 188, 248, 310]) {
      const sample = this.track.samples[sampleIndex];
      for (const sign of [-1, 1]) {
        const pole = new Mesh(poleGeometry, poleMaterial);
        pole.position
          .copy(sample.center)
          .addScaledVector(sample.side, sign * (this.track.barrierOffset + 5))
          .add(new Vector3(0, 8, 0));
        pole.castShadow = true;
        this.scene.add(pole);
      }
    }
  }

  private createCarModel(ghost: boolean): Group {
    const group = new Group();
    const bodyMaterial = new MeshStandardMaterial({
      color: ghost ? 0x9fb8c8 : 0xbfc6cc,
      roughness: 0.43,
      metalness: ghost ? 0.05 : 0.25,
      transparent: ghost,
      opacity: ghost ? 0.34 : 1
    });
    const glassMaterial = new MeshStandardMaterial({
      color: ghost ? 0xbad3e1 : 0x23313b,
      roughness: 0.18,
      metalness: 0.1,
      transparent: ghost,
      opacity: ghost ? 0.22 : 1
    });
    const tireMaterial = new MeshStandardMaterial({
      color: ghost ? 0x6f8794 : 0x171a1d,
      roughness: 0.82,
      metalness: 0.02,
      transparent: ghost,
      opacity: ghost ? 0.26 : 1
    });

    const body = new Mesh(new BoxGeometry(2.4, 0.62, 4.35), bodyMaterial);
    body.position.y = 0.58;
    body.castShadow = !ghost;
    body.receiveShadow = !ghost;
    group.add(body);

    const nose = new Mesh(new BoxGeometry(2.05, 0.36, 1.35), bodyMaterial);
    nose.position.set(0, 0.47, 1.72);
    nose.castShadow = !ghost;
    group.add(nose);

    const cabin = new Mesh(new BoxGeometry(1.55, 0.58, 1.32), glassMaterial);
    cabin.position.set(0, 1.02, -0.42);
    cabin.castShadow = !ghost;
    group.add(cabin);

    const wheelGeometry = new CylinderGeometry(0.38, 0.38, 0.42, 18);
    const wheelPositions = [
      [-1.28, 0.32, 1.38],
      [1.28, 0.32, 1.38],
      [-1.28, 0.32, -1.48],
      [1.28, 0.32, -1.48]
    ] as const;
    for (const [x, y, z] of wheelPositions) {
      const wheel = new Mesh(wheelGeometry, tireMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, y, z);
      wheel.castShadow = !ghost;
      group.add(wheel);
      if (!ghost) this.wheelMeshes.push(wheel);
    }

    return group;
  }

  private updateCarGroup(
    group: Group,
    position: Vector3,
    yaw: number,
    basis: { forward: Vector3; right: Vector3; up: Vector3 }
  ): void {
    const matrix = new Matrix4().makeBasis(basis.right, basis.up, basis.forward);
    group.quaternion.setFromRotationMatrix(matrix);
    group.position.copy(position);
    group.userData.yaw = yaw;
  }

  private updateWheels(speed: number, dt: number): void {
    const spin = speed * dt * 2.8;
    for (const wheel of this.wheelMeshes) {
      wheel.rotation.x += spin;
    }
  }

  private updateCamera(car: Car, dt: number): void {
    const contact = car.getContact(this.track);
    const forward = car.getForward();
    const velocity = car.velocity.clone();
    const travelDir = velocity.lengthSq() > 4 ? velocity.normalize() : forward;
    travelDir.addScaledVector(contact.sample.normal, -travelDir.dot(contact.sample.normal)).normalize();

    const desiredPosition = car.position
      .clone()
      .addScaledVector(travelDir, -14.4)
      .addScaledVector(contact.sample.normal, 5.3);
    const desiredTarget = car.position
      .clone()
      .addScaledVector(travelDir, 8.2)
      .addScaledVector(contact.sample.normal, 1.35);

    const positionAlpha = 1 - Math.exp(-5.8 * dt);
    const targetAlpha = 1 - Math.exp(-8.2 * dt);
    this.cameraPosition.lerp(desiredPosition, positionAlpha);
    this.cameraTarget.lerp(desiredTarget, targetAlpha);
    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(this.cameraTarget);
  }
}

function basisFromYaw(yaw: number, sample: TrackSample): { forward: Vector3; right: Vector3; up: Vector3 } {
  const up = sample.normal.clone().normalize();
  const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  forward.addScaledVector(up, -forward.dot(up)).normalize();
  const right = new Vector3().crossVectors(up, forward).normalize();
  return { forward, right, up };
}

function makeTextTexture(text: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable");

  context.fillStyle = "#1e2429";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#d9dee2";
  context.lineWidth = 12;
  context.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
  context.fillStyle = "#eef2f5";
  context.font = "700 82px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    context.fillText(line, canvas.width / 2, canvas.height / 2 - 58 + index * 112);
  });

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
}

