#!/usr/bin/env python3
"""Fake a translucent block cursor: kitty draws the cursor opaque, so
pre-blend `cursor` over `background` at ALPHA (macOS / GNOME Terminal look).
Run after matugen writes colors.conf; idempotent (reads cursor_base)."""
import pathlib, re

ALPHA = 0.6
path = pathlib.Path.home() / ".config/kitty/colors.conf"
text = path.read_text()

def get(key):
    m = re.search(rf"^{key}\s+#([0-9a-fA-F]{{6}})", text, re.M)
    return m and [int(m[1][i:i + 2], 16) for i in (0, 2, 4)]

base, bg = get("# cursor_base"), get("background")
if base and bg:
    mixed = "".join(f"{round(c * ALPHA + b * (1 - ALPHA)):02x}" for c, b in zip(base, bg))
    text = re.sub(r"^cursor\s+#[0-9a-fA-F]{6}", f"cursor               #{mixed}", text, flags=re.M)
    path.write_text(text)
