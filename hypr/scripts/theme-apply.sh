#!/bin/sh
# usage: theme-apply.sh [image] — matugen palette + GTK/icon theme for ~/.cache/theme_mode.
# Defaults to the last wallpaper. Called by wallpaper-set.sh and ags cc.theme.
img="${1:-$(cat ~/.cache/last_wall)}"
mode="$(cat ~/.cache/theme_mode 2>/dev/null || echo dark)"
idx="$(cat ~/.cache/theme_idx 2>/dev/null || echo 0)"

# Theme tools (nwg-look etc.) symlink these to root-owned /usr/share/themes files;
# matugen then fails with EACCES and aborts, skipping the remaining templates (ags).
for f in ~/.config/gtk-3.0/gtk.css ~/.config/gtk-4.0/gtk.css; do
  [ -L "$f" ] && rm "$f"
done

matugen image "$img" -m "$mode" --source-color-index "$idx" >> /tmp/matugen.log 2>&1

if [ "$mode" = light ]; then
  gsettings set org.gnome.desktop.interface color-scheme prefer-light
  gsettings set org.gnome.desktop.interface gtk-theme adw-gtk3
  gsettings set org.gnome.desktop.interface icon-theme Papirus-Light
else
  gsettings set org.gnome.desktop.interface color-scheme prefer-dark
  gsettings set org.gnome.desktop.interface gtk-theme adw-gtk3-dark
  gsettings set org.gnome.desktop.interface icon-theme Papirus-Dark
fi