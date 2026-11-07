-- Curves & animations: https://wiki.hypr.land/Configuring/Advanced-and-Cool/Animations/

hl.config({ animations = { enabled = true } })

-- Timings and curves come from one source shared with AGS: ags/widget/common/motionTokens.ts,
-- generated into conf/motion.lua by `npm run motion` in ~/.config/ags (see ags/DESIGN.md › Motion).
-- Edit that file, not the numbers here, so compositor and shell motion read as one.
local m = require("conf.motion")
for name, points in pairs(m.curves) do
  hl.curve(name, { type = "bezier", points = points })
end

-- Hyprland's speed is in 100ms units
local function speed(ms) return ms / 100 end
local enter, exit = speed(m.ms.enter), speed(m.ms.exit)

hl.animation({ leaf = "global",        enabled = true, speed = enter, bezier = "ease" })
hl.animation({ leaf = "windowsIn",     enabled = true, speed = speed(m.ms.window), bezier = "easeOut", style = "popin 92%" })
hl.animation({ leaf = "windowsOut",    enabled = true, speed = exit,  bezier = "easeIn",  style = "popin 92%" })
hl.animation({ leaf = "windowsMove",   enabled = true, speed = speed(m.ms.window), bezier = "easeOut" })
hl.animation({ leaf = "workspaces",    enabled = true, speed = speed(m.ms.workspace), bezier = "easeOut", style = "slidefade 40%" })
hl.animation({ leaf = "fade",          enabled = true, speed = speed(m.ms.base), bezier = "ease" })
-- AGS glass: opacity of shell layers and popups. Arrivals match AGS's move (enter, easeOut),
-- so the panel's fade and its motion are one gesture; AGS hides at once, so leaving is the fade alone (exit, easeIn)
hl.animation({ leaf = "layers",        enabled = true, speed = enter, bezier = "easeOut" })
hl.animation({ leaf = "layersIn",      enabled = true, speed = enter, bezier = "easeOut", style = "fade" })
hl.animation({ leaf = "layersOut",     enabled = true, speed = exit,  bezier = "easeIn",  style = "fade" })
hl.animation({ leaf = "fadeLayersIn",  enabled = true, speed = enter, bezier = "easeOut" })
hl.animation({ leaf = "fadeLayersOut", enabled = true, speed = exit,  bezier = "easeIn" })
hl.animation({ leaf = "fadePopupsIn",  enabled = true, speed = enter, bezier = "easeOut" })
hl.animation({ leaf = "fadePopupsOut", enabled = true, speed = exit,  bezier = "easeIn" })
