-- Curves & animations: https://wiki.hypr.land/Configuring/Advanced-and-Cool/Animations/

hl.config({ animations = { enabled = true } })

hl.curve("easeOutQuint", { type = "bezier", points = { {0.23, 1}, {0.32, 1} } })
hl.curve("quick",        { type = "bezier", points = { {0.15, 0}, {0.1, 1} } })
hl.curve("almostLinear", { type = "bezier", points = { {0.5, 0.5}, {0.75, 1} } })
-- AGS glass: opacity of shell layers and popups (AGS moves their content itself)
hl.curve("glassIn",      { type = "bezier", points = { {0.2, 0.7}, {0.3, 1} } })
-- cinematic windows/workspaces: long ease-out glide, no overshoot
hl.curve("smoothOut",    { type = "bezier", points = { {0.16, 1}, {0.3, 1} } })
hl.curve("softInOut",    { type = "bezier", points = { {0.65, 0}, {0.35, 1} } })
hl.curve("pop",          { type = "spring", mass = 1, stiffness = 220, dampening = 20 })

hl.animation({ leaf = "layersIn",      enabled = true, speed = 3,   spring = "pop",          style = "fade" })
hl.animation({ leaf = "layersOut",     enabled = true, speed = 1.8, bezier = "quick",        style = "fade" })
hl.animation({ leaf = "global",        enabled = true, speed = 10,  bezier = "easeOutQuint" })
hl.animation({ leaf = "windowsIn",     enabled = true, speed = 4,   bezier = "smoothOut",    style = "popin 92%" })
hl.animation({ leaf = "windowsOut",    enabled = true, speed = 3,   bezier = "softInOut",    style = "popin 92%" })
hl.animation({ leaf = "windowsMove",   enabled = true, speed = 5,   bezier = "smoothOut" })
hl.animation({ leaf = "fade",          enabled = true, speed = 3,   bezier = "softInOut" })
hl.animation({ leaf = "workspaces",    enabled = true, speed = 6,   bezier = "smoothOut",    style = "slidefade 40%" })
hl.animation({ leaf = "layers",        enabled = true, speed = 4,   bezier = "easeOutQuint" })
hl.animation({ leaf = "fadeLayersIn",  enabled = true, speed = 1.8, bezier = "glassIn" })
hl.animation({ leaf = "fadeLayersOut", enabled = true, speed = 1.6, bezier = "almostLinear" })
hl.animation({ leaf = "fadePopupsIn",  enabled = true, speed = 1.5, bezier = "glassIn" })
hl.animation({ leaf = "fadePopupsOut", enabled = true, speed = 1.3, bezier = "almostLinear" })
