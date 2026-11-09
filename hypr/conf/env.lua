-- Environment: https://wiki.hypr.land/Configuring/Advanced-and-Cool/Environment-variables/

hl.env("QT_QPA_PLATFORMTHEME", "qt5ct:qt6ct")
hl.env("XCURSOR_THEME", "MacTahoe-dark-cursors")
hl.env("XCURSOR_SIZE", "20")
hl.env("HYPRCURSOR_SIZE", "20")

-- GTK 4.24 sends an empty ext-background-effect blur region, which makes Hyprland skip window blur.
-- This only reaches apps Hyprland execs; D-Bus-activated apps (Loupe, Nautilus) get it from
-- ~/.config/environment.d/50-gtk-blur.conf, since Hyprland exports only a fixed var list to systemd.
hl.env("GDK_WAYLAND_DISABLE", "ext_background_effect_manager_v1")

-- Crisp fonts (fontbench config E): stem darkening for the autohinter forced in
-- ~/.config/fontconfig/conf.d/10-autohint.conf. Mirrored in environment.d/60-font-render.conf.
hl.env("FREETYPE_PROPERTIES", "cff:no-stem-darkening=0 autofitter:no-stem-darkening=0")
