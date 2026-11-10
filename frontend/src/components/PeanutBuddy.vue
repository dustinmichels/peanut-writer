<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { state } from "../lib/store";
import { createPeanutStage, type PeanutStage } from "../peanut/stage";

// Peanut keeps you company from beside the ribbon tabs: he breathes, blinks,
// sits down and stands up now and then, and cheers you on while you write.

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
const MILESTONE = 250; // words
const SAY_MS = 6000;

const stageEl = ref<HTMLElement>();
const message = ref("");
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

let hideTimer: ReturnType<typeof setTimeout> | undefined;
let lastSaidAt = 0;
function say(text: string) {
  message.value = text;
  lastSaidAt = Date.now();
  stage?.bounce();
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => (message.value = ""), SAY_MS);
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

type Pose = "stand" | "sit" | "cross";
let pose: Pose = "stand";
function poseLoop() {
  later(rand(25_000, 60_000), () => {
    const next = (["stand", "sit", "cross"] as Pose[]).filter((p) => p !== pose);
    pose = next[Math.floor(Math.random() * next.length)];
    stage?.setSitting(pose !== "stand");
    stage?.setLegsCrossed(pose === "cross");
    poseLoop();
  });
}

// While you're writing, a cheer every few minutes; nothing while you're away.
let lastTypedAt = 0;
function cheerLoop() {
  later(rand(4, 7) * 60_000, () => {
    if (Date.now() - lastTypedAt < 2 * 60_000 && Date.now() - lastSaidAt > 60_000) cheer();
    cheerLoop();
  });
}

watch(
  () => state.words,
  (now, before) => {
    const added = now - before;
    // Opening a document changes the count by a lot at once; that isn't writing.
    if (added <= 0 || added > 50) return;
    lastTypedAt = Date.now();
    const mark = Math.floor(now / MILESTONE) * MILESTONE;
    if (mark > before) say(`${mark.toLocaleString()} words! You can do it!`);
  },
);

function onPointerDown(e: PointerEvent) {
  if (stage?.hits(e.clientX, e.clientY)) cheer();
}

onMounted(() => {
  stage = createPeanutStage(stageEl.value!);
  window.addEventListener("pointerdown", onPointerDown);
  later(1200, () => say("Hi, I'm Peanut! You can do it!"));
  blinkLoop();
  poseLoop();
  cheerLoop();
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", onPointerDown);
  timers.forEach(clearTimeout);
  clearTimeout(hideTimer);
  stage?.dispose();
});
</script>

<template>
  <div class="buddy">
    <Transition name="bubble">
      <div v-if="message" class="bubble" aria-live="polite">{{ message }}</div>
    </Transition>
    <div ref="stageEl" class="stage" role="img" aria-label="Peanut, your writing buddy" />
  </div>
</template>

<style scoped>
/* Clicks pass through to the page; Peanut hit-tests them himself. He stands
   on the ribbon panel at the right end of the tab row, his head poking up
   into the title bar just left of the Export button. */
.buddy {
  position: relative;
  z-index: 90;
  width: 52px;
  margin: 0 120px 0 auto; /* clear of the Export button above */
  pointer-events: none;
}
.stage {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 52px;
  height: 65px;
}
/* Speaks to his left, into the empty stretch between the document title and
   Export and the tab row below it. Narrow enough at the minimum window width
   (960px) to stay clear of the centred title. */
.bubble {
  position: absolute;
  right: calc(100% + 2px);
  bottom: 2px;
  width: max-content;
  max-width: min(300px, calc(50vw - 280px));
  padding: 8px 13px;
  border-radius: 14px 14px 4px 14px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow);
  font-family: var(--rounded);
  font-size: 13px;
  font-weight: 600;
  color: var(--roast);
  line-height: 1.35;
}
.bubble-enter-active,
.bubble-leave-active {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform-origin: bottom right;
}
.bubble-enter-from,
.bubble-leave-to {
  opacity: 0;
  transform: translateX(6px) scale(0.9);
}
</style>
