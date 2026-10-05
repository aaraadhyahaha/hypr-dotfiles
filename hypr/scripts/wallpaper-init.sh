#!/bin/sh
awww-daemon &
until awww query >/dev/null 2>&1; do sleep 0.2; done

WALL="$(cat ~/.cache/last_wall 2>/dev/null)"
[ -f "$WALL" ] && awww img "$WALL" --transition-type none
