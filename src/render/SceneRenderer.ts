import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
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
    sun.shadow.camera.far = 720;
    sun.shadow.camera.left = -420;
    sun.shadow.camera.right = 520;
    sun.shadow.camera.top = 420;
    sun.shadow.camera.bottom = -520;
    this.scene.add(sun);
  }

  private addWorld(): void {
    const ground = new Mesh(
      new PlaneGeometry(1100, 1100, 1, 1),
      new MeshStandardMaterial({ color: 0x51614d, roughness: 0.95, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(190, -0.08, -30);
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.scene.add(this.track.createRoadMesh());
    this.scene.add(this.track.createPaintedLine(this.track.startS + 1, 0xf3f5f7, 2.6));
    this.scene.add(this.track.createPaintedLine(this.track.checkpointS, 0xf5c542, 3.6));
    this.scene.add(this.track.createPaintedLine(this.track.finishS, 0xf3f5f7, 3.2));

    this.addBridgeStructure();
    this.addBarriers();
    this.addIndustrialScenery();
  }

  private addBridgeStructure(): void {
    const deckMaterial = new MeshStandardMaterial({
      color: 0x68727a,
      roughness: 0.82,
      metalness: 0.08
    });
    const columnMaterial = new MeshStandardMaterial({
      color: 0x9aa1a7,
      roughness: 0.74,
      metalness: 0.06
    });
    const deckGeometry = new BoxGeometry(this.track.roadWidth + 4.2, 0.42, 7.2);
    const crossBeamGeometry = new BoxGeometry(this.track.roadWidth + 6.5, 0.5, 1.1);
    const groundY = -0.08;

    for (let index = 8; index < this.track.samples.length - 8; index += 8) {
      const sample = this.track.samples[index];
      if (sample.center.y < 1.3) continue;

      const deck = new Mesh(deckGeometry, deckMaterial);
      const basis = new Matrix4().makeBasis(sample.side, sample.normal, sample.tangent);
      deck.quaternion.setFromRotationMatrix(basis);
      deck.position.copy(sample.center).addScaledVector(sample.normal, -0.36);
      deck.castShadow = true;
      deck.receiveShadow = true;
      this.scene.add(deck);
    }

    for (let index = 20; index < this.track.samples.length - 20; index += 28) {
      const sample = this.track.samples[index];
      if (sample.center.y < 2.3) continue;

      const beam = new Mesh(crossBeamGeometry, columnMaterial);
      const basis = new Matrix4().makeBasis(sample.side, sample.normal, sample.tangent);
      beam.quaternion.setFromRotationMatrix(basis);
      beam.position.copy(sample.center).addScaledVector(sample.normal, -0.82);
      beam.castShadow = true;
      beam.receiveShadow = true;
      this.scene.add(beam);

      for (const sign of [-1, 1]) {
        const height = Math.max(1.2, sample.center.y - groundY - 0.65);
        const column = new Mesh(new CylinderGeometry(0.38, 0.48, height, 10), columnMaterial);
        const anchor = sample.center
          .clone()
          .addScaledVector(sample.side, sign * (this.track.roadWidth / 2 - 1.4));
        column.position.set(anchor.x, groundY + height / 2, anchor.z);
        column.castShadow = true;
        column.receiveShadow = true;
        this.scene.add(column);
      }
    }
  }

  private addBarriers(): void {
    const wallMaterial = new MeshStandardMaterial({
      color: 0xb9bec3,
      roughness: 0.72,
      metalness: 0.06,
      side: DoubleSide
    });

    for (const sign of [-1, 1]) {
      const wall = new Mesh(this.createBarrierGeometry(sign), wallMaterial);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(wall);
    }
  }

  private createBarrierGeometry(sign: number): BufferGeometry {
    const vertices: number[] = [];
    const indices: number[] = [];
    const inner = this.track.barrierOffset - 0.55;
    const outer = this.track.barrierOffset + 0.45;
    const height = 1.05;

    this.track.samples.forEach((sample, index) => {
      const innerBase = this.track
        .getSurfacePoint(sample, sign * inner)
        .addScaledVector(sample.normal, 0.03);
      const outerBase = this.track
        .getSurfacePoint(sample, sign * outer)
        .addScaledVector(sample.normal, 0.03);
      const innerTop = innerBase.clone().addScaledVector(sample.normal, height);
      const outerTop = outerBase.clone().addScaledVector(sample.normal, height);
      vertices.push(
        innerBase.x, innerBase.y, innerBase.z,
        innerTop.x, innerTop.y, innerTop.z,
        outerTop.x, outerTop.y, outerTop.z,
        outerBase.x, outerBase.y, outerBase.z
      );

      if (index < this.track.samples.length - 1) {
        const base = index * 4;
        const next = base + 4;
        indices.push(
          base, next, base + 1,
          base + 1, next, next + 1,
          base + 1, next + 1, base + 2,
          base + 2, next + 1, next + 2,
          base + 2, next + 2, base + 3,
          base + 3, next + 2, next + 3
        );
      }
    });

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
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

    const poleMaterial = new MeshStandardMaterial({
      color: 0x596169,
      roughness: 0.52,
      metalness: 0.35
    });
    const poleSampleIndexes = [28, 76, 126, 188, 248, 310, 396, 486, 570];
    const groundY = -0.08;
    for (const sampleIndex of poleSampleIndexes) {
      const sample = this.track.samples[sampleIndex];
      for (const sign of [-1, 1]) {
        const poleTopY = sample.center.y + 16;
        const poleHeight = poleTopY - groundY;
        const pole = new Mesh(new CylinderGeometry(0.28, 0.34, poleHeight, 10), poleMaterial);
        const anchor = sample.center
          .clone()
          .addScaledVector(sample.side, sign * (this.track.barrierOffset + 5));
        pole.position
          .copy(anchor)
          .setY(groundY + poleHeight / 2);
        pole.castShadow = true;
        pole.receiveShadow = true;
        this.scene.add(pole);
      }
    }
  }

  private createCarModel(ghost: boolean): Group {
    const group = new Group();
    const bodyMaterial = new MeshStandardMaterial({
      color: ghost ? 0xa9c0cd : 0xc9d0d5,
      roughness: 0.39,
      metalness: ghost ? 0.05 : 0.32,
      transparent: ghost,
      opacity: ghost ? 0.34 : 1
    });
    const glassMaterial = new MeshStandardMaterial({
      color: ghost ? 0xbad3e1 : 0x1b2a35,
      roughness: 0.18,
      metalness: 0.1,
      transparent: ghost,
      opacity: ghost ? 0.22 : 1
    });
    const trimMaterial = new MeshStandardMaterial({
      color: ghost ? 0x6f8794 : 0x252a2f,
      roughness: 0.62,
      metalness: ghost ? 0.04 : 0.18,
      transparent: ghost,
      opacity: ghost ? 0.24 : 1
    });
    const tireMaterial = new MeshStandardMaterial({
      color: ghost ? 0x6f8794 : 0x111417,
      roughness: 0.82,
      metalness: 0.02,
      transparent: ghost,
      opacity: ghost ? 0.26 : 1
    });
    const rimMaterial = new MeshStandardMaterial({
      color: ghost ? 0x91a6b2 : 0xaeb5bb,
      roughness: 0.36,
      metalness: ghost ? 0.04 : 0.42,
      transparent: ghost,
      opacity: ghost ? 0.24 : 1
    });
    const headlightMaterial = new MeshStandardMaterial({
      color: ghost ? 0xbad3e1 : 0xe6edf1,
      emissive: ghost ? 0x000000 : 0xcbd6df,
      emissiveIntensity: ghost ? 0 : 0.28,
      roughness: 0.22,
      transparent: ghost,
      opacity: ghost ? 0.2 : 1
    });
    const tailLightMaterial = new MeshStandardMaterial({
      color: ghost ? 0x9fb8c8 : 0xbd3030,
      emissive: ghost ? 0x000000 : 0x8c1717,
      emissiveIntensity: ghost ? 0 : 0.22,
      roughness: 0.34,
      transparent: ghost,
      opacity: ghost ? 0.2 : 1
    });

    const addBox = (
      width: number,
      height: number,
      depth: number,
      material: MeshStandardMaterial,
      x: number,
      y: number,
      z: number
    ): Mesh => {
      const mesh = new Mesh(new BoxGeometry(width, height, depth), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = !ghost;
      mesh.receiveShadow = !ghost;
      group.add(mesh);
      return mesh;
    };

    addBox(2.48, 0.22, 4.92, trimMaterial, 0, 0.34, -0.05);
    addBox(2.34, 0.48, 4.52, bodyMaterial, 0, 0.56, -0.08);
    addBox(2.02, 0.34, 1.72, bodyMaterial, 0, 0.68, 1.42);
    addBox(2.12, 0.36, 1.18, bodyMaterial, 0, 0.72, -1.62);
    addBox(1.48, 0.68, 1.26, glassMaterial, 0, 1.02, -0.32);
    addBox(1.28, 0.12, 0.95, trimMaterial, 0, 1.4, -0.34);
    addBox(2.38, 0.18, 0.22, trimMaterial, 0, 0.38, 2.36);
    addBox(2.28, 0.2, 0.24, trimMaterial, 0, 0.46, -2.42);
    addBox(2.75, 0.08, 0.42, trimMaterial, 0, 1.1, -2.2);
    addBox(0.14, 0.52, 0.12, trimMaterial, -0.86, 0.88, -2.05);
    addBox(0.14, 0.52, 0.12, trimMaterial, 0.86, 0.88, -2.05);
    addBox(0.42, 0.14, 0.08, headlightMaterial, -0.58, 0.67, 2.63);
    addBox(0.42, 0.14, 0.08, headlightMaterial, 0.58, 0.67, 2.63);
    addBox(0.34, 0.14, 0.08, tailLightMaterial, -0.66, 0.65, -2.66);
    addBox(0.34, 0.14, 0.08, tailLightMaterial, 0.66, 0.65, -2.66);
    addBox(0.16, 0.18, 2.72, trimMaterial, -1.26, 0.43, -0.08);
    addBox(0.16, 0.18, 2.72, trimMaterial, 1.26, 0.43, -0.08);

    const tireGeometry = new CylinderGeometry(0.43, 0.43, 0.48, 24);
    const rimGeometry = new CylinderGeometry(0.22, 0.22, 0.5, 18);
    const wheelPositions = [
      [-1.26, 0.39, 1.42],
      [1.26, 0.39, 1.42],
      [-1.26, 0.39, -1.55],
      [1.26, 0.39, -1.55]
    ] as const;
    for (const [x, y, z] of wheelPositions) {
      const tire = new Mesh(tireGeometry, tireMaterial);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(x, y, z);
      tire.castShadow = !ghost;
      group.add(tire);

      const rim = new Mesh(rimGeometry, rimMaterial);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(x, y, z);
      rim.castShadow = !ghost;
      group.add(rim);

      if (!ghost) {
        this.wheelMeshes.push(tire, rim);
      }
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
