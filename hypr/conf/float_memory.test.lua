-- Tests for conf/float_memory.lua. Run from ~/.config/hypr: lua conf/float_memory.test.lua

local memory = dofile("conf/float_memory.lua")

local AREA = { x = 12, y = 60, w = 1416, h = 738 }

local function test(name, fn)
    local ok, err = pcall(fn)
    print((ok and "ok   " or "FAIL ") .. name .. (ok and "" or ("\n     " .. tostring(err))))
    if not ok then os.exit(1) end
end

test("rect -> entry -> rect comes back to the pixel", function()
    local rect = { x = 200, y = 111, w = 901, h = 533 }
    local back = memory.to_rect(AREA, memory.parse(memory.serialize({ a = memory.to_entry(AREA, rect) })).a)
    assert(math.abs(back.x - rect.x) < 0.5 and math.abs(back.y - rect.y) < 0.5, "pos " .. back.x .. "," .. back.y)
    assert(back.w == rect.w and back.h == rect.h, "size " .. back.w .. "x" .. back.h)
end)

test("an entry scales with the area", function()
    local entry = memory.to_entry(AREA, { x = AREA.x, y = AREA.y, w = AREA.w / 2, h = AREA.h / 2 })
    local r = memory.to_rect({ x = 0, y = 0, w = 1000, h = 500 }, entry)
    assert(r.x == 0 and r.y == 0 and r.w == 500 and r.h == 250, "got " .. r.w .. "x" .. r.h)
end)

test("classes with spaces and dots survive the round trip", function()
    local e = { x = 0.1, y = 0.2, w = 0.3, h = 0.4 }
    local back = memory.parse(memory.serialize({ ["org.gnome.Papers"] = e, ["Some App"] = e }))
    assert(back["org.gnome.Papers"] and back["Some App"], "lost a class")
end)

test("malformed lines are skipped, good ones kept", function()
    local m = memory.parse("broken\nkitty\t0.1 0.2 nope 0.4\nzero\t0 0 0 0.5\nzen\t0.1 0.2 0.3 0.4\n")
    assert(m.zen and m.zen.w == 0.3, "lost the good line")
    assert(not (m.broken or m.kitty or m.zero), "kept a bad line")
end)

test("save then load round-trips; a missing file is empty memory", function()
    local path = os.tmpname()
    assert(memory.save(path, { zen = { x = 0.1, y = 0.2, w = 0.3, h = 0.4 } }), "save failed")
    assert(memory.load(path).zen.h == 0.4, "wrong value after load")
    os.remove(path)
    assert(next(memory.load(path)) == nil, "missing file should be empty")
end)
