-- Window, workspace and media binds: https://wiki.hypr.land/Configuring/Basics/Binds/
-- AGS shell binds live in shell.lua.

local mod      = "SUPER"
local terminal = "kitty"

-- Apps & session
hl.bind(mod .. " + Q", hl.dsp.exec_cmd(terminal))
hl.bind(mod .. " + L", hl.dsp.exec_cmd("loginctl lock-session"))
hl.bind(mod .. " + M", hl.dsp.exec_cmd("command -v hyprshutdown >/dev/null 2>&1 && hyprshutdown || hyprctl dispatch 'hl.dsp.exit()'"))

-- Window state
hl.bind(mod .. " + C", hl.dsp.window.close())
hl.bind(mod .. " + P", hl.dsp.window.pseudo())
hl.bind(mod .. " + J", hl.dsp.layout("togglesplit")) -- dwindle only

-- Toggle float; a window that becomes floating is placed in free space beside the other floats on
-- its workspace (60%, shrinking to 45% / 33% of the usable area; least overlap if nothing fits).
-- Existing floats never move. Placement logic: conf/float_place.lua.
-- Monitor size is in pixels and window size/position is logical, hence the divide by scale.
local float_place = require("conf.float_place")
hl.bind(mod .. " + V", function()
    hl.dispatch(hl.dsp.window.float({ action = "toggle" }))
    local win = hl.get_active_window()
    if not (win and win.floating) then return end
    local mon = win.monitor or hl.get_active_monitor()
    if not mon then return end

    local res, gaps = mon.reserved, hl.get_config("general.gaps_out")
    local area = {
        x = mon.x + res.left + gaps.left,
        y = mon.y + res.top + gaps.top,
        w = mon.width / mon.scale - res.left - res.right - gaps.left - gaps.right,
        h = mon.height / mon.scale - res.top - res.bottom - gaps.top - gaps.bottom,
    }

    local ws, others = win.workspace and win.workspace.id, {}
    for _, o in ipairs(hl.get_windows({ floating = true })) do
        if o.address ~= win.address and o.workspace and o.workspace.id == ws
            and o.mapped and not o.hidden and o.fullscreen == 0 then
            others[#others + 1] = { x = o.at.x, y = o.at.y, w = o.size.x, h = o.size.y }
        end
    end

    local r = float_place.place(area, others, { 0.6, 0.45, 0.33 }, gaps.top)
    hl.dispatch(hl.dsp.window.resize({ x = r.w, y = r.h }))
    hl.dispatch(hl.dsp.window.move({ x = r.x, y = r.y }))
end)

-- Focus
for _, dir in ipairs({ "left", "right", "up", "down" }) do
    hl.bind(mod .. " + " .. dir, hl.dsp.focus({ direction = dir }))
end

-- Resize the active window from the keyboard (floating or tiled)
local step = 40
hl.bind(mod .. " + CTRL + right", hl.dsp.window.resize({ x = step,  y = 0,     relative = true }), { repeating = true })
hl.bind(mod .. " + CTRL + left",  hl.dsp.window.resize({ x = -step, y = 0,     relative = true }), { repeating = true })
hl.bind(mod .. " + CTRL + down",  hl.dsp.window.resize({ x = 0,     y = step,  relative = true }), { repeating = true })
hl.bind(mod .. " + CTRL + up",    hl.dsp.window.resize({ x = 0,     y = -step, relative = true }), { repeating = true })

-- Move/resize with mouse drag
hl.bind(mod .. " + mouse:272", hl.dsp.window.drag(),   { mouse = true })
hl.bind(mod .. " + mouse:273", hl.dsp.window.resize(), { mouse = true })

-- Workspaces: mod+[0-9] switch, mod+SHIFT+[0-9] move window (key 0 = workspace 10)
for i = 1, 10 do
    local key = i % 10
    hl.bind(mod .. " + " .. key,         hl.dsp.focus({ workspace = i }))
    hl.bind(mod .. " + SHIFT + " .. key, hl.dsp.window.move({ workspace = i }))
end
hl.bind(mod .. " + mouse_down", hl.dsp.focus({ workspace = "e+1" }))
hl.bind(mod .. " + mouse_up",   hl.dsp.focus({ workspace = "e-1" }))

-- Scratchpad (bar.workspaces shows it as special:magic)
hl.bind(mod .. " + S",         hl.dsp.workspace.toggle_special("magic"))
hl.bind(mod .. " + SHIFT + S", hl.dsp.window.move({ workspace = "special:magic" }))

-- Media keys (volume OSD comes from AGS watching wireplumber)
local media = { locked = true, repeating = true }
hl.bind("XF86AudioRaiseVolume", hl.dsp.exec_cmd("wpctl set-volume -l 1 @DEFAULT_AUDIO_SINK@ 5%+"), media)
hl.bind("XF86AudioLowerVolume", hl.dsp.exec_cmd("wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-"),      media)
hl.bind("XF86AudioMute",        hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle"),     media)
hl.bind("XF86AudioMicMute",     hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_AUDIO_SOURCE@ toggle"),   media)

hl.bind("XF86AudioNext",  hl.dsp.exec_cmd("playerctl next"),       { locked = true })
hl.bind("XF86AudioPause", hl.dsp.exec_cmd("playerctl play-pause"), { locked = true })
hl.bind("XF86AudioPlay",  hl.dsp.exec_cmd("playerctl play-pause"), { locked = true })
hl.bind("XF86AudioPrev",  hl.dsp.exec_cmd("playerctl previous"),   { locked = true })
