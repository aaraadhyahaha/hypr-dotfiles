#!/bin/sh
# usage: theme-apply.sh [image]   (defaults to the last wallpaper)
img="${1:-$(cat ~/.cache/last_wall)}"
mode="$(cat ~/.cache/theme_mode 2>/dev/null || echo dark)"
idx="$(cat ~/.cache/theme_idx 2>/dev/null || echo 0)"

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