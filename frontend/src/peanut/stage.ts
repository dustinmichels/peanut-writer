// A small transparent three.js stage holding Peanut: fixed camera, studio
// lights, and a render loop capped at 30 fps so an idle companion stays cheap.

import * as THREE from "three";
import { createPeanutModel } from "./model";

const BOUNCE_MS = 750;
const BLINK_MS = 150;
const FRAME_MS = 1000 / 30;

export interface PeanutStage {
  bounce: () => void;
  blink: () => void;
  setSitting: (sitting: boolean) => void;
  setLegsCrossed: (crossed: boolean) => void;
  hits: (clientX: number, clientY: number) => boolean;
  dispose: () => void;
}

export function createPeanutStage(container: HTMLElement): PeanutStage {
  const width = container.clientWidth;
  const height = container.clientHeight;

  const scene = new THREE.Scene();
  // Three-quarter view from Peanut's left, so he faces into the window.
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 50);
  camera.position.set(3.0, 2.4, 7.6);
  camera.lookAt(0, 1.75, 0);

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
  }
  frame = requestAnimationFrame(loop);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  return {
    bounce: () => (bounceStart = performance.now()),
    blink: () => (blinkStart = performance.now()),
    setSitting: peanut.setSitting,
    setLegsCrossed: peanut.setLegsCrossed,
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
