-- Tests for conf/float_place.lua. Run from ~/.config/hypr: lua conf/float_place.test.lua

local place = dofile("conf/float_place.lua").place

local RATIOS, GAP = { 0.6, 0.45, 0.33 }, 12
-- Usable area of eDP-1 at scale 1.5 (1280x720 logical) minus the 48px bar and 12px gaps.
local AREA = { x = 12, y = 60, w = 1256, h = 648 }

local function inside(r, a)
    return r.x >= a.x and r.y >= a.y and r.x + r.w <= a.x + a.w and r.y + r.h <= a.y + a.h
end

local function clear(r, o, gap)
    return r.x >= o.x + o.w + gap or o.x >= r.x + r.w + gap
        or r.y >= o.y + o.h + gap or o.y >= r.y + r.h + gap
end

local function size_of(ratio)
    return math.floor(AREA.w * ratio), math.floor(AREA.h * ratio)
end

local function test(name, fn)
    local ok, err = pcall(fn)
    print((ok and "ok   " or "FAIL ") .. name .. (ok and "" or ("\n     " .. tostring(err))))
    if not ok then os.exit(1) end
end

test("empty workspace -> centered at 60%", function()
    local r = place(AREA, {}, RATIOS, GAP)
    local w, h = size_of(0.6)
    assert(r.w == w and r.h == h, "size " .. r.w .. "x" .. r.h)
    assert(r.x == math.floor(AREA.x + (AREA.w - w) / 2), "x " .. r.x)
    assert(r.y == math.floor(AREA.y + (AREA.h - h) / 2), "y " .. r.y)
end)

test("one float on the left -> new one clear of it, inside the area", function()
    local w, h = size_of(0.45)
    local other = { x = AREA.x, y = AREA.y, w = w, h = h }
    local r = place(AREA, { other }, RATIOS, GAP)
    assert(inside(r, AREA), "outside area")
    assert(clear(r, other, GAP), "overlaps the other float")
    assert(r.w >= w, "shrunk although a 45% spot was free")
end)

test("one centered 60% float -> clear of it or the 33% fallback, inside the area", function()
    local w, h = size_of(0.6)
    local other = { x = math.floor(AREA.x + (AREA.w - w) / 2), y = math.floor(AREA.y + (AREA.h - h) / 2), w = w, h = h }
    local r = place(AREA, { other }, RATIOS, GAP)
    assert(inside(r, AREA), "outside area")
    if not clear(r, other, GAP) then
        local sw, sh = size_of(0.33)
        assert(r.w == sw and r.h == sh, "overlapping result is not the 33% fallback")
    end
end)

test("three floats -> result clear of all, inside the area", function()
    local w, h = size_of(0.33)
    local others = {
        { x = AREA.x, y = AREA.y, w = w, h = h },
        { x = AREA.x + AREA.w - w, y = AREA.y, w = w, h = h },
        { x = AREA.x, y = AREA.y + AREA.h - h, w = w, h = h },
    }
    local r = place(AREA, others, RATIOS, GAP)
    assert(inside(r, AREA), "outside area")
    for i, o in ipairs(others) do assert(clear(r, o, GAP), "overlaps float " .. i) end
end)

test("fully covered area -> 33% size at least-overlap position, inside the area", function()
    local half = math.floor(AREA.w / 2)
    local others = {
        { x = AREA.x, y = AREA.y, w = half, h = AREA.h },
        { x = AREA.x + half, y = AREA.y, w = AREA.w - half, h = AREA.h },
    }
    local r = place(AREA, others, RATIOS, GAP)
    local w, h = size_of(0.33)
    assert(r.w == w and r.h == h, "size " .. r.w .. "x" .. r.h)
    assert(inside(r, AREA), "outside area")
end)
