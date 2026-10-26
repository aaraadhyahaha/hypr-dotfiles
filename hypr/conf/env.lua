-- Environment: https://wiki.hypr.land/Configuring/Advanced-and-Cool/Environment-variables/

hl.env("QT_QPA_PLATFORMTHEME", "qt5ct:qt6ct")
hl.env("XCURSOR_THEME", "MacTahoe-dark-cursors")
hl.env("XCURSOR_SIZE", "20")
hl.env("HYPRCURSOR_SIZE", "20")

-- GTK 4.24 sends an empty ext-background-effect blur region, which makes Hyprland skip window blur.
-- This only reaches apps Hyprland execs; D-Bus-activated apps (Loupe, Nautilus) get it from
-- ~/.config/environment.d/50-gtk-blur.conf, since Hyprland exports only a fixed var list to systemd.
hl.env("GDK_WAYLAND_DISABLE", "ext_background_effect_manager_v1")
