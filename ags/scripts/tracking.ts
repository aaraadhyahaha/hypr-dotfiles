// Regenerates styles/_tracking.scss from the installed SF Pro fonts' trak tables: `npm run tracking`
// trak is the same at every weight, so the Regular file of each cut stands for the family.
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { parseTrak, renderScss, type Trak } from "../widget/common/trackingModel.ts"

export const OUTPUT = new URL("../styles/_tracking.scss", import.meta.url)

function trakOf(family: string): Trak {
  const file = execFileSync("fc-match", ["-f", "%{file}", `${family}:regular`], { encoding: "utf8" })
  if (!file.includes("SF-Pro")) throw new Error(`${family} is not installed (fc-match gave ${file})`)
  const t = parseTrak(readFileSync(file))
  if (!t) throw new Error(`${file} has no trak table`)
  return t
}

if (import.meta.main) {
  writeFileSync(OUTPUT, renderScss({ text: trakOf("SF Pro Text"), display: trakOf("SF Pro Display") }))
  console.log(`wrote ${OUTPUT.pathname}`)
}
