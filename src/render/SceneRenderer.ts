import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
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
import { damp, shortestAngleDelta } from "../core/math";
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
  private readonly frontWheelGroups: Group[] = [];
  private readonly skidMarks: Mesh[] = [];
  private readonly previousSkidPoints: Array<Vector3 | null> = [null, null];
  private readonly skidMaterial = new MeshBasicMaterial({
    color: 0x090b0d,
    transparent: true,
    opacity: 0.32,
    side: DoubleSide,
    depthWrite: false
  });
  private visualYaw: number | null = null;
  private skidAccumulator = 0;

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
    const contact = car.getContact(this.track);
    this.visualYaw ??= car.yaw;
    this.visualYaw += shortestAngleDelta(this.visualYaw, car.yaw) * (1 - Math.exp(-11.5 * dt));
    const carBasis = basisFromYaw(this.visualYaw, contact.sample);
    this.updateCarGroup(this.carGroup, car.position, carBasis);
    this.updateFrontWheels(telemetry.steerInput);
    this.updateWheels(telemetry.speedMps, dt);
    this.updateSkidMarks(car, telemetry, carBasis, dt);

    if (ghostSample) {
      const position = new Vector3(ghostSample.x, ghostSample.y, ghostSample.z);
      const ghostContact = this.track.getClosestContact(position);
      const basis = basisFromYaw(ghostSample.yaw, ghostContact.sample);
      this.updateCarGroup(this.ghostGroup, position, basis);
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

    this.addRumbleCurbs();
    this.addCheckpointArch();
    this.addBridgeStructure();
    this.addBarriers();
    this.addIndustrialScenery();
  }

  private addRumbleCurbs(): void {
    const redMaterial = new MeshStandardMaterial({
      color: 0xb62f2f,
      roughness: 0.68,
      metalness: 0.02
    });
    const whiteMaterial = new MeshStandardMaterial({
      color: 0xe6e8e9,
      roughness: 0.68,
      metalness: 0.02
    });
    const curbGeometry = new BoxGeometry(this.track.curbWidth, 0.18, 8.8);
    const lateral = this.track.roadWidth / 2 + this.track.curbWidth / 2;

    for (let index = 4; index < this.track.samples.length - 4; index += 5) {
      const sample = this.track.samples[index];
      const material = Math.floor(index / 10) % 2 === 0 ? redMaterial : whiteMaterial;
      for (const sign of [-1, 1]) {
        const curb = new Mesh(curbGeometry, material);
        const basis = new Matrix4().makeBasis(sample.side, sample.normal, sample.tangent);
        curb.quaternion.setFromRotationMatrix(basis);
        curb.position
          .copy(sample.center)
          .addScaledVector(sample.side, sign * lateral)
          .addScaledVector(sample.normal, 0.08);
        curb.castShadow = true;
        curb.receiveShadow = true;
        this.scene.add(curb);
      }
    }
  }

  private addCheckpointArch(): void {
    const sample = this.track.getSampleAtS(this.track.checkpointS);
    const paintMaterial = new MeshStandardMaterial({
      color: 0xf0c84b,
      roughness: 0.48,
      metalness: 0.18
    });
    const darkMaterial = new MeshStandardMaterial({
      color: 0x2a3035,
      roughness: 0.62,
      metalness: 0.22
    });
    const basis = new Matrix4().makeBasis(sample.side, sample.normal, sample.tangent);
    const height = 8.2;
    const postOffset = this.track.wallOuterOffset + 0.6;

    for (const sign of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(0.38, height, 0.46), paintMaterial);
      post.quaternion.setFromRotationMatrix(basis);
      post.position
        .copy(sample.center)
        .addScaledVector(sample.side, sign * postOffset)
        .addScaledVector(sample.normal, height / 2);
      post.castShadow = true;
      post.receiveShadow = true;
      this.scene.add(post);
    }

    const beam = new Mesh(new BoxGeometry(postOffset * 2 + 0.65, 0.44, 0.58), paintMaterial);
    beam.quaternion.setFromRotationMatrix(basis);
    beam.position.copy(sample.center).addScaledVector(sample.normal, height);
    beam.castShadow = true;
    beam.receiveShadow = true;
    this.scene.add(beam);

    const cross = new Mesh(new BoxGeometry(postOffset * 2, 0.16, 0.2), darkMaterial);
    cross.quaternion.setFromRotationMatrix(basis);
    cross.position.copy(sample.center).addScaledVector(sample.normal, height - 1.2);
    cross.castShadow = true;
    this.scene.add(cross);
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
      deck.position.copy(sample.center).addScaledVector(sample.normal, -0.72);
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
      beam.position.copy(sample.center).addScaledVector(sample.normal, -1.34);
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
    const inner = this.track.wallInnerOffset;
    const outer = this.track.wallOuterOffset;
    const height = 1.22;

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

    this.addTrainingCourseScenery();
  }

  private addTrainingCourseScenery(): void {
    const coneMaterial = new MeshStandardMaterial({ color: 0xd85b2a, roughness: 0.7, metalness: 0.02 });
    const coneBandMaterial = new MeshStandardMaterial({ color: 0xf3f1e8, roughness: 0.72, metalness: 0.02 });
    const coneGeometry = new ConeGeometry(0.34, 0.9, 14);
    const coneBandGeometry = new CylinderGeometry(0.24, 0.28, 0.12, 14);
    for (const sampleIndex of [34, 42, 50, 58, 382, 394, 406, 548, 560, 572]) {
      const sample = this.track.samples[sampleIndex];
      const sign = sampleIndex < 120 ? -1 : 1;
      const base = sample.center
        .clone()
        .addScaledVector(sample.side, sign * (this.track.wallOuterOffset + 2.6));
      const cone = new Mesh(coneGeometry, coneMaterial);
      cone.position.copy(base).addScaledVector(sample.normal, 0.45);
      cone.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(sample.side, sample.normal, sample.tangent));
      cone.castShadow = true;
      cone.receiveShadow = true;
      this.scene.add(cone);

      const band = new Mesh(coneBandGeometry, coneBandMaterial);
      band.position.copy(base).addScaledVector(sample.normal, 0.54);
      band.quaternion.copy(cone.quaternion);
      band.castShadow = true;
      this.scene.add(band);
    }

    const signMaterial = new MeshStandardMaterial({
      color: 0xe9ecef,
      roughness: 0.56,
      metalness: 0.08
    });
    const signFaceMaterial = new MeshBasicMaterial({
      map: makeTextTexture("BRAKE\nZONE"),
      side: DoubleSide
    });
    for (const sampleIndex of [238, 468]) {
      const sample = this.track.samples[sampleIndex];
      const sign = sampleIndex === 238 ? -1 : 1;
      const post = new Mesh(new BoxGeometry(0.18, 2.1, 0.18), signMaterial);
      const base = sample.center
        .clone()
        .addScaledVector(sample.side, sign * (this.track.wallOuterOffset + 3.3));
      post.position.copy(base).addScaledVector(sample.normal, 1.05);
      post.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(sample.side, sample.normal, sample.tangent));
      post.castShadow = true;
      this.scene.add(post);

      const face = new Mesh(new PlaneGeometry(2.4, 1.25), signFaceMaterial);
      face.position.copy(base).addScaledVector(sample.normal, 2.45);
      face.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(sample.side, sample.normal, sample.tangent));
      this.scene.add(face);
    }

    this.addFenceLine(new Vector3(-92, -0.04, -40), new Vector3(-40, -0.04, 170), 12);
    this.addFenceLine(new Vector3(225, -0.04, -340), new Vector3(425, -0.04, -310), 13);
    this.addFenceLine(new Vector3(520, -0.04, 20), new Vector3(500, -0.04, 235), 11);
  }

  private addFenceLine(start: Vector3, end: Vector3, count: number): void {
    const material = new MeshStandardMaterial({ color: 0x697077, roughness: 0.68, metalness: 0.22 });
    const direction = end.clone().sub(start);
    const length = direction.length();
    const yaw = Math.atan2(direction.x, direction.z);
    const rail = new Mesh(new BoxGeometry(0.12, 0.12, length), material);
    rail.position.copy(start).lerp(end, 0.5).setY(1.18);
    rail.rotation.y = yaw;
    rail.castShadow = true;
    this.scene.add(rail);

    for (let index = 0; index < count; index += 1) {
      const t = count === 1 ? 0 : index / (count - 1);
      const post = new Mesh(new BoxGeometry(0.16, 2.25, 0.16), material);
      post.position.copy(start).lerp(end, t).setY(1.05);
      post.castShadow = true;
      this.scene.add(post);
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
    const addTaperedBox = (
      bottomWidth: number,
      topWidth: number,
      height: number,
      depth: number,
      material: MeshStandardMaterial,
      x: number,
      bottomY: number,
      z: number,
      topFrontInset = 0.12,
      topRearInset = 0.12
    ): Mesh => {
      const mesh = new Mesh(
        createTaperedBoxGeometry(bottomWidth, topWidth, height, depth, topFrontInset, topRearInset),
        material
      );
      mesh.position.set(x, bottomY, z);
      mesh.castShadow = !ghost;
      mesh.receiveShadow = !ghost;
      group.add(mesh);
      return mesh;
    };

    addBox(2.48, 0.22, 4.92, trimMaterial, 0, 0.34, -0.05);
    addTaperedBox(2.5, 2.16, 0.52, 4.62, bodyMaterial, 0, 0.36, -0.08, 0.28, 0.18);
    addTaperedBox(2.08, 1.72, 0.32, 1.82, bodyMaterial, 0, 0.62, 1.36, 0.42, 0.08);
    addTaperedBox(2.16, 1.82, 0.34, 1.25, bodyMaterial, 0, 0.66, -1.62, 0.08, 0.24);
    addTaperedBox(1.58, 1.18, 0.72, 1.32, glassMaterial, 0, 0.8, -0.34, 0.18, 0.22);
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
      const wheelGroup = new Group();
      wheelGroup.position.set(x, y, z);
      group.add(wheelGroup);

      const tire = new Mesh(tireGeometry, tireMaterial);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = !ghost;
      wheelGroup.add(tire);

      const rim = new Mesh(rimGeometry, rimMaterial);
      rim.rotation.z = Math.PI / 2;
      rim.castShadow = !ghost;
      wheelGroup.add(rim);

      if (!ghost) {
        if (z > 0) this.frontWheelGroups.push(wheelGroup);
        this.wheelMeshes.push(tire, rim);
      }
    }

    return group;
  }

  private updateCarGroup(
    group: Group,
    position: Vector3,
    basis: { forward: Vector3; right: Vector3; up: Vector3 }
  ): void {
    const matrix = new Matrix4().makeBasis(basis.right, basis.up, basis.forward);
    group.quaternion.setFromRotationMatrix(matrix);
    group.position.copy(position);
  }

  private updateFrontWheels(steerInput: number): void {
    const angle = steerInput * 0.48;
    for (const group of this.frontWheelGroups) {
      group.rotation.y = damp(group.rotation.y, angle, 18, 1 / 60);
    }
  }

  private updateWheels(speed: number, dt: number): void {
    const spin = speed * dt * 2.8;
    for (const wheel of this.wheelMeshes) {
      wheel.rotation.x += spin;
    }
  }

  private updateSkidMarks(
    car: Car,
    telemetry: CarTelemetry,
    basis: { forward: Vector3; right: Vector3; up: Vector3 },
    dt: number
  ): void {
    this.skidAccumulator += dt;
    const shouldMark =
      telemetry.speedKmh > 58 &&
      (Math.abs(telemetry.steerInput) > 0.24 || telemetry.slipAmount > 0.12 || telemetry.driftAmount > 0.08);

    if (!shouldMark) {
      this.previousSkidPoints[0] = null;
      this.previousSkidPoints[1] = null;
      return;
    }

    if (this.skidAccumulator < 0.035) return;
    this.skidAccumulator = 0;

    const rearOffset = -1.64;
    const halfTrack = 1.08;
    const points = [-halfTrack, halfTrack].map((sideOffset) => {
      const wheelPoint = car.position
        .clone()
        .addScaledVector(basis.forward, rearOffset)
        .addScaledVector(basis.right, sideOffset);
      const contact = this.track.getClosestContact(wheelPoint);
      return contact.surfacePoint.addScaledVector(contact.sample.normal, 0.035);
    });

    points.forEach((point, index) => {
      const previous = this.previousSkidPoints[index];
      if (previous && point.distanceToSquared(previous) > 0.0025) {
        const mark = new Mesh(createSkidMarkGeometry(previous, point, basis.up, 0.16), this.skidMaterial);
        mark.renderOrder = 1;
        this.scene.add(mark);
        this.skidMarks.push(mark);
        while (this.skidMarks.length > 340) {
          const old = this.skidMarks.shift();
          if (old) {
            this.scene.remove(old);
            old.geometry.dispose();
          }
        }
      }
      this.previousSkidPoints[index] = point;
    });
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

function createTaperedBoxGeometry(
  bottomWidth: number,
  topWidth: number,
  height: number,
  depth: number,
  topFrontInset: number,
  topRearInset: number
): BufferGeometry {
  const bottomHalf = bottomWidth / 2;
  const topHalf = topWidth / 2;
  const front = depth / 2;
  const rear = -depth / 2;
  const topFront = front - topFrontInset;
  const topRear = rear + topRearInset;
  const vertices = new Float32Array([
    -bottomHalf, 0, rear,
    bottomHalf, 0, rear,
    bottomHalf, 0, front,
    -bottomHalf, 0, front,
    -topHalf, height, topRear,
    topHalf, height, topRear,
    topHalf, height, topFront,
    -topHalf, height, topFront
  ]);
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    3, 2, 6, 3, 6, 7,
    1, 0, 4, 1, 4, 5,
    0, 3, 7, 0, 7, 4,
    2, 1, 5, 2, 5, 6
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createSkidMarkGeometry(start: Vector3, end: Vector3, up: Vector3, width: number): BufferGeometry {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length < 0.001) direction.set(0, 0, 1);
  else direction.divideScalar(length);
  const side = new Vector3().crossVectors(up, direction).normalize().multiplyScalar(width / 2);
  const vertices = new Float32Array([
    start.x - side.x, start.y - side.y, start.z - side.z,
    start.x + side.x, start.y + side.y, start.z + side.z,
    end.x - side.x, end.y - side.y, end.z - side.z,
    end.x + side.x, end.y + side.y, end.z + side.z
  ]);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(vertices, 3));
  geometry.setIndex([0, 2, 1, 1, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
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
