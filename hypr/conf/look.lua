-- Look & layouts: https://wiki.hypr.land/Configuring/Basics/Variables/

hl.config({
    general = {
        gaps_in     = 6,
        gaps_out    = 12,
        border_size = 0,

        -- Borders are 0px, so edges are grabbed in the gap
        resize_on_border        = true,
        extend_border_grab_area = 15,
        hover_icon_on_border    = true,

        allow_tearing = false,
        layout        = "dwindle",
    },

    decoration = {
        rounding       = 10,
        rounding_power = 2,

        active_opacity   = 0.9,
        inactive_opacity = 0.8,

        shadow = {
            enabled      = true,
            range        = 12,
            render_power = 3,
            color        = 0xee1a1a1a,
        },

        blur = {
            enabled           = true,
            size              = 8,
            passes            = 3,
            vibrancy          = 0.2,
            noise             = 0.01,
            new_optimizations = true,
        },
    },

    dwindle   = { preserve_split = true },
    master    = { new_status = "master" },
    scrolling = { fullscreen_on_one_column = true },

    misc = {
        force_default_wallpaper = -1,
        disable_hyprland_logo   = false,
    },
})
