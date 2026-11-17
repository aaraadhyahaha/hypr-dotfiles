#!/usr/bin/env python3
# TEMP keydebug: log what the KERNEL sees from the laptop keyboard, below Hyprland.
# Pairs with /tmp/hypr-keydebug.log (Hyprland's view). Logs Super, every key and raw scancode
# while Super is held, and which keys were already down when Super went down. Plain typing
# (no Super) is never logged, so passwords stay out of the log.
# Run: sudo -b python3 ~/.config/hypr/scripts/keydebug-evdev.py   → /tmp/kernel-keydebug.log
import struct, sys, time

DEV = sys.argv[1] if len(sys.argv) > 1 else "/dev/input/by-path/platform-i8042-serio-0-event-kbd"
OUT = "/tmp/kernel-keydebug.log"
EV_KEY, EV_MSC, MSC_SCAN = 1, 4, 4
META = {125: "super", 126: "super"}
WATCH = {2: "1", 3: "2", 4: "3", 5: "4", 6: "5", 7: "6", 8: "7", 9: "8", 10: "9", 11: "0", 16: "Q"}
STATE = {0: "up", 1: "down", 2: "repeat"}
fmt = "llHHi"
size = struct.calcsize(fmt)
held = False
down = set()   # every key currently held, so a Super press shows what else was already down

with open(DEV, "rb") as dev, open(OUT, "a", buffering=1) as out:
    out.write(f"{time.strftime('%T')} start {DEV}\n")
    while True:
        sec, usec, typ, code, val = struct.unpack(fmt, dev.read(size))
        stamp = time.strftime("%T", time.localtime(sec)) + f".{usec // 1000:03d}"
        if typ == EV_MSC and code == MSC_SCAN and held:
            out.write(f"{stamp} scan 0x{val & 0xffffffff:x}\n")   # raw scancode from the keyboard
            continue
        if typ != EV_KEY or val == 2:
            continue
        if val: down.add(code)
        else: down.discard(code)
        if code in META:
            held = val != 0
            others = sorted(down - {code})
            out.write(f"{stamp} super {STATE[val]}" + (f" (also held: {others})" if val and others else "") + "\n")
        elif held:
            out.write(f"{stamp} {WATCH.get(code, 'code' + str(code))} {STATE[val]}\n")
