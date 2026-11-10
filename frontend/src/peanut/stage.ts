// A small transparent three.js stage holding Peanut: fixed camera, studio
// lights, and a render loop capped at 30 fps so an idle companion stays cheap.

import * as THREE from "three";
import { createPeanutModel } from "./model";

const BOUNCE_MS = 750;
const BLINK_MS = 150;
const FRAME_MS = 1000 / 30;
// The bottom LEDGE_DROP_PX of the container hang below the ledge Peanut stands
// or perches on, so his dangling legs (up to ~17px below it) have room; the
// rest frames him as before.
export const LEDGE_DROP_PX = 20;

export interface PeanutStage {
  bounce: () => void;
  blink: () => void;
  setSitting: (sitting: boolean) => void;
  walk: (direction: -1 | 0 | 1) => void;
  hits: (clientX: number, clientY: number) => boolean;
  dispose: () => void;
}

// onMouth hears where his mouth is after every rendered frame, in CSS px from
// the container's top-left corner.
export function createPeanutStage(
  container: HTMLElement,
  onMouth: (x: number, y: number) => void,
): PeanutStage {
  const width = container.clientWidth;
  const height = container.clientHeight;

  const scene = new THREE.Scene();
  // Three-quarter view from Peanut's left, so he faces into the window. The
  // camera frames the part above the ledge (height - LEDGE_DROP_PX tall); a
  // view offset into a taller virtual frame adds the strip below it.
  const above = height - LEDGE_DROP_PX;
  const full = above + 2 * LEDGE_DROP_PX;
  const fov = THREE.MathUtils.radToDeg(
    2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(15)) * (full / above)),
  );
  const camera = new THREE.PerspectiveCamera(fov, width / full, 0.1, 50);
  camera.position.set(3.0, 2.4, 7.6);
  camera.lookAt(0, 1.75, 0);
  camera.setViewOffset(width, full, 0, LEDGE_DROP_PX, width, height);
  // The camera looks down on him, so the world ledge (y = 0 under his feet)
  // lands above the frame's ledge row. Slide the view so the two coincide and
  // he stands and sits exactly on the container's ledge line.
  camera.updateMatrixWorld();
  const ledgeRow = ((1 - new THREE.Vector3(0, 0, 0).project(camera).y) / 2) * height;
  camera.setViewOffset(width, full, 0, LEDGE_DROP_PX + ledgeRow - above, width, height);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  // The original's "studio" lighting preset.
  const key = new THREE.DirectionalLight(0xfff6ee, 2.2);
  key.position.set(3.5, 5.0, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, {
    near: 1,
    far: 14,
    left: -2.5,
    right: 2.5,
    top: 4,
    bottom: -1,
  });
  key.shadow.bias = -0.0003;
  key.shadow.radius = 3.5;
  const fill = new THREE.DirectionalLight(0xe5edfa, 1.1);
  fill.position.set(-4.0, 3.0, 2.5);
  const rim = new THREE.DirectionalLight(0xffdfba, 2.6);
  rim.position.set(1.0, 4.5, -3.5);
  const bounceLight = new THREE.DirectionalLight(0xfff1e5, 0.85);
  bounceLight.position.set(0.0, -1.0, 3.5);
  const hemi = new THREE.HemisphereLight(0xfff7ed, 0xdfd8ce, 0.85);
  scene.add(key, fill, rim, bounceLight, hemi);

  const peanut = createPeanutModel();
  scene.add(peanut.group);

  let bounceStart = 0;
  let blinkStart = 0;
  const start = performance.now();
  let last = start;
  let frame = 0;
  const mouth = new THREE.Vector3();

  function loop(now: number) {
    frame = requestAnimationFrame(loop);
    if (now - last < FRAME_MS) return;
    const delta = Math.min(0.1, (now - last) / 1000);
    last = now;

    let bounceProgress = 0;
    if (bounceStart) {
      bounceProgress = (now - bounceStart) / BOUNCE_MS;
      if (bounceProgress >= 1) bounceStart = bounceProgress = 0;
    }
    let blinkProgress = 0;
    if (blinkStart) {
      blinkProgress = (now - blinkStart) / BLINK_MS;
      if (blinkProgress >= 1) blinkStart = blinkProgress = 0;
    }
    peanut.animate((now - start) / 1000, bounceProgress, blinkProgress, delta);
    renderer.render(scene, camera);
    peanut.mouth.getWorldPosition(mouth).project(camera);
    onMouth(((mouth.x + 1) / 2) * width, ((1 - mouth.y) / 2) * height);
  }
  frame = requestAnimationFrame(loop);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  return {
    bounce: () => (bounceStart = performance.now()),
    blink: () => (blinkStart = performance.now()),
    setSitting: peanut.setSitting,
    walk: peanut.walk,
    hits(clientX, clientY) {
      const r = renderer.domElement.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) {
        return false;
      }
      pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster
        .intersectObject(peanut.group, true)
        .some((hit) => !hit.object.userData.isShadow);
    },
    dispose() {
      cancelAnimationFrame(frame);
      peanut.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
