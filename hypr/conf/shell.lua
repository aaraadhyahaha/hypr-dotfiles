-- AGS shell: IPC keybinds and layer rules (~/.config/ags, FEATURE_MAP `ext.hypr`).
-- Each `ags request <cmd>` maps to an `if` in ags/app.ts.

local mod = "SUPER"
local function ags(cmd) return hl.dsp.exec_cmd("ags request " .. cmd) end

hl.bind(mod .. " + Space",       ags("toggle-launcher"))
hl.bind(mod .. " + period",      ags("toggle-launcher :")) -- emoji mode
hl.bind(mod .. " + SHIFT + F",   ags("toggle-files"))
hl.bind(mod .. " + SHIFT + V",   ags("toggle-clipboard"))
hl.bind(mod .. " + W",           ags("toggle-wallpapers"))
hl.bind(mod .. " + G",           ags("toggle-widgets")) -- desktop edit mode + gallery
hl.bind(mod .. " + TAB",         ags("toggle-overview"))
hl.bind("Print",                 ags("toggle-shotmenu"))
hl.bind("SHIFT + Print",         ags("screenshot-full"))
hl.bind(mod .. " + SHIFT + R",   hl.dsp.exec_cmd("sh -c 'ags quit; sleep 0.3; cd ~/.config/ags && setsid ags run'"))

-- Brightness keys drive the OSD
hl.bind("XF86MonBrightnessUp",   hl.dsp.exec_cmd("brightnessctl -n1 set 5%+ && ags request osd-brightness"), { locked = true, repeating = true })
hl.bind("XF86MonBrightnessDown", hl.dsp.exec_cmd("brightnessctl -n1 set 5%- && ags request osd-brightness"), { locked = true, repeating = true })

-- Layer rules. Hyprland fades shell layers (fadeLayers*/fadePopups* in animations.lua) so the
-- blur fades with the glass; AGS moves their content (ags/widget/common/motion.ts).
-- A new AGS layer window needs its namespace added to ags-blur.

-- "shot" is the region selector: it must vanish instantly before grim captures, and stay unblurred.
hl.layer_rule({
    name    = "ags-no-anim",
    match   = { namespace = "^shot$" },
    no_anim = true,
})

-- the screenshot session's toolbar stays above the "shot" overlay on the same layer, so its
-- mode buttons take the pointer (map order alone doesn't hold). Hyprland sorts layers by order
-- descending: a LOWER order is nearer the top.
hl.layer_rule({
    name  = "ags-shotmenu-top",
    match = { namespace = "^shotmenu$" },
    order = -1,
})

hl.layer_rule({
    name         = "ags-blur",
    match        = { namespace = "^(bar|desktop|launcher|files|clipboard|wallpapers|overview|toasts|osd|shotpreview|shotmenu|bridge)$" },
    blur         = true,
    ignore_alpha = 0.1,
})

hl.layer_rule({
    name        = "bar-blur-popups",
    match       = { namespace = "^(bar|desktop)$" },
    blur_popups = true,
})
