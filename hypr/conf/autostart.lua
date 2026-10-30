-- Autostart: https://wiki.hypr.land/Configuring/Basics/Autostart/

hl.on("hyprland.start", function()
    -- ~/.local/bin/ags sets GDK_WAYLAND_DISABLE so GTK 4.24 does not break layer-rule blur
    -- restarts AGS if it crashes (scripts/ags-run.sh)
    hl.exec_cmd("~/.config/hypr/scripts/ags-run.sh")
    hl.exec_cmd("hyprctl setcursor MacTahoe-dark-cursors 20")
    hl.exec_cmd("hypridle")
    hl.exec_cmd("nm-applet --indicator")
    hl.exec_cmd("/usr/lib/polkit-kde-authentication-agent-1")
    hl.exec_cmd("wl-paste --watch cliphist store")
    hl.exec_cmd("wl-paste --type text --watch cliphist store")
    hl.exec_cmd("wl-paste --type image --watch cliphist store")
    hl.exec_cmd("~/.config/hypr/scripts/wallpaper-init.sh")
end)
