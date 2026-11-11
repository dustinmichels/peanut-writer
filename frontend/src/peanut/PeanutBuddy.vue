<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { HatKind } from "./hats";
import { createPeanutStage, LEDGE_DROP_PX, type PeanutStage } from "./stage";

// Peanut keeps you company from beside the ribbon tabs. Mostly he perches on
// the edge of the tab row with his legs dangling over the ribbon; now and
// then he stands up, strolls a little way left or right and comes back to
// his spot, or puts on a cowboy or party hat. He breathes and blinks, and
// says a word of encouragement only when you click him. What he says fades
// away slowly.

const CHEERS = [
  "You can do it!",
  "Keep going, you're doing great!",
  "One word at a time.",
  "I believe in you!",
  "Shell yeah! Keep writing!",
  "You're on a roll!",
  "Tough nuts crack eventually. Keep at it!",
  "Every draft counts.",
  "Done is better than perfect.",
  "Deep breath. You've got this.",
  "Proud of you for showing up!",
  "Write the messy version first.",
  "Look at you go!",
];
const SAY_MS = 4000; // from popping out of his mouth to faded away
const WALK_PX_PER_S = 28;
const MIN_STROLL_PX = 40;
const REST_INSET = 0.2; // share of the open stretch at each end he only strolls through
const GAP = 10; // kept clear around the title, title bar buttons and tabs
const STAGE_W = 52; // his stage, and the strip of ledge he occupies
const STAGE_ABOVE = 65; // stage height above the ledge
const BUBBLE_GAP = 6; // between his stage and the bubble, crossed by its tail
const BUBBLE_BOTTOM = 2; // bubble's lift off the ledge
const widthPx = `${STAGE_W}px`;
const abovePx = `${STAGE_ABOVE}px`;
const dropPx = `${LEDGE_DROP_PX}px`;
const bubbleGapPx = `${BUBBLE_GAP}px`;
const bubbleBottomPx = `${BUBBLE_BOTTOM}px`;
const sayMs = `${SAY_MS}ms`;

const homeEl = ref<HTMLElement>();
const walkerEl = ref<HTMLElement>();
const stageEl = ref<HTMLElement>();
const speechEl = ref<HTMLElement>();
const tailBackEl = ref<SVGPathElement>();
const tailFrontEl = ref<SVGPathElement>();
const message = ref("");
const bubbleSide = ref<"left" | "right">("left");
const bubbleMax = ref(300);
// Offset from where his box sits (px, negative is left) and how long the
// current walk there takes; 0 moves him at once.
const x = ref(0);
const walkMs = ref(0);
let stage: PeanutStage | undefined;
const timers = new Set<ReturnType<typeof setTimeout>>();

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function later(ms: number, f: () => void) {
  const t = setTimeout(() => {
    timers.delete(t);
    f();
  }, ms);
  timers.add(t);
}
const pause = (ms: number) => new Promise<void>((resolve) => later(ms, resolve));

// The bubble goes on whichever side has more open room in the tab row: left
// up to the last tab, right up to the window edge. One line stays below both
// the centred title and the title bar buttons.
function placeBubble() {
  const me = walkerEl.value!.getBoundingClientRect();
  const tabsEnd = homeEl.value!.previousElementSibling?.getBoundingClientRect().right ?? 0;
  const left = me.left - tabsEnd - GAP - BUBBLE_GAP;
  const right = window.innerWidth - me.right - GAP - BUBBLE_GAP;
  bubbleSide.value = left >= right ? "left" : "right";
  bubbleMax.value = Math.min(300, Math.max(left, right));
}

// His mouth, in px from the walker's left edge and up from the ledge; the
// stage reports it every frame as he sits, stands, bounces and turns.
let mouthX = STAGE_W / 2;
let mouthUp = STAGE_ABOVE / 2;
function onMouth(x: number, y: number) {
  mouthX = x;
  mouthUp = STAGE_ABOVE - y;
  if (message.value) drawTail();
}

// The tail curls from inside the bubble's inner edge to just short of his
// mouth. It passes under the stage, so his body hides whatever would cross
// his face. Drawn twice: an outlined copy below the bubble and a fill-only
// copy above it that erases the bubble's border where the two join.
function drawTail() {
  if (!speechEl.value) return;
  const dir = bubbleSide.value === "left" ? -1 : 1; // from him toward the bubble
  const edge = dir < 0 ? -BUBBLE_GAP : STAGE_W + BUBBLE_GAP;
  const baseX = edge + dir * 10;
  const baseLo = BUBBLE_BOTTOM + 6;
  const baseHi = BUBBLE_BOTTOM + 22;
  const tipX = mouthX + dir * 3;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  // Both sides bow toward the bubble's middle height, so the tail stays plump
  // where it leaves the bubble and narrows quickly to the tip.
  const midX = lerp(edge, tipX, 0.55);
  const midUp = (baseLo + baseHi) / 2;
  const d =
    `M${baseX},${-baseHi} Q${midX},${-lerp(lerp(baseHi, midUp, 0.4), mouthUp, 0.35)} ` +
    `${tipX},${-mouthUp} Q${midX},${-lerp(lerp(baseLo, midUp, 0.4), mouthUp, 0.35)} ` +
    `${baseX},${-baseLo}Z`;
  tailBackEl.value!.setAttribute("d", d);
  tailFrontEl.value!.setAttribute("d", d);
  // Pop in and out of his mouth.
  speechEl.value.style.transformOrigin = `${tipX}px ${-mouthUp}px`;
}

let hideTimer: ReturnType<typeof setTimeout> | undefined;
// Bumped per line, so a new one replaces the bubble and restarts its fade.
const said = ref(0);
async function say(text: string) {
  placeBubble();
  message.value = text;
  said.value++;
  stage?.bounce();
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => (message.value = ""), SAY_MS);
  await nextTick();
  drawTail();
}

let lastCheer = "";
function cheer() {
  const options = CHEERS.filter((c) => c !== lastCheer);
  lastCheer = options[Math.floor(Math.random() * options.length)];
  say(lastCheer);
}

function blinkLoop() {
  later(rand(2500, 6000), () => {
    stage?.blink();
    if (Math.random() < 0.2) later(260, () => stage?.blink());
    blinkLoop();
  });
}

// Where he may walk, as offsets from his box: standing, his head pokes into
// the title bar, so he keeps between the centred title and the buttons.
function strollRange(): [number, number] {
  const home = homeEl.value!.getBoundingClientRect();
  const title = document.querySelector(".titlebar .title")?.getBoundingClientRect();
  const buttons = document
    .querySelector(".titlebar .right > :first-child")
    ?.getBoundingClientRect();
  const max = Math.min(0, buttons ? buttons.left - GAP - home.right : 0);
  const min = title ? title.right + GAP - home.left : max;
  return [Math.min(min, max), max];
}

let perched = true;
function perch(sit: boolean) {
  perched = sit;
  stage?.setSitting(sit);
}

// Where he settles: the middle stretch of that open title bar, leaving the
// ends near the title and the buttons for strolls.
function restRange(): [number, number] {
  const [min, max] = strollRange();
  const inset = (max - min) * REST_INSET;
  return [min + inset, max - inset];
}
const restX = () => rand(...restRange());

async function walkTo(target: number) {
  stage?.walk(target < x.value ? -1 : 1);
  walkMs.value = (Math.abs(target - x.value) / WALK_PX_PER_S) * 1000;
  x.value = target;
  await pause(walkMs.value);
  stage?.walk(0);
}

// Out to somewhere left or right, a look around, then back to settle
// somewhere in his resting stretch.
let strolling = false;
async function stroll() {
  const [min, max] = strollRange();
  const target = rand(min, max);
  if (Math.abs(target - x.value) < MIN_STROLL_PX) return;
  strolling = true;
  if (perched) {
    perch(false);
    await pause(700);
  }
  await walkTo(target);
  await pause(rand(1500, 4000));
  await walkTo(restX());
  strolling = false;
  await pause(600);
  perch(true);
}

let hat: HatKind | null = null;
function changeHat() {
  if (hat) {
    hat = null;
    stage?.setHat(null);
    return;
  }
  hat = Math.random() < 0.5 ? "cowboy" : "birthday";
  stage?.setHat(hat);
}

// Every so often: stand up or sit back down, stroll out and back, or put on
// a hat (or take it off).
function activityLoop() {
  later(rand(20_000, 50_000), async () => {
    const roll = Math.random();
    if (roll < 0.2) changeHat();
    else if (roll < 0.6) await stroll();
    else perch(!perched);
    activityLoop();
  });
}

// A resized window moves the open stretch: keep him inside it mid-stroll, and
// inside his resting stretch otherwise.
function onResize() {
  const [min, max] = strolling ? strollRange() : restRange();
  walkMs.value = 0;
  x.value = Math.min(max, Math.max(min, x.value));
}

function onPointerDown(e: PointerEvent) {
  if (stage?.hits(e.clientX, e.clientY)) cheer();
}

onMounted(() => {
  stage = createPeanutStage(stageEl.value!, onMouth);
  x.value = restX();
  perch(true);
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("resize", onResize);
  blinkLoop();
  activityLoop();
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", onPointerDown);
  window.removeEventListener("resize", onResize);
  timers.forEach(clearTimeout);
  clearTimeout(hideTimer);
  stage?.dispose();
});
</script>

<template>
  <div ref="homeEl" class="buddy">
    <div
      ref="walkerEl"
      class="walker"
      :style="{ transform: `translateX(${x}px)`, transitionDuration: `${walkMs}ms` }"
    >
      <Transition name="speech">
        <div v-if="message" :key="said" ref="speechEl" class="speech" :class="bubbleSide">
          <svg class="tail back" aria-hidden="true"><path ref="tailBackEl" /></svg>
          <div class="bubble" :style="{ maxWidth: `${bubbleMax}px` }" aria-live="polite">
            {{ message }}
          </div>
          <svg class="tail front" aria-hidden="true"><path ref="tailFrontEl" /></svg>
        </div>
      </Transition>
      <div ref="stageEl" class="stage" role="img" aria-label="Peanut, your writing buddy" />
    </div>
  </div>
</template>

<style scoped>
/* Clicks pass through to the page; Peanut hit-tests them himself. His box sits
   on the wooden ledge along the bottom of the tab row, just
   left of the Show in Finder, Sync files and Export buttons in the title bar;
   he rests in the middle of the gap between there and the centred title. */
.buddy {
  position: relative;
  z-index: 70; /* over menus (60), under modal scrims (80) */
  width: v-bind(widthPx);
  margin: 0 290px 0 auto; /* clear of the title bar buttons above */
  pointer-events: none;
}
/* Strolls slide him along the ledge at walking pace. */
.walker {
  position: absolute;
  left: 0;
  bottom: 0;
  width: v-bind(widthPx);
  transition-property: transform;
  transition-timing-function: linear;
}
/* Room above the ledge for him, plus the strip below it for dangling legs. */
.stage {
  position: absolute;
  left: 0;
  bottom: calc(-1 * v-bind(dropPx));
  width: v-bind(widthPx);
  height: calc(v-bind(abovePx) + v-bind(dropPx));
}
/* A zero-height box on the ledge: the bubble and its tail hang off it in px
   from his left edge and up from the ledge, matching drawTail's coordinates. */
.speech {
  position: absolute;
  left: 0;
  bottom: 0;
  width: v-bind(widthPx);
  height: 0;
}
.tail {
  position: absolute;
  left: 0;
  top: 0;
  width: 1px;
  height: 1px;
  overflow: visible;
}
.tail path {
  fill: var(--surface);
}
.tail.back {
  filter: drop-shadow(0 2px 2px rgba(120, 70, 20, 0.12));
}
.tail.back path {
  stroke: var(--shell);
  stroke-width: 3px; /* half shows outside the fill, matching the bubble border */
  stroke-linejoin: round;
}
/* Sits on the ledge beside him, low enough that one line stays below the
   centred title and the title bar buttons; placeBubble picks the side. */
.bubble {
  position: absolute;
  bottom: v-bind(bubbleBottomPx);
  width: max-content;
  padding: 6px 13px;
  background: var(--surface);
  border: 1.5px solid var(--shell);
  border-radius: 16px;
  box-shadow:
    0 6px 14px -6px rgba(120, 70, 20, 0.3),
    0 1px 2px rgba(120, 70, 20, 0.08);
  font-family: var(--rounded);
  font-size: 13px;
  font-weight: 600;
  color: var(--roast);
  line-height: 1.35;
}
.speech.left .bubble {
  right: calc(100% + v-bind(bubbleGapPx));
}
.speech.right .bubble {
  left: calc(100% + v-bind(bubbleGapPx));
}
/* drawTail sets transform-origin to the tail's tip, so it grows from his mouth,
   then fades away almost at once, gone by the time say() clears it. */
.speech {
  animation: speech-fade v-bind(sayMs) forwards;
}
@keyframes speech-fade {
  0% {
    opacity: 0;
  }
  5% {
    opacity: 1;
    animation-timing-function: ease-in;
  }
  100% {
    opacity: 0;
  }
}
.speech-enter-active {
  transition: transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.speech-enter-from {
  transform: scale(0.4);
}
/* Faded already, or replaced by his next line: go at once. */
.speech-leave-active {
  animation: none;
  opacity: 0;
}
</style>
