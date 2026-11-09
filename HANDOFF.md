# HANDOFF: crisp fonts at scale 1 (`ext.hypr` font framework)

Branch `fonts/crisp` (not merged into `main`; Hyprland and AGS read the working tree, so it is all live).
No plan file: this note is the plan. (`~/.claude/plans/composed-pondering-aurora.md` is the unrelated *hum* project.)

## Goal
Text on eDP-1 (1920x1080, 340x190 mm, **143 PPI**, Hyprland scale **1.0**) looked blurry and small next to macOS.
Build a framework that makes it crisp and macOS-like. **User constraints:** crispness comes first, and the monitor stays at scale 1.0
for screen space (they moved off 1.5). Memory: `font-crispness-goal`.

Brainstorm, four layers:
- **L1 rasterizer:** done.
- **L4 assets:** done (SF Pro Display).
- **L2 type model:** in progress (tracking measured; x-height snapping not started).
- **L3 live sync on monitor change:** not started.

## Done
- `c50d511`: **fontbench**, `hypr/scripts/fontbench/fontbench.py` + `configs.json`. One GTK4 layer-shell card per config, each in its own process (env / fontconfig / GtkSettings). grim captures each card. Reports soft-edge ink (lower = crisper), ink weight and line widths. Writes `sheet.png` (1:1), `zoom.png` (6x) and `report.txt` to `~/Pictures/fontbench/<ts>/`. Namespace `fontbench` is no-anim (`hypr/conf/shell.lua`). FEATURE_MAP `ext.hypr.scripts`.
- `ff73088`: **config E is the system default.** Soft-edge 69.7% → 64.5% at the same weight.
  - `fontconfig/conf.d/10-autohint.conf`: autohint + hintslight. SF Pro is unhinted CFF.
  - `FREETYPE_PROPERTIES="cff:no-stem-darkening=0 autofitter:no-stem-darkening=0"` in `environment.d/60-font-render.conf` + `hypr/conf/env.lua`.
  - GTK manual hinting via `gsettings ... font-rendering 'manual'`.
  - `fontconfig/` is now whitelisted in `.gitignore`.
- `914396d`: **SF Pro Display from 20px in AGS.** `$font-display`, `$display-from` (`_tokens.scss`), `@mixin text-size()` (`_mixins.scss`), applied to 10 large text sites. `.dw-count-big.glyph` restates `$font-icon`. Rules recorded in `ags/DESIGN.md` → "Spacing, radii, type".
- SF Pro Display (18 OTFs) installed into `~/.local/share/fonts/SF/` from Apple's `SF-Pro.dmg`.
- WIP commit (this one), bench only:
  - `"tracking": "trak"` reads each font's own AAT `trak` table (matches Apple's published values).
  - Line widths in the report.
  - Labels are `halign START`.
  - The bench loads `environment.d` so card A = what a fresh login gets.
  - Configs G (E without the GTK change), H (Display), I (H + trak), J (I, unhinted metrics).
- Outside git (documented under Cleanup):
  - `~/.local/bin/ags` wrapper exports `FREETYPE_PROPERTIES`.
  - `gtk-4.0/settings.ini` has `gtk-font-rendering=manual`, `gtk-hint-font-metrics=1`, `gtk-xft-hinting=1`, `gtk-xft-hintstyle=hintslight` (file is gitignored as theme output).

## Measured findings (fontbench)
- GTK automatic at 1x ≈ manual slight (A ≈ C). The real gain is the **autohinter** (D). Stem darkening adds sturdiness (E). E beats G, so the GTK manual + hinted-metrics part matters.
- **Pango/HarfBuzz ignore `trak` in OpenType fonts**, so macOS's size-dependent tracking is missing on Linux.
  - Values: Text +0.064px @11, 0 @12, −0.076 @13, −0.234 @15. Display +0.344 @22, +0.382 @34.
- Tracking **survives hinted metrics** (I widths: 13px row −2, 11px caption +3, 22px date +6).
- I is the crispest (64.0%). Unhinted metrics (J) are softer (65.6%).
- Display without trak (what AGS ships now) is **tighter than macOS**: the date crowds at "Monday, 9". The cut assumes CoreText adds trak.

## Open bugs
- None known.
- Display in the desktop widgets and popovers has **not been checked by eye**: no screenshot was taken, to avoid disturbing the user's workspace.

## Remaining (in order)
1. **Waiting on the user:** roll config I (trak tracking) into AGS. Proposed:
   1. A generator script (like `npm run motion`) reads the `trak` tables and writes `ags/styles/_tracking.scss` (size → letter-spacing for Text and Display).
   2. `text-size()` adds `letter-spacing` from that map.
   3. Convert the ~150 text `font-size:` sites to `@include text-size()`, **one partial at a time**. Skip icon glyphs (`.icon`, `.symbol`, `*-glyph`, `$font-icon`, `$font-symbols`, mono). After each partial, diff compiled CSS (`sass --no-source-map style.scss`) and check on the bench.
2. User's eye check of Display: desktop clock/calendar (Super+G), pomodoro, battery %, notification date.
3. **L2:** `service/typeModel.ts` + test: physical PPI → per-role px sizes snapped so the x-height lands on whole device px, plus tracking and opsz. Optional: install the variable `SF-Pro.ttf` (has an `opsz` axis) and compare on the bench.
4. **L3:** a Hyprland event listener (`monitoraddedv2`/`monitorremoved`/`configreloaded`). It re-applies AGS CSS, sets `gsettings text-scaling-factor`, and writes `Xft.dpi` (xrdb) for XWayland. Qt/Electron only pick it up on restart.
5. Check non-GTK apps under the global autohint: Zen/Firefox, Electron (VSCode, Obsidian), Qt. Add per-font or per-app fontconfig exceptions if anything looks worse.
6. Merging `fonts/crisp` → `main` is the user's call.

## How to verify
- Bench, all configs: `~/.config/hypr/scripts/fontbench/fontbench.py`
- Bench, subset with extra zoom lines: `... --only A,H,I --zoom row,date`
- Leave the cards up to judge by eye (click to close): `... --hold`
- Output goes to `~/Pictures/fontbench/<ts>/`. Pass `--out <dir>` for scratch runs.
- SCSS compiles: `cd ~/.config/ags && sass --no-source-map style.scss >/dev/null`
- AGS tests (no TS changed this session): `cd ~/.config/ags && npm test`
- Rendering in effect:
  - `fc-match -v "SF Pro Text" | grep -E "autohint|hintstyle"` → `autohint: True`
  - `gsettings get org.gnome.desktop.interface font-rendering` → `'manual'`
- Running shell has the env: `tr '\0' '\n' </proc/$(pgrep -x gjs)/environ | grep FREETYPE`

## Cleanup / state
- No temporary system state. No bench processes left running. AGS was restarted once via the Super+Shift+R command and runs a single instance.
- Uncommitted: nothing after this commit.
- The SF Pro download lived in the session scratchpad and is gone. To re-get the variable `SF-Pro.ttf`:
  `mkdir d && cd d && curl -sSfLO https://devimages-cdn.apple.com/design/resources/download/SF-Pro.dmg && 7z x -odmg SF-Pro.dmg && 7z x -opkg dmg/SFProFonts.pkg && mkdir p && cd p && 7z x -so ../pkg/SFProFontsPackage.pkg/Payload | cpio -id` → fonts in `Library/Fonts/`.
  Apple's licence only covers Apple-platform mockups; the user knows.
- To undo config E entirely:
  - `rm ~/.config/fontconfig/conf.d/10-autohint.conf ~/.config/environment.d/60-font-render.conf`
  - Drop the `FREETYPE_PROPERTIES` lines from `hypr/conf/env.lua` and `~/.local/bin/ags`.
  - `gsettings set org.gnome.desktop.interface font-rendering 'automatic'`
  - Remove the 4 `gtk-font-rendering`/`gtk-hint-font-metrics`/`gtk-xft-hint*` lines from `gtk-4.0/settings.ini`.
  - Relogin.

## Gotchas
- `~/.config` is the single git repo; `ags/` and `hypr/` are subfolders. `.gitignore` is a whitelist (`/*` + `!/dir/`).
- `pgrep -f "gjs ... ags.js"` matches **your own bash command line**. Use `pgrep -x gjs`. Never run two AGS instances.
- Claude's shell predates `environment.d/60-font-render.conf`, so it lacks `FREETYPE_PROPERTIES`. The bench injects it itself; anything else you launch needs it set explicitly, or must be launched via Hyprland.
- Hyprland 0.57 is configured in Lua. Dispatch syntax: `hyprctl dispatch 'hl.dsp.exec_cmd([[sh -c "..."]])'`.
  - Restart AGS with the new env: `hyprctl dispatch "hl.dsp.exec_cmd([[sh -c 'ags quit; sleep 0.3; setsid ~/.config/hypr/scripts/ags-run.sh']])"`
- Processes exec'd by Hyprland can't see the session scratchpad (`/tmp/claude-*`). Use `$XDG_RUNTIME_DIR` for handoff files.
- `fc-match "Family:weight=600"` uses fontconfig's weight scale (600 → Black). Use style names (`:semibold`).
- A rule with both a text class and `.glyph` loses `.glyph`'s icon font once `text-size()` sets a family (later partial wins at equal specificity). Restate `font-family: $font-icon`.
- The soft-edge score favours heavier text (thicker stems = more solid pixels). Read it next to ink weight. Bench cards flash on screen for about 1 s as overlays, with no workspace switch (memory `never-open-claude-workspace`).
