// Peanut, the plush character from github.com/dustinmichels/peanut, trimmed
// to what the writing buddy needs: body, face, legs, hats, perching on a
// ledge, walking, bouncing and blinking. Boots, the mustache and material
// modes are left behind; the stubby arms, headphones, jamming, joyful jumps
// and poking at things are the buddy's own.

import * as THREE from "three";
import { fbm3D } from "./noise";
import {
  createFleeceTextures,
  createCorduroyTextures,
  createContactShadowTexture,
  type CorduroyTextureBundle,
} from "./textureGenerator";
import { createBirthdayHat, createCowboyHat, createHeadphones, type HatKind } from "./hats";

export interface PeanutModelHandle {
  group: THREE.Group;
  // Rides along on the body at the centre of his smile, so the speech bubble
  // can point at it through every pose.
  mouth: THREE.Object3D;
  // Advance the pose. bounceProgress runs 0→1 during a bounce, else 0;
  // blinkProgress likewise during a blink.
  animate: (
    time: number,
    bounceProgress: number,
    blinkProgress: number,
    deltaSeconds: number,
  ) => void;
  // Perch on the ledge (y = 0) with legs dangling below it, or stand on it.
  setSitting: (sitting: boolean) => void;
  // Walk in place facing screen-left (-1) or screen-right (1); 0 stops and
  // turns back to the camera. Moving him across the screen is the caller's job.
  walk: (direction: -1 | 0 | 1) => void;
  // Pop a hat on (swapping out any other) or, with null, take it off.
  setHat: (kind: HatKind | null) => void;
  // Nod, sway and tap along to the beat, one hand on his headphones.
  setJamming: (jamming: boolean) => void;
  // Leap for joy (JUMP_MS long), arms flung up; twirl spins him round in the air.
  jump: (twirl: boolean) => void;
  // Turn his back to the camera, or back round again.
  setFacingAway: (away: boolean) => void;
  // Turn a little to screen-right and look up, hand on chin.
  setInspecting: (inspecting: boolean) => void;
  // Hop and reach up and out to screen-right with the arm on that side, to
  // prod whatever's above him there (POKE_MS long, touching it POKE_TOUCH_MS in).
  poke: () => void;
  dispose: () => void;
}

const JUMP_S = 1.0;
const JUMP_CROUCH = 0.18; // share of the jump spent crouching, then...
const JUMP_LAND = 0.8; // ...in the air until this share, then landing
const JUMP_HEIGHT = 0.7;
const POKE_S = 1.1;
const POKE_TOUCH = 0.45; // share of the poke at the top of its hop
const POKE_HOP = 0.9; // as high as he can go without his head leaving the stage
// Arms only come out for moves that need them, sprouting from his shoulders,
// and stay out this long after the last such move so a run of them doesn't flicker.
const ARMS_LINGER_S = 0.4;
export const JUMP_MS = JUMP_S * 1000;
export const POKE_MS = POKE_S * 1000;
export const POKE_TOUCH_MS = POKE_S * POKE_TOUCH * 1000;
const INSPECT_TURN = 0.45; // how far he turns toward screen-right to inspect
const BEAT_HZ = 2; // 120 bpm in his headphones

// The shoulder socket on the x > 0 side, in bodyContainer space: at the top
// of the lower bulb, a little forward. The other is its mirror image.
const SHOULDER = new THREE.Vector3(0.76, 1.86, 0.08);

// Standing & perched pose transform definitions. Perched, the bottom of the
// body (local y 0.75, squashed to ~0.71) rests on the ledge.
const STAND_BODY_POS = new THREE.Vector3(0, 0, 0);
const PERCH_BODY_POS = new THREE.Vector3(0, -0.71, -0.08);

// Hip joint anchor locations in bodyContainer local space (embedded in the lower body bulb)
const HIP_RIGHT_LOCAL = new THREE.Vector3(0.2, 0.94, 0.04);
const HIP_LEFT_LOCAL = new THREE.Vector3(-0.2, 0.94, 0.04);

// Vector from foot/origin to hip joint in legGroup local space
const LEG_HIP_OFFSET = new THREE.Vector3(0, 0.95, -0.01);

const STAND_RIGHT_LEG_QUAT = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-0.02, 0.04, -0.02),
);
const STAND_LEFT_LEG_QUAT = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-0.02, -0.04, 0.02),
);

// Perched leg transforms: legs hang over the ledge, feet a little forward and
// splayed, kicking gently out of step.
const PERCH_RIGHT_LEG_QUAT = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-0.45, 0.08, -0.07, "YXZ"),
);
const PERCH_LEFT_LEG_QUAT = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-0.45, -0.08, 0.07, "YXZ"),
);

const STAND_RIGHT_FOOT_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
const STAND_LEFT_FOOT_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));

// Perched feet droop, toes pointing a little down.
const PERCH_RIGHT_FOOT_QUAT = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0.7, 0.1, 0, "YXZ"),
);
const PERCH_LEFT_FOOT_QUAT = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0.7, -0.1, 0, "YXZ"),
);

// Facing while walking: the camera sits at yaw ~0.37 rad, so ±π/2 from there
// is profile; pulled 0.35 rad back toward the camera to keep his face in view.
const CAMERA_YAW = 0.37;
const WALK_HEADING = Math.PI / 2 - 0.35;
const STEP_HZ = 1.6; // full gait cycles per second

const tempTargetHipR = new THREE.Vector3();
const tempTargetHipL = new THREE.Vector3();
const tempLegVecR = new THREE.Vector3();
const tempLegVecL = new THREE.Vector3();
function smoothstep(min: number, max: number, value: number): number {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
}
const tempBounceEuler = new THREE.Euler();
const tempBounceQuat = new THREE.Quaternion();
// Generate organic peanut body geometry with surface lobe pinching and fluffy vertex displacements
function createPeanutBodyGeometry(radialSegments = 96, heightSegments = 120): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const bodyBaseY = 0.75;
  const bodyTotalHeight = 2.45; // up to ~3.20 at top of tuft

  // Smooth profile control points: [v, radius]
  const controls: Array<[number, number]> = [
    [0.0, 0.0], // bottom pole
    [0.06, 0.58], // rounded bottom dome
    [0.18, 0.82], // chubby lower base
    [0.32, 0.88], // lower bulb peak
    [0.5, 0.7], // waist indent (gentle, cozy pinch)
    [0.7, 0.82], // head bulb peak
    [0.85, 0.65], // head dome curves gracefully inward
    [0.92, 0.35], // head crest into tuft
    [0.97, 0.22], // tuft nub
    [1.0, 0.0], // tuft tip
  ];

  function getRadius(vn: number): number {
    if (vn <= 0) return 0;
    if (vn >= 1) return 0;
    const n = controls.length - 1;
    for (let k = 0; k < n; k++) {
      const p1 = controls[k];
      const p2 = controls[k + 1];
      if (vn >= p1[0] && vn <= p2[0]) {
        const p0 = controls[Math.max(0, k - 1)];
        const p3 = controls[Math.min(n, k + 2)];
        const span = p2[0] - p1[0];
        const t = span > 0 ? (vn - p1[0]) / span : 0;
        const t2 = t * t;
        const t3 = t2 * t;
        const val =
          0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
        return Math.max(0, val);
      }
    }
    return 0;
  }

  // Eye anchor coordinates for soft socket depressions
  const eyeLeft = new THREE.Vector3(-0.26, 2.48, 0.8);
  const eyeRight = new THREE.Vector3(0.26, 2.48, 0.8);

  for (let j = 0; j <= heightSegments; j++) {
    const v = j / heightSegments; // 0 (bottom) to 1 (top tuft)
    const y = bodyBaseY + v * bodyTotalHeight;
    const r = getRadius(v);

    // Top tuft slight organic lean
    const tuftOffset = v > 0.88 ? Math.sin(((v - 0.88) / 0.12) * Math.PI) * 0.04 : 0;

    for (let i = 0; i <= radialSegments; i++) {
      const u = i / radialSegments;
      const theta = u * Math.PI * 2;

      // Elliptical cross-section + subtle organic peanut longitudinal ridges
      const lateralAspect = 0.96;
      const sagittalAspect = 1.04;
      const longitudinalRidges = 1.0 + Math.cos(theta * 4) * 0.02 + Math.sin(theta * 2) * 0.015;

      let rx = r * lateralAspect * longitudinalRidges;
      let rz = r * sagittalAspect * longitudinalRidges;

      let px = Math.sin(theta) * rx + tuftOffset * 0.5;
      let py = y;
      let pz = Math.cos(theta) * rz;

      // Soft socket depression around eyes
      const distL = Math.hypot(px - eyeLeft.x, py - eyeLeft.y, pz - eyeLeft.z);
      const distR = Math.hypot(px - eyeRight.x, py - eyeRight.y, pz - eyeRight.z);
      if (distL < 0.2) {
        const factor = Math.cos((distL / 0.2) * (Math.PI / 2)) * 0.012;
        pz -= factor;
      }
      if (distR < 0.2) {
        const factor = Math.cos((distR / 0.2) * (Math.PI / 2)) * 0.012;
        pz -= factor;
      }

      // 3D physical noise displacement for genuine fluffy fleece silhouette
      // Reduced at the very tip and bottom pole for smooth closure
      const poleDamping = Math.sin(v * Math.PI);
      const fleeceFuzz = fbm3D(px * 4.2, py * 4.2, pz * 4.2, 3, 2.0, 0.5) * 0.042 * poleDamping;

      const normX = Math.sin(theta);
      const normZ = Math.cos(theta);
      px += normX * fleeceFuzz;
      pz += normZ * fleeceFuzz;

      vertices.push(px, py, pz);
      // Temporary initial normals along radius
      normals.push(normX, 0, normZ);
      uvs.push(u, v);
    }
  }

  // Generate face indices
  for (let j = 0; j < heightSegments; j++) {
    for (let i = 0; i < radialSegments; i++) {
      const a = j * (radialSegments + 1) + i;
      const b = (j + 1) * (radialSegments + 1) + i;
      const c = (j + 1) * (radialSegments + 1) + (i + 1);
      const d = j * (radialSegments + 1) + (i + 1);

      indices.push(a, d, b);
      indices.push(b, d, c);
    }
  }

  geometry.setIndex(indices);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  return geometry;
}

// Create the 3D safety bead eyes (glossy black with specular catchlight)
function createBeadEye(x: number, y: number, z: number, rotationY: number): THREE.Group {
  const eyeGroup = new THREE.Group();
  eyeGroup.position.set(x, y, z);
  eyeGroup.rotation.y = rotationY;

  // Outer glossy black bead
  const eyeRadius = 0.078;
  const beadGeom = new THREE.SphereGeometry(eyeRadius, 32, 24);
  const beadMat = new THREE.MeshPhysicalMaterial({
    color: 0x0c0b0b,
    roughness: 0.03,
    metalness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.01,
    reflectivity: 0.95,
  });

  const beadMesh = new THREE.Mesh(beadGeom, beadMat);
  beadMesh.castShadow = true;
  eyeGroup.add(beadMesh);

  // Tiny dark felt backing ring behind the eye (gives realistic plush toy socket nesting)
  const socketRingGeom = new THREE.TorusGeometry(eyeRadius * 0.96, 0.02, 12, 24);
  const socketRingMat = new THREE.MeshStandardMaterial({
    color: 0x5a3d24,
    roughness: 0.95,
  });
  const ringMesh = new THREE.Mesh(socketRingGeom, socketRingMat);
  ringMesh.position.z = -0.02;
  eyeGroup.add(ringMesh);

  return eyeGroup;
}

// Create the embroidered plush thread smile
function createSmileMesh(threadMaterial: THREE.Material): THREE.Mesh {
  const smilePoints = [
    new THREE.Vector3(-0.13, 2.33, 0.8),
    new THREE.Vector3(-0.06, 2.27, 0.83),
    new THREE.Vector3(0.0, 2.26, 0.835),
    new THREE.Vector3(0.07, 2.29, 0.83),
    new THREE.Vector3(0.14, 2.35, 0.8),
  ];
  const curve = new THREE.CatmullRomCurve3(smilePoints);
  const geometry = new THREE.TubeGeometry(curve, 36, 0.016, 10, false);
  const smile = new THREE.Mesh(geometry, threadMaterial);
  smile.castShadow = false;
  return smile;
}

// Helper to create the oval plush sole with straight parallel lengthwise corduroy UVs
function createBootieSoleGeometry(
  rx = 0.138,
  rz = 0.205,
  centerZ = 0.05,
  nx = 20,
  nz = 28,
): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const grid: number[][] = [];
  let vertexCount = 0;

  for (let j = 0; j <= nz; j++) {
    const vz = -1.0 + (2.0 * j) / nz;
    const pz = centerZ + vz * rz;
    grid[j] = [];

    for (let i = 0; i <= nx; i++) {
      const vx = -1.0 + (2.0 * i) / nx;
      const px = vx * rx;

      const ellipseDist = vx * vx + vz * vz;
      if (ellipseDist <= 1.05) {
        // Puffed plush cushion sole, slightly convex downward so it rests solid on the ground
        const py = 0.012 - 0.01 * Math.max(0, 1.0 - ellipseDist);
        vertices.push(px, py, pz);

        // Perfectly straight parallel UVs: u across foot (X), v along foot (Z)
        const u = (vx * 0.5 + 0.5) * 4.0;
        const v = (vz * 0.5 + 0.5) * 2.5;
        uvs.push(u, v);

        grid[j][i] = vertexCount++;
      } else {
        grid[j][i] = -1;
      }
    }
  }

  // Counterclockwise winding when viewed from bottom (-Y) so normals point downward
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = grid[j][i];
      const b = grid[j + 1][i];
      const c = grid[j + 1][i + 1];
      const d = grid[j][i + 1];

      if (a !== -1 && b !== -1 && c !== -1 && d !== -1) {
        indices.push(a, c, b, a, d, c);
      } else if (a !== -1 && b !== -1 && c !== -1) {
        indices.push(a, c, b);
      } else if (a !== -1 && c !== -1 && d !== -1) {
        indices.push(a, d, c);
      } else if (a !== -1 && b !== -1 && d !== -1) {
        indices.push(a, d, b);
      } else if (b !== -1 && c !== -1 && d !== -1) {
        indices.push(b, d, c);
      }
    }
  }

  geom.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// Helper to create the stitched piping seam welt around the sole perimeter
function createSoleWeltGeometry(
  soleRx = 0.138,
  soleRz = 0.205,
  centerZSole = 0.05,
  soleY = 0.012,
): THREE.BufferGeometry {
  const curvePoints: THREE.Vector3[] = [];
  const segments = 48;
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    curvePoints.push(
      new THREE.Vector3(Math.cos(theta) * soleRx, soleY, centerZSole + Math.sin(theta) * soleRz),
    );
  }
  const curve = new THREE.CatmullRomCurve3(curvePoints, true);
  return new THREE.TubeGeometry(curve, 48, 0.012, 8, true);
}

// Helper to create the stuffed bootie shoe upper
function createBootieUpperGeometry(
  ankleRx = 0.088,
  ankleRz = 0.096,
  soleRx = 0.138,
  soleRz = 0.205,
  centerZAnkle = -0.01,
  centerZSole = 0.05,
  ankleY = 0.19,
  soleY = 0.012,
  radialSegments = 32,
  heightSegments = 16,
): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= heightSegments; j++) {
    const v = j / heightSegments;
    // Soft curved height drop from ankle opening to sole welt
    const py = ankleY * Math.pow(1.0 - v, 0.76) + soleY * (1.0 - Math.pow(1.0 - v, 0.76));
    const cz = centerZAnkle + (centerZSole - centerZAnkle) * v;

    // Soft stuffed plush fullness bulge
    const bulge = Math.sin(v * Math.PI) * 0.026;
    const curRx = ankleRx + (soleRx - ankleRx) * v + bulge * 0.8;
    const curRz = ankleRz + (soleRz - ankleRz) * v + bulge * 1.2;

    for (let s = 0; s <= radialSegments; s++) {
      const theta = (s / radialSegments) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Toe box forward puff
      const toePuff = sinT > 0 ? Math.sin(v * Math.PI) * 0.038 * Math.pow(sinT, 1.35) : 0;

      const px = cosT * curRx;
      const pz = cz + sinT * curRz + toePuff;

      vertices.push(px, py, pz);

      // UV: u around circumference, v down the shoe
      const u = (s / radialSegments) * 5.0;
      const texV = v * 2.2;
      uvs.push(u, texV);
    }
  }

  const stride = radialSegments + 1;
  for (let j = 0; j < heightSegments; j++) {
    for (let s = 0; s < radialSegments; s++) {
      const a = j * stride + s;
      const b = (j + 1) * stride + s;
      const c = (j + 1) * stride + (s + 1);
      const d = j * stride + (s + 1);
      // Counterclockwise winding when viewed from outside so normals point outward
      indices.push(a, d, b, b, d, c);
    }
  }

  geom.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// Plush Corduroy Physical Material with micro-fiber velvet sheen
function createCorduroyMaterial(corduroyTextures: CorduroyTextureBundle): THREE.Material {
  return new THREE.MeshPhysicalMaterial({
    map: corduroyTextures.map,
    normalMap: corduroyTextures.normalMap,
    normalScale: new THREE.Vector2(1.3, 1.3),
    roughnessMap: corduroyTextures.roughnessMap,
    roughness: 0.72,
    metalness: 0.01,
    sheen: 1.0,
    sheenColor: new THREE.Color(0xd4a578), // warm corduroy velvet sheen
    sheenRoughness: 0.55,
    side: THREE.DoubleSide,
  });
}

// One stubby corduroy arm hanging from its shoulder pivot (side +1 or -1:
// the side of the body it's on), ending in a round mitten. Its rotation is
// its pose: x pitches it forward (negative) or back, then z splays it out.
function createArm(side: 1 | -1, material: THREE.Material): THREE.Group {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * SHOULDER.x, SHOULDER.y, SHOULDER.z);
  shoulder.rotation.order = "ZXY";
  const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.078, 0.5, 6, 20), material);
  sleeve.position.y = -0.3;
  const mitten = new THREE.Mesh(new THREE.SphereGeometry(0.118, 24, 16), material);
  mitten.scale.set(1, 0.92, 1.08);
  mitten.position.y = -0.66;
  for (const m of [sleeve, mitten]) {
    m.castShadow = true;
    m.receiveShadow = true;
    shoulder.add(m);
  }
  return shoulder;
}

// Create one ribbed corduroy leg and authentic plush bootie foot
function createCorduroyLeg(
  isRight: boolean,
  corduroyTextures: CorduroyTextureBundle,
): {
  legGroup: THREE.Group;
  footGroup: THREE.Group;
} {
  const legGroup = new THREE.Group();
  const corduroyMaterial = createCorduroyMaterial(corduroyTextures);

  // Leg stem cylinder extends from y = 0.04 (deep inside shoe) up to y = 1.0 (inside body dome)
  const legBottomY = 0.04;
  const legHeight = 1.0 - legBottomY;
  const legRadius = 0.082;
  const legGeom = new THREE.CylinderGeometry(legRadius * 0.94, legRadius * 1.02, legHeight, 32);
  const legMesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(legGeom, corduroyMaterial);
  legMesh.position.set(0, legHeight / 2 + legBottomY, 0);
  legMesh.castShadow = true;
  legMesh.receiveShadow = true;
  legGroup.add(legMesh);

  // Plush Foot Bootie pivots around the ankle joint center so the shoe stays seamlessly attached to the leg
  const anklePivot = new THREE.Vector3(0, 0.17, -0.01);
  const footGroup = new THREE.Group();
  footGroup.position.copy(anklePivot);

  const footContent = new THREE.Group();
  footContent.position.copy(anklePivot).negate();
  footGroup.add(footContent);
  // 1. Bootie shoe upper
  const upperGeom = createBootieUpperGeometry(
    legRadius * 1.07,
    legRadius * 1.15,
    0.138,
    0.205,
    -0.01,
    0.05,
    0.19,
    0.012,
    32,
    16,
  );
  const upperMesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(
    upperGeom,
    corduroyMaterial,
  );
  upperMesh.castShadow = true;
  upperMesh.receiveShadow = true;
  footContent.add(upperMesh);

  // 2. Oval sole panel with planar UVs for parallel corduroy ribs
  const soleGeom = createBootieSoleGeometry(0.138, 0.205, 0.05);
  const soleMesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(soleGeom, corduroyMaterial);
  soleMesh.castShadow = true;
  soleMesh.receiveShadow = true;
  footContent.add(soleMesh);

  // 3. Stitched welt piping along sole perimeter
  const weltGeom = createSoleWeltGeometry(0.138, 0.205, 0.05, 0.012);
  const weltMesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(weltGeom, corduroyMaterial);
  weltMesh.castShadow = true;
  weltMesh.receiveShadow = true;
  footContent.add(weltMesh);

  legGroup.add(footGroup);

  // Initial standing stance
  if (isRight) {
    legGroup.quaternion.copy(STAND_RIGHT_LEG_QUAT);
  } else {
    legGroup.quaternion.copy(STAND_LEFT_LEG_QUAT);
  }

  return { legGroup, footGroup };
}

// Assemble complete Peanut character model
export function createPeanutModel(): PeanutModelHandle {
  const rootGroup = new THREE.Group();
  rootGroup.name = "PeanutCharacterRoot";

  // Body container (for squash-and-stretch without displacing feet)
  const bodyContainer = new THREE.Group();
  bodyContainer.name = "PeanutBodyContainer";
  rootGroup.add(bodyContainer);

  // 1. Textures & Materials
  const fleeceTextures = createFleeceTextures(512);
  const corduroyTextures = createCorduroyTextures(512);
  const shadowTexture = createContactShadowTexture(512);

  // Plush Bouclé Fleece Physical Material (matching soft sherpa teddy fleece)
  const fleeceMaterial = new THREE.MeshPhysicalMaterial({
    map: fleeceTextures.map,
    bumpMap: fleeceTextures.bumpMap,
    bumpScale: 0.035,
    roughnessMap: fleeceTextures.roughnessMap,
    roughness: 0.88,
    metalness: 0.0,
    sheen: 1.0,
    sheenColor: new THREE.Color(0xffe8c8), // golden cream velvet fiber halo
    sheenRoughness: 0.65,
  });

  // 2. Peanut Body Mesh
  const bodyGeometry = createPeanutBodyGeometry(96, 120);
  const bodyMesh = new THREE.Mesh(bodyGeometry, fleeceMaterial);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyContainer.add(bodyMesh);

  // 3. Face Details
  // Glossy black safety eyes
  const leftEye = createBeadEye(-0.26, 2.48, 0.8, -0.22);
  const rightEye = createBeadEye(0.26, 2.48, 0.8, 0.22);
  bodyContainer.add(leftEye);
  bodyContainer.add(rightEye);

  const mouthThreadMaterial = new THREE.MeshStandardMaterial({
    color: 0x1c1714,
    roughness: 0.85,
    metalness: 0.05,
  });
  bodyContainer.add(createSmileMesh(mouthThreadMaterial));
  const mouth = new THREE.Object3D();
  mouth.position.set(0, 2.28, 0.835);
  bodyContainer.add(mouth);

  const hats = {
    cowboy: createCowboyHat(),
    birthday: createBirthdayHat(),
    headphones: createHeadphones(),
  };
  bodyContainer.add(hats.cowboy.group, hats.birthday.group, hats.headphones.group);

  // 4. Corduroy Legs & Booties
  const { legGroup: leftLeg, footGroup: leftFoot } = createCorduroyLeg(false, corduroyTextures);
  const { legGroup: rightLeg, footGroup: rightFoot } = createCorduroyLeg(true, corduroyTextures);
  rootGroup.add(leftLeg);
  rootGroup.add(rightLeg);

  // 5. Stubby corduroy arms, riding on the body so they sway and squash with it
  const armMaterial = createCorduroyMaterial(corduroyTextures);
  const arms = [
    [createArm(1, armMaterial), 1],
    [createArm(-1, armMaterial), -1],
  ] as const;
  for (const [arm] of arms) bodyContainer.add(arm);

  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), shadowMat);
  shadowMesh.name = "ShadowPlane";
  shadowMesh.userData = { isShadow: true };
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.set(0, 0.002, 0.02);
  rootGroup.add(shadowMesh);

  // Perched/standing, walking, jamming and inspecting state, each eased in and out
  let isSitting = false;
  let sitProgress = 0.0;
  let walkDir: -1 | 0 | 1 = 0;
  let walkAmount = 0.0;
  let walkPhase = 0.0;
  let heading = 0.0;
  let facingAway = false;
  let jamming = false;
  let jamAmount = 0.0;
  let inspecting = false;
  let inspectAmount = 0.0;
  // One-off moves, by the animation time they started at (-1: not under way)
  let clock = 0.0;
  let jumpStart = -1;
  let jumpTwirl = false;
  let pokeStart = -1;
  let armsNeededAt = -Infinity; // when a move last needed his arms
  let armsOut = 0.0; // 0 tucked away, 1 out

  function setSitting(sitting: boolean) {
    isSitting = sitting;
  }

  function walk(direction: -1 | 0 | 1) {
    walkDir = direction;
  }

  function setHat(kind: HatKind | null) {
    hats.cowboy.setVisible(kind === "cowboy");
    hats.birthday.setVisible(kind === "birthday");
    hats.headphones.setVisible(kind === "headphones");
  }

  function setJamming(on: boolean) {
    jamming = on;
  }

  function jump(twirl: boolean) {
    jumpStart = clock;
    jumpTwirl = twirl;
  }

  function setInspecting(on: boolean) {
    inspecting = on;
  }

  function poke() {
    pokeStart = clock;
  }

  function setFacingAway(away: boolean) {
    facingAway = away;
  }

  function animate(
    time: number,
    bounceProgress: number,
    blinkProgress: number,
    deltaSeconds: number,
  ) {
    clock = time;
    const lerp = THREE.MathUtils.lerp;
    const sitSpeed = 2.0; // ~0.5s transition
    if (isSitting && sitProgress < 1.0) {
      sitProgress = Math.min(1.0, sitProgress + deltaSeconds * sitSpeed);
    } else if (!isSitting && sitProgress > 0.0) {
      sitProgress = Math.max(0.0, sitProgress - deltaSeconds * sitSpeed);
    }
    const walkStep = deltaSeconds * 4; // ~0.25s to start or stop striding
    walkAmount =
      walkDir === 0 ? Math.max(0, walkAmount - walkStep) : Math.min(1, walkAmount + walkStep);
    walkPhase += deltaSeconds * Math.PI * 2 * STEP_HZ * walkAmount;
    const w = walkAmount * walkAmount * (3 - 2 * walkAmount); // smoothstep
    const moodStep = deltaSeconds * 2.5; // ~0.4s to get into or out of a groove
    jamAmount = jamming ? Math.min(1, jamAmount + moodStep) : Math.max(0, jamAmount - moodStep);
    inspectAmount = inspecting
      ? Math.min(1, inspectAmount + moodStep)
      : Math.max(0, inspectAmount - moodStep);
    const j = smoothstep(0, 1, jamAmount);
    const insp = smoothstep(0, 1, inspectAmount);

    // The beat: a nod down and back up on each one
    const beat = time * BEAT_HZ;
    const nod = (1 - Math.cos(beat * Math.PI * 2)) / 2;

    // A jump: crouch, fly (stretched while fast, arms flung up, legs tucked
    // back, maybe twirling), then land with a squash as the arms come down
    let jumpLift = 0;
    let crouch = 0;
    let stretch = 0;
    let armsUp = 0;
    let tuck = 0;
    let land = 0;
    let turn = 0;
    if (jumpStart >= 0) {
      const p = (time - jumpStart) / JUMP_S;
      if (p >= 1 || p < 0) jumpStart = -1;
      else if (p < JUMP_CROUCH) crouch = Math.sin(((p / JUMP_CROUCH) * Math.PI) / 2);
      else if (p < JUMP_LAND) {
        const a = (p - JUMP_CROUCH) / (JUMP_LAND - JUMP_CROUCH);
        jumpLift = 4 * a * (1 - a) * JUMP_HEIGHT;
        stretch = Math.abs(1 - 2 * a);
        armsUp = smoothstep(0, 0.2, a);
        tuck = Math.sin(a * Math.PI);
        if (jumpTwirl) turn = smoothstep(0.05, 0.95, a) * Math.PI * 2;
      } else {
        const l = (p - JUMP_LAND) / (1 - JUMP_LAND);
        land = Math.sin(l * Math.PI);
        armsUp = 1 - smoothstep(0, 0.7, l);
      }
    }

    // A poke: the near hand reaches up, he hops and jabs, holds a moment and
    // comes back down
    let reach = 0;
    let jab = 0;
    if (pokeStart >= 0) {
      const p = (time - pokeStart) / POKE_S;
      if (p >= 1 || p < 0) pokeStart = -1;
      else {
        reach = smoothstep(0, 0.3, p) * (1 - smoothstep(0.75, 1, p));
        jab = Math.sin(smoothstep(POKE_TOUCH - 0.15, POKE_TOUCH + 0.15, p) * Math.PI);
      }
    }

    // Arms sprout for jamming, inspecting, poking and jumping, and tuck away after
    if (jamming || inspecting || jumpStart >= 0 || pokeStart >= 0) armsNeededAt = time;
    const armsWanted = time - armsNeededAt < ARMS_LINGER_S;
    armsOut = armsWanted
      ? Math.min(1, armsOut + deltaSeconds * 5)
      : Math.max(0, armsOut - deltaSeconds * 5);

    // Turn toward the walking direction, his back to the camera, or back to
    // the camera's three-quarter view; inspecting, a little toward
    // screen-right. Big turns, like showing his back, go slower.
    const targetHeading =
      walkDir !== 0 ? CAMERA_YAW + walkDir * WALK_HEADING : facingAway ? CAMERA_YAW + Math.PI : 0;
    const turnRate = Math.abs(targetHeading - heading) > Math.PI / 2 ? 3.5 : 8;
    heading += (targetHeading - heading) * Math.min(1, deltaSeconds * turnRate);
    rootGroup.rotation.y = heading + turn + INSPECT_TURN * insp;

    // Blink: squeeze the bead eyes flat and back open
    const eyeScaleY = 1.0 - 0.9 * Math.sin(blinkProgress * Math.PI);
    leftEye.scale.y = eyeScaleY;
    rightEye.scale.y = eyeScaleY;
    hats.cowboy.update(deltaSeconds);
    hats.birthday.update(deltaSeconds);
    hats.headphones.update(deltaSeconds);

    const s = sitProgress * sitProgress * (3 - 2 * sitProgress); // smoothstep

    // Gentle breathing and sway, plus a waddle and bob while walking
    const breathPhase = Math.sin(time * 1.8);
    const breatheScaleY = 1.0 + breathPhase * 0.018;
    const breatheScaleXZ = 1.0 - breathPhase * 0.012;
    const swayTiltZ = Math.sin(time * 0.9) * 0.022 + Math.sin(walkPhase) * 0.07 * w;
    const swayTiltX = Math.cos(time * 0.9) * 0.012;
    const walkBob = -Math.abs(Math.sin(walkPhase)) * 0.05 * w;

    // Body perching position, rotation & squash
    const seatPosY = lerp(STAND_BODY_POS.y, PERCH_BODY_POS.y, s) + walkBob - nod * 0.04 * j;
    const seatPosZ = lerp(STAND_BODY_POS.z, PERCH_BODY_POS.z, s);
    const seatTiltX = lerp(0, -0.05, s);
    const seatSquashY = lerp(1.0, 0.95, s);
    const seatSquashXZ = lerp(1.0, 1.03, s);

    // Contact shadow on the floor while standing; perched there's no floor below
    shadowMat.opacity = lerp(0.85, 0, s);

    // Legs swing from standing to dangling in sync with the body's descent
    const rotS = Math.min(1.0, Math.pow(s, 0.75));
    rightLeg.quaternion.copy(STAND_RIGHT_LEG_QUAT).slerp(PERCH_RIGHT_LEG_QUAT, rotS);
    leftLeg.quaternion.copy(STAND_LEFT_LEG_QUAT).slerp(PERCH_LEFT_LEG_QUAT, rotS);
    rightFoot.quaternion.copy(STAND_RIGHT_FOOT_QUAT).slerp(PERCH_RIGHT_FOOT_QUAT, rotS);
    leftFoot.quaternion.copy(STAND_LEFT_FOOT_QUAT).slerp(PERCH_LEFT_FOOT_QUAT, rotS);

    // Dangling feet kick out of step (to the beat when jamming); walking legs
    // stride out of step; jumping legs both tuck back
    const kick =
      Math.sin(time * 2.4) * 0.16 * s * (1 - j) + Math.sin(beat * Math.PI) * 0.22 * s * j;
    const stride = Math.sin(walkPhase) * 0.5 * w;
    tempBounceQuat.setFromEuler(tempBounceEuler.set(kick + stride + tuck * 0.25, 0, 0));
    rightLeg.quaternion.multiply(tempBounceQuat);
    tempBounceQuat.setFromEuler(tempBounceEuler.set(-kick - stride + tuck * 0.25, 0, 0));
    leftLeg.quaternion.multiply(tempBounceQuat);
    // Standing, he taps a toe to the beat
    const tap = Math.max(0, Math.sin(beat * Math.PI * 2)) * j * (1 - s);
    tempBounceQuat.setFromEuler(tempBounceEuler.set(-0.45 * tap, 0, 0));
    rightFoot.quaternion.multiply(tempBounceQuat);

    let squashY = 1.0;
    let squashXZ = 1.0;
    let wiggleZ = 0.0;
    let bounceLift = 0;
    if (bounceProgress > 0) {
      // Bounce squash and stretch physics
      const p = bounceProgress;
      bounceLift = Math.sin(p * Math.PI) * 0.38;
      squashY = 1.0 + Math.sin(p * Math.PI * 2) * 0.15;
      squashXZ = 1.0 - Math.sin(p * Math.PI * 2) * 0.1;
      wiggleZ = Math.sin(p * Math.PI * 4) * 0.08;

      // Playful bounce kick/swing
      const bounceSwing = Math.sin(p * Math.PI) * (0.25 * (1.0 - s * 0.5));
      const bounceKick = Math.sin(p * Math.PI * 2) * 0.12 * s;
      tempBounceQuat.setFromEuler(tempBounceEuler.set(bounceSwing, 0, bounceKick));
      leftLeg.quaternion.multiply(tempBounceQuat);
      tempBounceQuat.setFromEuler(tempBounceEuler.set(-bounceSwing, 0, -bounceKick));
      rightLeg.quaternion.multiply(tempBounceQuat);
    }
    squashY *= (1 - 0.16 * crouch) * (1 + 0.1 * stretch) * (1 - 0.14 * land);
    squashXZ *= (1 + 0.09 * crouch) * (1 - 0.05 * stretch) * (1 + 0.08 * land);
    rootGroup.position.y = bounceLift + jumpLift + jab * POKE_HOP;
    shadowMesh.position.y = 0.002 - rootGroup.position.y;
    shadowMesh.scale.setScalar(1 - jumpLift * 0.3);

    bodyContainer.position.set(0, seatPosY, seatPosZ);
    bodyContainer.scale.set(
      breatheScaleXZ * seatSquashXZ * squashXZ,
      breatheScaleY * seatSquashY * squashY,
      breatheScaleXZ * seatSquashXZ * squashXZ,
    );
    // Jamming he sways a beat each way and nods on every one; inspecting he
    // leans back to look up, tilting his head this way and that
    bodyContainer.rotation.z =
      swayTiltZ +
      wiggleZ +
      Math.sin(beat * Math.PI) * 0.08 * j +
      Math.sin(time * 1.3) * 0.07 * insp;
    bodyContainer.rotation.x = seatTiltX + swayTiltX + nod * 0.12 * j - 0.1 * insp;

    // Arms hang loose, swinging opposite the legs when walking, hands in his
    // lap when perched, flapping when he bounces. Facing the camera, the
    // x > 0 arm is the one on screen-right.
    const swing = Math.sin(walkPhase) * 0.45 * w;
    const flap = bounceProgress > 0 ? Math.sin(bounceProgress * Math.PI) * 0.5 : 0;
    for (const [arm, side] of arms) {
      let pitch = lerp(-0.12, -0.5, s) - side * swing;
      let splay = lerp(0.55, 0.42, s) + flap;
      // Jamming: one hand holds his headphones, the other pumps the beat
      if (side === 1) {
        pitch = lerp(pitch, -0.25, j);
        splay = lerp(splay, 2.75 + nod * 0.08, j);
      } else {
        pitch = lerp(pitch, -1.3 + Math.sin(beat * Math.PI * 2) * 0.35, j);
        splay = lerp(splay, 0.35, j);
      }
      // Inspecting: the screen-left hand to his chin; poking: the other
      // reaches up and out, jabbing higher at the top of the hop
      if (side === -1) {
        pitch = lerp(pitch, -1.9, insp);
        splay = lerp(splay, 0.6, insp);
      } else {
        pitch = lerp(pitch, -0.3, reach);
        splay = lerp(splay, 2.3 + jab * 0.15, reach);
      }
      // Jumping: swung back in the crouch, flung up and waving in the air
      pitch = lerp(lerp(pitch, 0.55, crouch), -0.2, armsUp);
      splay = lerp(lerp(splay, 0.3, crouch), 2.5 + Math.sin(time * 18 + side) * 0.15, armsUp);
      arm.rotation.set(pitch, 0, side * splay);
      arm.visible = armsOut > 0;
      arm.scale.setScalar(Math.max(0.001, smoothstep(0, 1, armsOut)));
    }

    // Dynamically compute leg positions attached to hip sockets, in the root
    // group's space (the legs' parent), so a lift or turn isn't applied twice
    bodyContainer.updateMatrix();
    tempTargetHipR.copy(HIP_RIGHT_LOCAL).applyMatrix4(bodyContainer.matrix);
    tempTargetHipL.copy(HIP_LEFT_LOCAL).applyMatrix4(bodyContainer.matrix);
    tempLegVecR.copy(LEG_HIP_OFFSET).applyQuaternion(rightLeg.quaternion);
    rightLeg.position.copy(tempTargetHipR).sub(tempLegVecR);
    tempLegVecL.copy(LEG_HIP_OFFSET).applyQuaternion(leftLeg.quaternion);
    leftLeg.position.copy(tempTargetHipL).sub(tempLegVecL);

    // Standing feet stay on the floor; perched they hang below it
    if (rootGroup.position.y === 0 && s === 0) {
      if (rightLeg.position.y < 0.002) rightLeg.position.y = 0.002;
      if (leftLeg.position.y < 0.002) leftLeg.position.y = 0.002;
    }
  }

  function dispose() {
    // Materials shared between meshes may be disposed twice; three tolerates that.
    rootGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    for (const t of [
      fleeceTextures.map,
      fleeceTextures.bumpMap,
      fleeceTextures.normalMap,
      fleeceTextures.roughnessMap,
      corduroyTextures.map,
      corduroyTextures.normalMap,
      corduroyTextures.roughnessMap,
      shadowTexture,
    ]) {
      t.dispose();
    }
    // For the hats' own extras (the birthday hat's textures); their meshes
    // went with the rest above.
    hats.cowboy.dispose();
    hats.birthday.dispose();
    hats.headphones.dispose();
  }

  return {
    group: rootGroup,
    mouth,
    animate,
    setSitting,
    walk,
    setHat,
    setJamming,
    jump,
    setInspecting,
    poke,
    setFacingAway,
    dispose,
  };
}
