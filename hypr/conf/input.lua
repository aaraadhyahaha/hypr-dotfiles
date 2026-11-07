-- Input: https://wiki.hypr.land/Configuring/Basics/Variables/#input

hl.config({
    input = {
        kb_layout  = "us",
        kb_variant = "",
        kb_model   = "",
        kb_options = "",
        kb_rules   = "",

        follow_mouse = 1,
        sensitivity  = 0.35, -- -1.0 to 1.0, 0 = unmodified

        touchpad = {
            natural_scroll       = true,
            disable_while_typing = true,
            clickfinger_behavior = true,
            -- Baseline for every app; per-app scroll_touchpad rules in rules.lua scale from this.
            scroll_factor        = 1.0,
        },
    },
})

hl.gesture({ fingers = 3, direction = "horizontal", action = "workspace" })
