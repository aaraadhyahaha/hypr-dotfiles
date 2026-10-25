import { test } from "node:test"
import assert from "node:assert/strict"
import { fxAddArgs, matchTasks, parseAction, parseDuration, parseFxQuery, riskyPrefix } from "./actionsModel.ts"

test("parseDuration reads units, h-m shorthand and clock forms", () => {
  assert.equal(parseDuration("10m"), 600)
  assert.equal(parseDuration("1h30"), 5400)
  assert.equal(parseDuration("1h30m"), 5400)
  assert.equal(parseDuration("90s"), 90)
  assert.equal(parseDuration("1.5h"), 5400)
  assert.equal(parseDuration("1:30"), 5400)
  assert.equal(parseDuration("1:30:15"), 5415)
  assert.equal(parseDuration("2h"), 7200)
  assert.equal(parseDuration("10"), 600)
  assert.equal(parseDuration("5 min"), 300)
})

test("parseDuration rejects junk and zero", () => {
  for (const s of ["", "tea", "0", "0m", "m", "10x", "h30", "1:", "-5m"]) assert.equal(parseDuration(s), null, s)
})

test("parseAction timers", () => {
  assert.deepEqual(parseAction("timer 10m"), { kind: "timer", secs: 600, label: "" })
  assert.deepEqual(parseAction("timer 1h30 green tea"), { kind: "timer", secs: 5400, label: "green tea" })
  assert.deepEqual(parseAction("timer"), { kind: "timers" })
  assert.equal(parseAction("timer tea"), null)
})

test("parseAction timer durations may span two words", () => {
  assert.deepEqual(parseAction("timer 5 min tea"), { kind: "timer", secs: 300, label: "tea" })
  assert.deepEqual(parseAction("timer 1h 30m"), { kind: "timer", secs: 5400, label: "" })
  assert.deepEqual(parseAction("timer 1h 30 laundry"), { kind: "timer", secs: 5400, label: "laundry" })
  assert.deepEqual(parseAction("timer 10 tea"), { kind: "timer", secs: 600, label: "tea" })
  // two bare numbers are a duration and a label, never one glued number
  assert.deepEqual(parseAction("timer 10 15"), { kind: "timer", secs: 600, label: "15" })
  assert.deepEqual(parseAction("timer 10m 5 eggs"), { kind: "timer", secs: 600, label: "5 eggs" })
})

test("riskyPrefix flags session-ending actions reached by prefix", () => {
  const risky = (q: string) => riskyPrefix(q, parseAction(q)!)
  assert.equal(risky("reb"), true)
  assert.equal(risky("shut"), true)
  assert.equal(risky("logo"), true)
  assert.equal(risky("reboot"), false)
  assert.equal(risky("Shutdown"), false)
  assert.equal(risky("poweroff"), false)
  assert.equal(risky("logout"), false)
  assert.equal(risky("loc"), false)
  assert.equal(risky("sus"), false)
  assert.equal(risky("vol 30"), false)
})

test("parseAction volume and brightness", () => {
  assert.deepEqual(parseAction("volume 30"), { kind: "volume", value: 30, relative: false })
  assert.deepEqual(parseAction("vol +10"), { kind: "volume", value: 10, relative: true })
  assert.deepEqual(parseAction("vol -10"), { kind: "volume", value: -10, relative: true })
  assert.deepEqual(parseAction("vol 30%"), { kind: "volume", value: 30, relative: false })
  assert.deepEqual(parseAction("vol 500"), { kind: "volume", value: 100, relative: false })
  assert.deepEqual(parseAction("brightness 50"), { kind: "brightness", value: 50, relative: false })
  assert.deepEqual(parseAction("bri 0"), { kind: "brightness", value: 1, relative: false })
  assert.equal(parseAction("vol"), null)
  assert.equal(parseAction("vol loud"), null)
})

test("parseAction mute", () => {
  assert.deepEqual(parseAction("mute"), { kind: "mute", target: "speaker", state: true })
  assert.deepEqual(parseAction("unmute"), { kind: "mute", target: "speaker", state: false })
  assert.deepEqual(parseAction("mic"), { kind: "mute", target: "mic" })
  assert.deepEqual(parseAction("mic mute"), { kind: "mute", target: "mic", state: true })
})

test("parseAction toggles", () => {
  assert.deepEqual(parseAction("wifi on"), { kind: "toggle", target: "wifi", state: true })
  assert.deepEqual(parseAction("wifi off"), { kind: "toggle", target: "wifi", state: false })
  assert.deepEqual(parseAction("wifi"), { kind: "toggle", target: "wifi" })
  assert.deepEqual(parseAction("bt on"), { kind: "toggle", target: "bt", state: true })
  assert.deepEqual(parseAction("dnd"), { kind: "toggle", target: "dnd" })
  assert.deepEqual(parseAction("night light off"), { kind: "toggle", target: "nightlight", state: false })
  assert.deepEqual(parseAction("caffeine"), { kind: "toggle", target: "caffeine" })
  assert.deepEqual(parseAction("airplane on"), { kind: "toggle", target: "airplane", state: true })
  assert.equal(parseAction("wifi maybe"), null)
})

test("parseAction theme, power, media, capture", () => {
  assert.deepEqual(parseAction("dark"), { kind: "theme", mode: "dark" })
  assert.deepEqual(parseAction("theme light"), { kind: "theme", mode: "light" })
  assert.deepEqual(parseAction("lock"), { kind: "power", op: "lock" })
  assert.deepEqual(parseAction("sus"), { kind: "power", op: "suspend" })
  assert.deepEqual(parseAction("shut"), { kind: "power", op: "shutdown" })
  assert.deepEqual(parseAction("next"), { kind: "media", op: "next" })
  assert.deepEqual(parseAction("prev"), { kind: "media", op: "prev" })
  assert.deepEqual(parseAction("pau"), { kind: "media", op: "pause" })
  assert.deepEqual(parseAction("screenshot"), { kind: "screenshot" })
  assert.deepEqual(parseAction("rec"), { kind: "record" })
})

test("parseAction pomodoro", () => {
  assert.deepEqual(parseAction("focus 25"), { kind: "pomo", op: "start", mins: 25 })
  assert.deepEqual(parseAction("focus 25 write essay"), { kind: "pomo", op: "start", mins: 25, task: "write essay" })
  assert.deepEqual(parseAction("focus"), { kind: "pomo", op: "start" })
  assert.deepEqual(parseAction("pomo"), { kind: "pomo", op: "toggle" })
  assert.deepEqual(parseAction("pomo pause"), { kind: "pomo", op: "pause" })
})

test("parseAction ignores ordinary app searches", () => {
  for (const q of ["", "firefox", "fi", "te", "vo", "li", "lockscreen", "nextcloud", "dark mode toggle", "play music now", "ti"])
    assert.equal(parseAction(q), null, q)
})

test("parseAction prefixes need three characters, bt and dnd are exact", () => {
  assert.equal(parseAction("su"), null)
  assert.equal(parseAction("b"), null)
  assert.deepEqual(parseAction("blu on"), { kind: "toggle", target: "bt", state: true })
  assert.equal(parseAction("dn"), null)
})

test("parseFxQuery lists, filters, stops and opens", () => {
  assert.deepEqual(parseFxQuery(""), { kind: "list", filter: "" })
  assert.deepEqual(parseFxQuery("  read "), { kind: "list", filter: "read" })
  assert.deepEqual(parseFxQuery("stop"), { kind: "stop" })
  assert.deepEqual(parseFxQuery("open"), { kind: "open" })
  assert.deepEqual(parseFxQuery("stopwatch"), { kind: "list", filter: "stopwatch" })
})

test("parseFxQuery add with severity and effort", () => {
  assert.deepEqual(parseFxQuery("add Read ch 4 /3 45m"), { kind: "add", title: "Read ch 4", severity: 3, effort: 45 })
  assert.deepEqual(parseFxQuery("add Plain task"), { kind: "add", title: "Plain task" })
  assert.deepEqual(parseFxQuery("add /5 Fix bug 1h"), { kind: "add", title: "Fix bug", severity: 5, effort: 60 })
  assert.deepEqual(parseFxQuery("add"), { kind: "add", title: "" })
  assert.deepEqual(parseFxQuery("add Chapter 2h2o"), { kind: "add", title: "Chapter 2h2o" })
})

test("fxAddArgs passes only the flags given and guards the title", () => {
  assert.deepEqual(fxAddArgs({ title: "Read ch 4", severity: 3, effort: 45 }), ["add", "--severity", "3", "--effort", "45", "--", "Read ch 4"])
  assert.deepEqual(fxAddArgs({ title: "-ish notes" }), ["add", "--", "-ish notes"])
})

test("matchTasks keeps open tasks matching every word, focus first", () => {
  const tasks = [
    { id: 1, title: "Physics: waves", done: false },
    { id: 2, title: "Chem revision", done: true },
    { id: 3, title: "Physics mock review", done: false },
    { id: 4, title: "Read ch 4", done: false },
  ]
  const ids = (ts: { id: number }[]) => ts.map((t) => t.id)
  assert.deepEqual(ids(matchTasks(tasks, "")), [1, 3, 4])
  assert.deepEqual(ids(matchTasks(tasks, "", 4)), [4, 1, 3])
  assert.deepEqual(ids(matchTasks(tasks, "review PHYS")), [3])
  assert.deepEqual(ids(matchTasks(tasks, "chem")), [])
  assert.deepEqual(ids(matchTasks(tasks, "", 2)), [1, 3, 4])
})
