// Peanut's hats, from github.com/dustinmichels/peanut: a cowboy hat and a
// knit party hat. Trimmed to the fleece look, without the jump flutter,
// countdown or confetti. Each sits on the body container and pops on or off.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type HatKind = "cowboy" | "birthday";

export interface HatHandle {
  group: THREE.Group;
  setVisible: (visible: boolean) => void;
  update: (deltaSeconds: number) => void;
  dispose: () => void;
}

interface Rest {
  y: number;
  z: number;
  rotX: number;
  rotZ: number;
  dropHeight: number; // how far above the head it starts popping on
  tipX: number; // extra tilt at the start of the pop
  tipZ: number;
}

const POP_SPEED = 4.2; // ~0.24s on, a little quicker off

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

// A hidden group resting on his head that drops on with a springy overshoot
// and lifts off the same way; disposeExtra frees what the meshes don't own.
function hat(name: string, rest: Rest, disposeExtra: () => void): HatHandle {
  const group = new THREE.Group();
  group.name = name;
  group.visible = false;
  let visible = false;
  let progress = 0; // 0 off, 1 fully on

  function update(deltaSeconds: number) {
    const dt = Math.min(deltaSeconds, 0.1);
    progress = visible
      ? Math.min(1, progress + dt * POP_SPEED)
      : Math.max(0, progress - dt * POP_SPEED * 1.2);
    group.visible = progress > 0;
    if (!group.visible) return;
    const off = 1 - progress;
    group.scale.setScalar(Math.max(0.001, easeOutBack(progress)));
    group.position.set(0, rest.y + off * rest.dropHeight, rest.z);
    group.rotation.x = rest.rotX + off * rest.tipX;
    group.rotation.z = rest.rotZ + off * rest.tipZ;
  }

  return {
    group,
    setVisible: (v) => (visible = v),
    update,
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      disposeExtra();
    },
  };
}

function shadowed(mesh: THREE.Mesh, cast = true): THREE.Mesh {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

// ---- Cowboy hat ----

// The curved western brim with upturned side curls and a gentle front/back
// dip, two layers thick with a stitched outer edge.
function createBrimGeometry(): THREE.BufferGeometry {
  const radialSegments = 48;
  const ringSegments = 10;
  const thickness = 0.026;
  const rxIn = 0.8;
  const rzIn = 0.86;
  const rxOut = 1.48;
  const rzOut = 1.58;
  const ringStride = radialSegments + 1;
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  function layer(offset: number) {
    const start = vertices.length / 3;
    for (let j = 0; j <= ringSegments; j++) {
      const t = j / ringSegments;
      const rx = rxIn + t * (rxOut - rxIn);
      const rz = rzIn + t * (rzOut - rzIn);
      for (let i = 0; i <= radialSegments; i++) {
        const u = i / radialSegments;
        const sinT = Math.sin(u * Math.PI * 2);
        const cosT = Math.cos(u * Math.PI * 2);
        const ySide = sinT * sinT * 0.38 * Math.pow(t, 1.75);
        const yDip = -cosT * cosT * 0.07 * t;
        vertices.push(sinT * rx, ySide + yDip + offset, cosT * rz);
        uvs.push(u, t);
      }
    }
    return start;
  }

  const top = layer(thickness * 0.5);
  const bottom = layer(-thickness * 0.5);
  for (let j = 0; j < ringSegments; j++) {
    for (let i = 0; i < radialSegments; i++) {
      const a = j * ringStride + i;
      const b = (j + 1) * ringStride + i;
      const c = b + 1;
      const d = a + 1;
      indices.push(top + a, top + b, top + d, top + d, top + b, top + c);
      indices.push(bottom + a, bottom + d, bottom + b, bottom + d, bottom + c, bottom + b);
    }
  }
  const topOuter = top + ringSegments * ringStride;
  const bottomOuter = bottom + ringSegments * ringStride;
  for (let i = 0; i < radialSegments; i++) {
    const t1 = topOuter + i;
    const b1 = bottomOuter + i;
    indices.push(t1, t1 + 1, b1, t1 + 1, b1 + 1, b1);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// The tapered crown: a cattleman crease along the top and pinch dents in front.
function createCrownGeometry(): THREE.BufferGeometry {
  const radialSegments = 48;
  const heightSegments = 24;
  const capRings = 8;
  const crownHeight = 0.72;
  const baseRx = 0.8;
  const baseRz = 0.86;
  const topRx = 0.62;
  const topRz = 0.68;
  const ringStride = radialSegments + 1;
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const crease = (px: number, weight: number) =>
    (-Math.exp(-Math.pow(px / 0.16, 2)) * 0.09 +
      Math.exp(-Math.pow((px + 0.22) / 0.11, 2)) * 0.035 +
      Math.exp(-Math.pow((px - 0.22) / 0.11, 2)) * 0.035) *
    weight;

  for (let j = 0; j <= heightSegments; j++) {
    const v = j / heightSegments;
    const rx = baseRx + (topRx - baseRx) * Math.pow(v, 0.85);
    const rz = baseRz + (topRz - baseRz) * Math.pow(v, 0.85);
    for (let i = 0; i <= radialSegments; i++) {
      const u = i / radialSegments;
      const sinT = Math.sin(u * Math.PI * 2);
      const cosT = Math.cos(u * Math.PI * 2);
      let px = sinT * rx;
      let py = v * crownHeight;
      let pz = cosT * rz;
      if (v > 0.25 && v < 0.95 && pz > 0.04) {
        const pinch =
          0.07 *
          Math.sin(((v - 0.25) / 0.7) * Math.PI) *
          Math.pow(Math.abs(sinT), 1.6) *
          Math.max(0, cosT);
        px *= 1 - pinch;
        pz *= 1 - pinch * 0.75;
      }
      if (v >= 0.82) py += crease(px, (v - 0.82) / 0.18);
      vertices.push(px, py, pz);
      uvs.push(u, v);
    }
  }
  for (let j = 0; j < heightSegments; j++) {
    for (let i = 0; i < radialSegments; i++) {
      const a = j * ringStride + i;
      const b = a + ringStride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  // Top cap, continuing the crease toward the middle
  const wallTop = heightSegments * ringStride;
  const cap = vertices.length / 3;
  for (let j = 1; j <= capRings; j++) {
    const frac = 1 - j / capRings;
    for (let i = 0; i <= radialSegments; i++) {
      const u = i / radialSegments;
      const px = Math.sin(u * Math.PI * 2) * topRx * frac;
      const pz = Math.cos(u * Math.PI * 2) * topRz * frac;
      const zFade = Math.sqrt(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(pz) / topRz), 2)));
      vertices.push(px, crownHeight + crease(px, zFade), pz);
      uvs.push(u, frac);
    }
  }
  for (let i = 0; i < radialSegments; i++) {
    const w = wallTop + i;
    const c = cap + i;
    indices.push(w, c, w + 1, w + 1, c, c + 1);
  }
  for (let j = 0; j < capRings - 1; j++) {
    for (let i = 0; i < radialSegments; i++) {
      const a = cap + j * ringStride + i;
      const b = a + ringStride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// The ribbon band around the base of the crown.
function createHatbandGeometry(): THREE.BufferGeometry {
  const radialSegments = 48;
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= radialSegments; i++) {
    const u = i / radialSegments;
    const sinT = Math.sin(u * Math.PI * 2);
    const cosT = Math.cos(u * Math.PI * 2);
    vertices.push(sinT * 0.815, 0.014, cosT * 0.875, sinT * 0.795, 0.115, cosT * 0.855);
    uvs.push(u, 0, u, 1);
  }
  for (let i = 0; i < radialSegments; i++) {
    const b = i * 2;
    indices.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// A gold star concho on the side of the band.
function createStarConcho(): THREE.Mesh {
  const points = 5;
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? 0.042 : 0.021;
    if (i === 0) shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  shape.closePath();
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.007,
    bevelEnabled: true,
    bevelThickness: 0.002,
    bevelSize: 0.002,
    bevelSegments: 2,
  });
  const mat = new THREE.MeshStandardMaterial({ color: 0xdeb841, roughness: 0.25, metalness: 0.88 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.position.set(-0.82, 0.065, 0.14);
  mesh.rotation.y = -Math.PI / 2 + 0.16;
  mesh.scale.setScalar(1.3);
  return mesh;
}

export function createCowboyHat(): HatHandle {
  // Jaunty over the top tuft, tilted back so his eyes show.
  const h = hat(
    "CowboyHat",
    { y: 2.68, z: 0.01, rotX: -0.06, rotZ: -0.04, dropHeight: 0.45, tipX: 0.25, tipZ: -0.15 },
    () => {},
  );
  // Saddle-brown plush felt; both brim and crown share it.
  const felt = new THREE.MeshPhysicalMaterial({
    color: 0x78401b,
    roughness: 0.82,
    metalness: 0.04,
    sheen: 0.55,
    sheenColor: new THREE.Color(0xb57a4a),
    sheenRoughness: 0.65,
    side: THREE.DoubleSide,
  });
  const band = new THREE.MeshStandardMaterial({
    color: 0x241309,
    roughness: 0.7,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });
  h.group.add(
    shadowed(new THREE.Mesh(createBrimGeometry(), felt)),
    shadowed(new THREE.Mesh(createCrownGeometry(), felt)),
    shadowed(new THREE.Mesh(createHatbandGeometry(), band)),
    createStarConcho(),
  );
  return h;
}

// ---- Birthday hat ----

interface KnitTextures {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

// Dark knit with funfetti sprinkles, plus normal and roughness maps derived
// from its brightness.
function createKnitTextures(base: string, size = 256): KnitTextures {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Knit stitches
  const rowHeight = 7;
  const colWidth = 6;
  for (let r = 0; r < Math.ceil(size / rowHeight); r++) {
    const y = r * rowHeight;
    for (let c = 0; c < Math.ceil(size / colWidth); c++) {
      const px = (c * colWidth + (r % 2) * (colWidth / 2)) % size;
      ctx.fillStyle = (r + c) % 2 === 0 ? "rgba(0, 0, 0, 0.18)" : "rgba(255, 255, 255, 0.1)";
      ctx.fillRect(px, y, colWidth * 0.75, rowHeight * 0.85);
      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      ctx.fillRect(px, y + rowHeight * 0.7, colWidth * 0.75, 1.5);
    }
  }

  // Yarn fuzz
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  // Sprinkles, laid out the same every time
  const colors = [
    "#ff2a70",
    "#ff4081",
    "#00b4d8",
    "#00c49f",
    "#ffb703",
    "#ffc300",
    "#9d4edd",
    "#7b2cbf",
    "#ff758f",
  ];
  let seed = 42;
  const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const scale = size / 512;
  for (let s = 0; s < 280 * scale * scale; s++) {
    const cx = random() * size;
    const cy = random() * size;
    const angle = random() * Math.PI;
    const length = (7 + random() * 9) * scale;
    const width = (3.6 + random() * 2.2) * scale;
    const color = colors[Math.floor(random() * colors.length)];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-length / 2, -width / 2, length, width, width / 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.beginPath();
    ctx.roundRect(-length / 2 + 1, -width / 2, length - 2, width * 0.35, width * 0.2);
    ctx.fill();
    ctx.restore();
  }

  const color = ctx.getImageData(0, 0, size, size).data;
  const heights = new Float32Array(size * size);
  for (let i = 0; i < heights.length; i++) {
    heights[i] = (color[i * 4] * 0.299 + color[i * 4 + 1] * 0.587 + color[i * 4 + 2] * 0.114) / 255;
  }

  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = normalCanvas.height = size;
  const normalCtx = normalCanvas.getContext("2d")!;
  const normal = normalCtx.createImageData(size, size);
  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext("2d")!;
  const rough = roughCtx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx =
        (heights[y * size + ((x + 1) % size)] - heights[y * size + ((x - 1 + size) % size)]) * 1.8;
      const dy =
        (heights[((y + 1) % size) * size + x] - heights[((y - 1 + size) % size) * size + x]) * 1.8;
      const len = Math.hypot(dx, dy, 1);
      normal.data.set(
        [
          ((-dx / len) * 0.5 + 0.5) * 255,
          ((-dy / len) * 0.5 + 0.5) * 255,
          (0.5 / len + 0.5) * 255,
          255,
        ],
        i * 4,
      );
      const r = heights[i] > 0.85 ? 175 : 215; // sprinkles a little sleeker
      rough.data.set([r, r, r, 255], i * 4);
    }
  }
  normalCtx.putImageData(normal, 0, 0);
  roughCtx.putImageData(rough, 0, 0);

  const texture = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2.2, 2.0);
    return t;
  };
  const map = texture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, normalMap: texture(normalCanvas), roughnessMap: texture(roughCanvas) };
}

// A small cone that clears his top nub, flaring slightly at the bottom.
function createConeGeometry(): THREE.BufferGeometry {
  const height = 0.5;
  const radiusTop = 0.035;
  const radiusBottom = 0.44;
  const geom = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 48, 20, true);
  geom.translate(0, height / 2, 0);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = Math.max(0, Math.min(1, pos.getY(i) / height));
    const clearance = Math.sin(Math.PI * Math.min(1, v / 0.55)) * 0.025;
    const flare = 1 + clearance / (radiusBottom + (radiusTop - radiusBottom) * v);
    pos.setX(i, pos.getX(i) * 0.98 * flare);
    pos.setZ(i, pos.getZ(i) * 1.05 * flare);
  }
  geom.computeVertexNormals();
  return geom;
}

// The scalloped crochet rim: a ring of yarn bobbles.
function createRimGeometry(): THREE.BufferGeometry {
  const count = 18;
  const base = new THREE.SphereGeometry(0.038, 14, 10);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2;
    const g = base.clone();
    g.scale(1.12, 0.94, 1.12);
    g.rotateY(theta);
    g.translate(Math.sin(theta) * 0.44, 0.012, Math.cos(theta) * 0.46);
    parts.push(g);
  }
  base.dispose();
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  return merged;
}

function createPomPomGeometry(): THREE.BufferGeometry {
  const geom = new THREE.SphereGeometry(0.072, 24, 20);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 1 + Math.sin(x * 35) * Math.cos(y * 35) * Math.sin(z * 35) * 0.008;
    pos.setXYZ(i, x * n, y * n, z * n);
  }
  geom.computeVertexNormals();
  return geom;
}

export function createBirthdayHat(): HatHandle {
  // Usually deep navy, but now and then dyed another dark festive hue, so the
  // hat stands out against his light fleece.
  const base =
    Math.random() < 0.25
      ? `#${new THREE.Color().setHSL(Math.random(), 0.6, 0.3).getHexString()}`
      : "#1f2f6b";
  const textures = createKnitTextures(base);
  // Enclosing the top nub, with a little celebratory wobble as it lands.
  const h = hat(
    "BirthdayHat",
    { y: 3.0, z: 0.01, rotX: -0.03, rotZ: 0.02, dropHeight: 0.52, tipX: -0.2, tipZ: 0.22 },
    () => {
      textures.map.dispose();
      textures.normalMap.dispose();
      textures.roughnessMap.dispose();
    },
  );
  const cone = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: textures.map,
    normalMap: textures.normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: textures.roughnessMap,
    roughness: 0.82,
    metalness: 0.02,
    sheen: 0.6,
    sheenColor: new THREE.Color(0xffffff),
    sheenRoughness: 0.6,
    side: THREE.DoubleSide,
  });
  const rim = new THREE.MeshPhysicalMaterial({
    color: 0x00a8e8,
    roughness: 0.74,
    metalness: 0.02,
    sheen: 0.7,
    sheenColor: new THREE.Color(0x6be0ff),
    sheenRoughness: 0.65,
  });
  const pom = new THREE.MeshPhysicalMaterial({
    color: 0x8a5ff2,
    roughness: 0.88,
    metalness: 0.02,
    sheen: 0.9,
    sheenColor: new THREE.Color(0xd7bdfa),
    sheenRoughness: 0.75,
  });
  const pomPom = shadowed(new THREE.Mesh(createPomPomGeometry(), pom), false);
  pomPom.position.set(0, 0.535, 0);
  h.group.add(
    shadowed(new THREE.Mesh(createConeGeometry(), cone)),
    shadowed(new THREE.Mesh(createRimGeometry(), rim)),
    pomPom,
  );
  return h;
}
