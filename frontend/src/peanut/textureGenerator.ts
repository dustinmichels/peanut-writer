import * as THREE from "three";
import { cellular2D, fbm2D } from "./noise";

export interface FleeceTextureBundle {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

export interface CorduroyTextureBundle {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

// Generate procedural curly fleece/bouclé plush texture
export function createFleeceTextures(size = 512): FleeceTextureBundle {
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext("2d", { willReadFrequently: true });

  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = size;
  normalCanvas.height = size;
  const normalCtx = normalCanvas.getContext("2d");

  const roughnessCanvas = document.createElement("canvas");
  roughnessCanvas.width = size;
  roughnessCanvas.height = size;
  const roughnessCtx = roughnessCanvas.getContext("2d");

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext("2d");

  if (!colorCtx || !normalCtx || !roughnessCtx) {
    throw new Error("Canvas 2D context not supported");
  }

  const colorImgData = colorCtx.createImageData(size, size);
  const normalImgData = normalCtx.createImageData(size, size);
  const roughnessImgData = roughnessCtx.createImageData(size, size);

  const colorData = colorImgData.data;
  const normalData = normalImgData.data;
  const roughnessData = roughnessImgData.data;

  // Pre-calculate heightmap array for normal map generation
  const heightMap = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const ny = y / size;
    for (let x = 0; x < size; x++) {
      const nx = x / size;

      // Swirled coordinate space to mimic curly fleece bouclé tufts
      const swirlX = nx * 14 + Math.sin(ny * 22) * 0.22;
      const swirlY = ny * 14 + Math.cos(nx * 22) * 0.22;

      // Cellular clumping (curly fleece clusters)
      const cell = cellular2D(swirlX, swirlY);
      // Fine fibrous noise
      const fineNoise = fbm2D(nx * 40, ny * 40, 3, 2.2, 0.5);

      // Curly height: rounded inverted cellular peaks with fibrous micro-detail
      const tuftHeight = Math.pow(1.0 - cell, 1.6) * 0.75 + fineNoise * 0.25;
      heightMap[y * size + x] = tuftHeight;

      // Base golden-tan tones from the reference image
      // Crevice: #936034 (deep warm amber brown)
      // Mid: #caa06d (warm honey tan)
      // Highlight: #e2be88 (light soft fleece highlight)
      const crevice = Math.max(0, Math.min(1, tuftHeight));

      let r: number;
      let g: number;
      let b: number;

      if (crevice < 0.45) {
        const t = crevice / 0.45;
        r = 155 + t * (208 - 155);
        g = 100 + t * (162 - 100);
        b = 52 + t * (104 - 52);
      } else {
        const t = (crevice - 0.45) / 0.55;
        r = 208 + t * (235 - 208);
        g = 162 + t * (198 - 162);
        b = 104 + t * (142 - 104);
      }

      // Add gentle random micro-fiber flecks
      const fleck = (Math.random() - 0.5) * 8;
      const idx = (y * size + x) * 4;

      colorData[idx] = Math.max(0, Math.min(255, r + fleck));
      colorData[idx + 1] = Math.max(0, Math.min(255, g + fleck * 0.8));
      colorData[idx + 2] = Math.max(0, Math.min(255, b + fleck * 0.6));
      colorData[idx + 3] = 255;

      // Roughness: very high (matte fleece fabric) with slight variation
      const roughVal = Math.floor(215 + (1 - tuftHeight) * 35);
      roughnessData[idx] = roughVal;
      roughnessData[idx + 1] = roughVal;
      roughnessData[idx + 2] = roughVal;
      roughnessData[idx + 3] = 255;
    }
  }

  // Generate tangent space normal map via Sobel filter over heightmap
  const bumpStrength = 2.4;
  for (let y = 0; y < size; y++) {
    const ym1 = (y - 1 + size) % size;
    const yp1 = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm1 = (x - 1 + size) % size;
      const xp1 = (x + 1) % size;

      // Central difference
      const dx = (heightMap[y * size + xp1] - heightMap[y * size + xm1]) * bumpStrength;
      const dy = (heightMap[yp1 * size + x] - heightMap[ym1 * size + x]) * bumpStrength;

      // Vector [-dx, -dy, 1] normalized
      const len = Math.hypot(dx, dy, 1.0);
      const nx = -dx / len;
      const ny = -dy / len;
      const nz = 1.0 / len;

      const idx = (y * size + x) * 4;
      normalData[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
      normalData[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      normalData[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
      normalData[idx + 3] = 255;
    }
  }

  if (bumpCtx) {
    const bumpImgData = bumpCtx.createImageData(size, size);
    const bData = bumpImgData.data;
    for (let k = 0; k < size * size; k++) {
      const v = Math.floor(Math.max(0, Math.min(1, heightMap[k])) * 255);
      const idx = k * 4;
      bData[idx] = v;
      bData[idx + 1] = v;
      bData[idx + 2] = v;
      bData[idx + 3] = 255;
    }
    bumpCtx.putImageData(bumpImgData, 0, 0);
  }

  colorCtx.putImageData(colorImgData, 0, 0);
  normalCtx.putImageData(normalImgData, 0, 0);
  roughnessCtx.putImageData(roughnessImgData, 0, 0);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(6, 6);

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(6, 6);
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(6, 6);

  const roughnessMap = new THREE.CanvasTexture(roughnessCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(6, 6);

  return { map, bumpMap, normalMap, roughnessMap };
}

// Generate ribbed corduroy texture for legs and feet matching Jellycat plush
export function createCorduroyTextures(size = 512): CorduroyTextureBundle {
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext("2d");

  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = size;
  normalCanvas.height = size;
  const normalCtx = normalCanvas.getContext("2d");

  const roughnessCanvas = document.createElement("canvas");
  roughnessCanvas.width = size;
  roughnessCanvas.height = size;
  const roughnessCtx = roughnessCanvas.getContext("2d");

  if (!colorCtx || !normalCtx || !roughnessCtx) {
    throw new Error("Canvas 2D context not supported");
  }

  const colorImgData = colorCtx.createImageData(size, size);
  const normalImgData = normalCtx.createImageData(size, size);
  const roughnessImgData = roughnessCtx.createImageData(size, size);

  const colorData = colorImgData.data;
  const normalData = normalImgData.data;
  const roughnessData = roughnessImgData.data;

  // Corduroy wales: 24 distinct plush cords across texture
  const wales = 24;
  const ribHeight = new Float32Array(size);

  for (let x = 0; x < size; x++) {
    // Phase within wale [0, 1)
    const u = (x / size) * wales;
    const phase = u - Math.floor(u);
    // Centered at 0.5; cord spans ~0.15 to 0.85 (70% cord, 30% furrow)
    const d = Math.abs(phase - 0.5);
    if (d < 0.38) {
      const t = d / 0.38;
      // Rounded cylindrical profile for the plush pile
      ribHeight[x] = Math.pow(Math.max(0, 1.0 - t * t), 0.65);
    } else {
      ribHeight[x] = 0.0;
    }
  }

  for (let y = 0; y < size; y++) {
    const ny = y / size;
    for (let x = 0; x < size; x++) {
      const rib = ribHeight[x];
      // Micro fabric cross-weave and fiber noise
      const weave = Math.sin(ny * 160 * Math.PI) * 0.05;
      // Subtle fiber jitter
      const jitter = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * 0.04;
      const combined = Math.max(0, Math.min(1, rib + weave + jitter));

      // Warm dusty mocha/fawn corduroy palette sampled from Jellycat reference images:
      // Furrow: rgb(118, 82, 60)
      // Shoulder: rgb(165, 126, 96)
      // Ridge crest highlight: rgb(208, 170, 138)
      // Fluffy fiber nap highlight: rgb(220, 186, 154)
      let r: number, g: number, b: number;
      if (combined < 0.35) {
        const t = combined / 0.35;
        r = 118 + t * (165 - 118);
        g = 82 + t * (126 - 82);
        b = 60 + t * (96 - 60);
      } else {
        const t = (combined - 0.35) / 0.65;
        r = 165 + t * (214 - 165);
        g = 126 + t * (176 - 126);
        b = 96 + t * (144 - 96);
      }

      const idx = (y * size + x) * 4;
      colorData[idx] = Math.floor(r);
      colorData[idx + 1] = Math.floor(g);
      colorData[idx + 2] = Math.floor(b);
      colorData[idx + 3] = 255;

      // Normal map with strong tangent X curvature and subtle Y cross-thread weave
      const xm1 = (x - 1 + size) % size;
      const xp1 = (x + 1) % size;
      const dx = (ribHeight[xp1] - ribHeight[xm1]) * 4.2;
      const dy = Math.cos(ny * 160 * Math.PI) * 0.15;
      const len = Math.hypot(dx, dy, 1.0);
      const nx = -dx / len;
      const ny_val = -dy / len;
      const nz = 1.0 / len;

      normalData[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
      normalData[idx + 1] = Math.floor((ny_val * 0.5 + 0.5) * 255);
      normalData[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
      normalData[idx + 3] = 255;

      // Roughness: furrows matte (0.92), cord pile crest velvety sheen (0.68)
      const rough = Math.floor(235 - combined * 60);
      roughnessData[idx] = rough;
      roughnessData[idx + 1] = rough;
      roughnessData[idx + 2] = rough;
      roughnessData[idx + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImgData, 0, 0);
  normalCtx.putImageData(normalImgData, 0, 0);
  roughnessCtx.putImageData(roughnessImgData, 0, 0);

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;

  const roughnessMap = new THREE.CanvasTexture(roughnessCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;

  return { map, normalMap, roughnessMap };
}

// Generate soft radial contact shadow for floor
export function createContactShadowTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context failed");

  ctx.clearRect(0, 0, size, size);

  // Two soft dark foot contact ovals + one broad body occlusion ellipse
  const cx = size / 2;
  const cy = size / 2;

  // Broad soft shadow
  const broadGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, size * 0.45);
  broadGrad.addColorStop(0, "rgba(30, 20, 15, 0.45)");
  broadGrad.addColorStop(0.4, "rgba(40, 25, 20, 0.22)");
  broadGrad.addColorStop(1, "rgba(40, 25, 20, 0)");
  ctx.fillStyle = broadGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.42, size * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  // Left foot contact shadow
  const leftFootGrad = ctx.createRadialGradient(cx - 50, cy + 10, 4, cx - 50, cy + 10, 48);
  leftFootGrad.addColorStop(0, "rgba(20, 12, 8, 0.7)");
  leftFootGrad.addColorStop(0.5, "rgba(20, 12, 8, 0.3)");
  leftFootGrad.addColorStop(1, "rgba(20, 12, 8, 0)");
  ctx.fillStyle = leftFootGrad;
  ctx.beginPath();
  ctx.ellipse(cx - 50, cy + 10, 50, 36, -0.15, 0, Math.PI * 2);
  ctx.fill();

  // Right foot contact shadow (slightly forward and angled)
  const rightFootGrad = ctx.createRadialGradient(cx + 52, cy - 8, 4, cx + 52, cy - 8, 54);
  rightFootGrad.addColorStop(0, "rgba(20, 12, 8, 0.7)");
  rightFootGrad.addColorStop(0.5, "rgba(20, 12, 8, 0.3)");
  rightFootGrad.addColorStop(1, "rgba(20, 12, 8, 0)");
  ctx.fillStyle = rightFootGrad;
  ctx.beginPath();
  ctx.ellipse(cx + 52, cy - 8, 54, 40, 0.22, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}
