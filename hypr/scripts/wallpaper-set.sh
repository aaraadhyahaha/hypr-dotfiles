#!/bin/sh
if ! awww query >/dev/null 2>&1; then
  awww-daemon &
  until awww query >/dev/null 2>&1; do sleep 0.2; done
fi
[ -f "$1" ] || { echo "usage: wall-set.sh /path/to/image"; exit 1; }
echo "$1" > ~/.cache/last_wall
awww img "$1" \
  --transition-type grow \
  --transition-pos center \
  --transition-duration 1.6 \
  --transition-fps 60
~/.config/hypr/scripts/theme-apply.sh "$1" &
