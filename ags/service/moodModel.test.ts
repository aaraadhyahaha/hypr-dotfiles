import { test } from "node:test"
import assert from "node:assert/strict"
import {
  type MoodInput,
  categorize,
  period,
  pomoKind,
  focusEnded,
  nextMode,
  parseMode,
  moodClasses,
  ALL_CLASSES,
} from "./moodModel.ts"

const base: MoodInput = {
  mode: "both",
  hour: 12,
  pomo: null,
  app: { group: "unknown", distraction: false },
  caffeine: false,
  flash: false,
  sweep: false,
}
const mood = (o: Partial<MoodInput>) => moodClasses({ ...base, ...o })

test("categorize: app groups", () => {
  assert.equal(categorize("kitty", "fish").group, "build")
  assert.equal(categorize("com.microsoft.VSCode", "x.ts").group, "build")
  assert.equal(categorize("dev.zed.Zed", "").group, "build")
  assert.equal(categorize("md.obsidian.Obsidian", "note").group, "write")
  assert.equal(categorize("zen", "MDN Web Docs").group, "browse")
  assert.equal(categorize("org.pulseaudio.pavucontrol", "Volume").group, "system")
  assert.equal(categorize("gimp", "").group, "unknown")
  assert.equal(categorize("", "").group, "unknown")
})

test("categorize: watch is a distraction", () => {
  assert.deepEqual(categorize("mpv", "film.mkv"), { group: "watch", distraction: true })
  assert.deepEqual(categorize("zen", "Video - YouTube — Zen Browser"), { group: "watch", distraction: true })
  assert.equal(categorize("firefox", "r/linux - Reddit").group, "watch")
  assert.equal(categorize("google-chrome", "Home / X").group, "watch")
  assert.equal(categorize("zen", "x.com/home").group, "watch")
  // "x" only as the site, not any word containing x
  assert.equal(categorize("zen", "Linux kernel docs").group, "browse")
  // Non-browsers with a watch-y title stay in their group
  assert.equal(categorize("kitty", "youtube-dl").group, "build")
})

test("categorize: music is not watch", () => {
  assert.equal(categorize("zen", "Song - YouTube Music").group, "browse")
  assert.equal(categorize("zen", "music.youtube.com").group, "browse")
  assert.equal(categorize("zen", "Spotify – Web Player").group, "browse")
  assert.equal(categorize("zen", "Track | SoundCloud").group, "browse")
  assert.equal(categorize("zen", "Song - YouTube Music").distraction, false)
})

test("period boundaries", () => {
  assert.equal(period(4), "night")
  assert.equal(period(5), "dawn")
  assert.equal(period(8), "dawn")
  assert.equal(period(9), "day")
  assert.equal(period(16), "day")
  assert.equal(period(17), "dusk")
  assert.equal(period(19), "dusk")
  assert.equal(period(20), "night")
  assert.equal(period(0), "night")
  assert.equal(period(24), "night")
})

test("pomoKind and focusEnded", () => {
  assert.equal(pomoKind(null), null)
  assert.equal(pomoKind({ phase: "focus", running: false }), null)
  assert.equal(pomoKind({ phase: "focus", running: true }), "focus")
  assert.equal(pomoKind({ phase: "short", running: true }), "break")
  assert.equal(pomoKind({ phase: "long", running: true }), "break")
  assert.equal(focusEnded({ phase: "focus", running: true }, { phase: "short", running: true }), true)
  assert.equal(focusEnded({ phase: "focus", running: true }, { phase: "long", running: false }), true)
  assert.equal(focusEnded({ phase: "focus", running: true }, { phase: "focus", running: false }), false)
  assert.equal(focusEnded({ phase: "short", running: true }, { phase: "focus", running: true }), false)
  assert.equal(focusEnded(null, { phase: "short", running: true }), false)
})

test("modes cycle and parse", () => {
  assert.equal(nextMode("ambient"), "both")
  assert.equal(nextMode("both"), "reactive")
  assert.equal(nextMode("reactive"), "ambient")
  assert.equal(parseMode(" reactive\n"), "reactive")
  assert.equal(parseMode("loud"), null)
  assert.equal(parseMode(null), null)
})

test("mode filtering", () => {
  const all = { hour: 19, caffeine: true, app: { group: "build" as const, distraction: false } }
  assert.deepEqual(mood({ ...all, mode: "ambient" }), ["shell-ambient", "amb-dusk"])
  assert.deepEqual(mood({ ...all, mode: "reactive" }), ["shell-reactive", "mood-build", "edge-caffeine"])
  assert.deepEqual(mood({ ...all, mode: "both" }), ["shell-both", "amb-dusk", "mood-build", "edge-caffeine"])
})

test("pomodoro outranks app tint", () => {
  const app = { group: "build" as const, distraction: false }
  assert.ok(mood({ app, pomo: { phase: "focus", running: true } }).includes("mood-focus"))
  assert.ok(!mood({ app, pomo: { phase: "focus", running: true } }).includes("mood-build"))
  assert.ok(mood({ app, pomo: { phase: "short", running: true } }).includes("mood-break"))
  // Paused pomodoro falls back to app purpose
  assert.ok(mood({ app, pomo: { phase: "focus", running: false } }).includes("mood-build"))
})

test("system and unknown apps get no tint", () => {
  for (const group of ["system", "unknown"] as const) {
    const c = mood({ app: { group, distraction: false } })
    assert.ok(!c.some((x) => x.startsWith("mood-")), group)
  }
})

test("nudge only during focus on a distraction", () => {
  const watch = { group: "watch" as const, distraction: true }
  assert.ok(mood({ app: watch, pomo: { phase: "focus", running: true } }).includes("edge-nudge"))
  assert.ok(!mood({ app: watch, pomo: { phase: "short", running: true } }).includes("edge-nudge"))
  assert.ok(!mood({ app: watch }).includes("edge-nudge"))
  assert.ok(mood({ app: watch }).includes("mood-watch"))
})

test("critical flash outranks nudge; caffeine stacks", () => {
  const c = mood({
    app: { group: "watch", distraction: true },
    pomo: { phase: "focus", running: true },
    flash: true,
    caffeine: true,
  })
  assert.ok(c.includes("edge-critical"))
  assert.ok(!c.includes("edge-nudge"))
  assert.ok(c.includes("edge-caffeine"))
  assert.ok(c.includes("mood-focus"))
})

test("sweep only in reactive modes", () => {
  assert.ok(mood({ sweep: true }).includes("sweep"))
  assert.ok(!mood({ sweep: true, mode: "ambient" }).includes("sweep"))
})

test("ALL_CLASSES covers every emitted class", () => {
  const inputs: Partial<MoodInput>[] = [
    { mode: "ambient", hour: 6 },
    { mode: "reactive", flash: true, caffeine: true, sweep: true, pomo: { phase: "long", running: true } },
    { app: { group: "write", distraction: false }, hour: 22 },
    { app: { group: "watch", distraction: true }, pomo: { phase: "focus", running: true } },
  ]
  for (const i of inputs) for (const c of mood(i)) assert.ok(ALL_CLASSES.includes(c), c)
})
