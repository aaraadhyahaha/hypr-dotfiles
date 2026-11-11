-- Window, workspace and media binds: https://wiki.hypr.land/Configuring/Basics/Binds/
-- AGS shell binds live in shell.lua.

local mod      = "SUPER"
local terminal = "kitty"

-- Apps & session
-- TEMP keydebug: log each bind fire to /tmp/hypr-keydebug.log
local function keylog(tag)
    local f = io.open("/tmp/hypr-keydebug.log", "a")
    if f then f:write(os.date("%T"), " ", tag, "\n"); f:close() end
end
hl.bind(mod .. " + Q", function() keylog("Q"); hl.dispatch(hl.dsp.exec_cmd(terminal)) end)
hl.bind(mod .. " + L", hl.dsp.exec_cmd("loginctl lock-session"))
hl.bind(mod .. " + T", hl.dsp.exec_cmd("slate toggle")) -- slate todo overlay (daemon: systemd slate.service)
hl.bind(mod .. " + M", hl.dsp.exec_cmd("command -v hyprshutdown >/dev/null 2>&1 && hyprshutdown || hyprctl dispatch 'hl.dsp.exit()'"))

-- Window state
hl.bind(mod .. " + C", hl.dsp.window.close())
hl.bind(mod .. " + P", hl.dsp.window.pseudo())
hl.bind(mod .. " + J", hl.dsp.layout("togglesplit")) -- dwindle only

-- Toggle float. A window that becomes floating gets the size and spot remembered for its class, or
-- else is placed in free space beside the other floats on its workspace (75%, shrinking to 60% / 45%
-- / 33% of the usable area; least overlap if nothing fits). Existing floats never move.
-- Placement logic: conf/float_place.lua. Memory format: conf/float_memory.lua.
-- Monitor size is in pixels and window size/position is logical, hence the divide by scale.
local float_place  = require("conf.float_place")
local float_memory = require("conf.float_memory")

local memory_path = os.getenv("HOME") .. "/.local/state/hypr-float-memory.tsv"
local memory      = float_memory.load(memory_path)
-- Only Super+V floats are remembered: dialogs float on their own and share their app's class.
-- A tag, since it outlives a config reload, which wipes this file's locals.
local memory_tag  = "float-memory"
local placed      = {} -- address -> rect it last had, so only real changes reach the memory
local float_ratios = { 0.75, 0.6, 0.45, 0.33 }

local function usable_area(mon)
    local res, gaps = mon.reserved, hl.get_config("general.gaps_out")
    return {
        x = mon.x + res.left + gaps.left,
        y = mon.y + res.top + gaps.top,
        w = mon.width / mon.scale - res.left - res.right - gaps.left - gaps.right,
        h = mon.height / mon.scale - res.top - res.bottom - gaps.top - gaps.bottom,
    }
end

local function rect_of(win)
    return { x = win.at.x, y = win.at.y, w = win.size.x, h = win.size.y }
end

local function same_rect(a, b)
    return math.abs(a.x - b.x) <= 1 and math.abs(a.y - b.y) <= 1
        and math.abs(a.w - b.w) <= 1 and math.abs(a.h - b.h) <= 1
end

local function has_memory_tag(win)
    for _, tag in ipairs(win.tags) do
        if tag == memory_tag then return true end
    end
    return false
end

local function remember(win)
    if not (win and win.floating and win.fullscreen == 0 and win.class ~= "" and has_memory_tag(win)) then return end
    local mon, rect = win.monitor, rect_of(win)
    if not mon or (placed[win.address] and same_rect(placed[win.address], rect)) then return end
    placed[win.address] = rect
    memory[win.class] = float_memory.to_entry(usable_area(mon), rect)
    float_memory.save(memory_path, memory)
end

hl.bind(mod .. " + V", function()
    remember(hl.get_active_window()) -- about to tile: its floating rect is gone after the toggle
    hl.dispatch(hl.dsp.window.float({ action = "toggle" }))
    local win = hl.get_active_window()
    if not (win and win.floating) then return end
    local mon = win.monitor or hl.get_active_monitor()
    if not mon then return end

    local area, gap = usable_area(mon), hl.get_config("general.gaps_out").top
    local ws, others = win.workspace and win.workspace.id, {}
    for _, o in ipairs(hl.get_windows({ floating = true })) do
        if o.address ~= win.address and o.workspace and o.workspace.id == ws
            and o.mapped and not o.hidden and o.fullscreen == 0 then
            others[#others + 1] = rect_of(o)
        end
    end

    local entry = memory[win.class]
    local r = entry and float_place.restore(area, others, float_memory.to_rect(area, entry), gap)
        or float_place.place(area, others, float_ratios, gap)
    hl.dispatch(hl.dsp.window.resize({ x = r.w, y = r.h }))
    hl.dispatch(hl.dsp.window.move({ x = r.x, y = r.y }))
    hl.dispatch(hl.dsp.window.tag({ tag = "+" .. memory_tag }))
    placed[win.address] = r
end)

-- Moves and resizes have no event, so a float is saved when it loses focus or closes.
local focused
hl.on("window.active", function(win)
    if focused then remember(hl.get_window("address:" .. focused)) end
    focused = win and win.address
end)
hl.on("window.close", function(win)
    remember(win)
    placed[win.address] = nil
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
    hl.bind(mod .. " + " .. key, function() keylog("ws" .. i); hl.dispatch(hl.dsp.focus({ workspace = i })) end) -- TEMP keydebug
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

-- TEMP keydebug: raw keys while Super is held (args: xkb keycode, time ms, state; Super = 133/134), and
-- every workspace change, so a Super+N that "does nothing" shows whether the key arrived,
-- the bind fired, and whether something switched back.
local super_held = false
hl.on("input.keyboard.key", function(a, b, c)
    local is_super = a == 125 or a == 126 or a == 133 or a == 134
    if is_super then super_held = (c ~= 0); keylog(string.format("key super %s", tostring(c))); return end
    if super_held then keylog(string.format("key %s %s", tostring(a), tostring(c))) end
end)
hl.on("workspace.active", function(ws)
    local w = hl.get_active_window()
    keylog(string.format("-> active ws %s (window %s)", tostring(ws and ws.id), tostring(w and w.class)))
end)
