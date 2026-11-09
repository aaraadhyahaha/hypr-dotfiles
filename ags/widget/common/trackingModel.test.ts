import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { parseTrak, renderScss, trackAt, SIZES, type Trak } from "./trackingModel.ts"
import { OUTPUT } from "../../scripts/tracking.ts"

// A minimal sfnt: a table directory with `head` (upem only) and a `trak` table holding a
// tight track (-1) and the normal track (0), so the parser has to pick the right one.
function font(upem: number, sizes: number[], normal: number[], withTrak = true): Uint8Array {
  const n = sizes.length
  const tags = withTrak ? ["head", "trak"] : ["head"]
  const dir = 12 + 16 * tags.length
  const head = dir
  const trak = head + 54
  // trak: header 12, TrackData 8, 2 entries × 8, sizes 4n, 2 value rows × 2n
  const td = 12
  const sizeOff = td + 8 + 16
  const tightOff = sizeOff + 4 * n
  const normalOff = tightOff + 2 * n
  const bytes = new Uint8Array(trak + normalOff + 2 * n)
  const v = new DataView(bytes.buffer)
  v.setUint16(4, tags.length)
  tags.forEach((tag, i) => {
    for (let c = 0; c < 4; c++) bytes[12 + 16 * i + c] = tag.charCodeAt(c)
    v.setUint32(12 + 16 * i + 8, tag === "head" ? head : trak)
  })
  v.setUint16(head + 18, upem)
  if (!withTrak) return bytes
  v.setUint16(trak + 6, td) // horizOffset
  v.setUint16(trak + td, 2)
  v.setUint16(trak + td + 2, n)
  v.setUint32(trak + td + 4, sizeOff)
  v.setInt32(trak + td + 8, -65536) // track -1 first
  v.setUint16(trak + td + 14, tightOff)
  v.setInt32(trak + td + 16, 0)
  v.setUint16(trak + td + 22, normalOff)
  sizes.forEach((s, i) => v.setInt32(trak + sizeOff + 4 * i, s * 65536))
  normal.forEach((u, i) => {
    v.setInt16(trak + tightOff + 2 * i, u - 50)
    v.setInt16(trak + normalOff + 2 * i, u)
  })
  return bytes
}

const t: Trak = { upem: 1000, sizes: [10, 20], values: [20, -10] }

test("parseTrak reads the normal track, not the first one", () => {
  assert.deepEqual(parseTrak(font(2048, [9, 12, 17], [38, 0, -47])), {
    upem: 2048,
    sizes: [9, 12, 17],
    values: [38, 0, -47],
  })
})

test("parseTrak is null for a font without trak", () => {
  assert.equal(parseTrak(font(1000, [], [], false)), null)
})

test("trackAt interpolates per-em units and scales by size", () => {
  assert.equal(trackAt(t, 10), 0.2) // 20/1000 em × 10px
  assert.equal(trackAt(t, 15), 0.075) // 5/1000 em × 15px
  assert.equal(trackAt(t, 20), -0.2)
})

test("trackAt holds the end values outside the table", () => {
  assert.equal(trackAt(t, 5), 0.1)
  assert.equal(trackAt(t, 40), -0.4)
})

test("renderScss writes both maps over every whole px size", () => {
  const s = renderScss({ text: t, display: { ...t, values: [40, 40] } })
  assert.match(s, /do not edit/)
  assert.match(s, /^\$tracking-text: \($/m)
  assert.match(s, /^\$tracking-display: \($/m)
  assert.match(s, /^  15: 0\.075px,$/m)
  assert.match(s, /^  10: 0\.4px,$/m)
  assert.equal(s.match(/^  \d+: /gm)?.length, 2 * (SIZES.to - SIZES.from + 1))
})

test("renderScss never writes -0px", () => {
  const s = renderScss({ text: { upem: 1000, sizes: [12], values: [0] }, display: t })
  assert.doesNotMatch(s, /-0px/)
})

// Apple's published SF Pro values; guards the checked-in file against a bad regeneration
test("_tracking.scss carries SF Pro's tracking", () => {
  const s = readFileSync(OUTPUT, "utf8")
  const get = (map: string, size: number) =>
    s.split(`$${map}: (`)[1].match(new RegExp(`^  ${size}: (-?[\\d.]+)px,$`, "m"))?.[1]
  assert.equal(get("tracking-text", 12), "0")
  assert.equal(get("tracking-text", 13), "-0.076")
  assert.equal(get("tracking-display", 22), "0.344")
})
