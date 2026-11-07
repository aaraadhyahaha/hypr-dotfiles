import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { luaCurve, renderLua, renderScss, scssDur, scssEase, type Tokens } from "./motionTokensModel.ts"
import { OUTPUTS, tokens } from "../../scripts/motion.ts"

const small: Tokens = {
  durations: { fast: 90, base: 160, enter: 260 },
  compositor: { workspace: 300 },
  curves: { standard: [0.25, 0.1, 0.25, 1], out: [0.16, 1, 0.3, 1] },
}

test("token names keep the existing SCSS and Lua spellings", () => {
  assert.equal(scssDur("base"), "$dur")
  assert.equal(scssDur("enter"), "$dur-enter")
  assert.equal(scssDur("slowFade"), "$dur-slow-fade")
  assert.equal(scssEase("standard"), "$ease")
  assert.equal(scssEase("out"), "$ease-out")
  assert.equal(luaCurve("standard"), "ease")
  assert.equal(luaCurve("out"), "easeOut")
  assert.equal(luaCurve("in"), "easeIn")
})

test("renderScss emits curves and durations, not compositor-only times", () => {
  const s = renderScss(small)
  assert.match(s, /do not edit/)
  assert.match(s, /^\$ease: cubic-bezier\(0\.25, 0\.1, 0\.25, 1\);$/m)
  assert.match(s, /^\$ease-out: cubic-bezier\(0\.16, 1, 0\.3, 1\);$/m)
  assert.match(s, /^\$dur: 160ms;$/m)
  assert.match(s, /^\$dur-enter: 260ms;$/m)
  assert.doesNotMatch(s, /workspace|300/)
})

test("renderLua returns ms (incl. compositor) and bezier point pairs", () => {
  const l = renderLua(small)
  assert.match(l, /^-- generated .* do not edit$/m)
  assert.match(l, /^return \{$/m)
  assert.match(l, /^    base = 160,$/m)
  assert.match(l, /^    workspace = 300,$/m)
  assert.match(l, /^    easeOut = \{ \{0\.16, 1\}, \{0\.3, 1\} \},$/m)
})

test("a non-finite token fails instead of writing broken config", () => {
  assert.throws(() => renderScss({ ...small, durations: { base: NaN } }))
  assert.throws(() => renderLua({ ...small, curves: { out: [0, Infinity, 0, 1] } }))
})

test("generated files match motionTokens.ts (run `npm run motion` if this fails)", () => {
  assert.equal(readFileSync(OUTPUTS.scss, "utf8"), renderScss(tokens))
  assert.equal(readFileSync(OUTPUTS.lua, "utf8"), renderLua(tokens))
})

test("the shipped tokens keep the panel fade and move on one clock", () => {
  // Hyprland's layersIn uses enter; AGS's ENTER.* presets use enter too (DESIGN.md › Motion)
  assert.ok(tokens.durations.enter > tokens.durations.exit)
  for (const c of Object.values(tokens.curves)) {
    assert.equal(c.length, 4)
    assert.ok(c[0] >= 0 && c[0] <= 1 && c[2] >= 0 && c[2] <= 1, "bezier x must stay in [0, 1]")
  }
})
