import { test } from "node:test"
import assert from "node:assert/strict"
import {
  matchTier,
  matchRecent,
  mergePaths,
  previewKind,
  looksBinary,
  firstLines,
  formatSize,
  relTime,
  itemCount,
  tildePath,
  fitSize,
} from "./filesModel.ts"

test("matchTier ranks prefix, substring, subsequence, then path", () => {
  assert.equal(matchTier("/h/notes/todo.md", "to"), 0)
  assert.equal(matchTier("/h/notes/my-todo.md", "TODO"), 1)
  assert.equal(matchTier("/h/notes/my-todo.md", "mtd"), 2)
  assert.equal(matchTier("/h/notes/my-todo.md", "notes"), 3)
  assert.equal(matchTier("/h/notes/my-todo.md", "zzz"), -1)
  assert.equal(matchTier("/h/notes/", "notes"), 0)
  assert.equal(matchTier("/h/a.txt", "  "), 0)
})

test("matchRecent sorts by tier, then newest", () => {
  const list = [
    { path: "/h/old-report.pdf", modified: 1 },
    { path: "/h/report.pdf", modified: 2 },
    { path: "/h/x/reportage.txt", modified: 3 },
    { path: "/h/cat.png", modified: 9 },
  ]
  assert.deepEqual(matchRecent(list, "report", 10).map((r) => r.path), [
    "/h/x/reportage.txt",
    "/h/report.pdf",
    "/h/old-report.pdf",
  ])
  assert.deepEqual(matchRecent(list, "", 2).map((r) => r.path), ["/h/cat.png", "/h/x/reportage.txt"])
})

test("mergePaths dedupes and caps", () => {
  assert.deepEqual(mergePaths(["/a", "/b"], ["/b", "/c", "/d"], 3), ["/a", "/b", "/c"])
})

test("previewKind", () => {
  const isA = (ct: string, parent: string) => ct === parent || (parent === "text/plain" && ct === "application/json")
  assert.equal(previewKind("inode/directory", true, isA), "dir")
  assert.equal(previewKind("image/png", false, isA), "image")
  assert.equal(previewKind("image/svg+xml", false, isA), "image")
  assert.equal(previewKind("application/json", false, isA), "text")
  assert.equal(previewKind("text/plain", false, isA), "text")
  assert.equal(previewKind("application/pdf", false, isA), "other")
})

test("looksBinary", () => {
  assert.equal(looksBinary(new Uint8Array([104, 105])), false)
  assert.equal(looksBinary(new Uint8Array([104, 0, 105])), true)
})

test("firstLines", () => {
  assert.equal(firstLines("a\r\nb\n\tc\nd\n", 3), "a\nb\n  c")
  assert.equal(firstLines("x\n\n\n", 10), "x")
  assert.equal(firstLines("ab�", 1), "ab")
})

test("formatSize", () => {
  assert.equal(formatSize(0), "0 B")
  assert.equal(formatSize(999), "999 B")
  assert.equal(formatSize(2400), "2.4 KB")
  assert.equal(formatSize(52_000_000), "52 MB")
})

test("relTime", () => {
  const now = 1_000_000_000_000
  assert.equal(relTime(now - 10_000, now), "just now")
  assert.equal(relTime(now - 5 * 60_000, now), "5 min ago")
  assert.equal(relTime(now - 3 * 3_600_000, now), "3 h ago")
  assert.equal(relTime(now - 30 * 3_600_000, now), "yesterday")
  assert.equal(relTime(now - 4 * 86_400_000, now), "4 days ago")
  assert.equal(relTime(now + 5000, now), "just now")
})

test("itemCount", () => {
  assert.equal(itemCount(0, false), "0 items")
  assert.equal(itemCount(1, false), "1 item")
  assert.equal(itemCount(200, true), "200+ items")
})

test("tildePath", () => {
  assert.equal(tildePath("/home/u/a", "/home/u"), "~/a")
  assert.equal(tildePath("/home/u", "/home/u"), "~")
  assert.equal(tildePath("/home/user2/a", "/home/u"), "/home/user2/a")
})

test("fitSize keeps aspect and never upscales", () => {
  assert.deepEqual(fitSize(4000, 2000, 300, 260), [300, 150])
  assert.deepEqual(fitSize(1000, 4000, 300, 260), [65, 260])
  assert.deepEqual(fitSize(100, 50, 300, 260), [100, 50])
})
