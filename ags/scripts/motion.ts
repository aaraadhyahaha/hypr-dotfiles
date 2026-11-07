// Regenerates the motion token outputs from widget/common/motionTokens.ts: `npm run motion`
import { writeFileSync } from "node:fs"
import { COMPOSITOR, CURVES, DURATIONS } from "../widget/common/motionTokens.ts"
import { renderLua, renderScss } from "../widget/common/motionTokensModel.ts"

export const tokens = { durations: DURATIONS, compositor: COMPOSITOR, curves: CURVES }
export const OUTPUTS = {
  scss: new URL("../styles/_motion.scss", import.meta.url),
  lua: new URL("../../hypr/conf/motion.lua", import.meta.url),
}

if (import.meta.main) {
  writeFileSync(OUTPUTS.scss, renderScss(tokens))
  writeFileSync(OUTPUTS.lua, renderLua(tokens))
  console.log(`wrote ${OUTPUTS.scss.pathname}\nwrote ${OUTPUTS.lua.pathname}`)
}
