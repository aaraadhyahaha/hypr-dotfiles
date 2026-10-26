import { test } from "node:test"
import assert from "node:assert/strict"
import {
  bump,
  cleanCalc,
  frecencyScore,
  looksLikeMath,
  parseEmojiData,
  qalcExpr,
  rank,
  searchEmoji,
  takeMode,
  webUrl,
} from "./model.ts"

test("takeMode turns a leading prefix into a mode and keeps the rest", () => {
  assert.equal(takeMode("firefox"), null)
  assert.equal(takeMode(""), null)
  assert.deepEqual(takeMode("= 2^10"), { mode: "calc", rest: "2^10" })
  assert.deepEqual(takeMode("=5 km to mi"), { mode: "calc", rest: "5 km to mi" })
  assert.deepEqual(takeMode(":fire"), { mode: "emoji", rest: "fire" })
  assert.deepEqual(takeMode("> htop"), { mode: "shell", rest: "htop" })
  assert.deepEqual(takeMode("  ?  hyprland lua "), { mode: "web", rest: "hyprland lua " })
  assert.deepEqual(takeMode("! add x /2"), { mode: "fx", rest: "add x /2" })
  assert.deepEqual(takeMode("/ notes md"), { mode: "files", rest: "notes md" })
  // a prefix later on is just text
  assert.equal(takeMode("a=b"), null)
})

test("takeMode with a prefix and nothing after it", () => {
  for (const [p, mode] of [["=", "calc"], [":", "emoji"], [">", "shell"], ["?", "web"], ["!", "fx"], ["/", "files"]] as const)
    assert.deepEqual(takeMode(p), { mode, rest: "" })
})

test("takeMode needs a space after fx", () => {
  assert.deepEqual(takeMode("fx stop"), { mode: "fx", rest: "stop" })
  assert.deepEqual(takeMode("FX "), { mode: "fx", rest: "" })
  assert.equal(takeMode("fx"), null)
  assert.equal(takeMode("fxsomething"), null)
})

test("looksLikeMath accepts maths and conversions", () => {
  for (const q of ["12*7", "2^10", "1 + 2", "(1+2)*3", "sqrt(2)", "2*pi", "5 km to mi", "100 usd in inr", "10%3"])
    assert.equal(looksLikeMath(q), true, q)
})

test("looksLikeMath rejects names, bare numbers and text with numbers", () => {
  for (const q of ["", "firefox", "42", "gimp 2", "foo bar", "5 km", "visual studio code", "2fa", "3.14"])
    assert.equal(looksLikeMath(q), false, q)
})

test("cleanCalc drops empty, error and echoed output", () => {
  assert.equal(cleanCalc("2+2", ""), null)
  assert.equal(cleanCalc("2+2", "  \n"), null)
  assert.equal(cleanCalc("2+", "error: syntax"), null)
  assert.equal(cleanCalc("2+2", "2 + 2"), null)
  assert.equal(cleanCalc("5", "5"), null)
})

test("cleanCalc keeps real results trimmed", () => {
  assert.equal(cleanCalc("12*7", "84\n"), "84")
  assert.equal(cleanCalc("5 km to mi", "3.10686 mi"), "3.10686 mi")
})

const tsv = [
  "# comment",
  "🔥\tfire\tflame hot",
  "🚒\tfire engine\ttruck",
  "🧯\tfire extinguisher\t",
  "🧨\tfirecracker\texplosive",
  "☄️\tcomet\tfire space",
  "→\trightwards arrow\tarrow right",
  "",
].join("\n")

test("parseEmojiData skips comments and blanks", () => {
  const list = parseEmojiData(tsv)
  assert.equal(list.length, 6)
  assert.deepEqual(list[0], { glyph: "🔥", name: "fire", keywords: "flame hot" })
  assert.equal(list[3].keywords, "explosive")
})

test("parseEmojiData keeps the keycap # glyph", () => {
  assert.deepEqual(parseEmojiData("# note\n#️⃣\tkeycap: #\tkeycap"), [
    { glyph: "#️⃣", name: "keycap: #", keywords: "keycap" },
  ])
})

test("searchEmoji ranks exact, name prefix, word prefix, keyword", () => {
  const list = parseEmojiData(tsv)
  assert.deepEqual(
    searchEmoji(list, "fire", 10).map((e) => e.glyph),
    ["🔥", "🚒", "🧯", "🧨", "☄️"],
  )
  assert.deepEqual(searchEmoji(list, "arrow", 10).map((e) => e.glyph), ["→"])
  assert.deepEqual(searchEmoji(list, "ext", 10).map((e) => e.glyph), ["🧯"])
})

test("searchEmoji honours max and empty query", () => {
  const list = parseEmojiData(tsv)
  assert.equal(searchEmoji(list, "fire", 2).length, 2)
  assert.equal(searchEmoji(list, "", 3).length, 3)
  assert.deepEqual(searchEmoji(list, "zzz", 5), [])
})

const DAY = 24 * 60 * 60 * 1000

test("frecency halves every three days", () => {
  const now = 10 * DAY
  const e = { n: 4, last: now - 3 * DAY }
  assert.ok(Math.abs(frecencyScore(e, now) - 2) < 1e-9)
  assert.equal(frecencyScore(undefined, now), 0)
})

test("bump counts and does not mutate", () => {
  const a = {}
  const b = bump(a, "app:x", 5)
  const c = bump(b, "app:x", 9)
  assert.deepEqual(a, {})
  assert.deepEqual(b, { "app:x": { n: 1, last: 5 } })
  assert.deepEqual(c, { "app:x": { n: 2, last: 9 } })
})

test("rank keeps base order on ties and promotes used items", () => {
  const items = ["a", "b", "c", "d"]
  assert.deepEqual(rank(items, {}, 0, (x) => x), items)
  const store = { c: { n: 3, last: 0 } }
  assert.deepEqual(rank(items, store, 0, (x) => x), ["c", "a", "b", "d"])
})

test("rank only reorders within the window", () => {
  const items = ["a", "b", "c", "d"]
  const store = { d: { n: 9, last: 0 } }
  assert.deepEqual(rank(items, store, 0, (x) => x, 2), items)
})

test("rank prefers recent use over stale use", () => {
  const now = 30 * DAY
  const store = { old: { n: 5, last: 0 }, fresh: { n: 2, last: now } }
  assert.deepEqual(rank(["old", "fresh"], store, now, (x) => x), ["fresh", "old"])
})

test("webUrl encodes the query", () => {
  assert.equal(webUrl("hyprland lua"), "https://www.google.com/search?q=hyprland%20lua")
  assert.equal(webUrl("a&b=c"), "https://www.google.com/search?q=a%26b%3Dc")
})

test("qalcExpr disables mixed units for conversions only", () => {
  assert.equal(qalcExpr("5 km to mi"), "5 km to -mi")
  assert.equal(qalcExpr("5 km in mi"), "5 km to -mi")
  assert.equal(qalcExpr("100 usd in inr"), "100 usd to -inr")
  assert.equal(qalcExpr("  12*7 "), "12*7")
  assert.equal(qalcExpr("sqrt(2)"), "sqrt(2)")
})
