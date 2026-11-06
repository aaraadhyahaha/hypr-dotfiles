-- Remembered float geometry, one entry per window class, kept across restarts.
-- Pure logic plus the state file (no hl.* calls) so it runs under plain lua; see float_memory.test.lua.
-- An entry is { x, y, w, h } as fractions of the usable area, so it survives a scale or monitor change.

local function to_entry(area, rect)
    return {
        x = (rect.x - area.x) / area.w,
        y = (rect.y - area.y) / area.h,
        w = rect.w / area.w,
        h = rect.h / area.h,
    }
end

local function to_rect(area, entry)
    return {
        x = area.x + entry.x * area.w,
        y = area.y + entry.y * area.h,
        w = math.floor(entry.w * area.w + 0.5),
        h = math.floor(entry.h * area.h + 0.5),
    }
end

-- One "class<TAB>x y w h" line per entry; lines that don't parse are skipped.
local function parse(text)
    local memory = {}
    for line in text:gmatch("[^\n]+") do
        local class, x, y, w, h = line:match("^([^\t]+)\t(%S+) (%S+) (%S+) (%S+)$")
        x, y, w, h = tonumber(x), tonumber(y), tonumber(w), tonumber(h)
        if class and x and y and w and h and w > 0 and h > 0 then
            memory[class] = { x = x, y = y, w = w, h = h }
        end
    end
    return memory
end

local function serialize(memory)
    local classes = {}
    for class in pairs(memory) do classes[#classes + 1] = class end
    table.sort(classes)
    local lines = {}
    for _, class in ipairs(classes) do
        local e = memory[class]
        lines[#lines + 1] = ("%s\t%.5f %.5f %.5f %.5f\n"):format(class, e.x, e.y, e.w, e.h)
    end
    return table.concat(lines)
end

local function load_file(path)
    local f = io.open(path, "r")
    if not f then return {} end
    local text = f:read("a")
    f:close()
    return parse(text)
end

-- Written beside the target and renamed over it, so a crash can't leave a half-written file.
local function save_file(path, memory)
    local tmp = path .. ".tmp"
    local f = io.open(tmp, "w")
    if not f then return false end
    f:write(serialize(memory))
    f:close()
    return os.rename(tmp, path) == true
end

return {
    to_entry = to_entry,
    to_rect = to_rect,
    parse = parse,
    serialize = serialize,
    load = load_file,
    save = save_file,
}
