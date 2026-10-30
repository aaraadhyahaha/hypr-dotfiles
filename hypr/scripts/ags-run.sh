#!/bin/sh
# Keep the AGS shell up: restart it when gjs crashes. libnm segfaults inside
# AGS when Wi-Fi reconnects after resume, which left the desktop shell-less.
# A clean exit (`ags quit`, Super+Shift+R) ends the loop.
cd ~/.config/ags || exit 1
while :; do
  ags run "$@" && exit 0
  sleep 1
done
