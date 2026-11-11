<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { state } from "@/lib/store";
import type { HatKind } from "./hats";
import {
  HANG_CROUCH_MS,
  HANG_FALL_MS,
  HANG_LEAP_MS,
  JUMP_MS,
  POKE_MS,
  POKE_TOUCH_MS,
  PULL_MS,
} from "./model";
import { createPeanutStage, LEDGE_DROP_PX, type PeanutStage } from "./stage";

// Peanut keeps you company from beside the ribbon tabs. Mostly he perches on
// the edge of the tab row with his legs dangling over the ribbon; now and
// then he stands up, strolls a little way left or right and comes back to
// his spot, shows off his back, or puts on a party hat or pulls a cowboy hat
// out from behind his back. Less often he jams in his headphones, jumps for
// joy, hangs from the top of the window, or goes up to the Commands button
// for a closer look and knocks it crooked. Busy (Settings), he's up to
// something every few seconds. He breathes and blinks, and says a word of
// encouragement only when you click him. What he says fades away slowly.

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
// How long he waits between doing things, chill or busy.
const CHILL_PAUSE_MS: [number, number] = [20_000, 50_000];
const BUSY_PAUSE_MS: [number, number] = [1_500, 5_000];
const JAM_MS: [number, number] = [8_000, 14_000];
const BUSY_JAM_MS: [number, number] = [5_000, 8_000];
// Inspecting the Commands button, how far his box's right edge goes past its
// left edge (bringing him in just left of its icon, close enough to reach up
// and poke it), and how crooked his poke leaves it.
const INSPECT_OVERLAP = 18;
const CROOKED_DEG = 14;
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
const jamming = ref(false); // music notes float up beside him
const notesEl = ref<HTMLElement>();
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
  return t;
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
  // Hanging, the stage itself is raised (or on its way up or down).
  const raised =
    lifting && stageEl.value
      ? -new DOMMatrixReadOnly(getComputedStyle(stageEl.value).transform).m42
      : 0;
  mouthUp = STAGE_ABOVE - y + raised;
  if (message.value) drawTail();
  // The notes rise from beside his head.
  if (notesEl.value) {
    notesEl.value.style.left = `${mouthX + 10}px`;
    notesEl.value.style.bottom = `${mouthUp + 4}px`;
  }
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

// The Commands button, first of the title bar buttons.
const commandsButton = () => document.querySelector<HTMLElement>(".titlebar .right > :first-child");

// Where he may walk, as offsets from his box: standing, his head pokes into
// the title bar, so he keeps between the centred title and the buttons.
function strollRange(): [number, number] {
  const home = homeEl.value!.getBoundingClientRect();
  const title = document.querySelector(".titlebar .title")?.getBoundingClientRect();
  const buttons = commandsButton()?.getBoundingClientRect();
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

// Out to somewhere left or right, at least MIN_STROLL_PX away, a look around,
// then back to settle somewhere in his resting stretch.
let strolling = false;
async function stroll() {
  const [min, max] = strollRange();
  const left = Math.max(0, x.value - MIN_STROLL_PX - min);
  const right = Math.max(0, max - x.value - MIN_STROLL_PX);
  if (!left && !right) return; // too little room
  const roll = Math.random() * (left + right);
  const target = roll < left ? min + roll : x.value + MIN_STROLL_PX + (roll - left);
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

// The cowboy hat he pulls out from behind his back; the others pop on.
async function putOn(kind: HatKind | null) {
  if (kind === "cowboy") {
    stage?.pullOutHat(kind);
    await pause(PULL_MS);
  } else stage?.setHat(kind);
}

let hat: HatKind | null = null;
async function changeHat() {
  if (hat) {
    hat = null;
    stage?.setHat(null);
    return;
  }
  hat = Math.random() < 0.5 ? "cowboy" : "birthday";
  await putOn(hat);
}

// Put on headphones (swapping out any hat) and jam for a while, then put the
// hat back on.
async function jam() {
  stage?.setHat("headphones");
  await pause(500);
  stage?.setJamming(true);
  jamming.value = true;
  await pause(rand(...(state.peanutBusy ? BUSY_JAM_MS : JAM_MS)));
  stage?.setJamming(false);
  jamming.value = false;
  await pause(500);
  await putOn(hat);
}

// The stage is raised by lift px (to hang from the top of the window), moving
// there as liftTransition says; lifting while it's raised or on its way.
const lift = ref(0);
const liftTransition = ref("");
let lifting = false;
function raise(px: number, ms: number, easing: string) {
  liftTransition.value = `transform ${ms}ms ${easing}`;
  lift.value = px;
}

// His back to the room, a leap up to grab the top of the window, a dangle
// with his feet kicking, then a drop back down. His stage rises with him, the
// same way he does, until its top meets the window's.
async function hang() {
  const wasPerched = perched;
  if (perched) {
    perch(false);
    await pause(700);
  }
  stage?.setFacingAway(true);
  await pause(1100);
  stage?.setHanging(true);
  await pause(HANG_CROUCH_MS);
  lifting = true;
  const easeOut = "cubic-bezier(0.25, 0.46, 0.45, 0.94)"; // his leap's ease-out
  raise(stageEl.value!.getBoundingClientRect().top, HANG_LEAP_MS, easeOut);
  await pause(HANG_LEAP_MS + rand(3000, 5000));
  stage?.setHanging(false);
  raise(0, HANG_FALL_MS, "cubic-bezier(0.55, 0.085, 0.68, 0.53)"); // his fall's ease-in
  await pause(HANG_FALL_MS);
  lifting = false;
  await pause(500);
  stage?.setFacingAway(false);
  await pause(900);
  if (wasPerched) perch(true);
}

// Two hops for joy, the second with a twirl; perched, he stands up for them
// and sits back down after.
async function jumpForJoy() {
  const wasPerched = perched;
  if (perched) {
    perch(false);
    await pause(700);
  }
  stage?.jump(false);
  await pause(JUMP_MS + 150);
  stage?.jump(true);
  await pause(JUMP_MS + 800);
  if (wasPerched) perch(true);
}

// A few steps one way, a turn to show off his back a moment, then round
// again and back to where he was.
async function showBack() {
  const [min, max] = strollRange();
  const start = x.value;
  const dir = start - min > max - start ? -1 : 1; // toward the roomier side
  const target = Math.min(max, Math.max(min, start + dir * rand(25, 50)));
  if (Math.abs(target - start) < 15) return; // too little room
  strolling = true;
  const wasPerched = perched;
  if (perched) {
    perch(false);
    await pause(700);
  }
  await walkTo(target);
  await pause(400);
  stage?.setFacingAway(true);
  await pause(rand(2000, 3500));
  stage?.setFacingAway(false);
  await pause(900);
  await walkTo(start);
  strolling = false;
  await pause(500);
  if (wasPerched) perch(true);
}

// The offset from his box that brings him in under the button's icon.
function inspectX(button: HTMLElement) {
  const home = homeEl.value!.getBoundingClientRect();
  return button.getBoundingClientRect().left + INSPECT_OVERLAP - STAGE_W - home.left;
}

// The button he's visiting, which a resize keeps him beside; null otherwise.
let visiting: HTMLElement | null = null;

function tilt(button: HTMLElement, deg: number) {
  button.style.transition = "transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)";
  button.style.transform = deg ? `rotate(${deg}deg)` : "";
}

function straighten(button: HTMLElement) {
  button.style.transition = "";
  button.style.transform = "";
}

// A poke at the button, which leaves it at deg the moment his hand reaches it.
async function prod(button: HTMLElement, deg: number) {
  stage?.poke();
  await pause(POKE_TOUCH_MS);
  tilt(button, deg);
  await pause(POKE_MS - POKE_TOUCH_MS);
}

// Up to the Commands button for a closer look: a poke knocks it crooked, he
// starts, has another look, pokes it straight, and back to his spot he goes.
async function inspect() {
  const button = commandsButton();
  if (!button) return;
  strolling = true;
  if (perched) {
    perch(false);
    await pause(700);
  }
  await walkTo(inspectX(button));
  visiting = button;
  stage?.setInspecting(true);
  await pause(1500);
  await prod(button, CROOKED_DEG);
  stage?.bounce();
  await pause(1800);
  await prod(button, 0);
  await pause(900);
  straighten(button);
  visiting = null;
  stage?.setInspecting(false);
  await walkTo(restX());
  strolling = false;
  await pause(600);
  perch(true);
}

// What he gets up to, weighted chill and busy: busy, he's more often up to
// his tricks.
const activities: [number, number, () => unknown][] = [
  [2, 1.5, changeHat],
  [4, 2.5, stroll],
  [4, 1.5, () => perch(!perched)],
  [0.7, 1.5, jam],
  [0.6, 1.5, jumpForJoy],
  [0.5, 1.5, inspect],
  [1.2, 2, showBack],
  [0.6, 1.5, hang],
];

// Never the same thing twice running, so a busy Peanut keeps changing it up.
let lastActivity: (typeof activities)[number] | undefined;
function pickActivity() {
  const k = state.peanutBusy ? 1 : 0;
  const options = activities.filter((a) => a !== lastActivity);
  let roll = Math.random() * options.reduce((sum, a) => sum + a[k], 0);
  lastActivity = options.find((a) => (roll -= a[k]) < 0) ?? options[0];
  return lastActivity[2];
}

// Every so often, one of those, then wait again. Switching between chill and
// busy restarts the wait, unless he's in the middle of something.
let nextActivity: ReturnType<typeof setTimeout> | undefined;
let acting = false;
function scheduleActivity() {
  if (nextActivity) {
    clearTimeout(nextActivity);
    timers.delete(nextActivity);
  }
  nextActivity = later(rand(...(state.peanutBusy ? BUSY_PAUSE_MS : CHILL_PAUSE_MS)), async () => {
    acting = true;
    await pickActivity()();
    acting = false;
    scheduleActivity();
  });
}
watch(
  () => state.peanutBusy,
  () => acting || scheduleActivity(),
);

// A resized window moves the open stretch: keep him inside it mid-stroll, and
// inside his resting stretch otherwise, or beside the button he's visiting.
function onResize() {
  walkMs.value = 0;
  if (visiting) {
    x.value = inspectX(visiting);
    return;
  }
  const [min, max] = strolling ? strollRange() : restRange();
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
  scheduleActivity();
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", onPointerDown);
  window.removeEventListener("resize", onResize);
  timers.forEach(clearTimeout);
  clearTimeout(hideTimer);
  if (visiting) straighten(visiting);
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
      <div
        ref="stageEl"
        class="stage"
        role="img"
        aria-label="Peanut, your writing buddy"
        :style="{
          transform: lift ? `translateY(${-lift}px)` : undefined,
          transition: liftTransition,
        }"
      />
      <div v-if="jamming" ref="notesEl" class="notes" aria-hidden="true">
        <span>♪</span><span>♫</span><span>♪</span>
      </div>
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
/* Music notes drift up and away beside his head while he jams; onMouth keeps
   their origin there. */
.notes {
  position: absolute;
  width: 0;
  height: 0;
}
.notes span {
  position: absolute;
  left: 0;
  bottom: 0;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  color: var(--roast);
  opacity: 0;
  animation: note-float 1.8s ease-out infinite;
}
.notes span:nth-child(2) {
  --drift: -5px;
  color: var(--accent);
  animation-delay: 0.6s;
}
.notes span:nth-child(3) {
  --drift: 11px;
  animation-delay: 1.2s;
}
@keyframes note-float {
  0% {
    opacity: 0;
    transform: translate(0, 0) rotate(-10deg) scale(0.6);
  }
  20% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(var(--drift, 4px), -22px) rotate(12deg) scale(1);
  }
}
</style>
