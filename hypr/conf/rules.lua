-- Window rules: https://wiki.hypr.land/Configuring/Basics/Window-Rules/
-- AGS layer rules live in shell.lua.

hl.window_rule({
    name           = "suppress-maximize-events",
    match          = { class = ".*" },
    suppress_event = "maximize",
})

-- Fix some dragging issues with XWayland
hl.window_rule({
    name  = "fix-xwayland-drags",
    match = {
        class      = "^$",
        title      = "^$",
        xwayland   = true,
        float      = true,
        fullscreen = false,
        pin        = false,
    },
    no_focus = true,
})

hl.window_rule({
    name   = "float-utilities",
    match  = { class = "^(org.pulseaudio.pavucontrol|blueman-manager|nm-connection-editor)$" },
    float  = true,
    center = true,
})

hl.window_rule({
    name  = "move-hyprland-run",
    match = { class = "hyprland-run" },
    move  = "20 monitor_h-120",
    float = true,
})

-- Per-app scroll: each app has its own scroll physics, so the same swipe moves a different
-- distance. These multiply input.touchpad.scroll_factor to even out distance per swipe
-- (not momentum). Starting values; tune by feel. Mouse wheels are left alone.
local scroll_touchpad = {
    { name = "scroll-zen",      class = "^(zen)$",                                     factor = 0.75 },
    { name = "scroll-electron", class = "^(com\\.microsoft\\.VSCode|md\\.obsidian\\.Obsidian)$", factor = 1.25 },
    { name = "scroll-kitty",    class = "^(kitty)$",                                   factor = 0.6 },
}

for _, r in ipairs(scroll_touchpad) do
    hl.window_rule({
        name            = r.name,
        match           = { class = r.class },
        scroll_touchpad = r.factor,
    })
end
