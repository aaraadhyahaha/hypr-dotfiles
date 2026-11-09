#!/usr/bin/env python3
"""fontbench: A/B font rendering on the real panel.

Each config in configs.json runs in its own GTK4 process: environment, fontconfig and
GtkSettings are per-process. Each process draws a card of shell-like text as a
layer-shell overlay ("fontbench" namespace, no fade, see conf/shell.lua). Overlays never
switch workspaces. The runner grims every card, scores it and writes:

  <out>/card-<id>.png   the card at 1:1 device pixels
  <out>/sheet.png       all cards side by side, 1:1 (view at 100% zoom)
  <out>/zoom.png        12px and 11px lines (first 120 px) at 6x, nearest-neighbour, to see the pixels
  <out>/report.txt      effective settings and the crispness score per card

Usage:
  fontbench.py                   capture, then close the cards
  fontbench.py --hold [SECS]     capture, then leave the cards up until clicked (default 120 s)
  fontbench.py --only A,D        run a subset of configs
  fontbench.py --zoom date,pomo  zoom other sample lines
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLORS = Path.home() / ".config/ags/colors.scss"
LAYER_SHELL_LIB = "/usr/lib/libgtk4-layer-shell.so"

# Shell-like lines: (id, px, weight, family key, text). Sizes and weights are the AGS
# tokens ($font-size-*, 400/500/600) that the shell actually uses most.
SAMPLES = [
    ("pomo", 34, 600, "sans", "25:00"),
    ("date", 22, 600, "sans", "Monday, 9 November"),
    ("title", 15, 600, "sans", "Control Center"),
    ("row", 13, 500, "sans", "Wi-Fi · Bluetooth · Do Not Disturb"),
    ("body", 12, 400, "sans", "The quick brown fox jumps over the lazy dog"),
    ("bold", 12, 600, "sans", "Notifications · 3 new · Clear all"),
    ("caption", 11, 400, "sans", "Battery 87% — 3 h 12 min remaining"),
    ("tiny", 10, 400, "sans", "Updated 2 min ago · 0123456789"),
    ("mono", 12, 400, "mono", "fx status --json | jq .tasks"),
]
STRIP = ("light", 12, 400, "sans", "Dark on light: The quick brown fox jumps over the lazy dog")
FAMILIES = {"sans": "SF Pro Text", "mono": "JetBrainsMono Nerd Font"}
# config "display_from": N switches sans lines of N px and up to the Display cut (macOS: 20 pt)
DISPLAY = "SF Pro Display"
# config "tracking": "trak" applies the font's own size-dependent tracking (see trak_spacing)
FC_WEIGHT = {400: "regular", 500: "medium", 600: "semibold", 700: "bold"}
WIDTH_LINES = ("row", "body", "caption", "date")
ZOOM_LINES = ("body", "caption")
ZOOM_W, ZOOM_X = 120, 6  # first 120 device px of each zoom line, at 6x
GAP = 16


def trak_spacing(family, weight, px):
    """Letter-spacing (px) that CoreText adds at this size: the normal track of the font's
    AAT `trak` table, linearly interpolated between its sizes. SF Pro carries one, but
    Pango/HarfBuzz ignore `trak` in OpenType fonts, so on Linux it never applies."""
    import struct

    file = subprocess.check_output(["fc-match", "-f", "%{file}", f"{family}:{FC_WEIGHT.get(weight, 'regular')}"], text=True)
    b = Path(file).read_bytes()
    tables = {b[12 + 16 * i : 16 + 16 * i]: struct.unpack(">I", b[20 + 16 * i : 24 + 16 * i])[0]
              for i in range(struct.unpack(">H", b[4:6])[0])}
    if b"trak" not in tables:
        return 0.0
    upem = struct.unpack(">H", b[tables[b"head"] + 18 : tables[b"head"] + 20])[0]
    o = tables[b"trak"]
    h = o + struct.unpack(">H", b[o + 6 : o + 8])[0]
    ntracks, nsizes, size_off = struct.unpack(">HHI", b[h : h + 8])
    sizes = [struct.unpack(">i", b[o + size_off + 4 * i : o + size_off + 4 * i + 4])[0] / 65536 for i in range(nsizes)]
    for i in range(ntracks):
        track, _, off = struct.unpack(">iHH", b[h + 8 + 8 * i : h + 16 + 8 * i])
        if track == 0:
            vals = [struct.unpack(">h", b[o + off + 2 * j : o + off + 2 * j + 2])[0] for j in range(nsizes)]
            break
    else:
        return 0.0
    if px <= sizes[0]:
        v = vals[0]
    elif px >= sizes[-1]:
        v = vals[-1]
    else:
        j = next(j for j in range(1, nsizes) if sizes[j] >= px)
        f = (px - sizes[j - 1]) / (sizes[j] - sizes[j - 1])
        v = vals[j - 1] + f * (vals[j] - vals[j - 1])
    return v / upem * px


def theme_colors():
    """Card colours come from the matugen palette, same as the shell."""
    found = dict(re.findall(r"^\$([\w-]+):\s*(#[0-9a-fA-F]{6})", COLORS.read_text(), re.M))
    return {k: found[k] for k in ("surface", "surface-container", "on-surface", "on-surface-variant")}


# ---------------------------------------------------------------- probe (one per config)


def probe(spec):
    import gi

    gi.require_version("Gtk", "4.0")
    gi.require_version("Gtk4LayerShell", "1.0")
    from gi.repository import GLib, Gtk
    from gi.repository import Gtk4LayerShell as LS

    Gtk.init()
    settings = Gtk.Settings.get_default()
    g = spec.get("gtk", {})
    if "rendering" in g:
        settings.props.gtk_font_rendering = (
            Gtk.FontRendering.MANUAL if g["rendering"] == "manual" else Gtk.FontRendering.AUTOMATIC
        )
    if "hintstyle" in g:
        settings.props.gtk_xft_hinting = 0 if g["hintstyle"] == "hintnone" else 1
        settings.props.gtk_xft_hintstyle = g["hintstyle"]
        settings.props.gtk_xft_antialias = 1
    if "hint_metrics" in g:
        settings.props.gtk_hint_font_metrics = g["hint_metrics"]

    c, k = spec["colors"], spec.get("size_scale", 1.0)
    css = [
        f".card {{ background: {c['surface-container']}; color: {c['on-surface']}; }}",
        f".meta {{ color: {c['on-surface-variant']}; font-family: '{FAMILIES['sans']}'; font-size: 10px; }}",
        f".head {{ font-family: '{FAMILIES['sans']}'; font-size: 13px; font-weight: 600; }}",
        f".strip {{ background: {c['on-surface']}; color: {c['surface']}; }}",
    ]
    display_from = spec.get("display_from", float("inf"))
    for sid, px, weight, fam, _ in SAMPLES + [STRIP]:
        family = DISPLAY if fam == "sans" and px * k >= display_from else FAMILIES[fam]
        track = trak_spacing(family, weight, px * k) if spec.get("tracking") == "trak" and fam == "sans" else 0
        css.append(
            f".s-{sid} {{ font-family: '{family}'; font-size: {px * k:g}px; font-weight: {weight}; "
            f"letter-spacing: {track:.3f}px; }}"
        )
    provider = Gtk.CssProvider()
    provider.load_from_string("\n".join(css))
    win = Gtk.Window(decorated=False)
    Gtk.StyleContext.add_provider_for_display(win.get_display(), provider, Gtk.STYLE_PROVIDER_PRIORITY_USER)

    LS.init_for_window(win)
    LS.set_namespace(win, "fontbench")
    LS.set_layer(win, LS.Layer.OVERLAY)
    LS.set_keyboard_mode(win, LS.KeyboardMode.NONE)
    LS.set_exclusive_zone(win, -1)
    for edge, margin in ((LS.Edge.LEFT, spec["x"]), (LS.Edge.TOP, spec["y"])):
        LS.set_anchor(win, edge, True)
        LS.set_margin(win, edge, margin)
    monitors = win.get_display().get_monitors()
    for i in range(monitors.get_n_items()):
        if monitors.get_item(i).get_connector() == spec["monitor"]:
            LS.set_monitor(win, monitors.get_item(i))

    def label(text, cls):
        # START, not fill: the bounds are the text's own width, which the report measures
        lbl = Gtk.Label(label=text, xalign=0, halign=Gtk.Align.START)
        lbl.add_css_class(cls)
        return lbl

    card = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
    card.add_css_class("card")
    card.set_size_request(spec["w"], spec["h"])
    head = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2, margin_start=18, margin_end=18, margin_top=14)
    head.append(label(spec["label"], "head"))
    meta = label("", "meta")
    head.append(meta)
    card.append(head)
    lines = {}
    body = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6, margin_start=18, margin_end=18, margin_top=8)
    for sid, *_, text in SAMPLES:
        lines[sid] = label(text, f"s-{sid}")
        body.append(lines[sid])
    card.append(body)
    spacer = Gtk.Box(vexpand=True)
    card.append(spacer)
    strip = Gtk.Box(margin_bottom=0)
    strip.add_css_class("strip")
    lines["light"] = label(STRIP[4], "s-light")
    lines["light"].set_margin_start(18)
    lines["light"].set_margin_top(10)
    lines["light"].set_margin_bottom(10)
    strip.append(lines["light"])
    card.append(strip)
    win.set_child(card)

    click = Gtk.GestureClick()
    loop = GLib.MainLoop()
    click.connect("released", lambda *_: loop.quit())
    win.add_controller(click)
    win.connect("close-request", lambda *_: loop.quit() or False)

    def rect(widget):
        ok, b = widget.compute_bounds(win)
        return [round(b.get_x()), round(b.get_y()), round(b.get_width()), round(b.get_height())]

    def report():
        renderer = win.get_renderer().__gtype__.name
        fr = settings.props.gtk_font_rendering.value_nick
        meta.set_label(
            f"{renderer} · {fr} · {settings.props.gtk_xft_hintstyle} · "
            f"metrics {'hinted' if settings.props.gtk_hint_font_metrics else 'unhinted'}"
        )
        # one more frame so the meta line is painted before grim runs
        GLib.timeout_add(250, write_ready, renderer, fr)
        return False

    def write_ready(renderer, fr):
        out = {
            "renderer": renderer,
            "font_rendering": fr,
            "hintstyle": settings.props.gtk_xft_hintstyle,
            "hint_metrics": settings.props.gtk_hint_font_metrics,
            "lines": {sid: rect(w) for sid, w in lines.items()},
            "samples": rect(body),
            "card": rect(card),
        }
        Path(spec["ready"]).write_text(json.dumps(out))
        return False

    win.connect("map", lambda *_: GLib.timeout_add(150, report))
    win.present()
    loop.run()


# ---------------------------------------------------------------- runner


def login_env():
    """Variables from ~/.config/environment.d, as a fresh login has them: card A must show
    the system default even when the bench runs from a shell older than those files."""
    env = {}
    for conf in sorted((Path.home() / ".config/environment.d").glob("*.conf")):
        for line in conf.read_text().splitlines():
            m = re.match(r"\s*([A-Za-z_]\w*)=(.*)", line)
            if m:
                env[m[1]] = m[2].strip().strip('"').strip("'")
    return env


def focused_monitor():
    mons = json.loads(subprocess.check_output(["hyprctl", "monitors", "-j"]))
    return next((m for m in mons if m.get("focused")), mons[0])


def fc_settings(env):
    out = subprocess.run(["fc-match", "-v", FAMILIES["sans"]], env=env, capture_output=True, text=True).stdout
    get = lambda key: (re.search(rf"^\s*{key}: (\S+)", out, re.M) or [None, "?"])[1]
    return f"autohint={get('autohint')} hintstyle={get('hintstyle')}"


def gray(png, r):
    x, y, w, h = r
    raw = subprocess.run(
        ["magick", str(png), "-crop", f"{w}x{h}+{x}+{y}", "+repage", "-colorspace", "Gray", "-depth", "8", "gray:-"],
        capture_output=True,
        check=True,
    ).stdout
    return raw


def score(png, r):
    """Crispness: share of ink pixels that sit fully on or off.

    Every ink pixel is normalised to t in [0,1] between background and the brightest ink.
    `grey` is the share of ink pixels with 0.08 < t < 0.92: soft edges. Lower is crisper.
    `ink` is mean coverage, how dark the text reads (stem darkening raises it).
    Heavier text scores crisper for free (thicker stems have more solid pixels), so read
    `grey` next to `ink`: a crispness gain is real only when ink stays near 1.0x."""
    raw = gray(png, r)
    counts = [0] * 256
    for v in raw:
        counts[v] += 1
    bg = max(range(256), key=counts.__getitem__)
    fg = max(v for v in range(256) if counts[v])
    span = max(fg - bg, 1)
    ts = [(v - bg) / span for v in raw]
    ink = [t for t in ts if t > 0.08]
    grey = sum(1 for t in ink if t < 0.92) / max(len(ink), 1)
    return grey, sum(ink) / max(len(ts), 1)


def run(args):
    configs = json.loads((HERE / "configs.json").read_text())
    if args.only:
        wanted = args.only.split(",")
        configs = [c for c in configs if c["id"] in wanted]
    if not configs:
        sys.exit("no configs selected")
    for tool in ("grim", "magick", "fc-match", "hyprctl"):
        if not shutil.which(tool):
            sys.exit(f"missing {tool}")

    mon = focused_monitor()
    lw, lh = round(mon["width"] / mon["scale"]), round(mon["height"] / mon["scale"])
    cols = min(3, len(configs))
    rows = -(-len(configs) // cols)
    w = (lw - GAP * (cols + 1)) // cols
    h = min((lh - GAP * (rows + 1)) // rows, 520)
    colors = theme_colors()
    out = Path(args.out or Path(subprocess.check_output(["xdg-user-dir", "PICTURES"], text=True).strip()) / "fontbench")
    out = out / datetime.now().strftime("%Y%m%d-%H%M%S")
    out.mkdir(parents=True)
    tmp = Path(tempfile.mkdtemp(prefix="fontbench-"))

    procs, cards = [], []
    try:
        for i, cfg in enumerate(configs):
            x, y = GAP + (i % cols) * (w + GAP), GAP + (i // cols) * (h + GAP)
            env = {**os.environ, **login_env(), **cfg.get("env", {})}
            env["LD_PRELOAD"] = ":".join(filter(None, [LAYER_SHELL_LIB, env.get("LD_PRELOAD")]))
            if cfg.get("fc", {}).get("autohint"):
                conf = tmp / f"fonts-{cfg['id']}.conf"
                conf.write_text(
                    '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">\n<fontconfig>\n'
                    '  <include ignore_missing="no">/etc/fonts/fonts.conf</include>\n'
                    '  <match target="font"><edit name="autohint" mode="assign"><bool>true</bool></edit></match>\n'
                    "</fontconfig>\n"
                )
                env["FONTCONFIG_FILE"] = str(conf)
            spec = dict(cfg, x=x, y=y, w=w, h=h, monitor=mon["name"], colors=colors, ready=str(tmp / f"{cfg['id']}.json"))
            procs.append(subprocess.Popen([sys.executable, __file__, "--probe", json.dumps(spec)], env=env))
            cards.append((cfg, spec, env))

        deadline = time.monotonic() + 15
        while not all(Path(s["ready"]).exists() for _, s, _ in cards):
            if time.monotonic() > deadline or any(p.poll() is not None for p in procs):
                sys.exit("a card failed to come up (see stderr above)")
            time.sleep(0.05)

        report, base_ink = [], None
        for cfg, spec, env in cards:
            info = json.loads(Path(spec["ready"]).read_text())
            png = out / f"card-{cfg['id']}.png"
            gx, gy = mon["x"] + spec["x"], mon["y"] + spec["y"]
            subprocess.run(["grim", "-g", f"{gx},{gy} {spec['w']}x{spec['h']}", str(png)], check=True)
            # device px = logical px * scale; the bench targets scale 1, where they are equal
            s = mon["scale"]
            dev = lambda r: [round(v * s) for v in r]
            grey, ink = score(png, dev(info["samples"]))
            base_ink = base_ink or ink
            for sid in args.zoom:
                x, y, lw_, lh_ = dev(info["lines"][sid])
                subprocess.run(
                    ["magick", str(png), "-crop", f"{min(lw_, ZOOM_W)}x{lh_}+{x}+{y}", "+repage",
                     "-scale", f"{ZOOM_X * 100}%", str(tmp / f"z-{cfg['id']}-{sid}.png")],
                    check=True,
                )
            report.append(
                f"{cfg['label']}\n"
                f"    gtk: {info['renderer']}, {info['font_rendering']}, {info['hintstyle']}, "
                f"hint_metrics={info['hint_metrics']}\n"
                f"    fontconfig: {fc_settings(env)}   FREETYPE_PROPERTIES={env.get('FREETYPE_PROPERTIES', '-')}\n"
                f"    soft-edge ink {grey:6.1%}  (lower = crisper)   ink weight {ink / base_ink:5.2f}x of first card\n"
                f"    line widths: " + "  ".join(f"{sid} {info['lines'][sid][2]}" for sid in WIDTH_LINES)
            )

        bg, fg = colors["surface"], colors["on-surface"]
        subprocess.run(
            ["magick", "montage", *[str(out / f"card-{c['id']}.png") for c, _, _ in cards],
             "-tile", f"{cols}x", "-geometry", "+8+8", "-background", bg, str(out / "sheet.png")],
            check=True,
        )
        zoom_args = []
        for cfg, _, _ in cards:
            for sid in args.zoom:
                zoom_args += ["-label", f"{cfg['id']} · {sid}", str(tmp / f"z-{cfg['id']}-{sid}.png")]
        subprocess.run(
            ["magick", "montage", *zoom_args, "-tile", f"{len(args.zoom)}x", "-geometry", "+6+6",
             "-background", bg, "-fill", fg, "-pointsize", "16", str(out / "zoom.png")],
            check=True,
        )
        text = f"fontbench {out.name} · {mon['name']} {mon['width']}x{mon['height']} @ {mon['scale']}\n\n" + "\n\n".join(report)
        (out / "report.txt").write_text(text + "\n")
        print(text)
        print(f"\nwrote {out}")

        if args.hold is not None:
            print(f"cards stay up for {args.hold:g} s: click any card to close them all")
            deadline = time.monotonic() + args.hold
            while time.monotonic() < deadline and all(p.poll() is None for p in procs):
                time.sleep(0.1)
    finally:
        for p in procs:
            if p.poll() is None:
                p.terminate()
        for p in procs:
            try:
                p.wait(timeout=3)
            except subprocess.TimeoutExpired:
                p.kill()
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--probe":
        return probe(json.loads(sys.argv[2]))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--hold", type=float, nargs="?", const=120.0, help="keep cards up after capture (seconds)")
    ap.add_argument("--only", help="comma-separated config ids")
    ap.add_argument("--zoom", type=lambda v: v.split(","), default=list(ZOOM_LINES),
                    help=f"sample lines for zoom.png (default {','.join(ZOOM_LINES)}; also pomo,date,title,row,bold,tiny,mono,light)")
    ap.add_argument("--out", help="output root (default: ~/Pictures/fontbench)")
    run(ap.parse_args())


if __name__ == "__main__":
    main()
