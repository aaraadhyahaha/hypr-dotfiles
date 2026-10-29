-- Placement for a newly floated window: find a spot that avoids the other floats on the workspace.
-- Pure logic (no hl.* calls) so it runs under plain lua; see float_place.test.lua.
-- Rects are { x, y, w, h } in logical coordinates.

local function intersects(a, b, gap)
    return a.x < b.x + b.w + gap and b.x < a.x + a.w + gap
        and a.y < b.y + b.h + gap and b.y < a.y + a.h + gap
end

local function overlap(a, b)
    local w = math.min(a.x + a.w, b.x + b.w) - math.max(a.x, b.x)
    local h = math.min(a.y + a.h, b.y + b.h) - math.max(a.y, b.y)
    if w <= 0 or h <= 0 then return 0 end
    return w * h
end

local function clamp(v, lo, hi)
    if hi < lo then return lo end
    return math.max(lo, math.min(v, hi))
end

-- Candidate top-left corners for a w x h window: centered, beside each other rect, then the area's corners.
local function candidates(area, others, w, h, gap)
    local cx, cy = area.x + (area.w - w) / 2, area.y + (area.h - h) / 2
    local list = { { cx, cy } }
    for _, o in ipairs(others) do
        local ys = { o.y, o.y + (o.h - h) / 2, cy }
        local xs = { o.x, o.x + (o.w - w) / 2, cx }
        for _, y in ipairs(ys) do
            list[#list + 1] = { o.x + o.w + gap, y } -- right of
            list[#list + 1] = { o.x - gap - w, y }   -- left of
        end
        for _, x in ipairs(xs) do
            list[#list + 1] = { x, o.y + o.h + gap } -- below
            list[#list + 1] = { x, o.y - gap - h }   -- above
        end
    end
    list[#list + 1] = { area.x, area.y }
    list[#list + 1] = { area.x + area.w - w, area.y }
    list[#list + 1] = { area.x, area.y + area.h - h }
    list[#list + 1] = { area.x + area.w - w, area.y + area.h - h }

    local rects = {}
    for _, p in ipairs(list) do
        rects[#rects + 1] = {
            x = math.floor(clamp(p[1], area.x, area.x + area.w - w)),
            y = math.floor(clamp(p[2], area.y, area.y + area.h - h)),
            w = w,
            h = h,
        }
    end
    return rects
end

local function center_dist(area, r)
    local dx = (r.x + r.w / 2) - (area.x + area.w / 2)
    local dy = (r.y + r.h / 2) - (area.y + area.h / 2)
    return dx * dx + dy * dy
end

-- Clear spot nearest the area center for the largest ratio that has one;
-- otherwise the smallest ratio at the position with the least total overlap.
local function place(area, others, ratios, gap)
    for _, ratio in ipairs(ratios) do
        local w, h = math.floor(area.w * ratio), math.floor(area.h * ratio)
        local best, best_dist
        for _, r in ipairs(candidates(area, others, w, h, gap)) do
            local clear = true
            for _, o in ipairs(others) do
                if intersects(r, o, gap) then clear = false break end
            end
            if clear then
                local d = center_dist(area, r)
                if not best or d < best_dist then best, best_dist = r, d end
            end
        end
        if best then return best end
    end

    local ratio = ratios[#ratios]
    local w, h = math.floor(area.w * ratio), math.floor(area.h * ratio)
    local best, best_overlap, best_dist
    for _, r in ipairs(candidates(area, others, w, h, gap)) do
        local total = 0
        for _, o in ipairs(others) do total = total + overlap(r, o) end
        local d = center_dist(area, r)
        if not best or total < best_overlap or (total == best_overlap and d < best_dist) then
            best, best_overlap, best_dist = r, total, d
        end
    end
    return best
end

return { place = place }
