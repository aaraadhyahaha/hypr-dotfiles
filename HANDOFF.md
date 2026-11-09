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
- **L2 type model:** in progress (tracking shipped in AGS; x-height snapping not started).
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
- Commit "ags(type): SF Pro's trak tracking on every text size": **trak tracking in AGS (config I):**
  - `npm run tracking` (`ags/scripts/tracking.ts` → `widget/common/trackingModel.ts`, 7 tests in `trackingModel.test.ts`) parses the installed SF Pro `trak` tables and writes `ags/styles/_tracking.scss`: `$tracking-text`/`$tracking-display`, whole px 6–64 → letter-spacing. trak is identical at every weight, so Regular stands for each cut.
  - `text-size()` (`_mixins.scss`) adds `letter-spacing` from the map for its cut; `@error`s outside 6–64px.
  - 119 text `font-size:` sites across all 18 partials now use `@include text-size()`. Each partial's compiled-CSS diff added only `letter-spacing` lines (0 other changes).
  - Left as bare `font-size`: every `.icon`/`.glyph`/`*-icon`/`.symbol`/`.pnl-row-check`/`.cc-cover-fallback`/`.dw-live-dot` rule and mono text (bridge lines, `.code`, accelerators, `.menu-key`). `.dw-count-big.glyph` restates `letter-spacing: 0`.
  - Explicit `letter-spacing` overrides (uppercase eyebrows 0.06–0.08em, desktop clock −0.02em) come after the include and still win.
  - Checked: Material Symbols ligatures survive letter-spacing (pango-view: the icon stays one glyph even at +2pt), so inherited tracking can't break icons.
  - AGS restarted with it (one gjs, `FREETYPE_PROPERTIES` present, no CSS warnings). `npm test` 247/247.
  - Docs: `ags/DESIGN.md` → "Spacing, radii, type" (rule: always `text-size()`), FEATURE_MAP `core.styles`.
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

### x-height snapping (L2), measured 2026-11-09
- The autohinter quantizes height: rendered x-height steps at ~10.1 (6 px), 11.9 (7), 13.8 (8), 15.7 (9), 17.5 (10) px for SF Pro Text. Inside a step only width changes.
  - So **12px renders exactly as tall as 13px** (x 7, caps 9): +10.8% vertical stretch. 14 is as tall as 15 (+8.6%, caps +11.5%). 22px Display is just past a step (+7.4%).
  - Undistorted points: 11.3, 13.0, 15.4, 17.0, 18.6; Display 21.6.
  - Method: pango-view offscreen sweep (scratch scripts, not kept), confirmed in GTK with the bench's new `"sizes"` remap.
- **Snapping does not buy crispness.** Bench K (base 12→11.3) and L (12→13), both with 11→11.3, 15→15.4, 22→21.6: 65.6% vs I's 64.0%.
  - One move at a time: every move of 12px costs 0.2–1.6 points (11.3, 12.8, 13, even integer 11). 15→15.4 −0.3, 22→21.6 +0.2, 11→11.3 +0.3.
  - 12px is a crisp sweet spot (trak is exactly 0 there). Fixing its proportions means either shrinking base to caption height or merging it with 13px.
- Not applied to AGS: the user chose to drop snapping.

## Open bugs
- None known from this work. The AGS log after restart showed one `Json-CRITICAL: json_object_get_int_member: assertion 'node != NULL'` (Json-GLib, so not CSS). Not investigated; may predate this branch.
- Display in the desktop widgets and popovers has **not been checked by eye**: no screenshot was taken, to avoid disturbing the user's workspace.

## Remaining (in order)
1. **User's eye check** of Display + tracking: desktop clock/calendar (Super+G), pomodoro, battery %, notification date, and small text (bar 13px, captions 11px). Tracking is committed; revert that commit if it reads wrong.
2. ~~L2 x-height snapping~~: **dropped** by the user after the measurement above. Sizes stay as they are. Optional leftover: try the variable `SF-Pro.ttf` `opsz` axis on the bench.
3. ~~L3 live sync~~: **moot** after L2 was dropped: there is no PPI-based model to re-apply. A global `text-scaling-factor` on hotplug would also resize eDP-1 text (Wayland already scales each output). Only eDP-1 exists today. Revisit when an external monitor is in use.
4. **Non-GTK apps, measured 2026-11-09** (headless Chrome and Firefox render a test page; scored with the bench's soft-edge metric, dark-on-light crops negated; scripts were in the session scratchpad, not kept):
   - **Chrome/Electron (VSCode, Obsidian):** the autohint rule leaves Noto Sans (the `sans-serif`/`system-ui` fallback), Liberation and JetBrains Mono byte-identical. SF Pro gets crisper (84.1% → 81.1%, same ink). Skia ignores `FREETYPE_PROPERTIES`, so no darkening. No regression.
   - **Firefox/Zen:** headless ignores the autohint rule (byte-identical). Stem darkening applies: about 1.2x ink on every font, scoring crisper (Noto 13 82.2% → 74.3%). Text visibly heavier. This has been live in Zen since config E.
   - **Caveats:** windowed Firefox may also take GTK hinting, which headless can't show. Qt is untested (no PyQt/PySide installed).
   - If Zen reads too heavy, exclude it: launch it with `FREETYPE_PROPERTIES` unset (desktop-file override).
5. Merging `fonts/crisp` → `main` is the user's call.

## How to verify
- Bench, all configs: `~/.config/hypr/scripts/fontbench/fontbench.py`
- Bench, subset with extra zoom lines: `... --only A,H,I --zoom row,date`
- Leave the cards up to judge by eye (click to close): `... --hold`
- Output goes to `~/Pictures/fontbench/<ts>/`. Pass `--out <dir>` for scratch runs.
- SCSS compiles: `cd ~/.config/ags && sass --no-source-map style.scss >/dev/null`
- AGS tests: `cd ~/.config/ags && npm test`; tracking only: `node --test widget/common/trackingModel.test.ts`
- Regenerate tracking after a font change: `npm run tracking`, then diff compiled CSS
- Rendering in effect:
  - `fc-match -v "SF Pro Text" | grep -E "autohint|hintstyle"` → `autohint: True`
  - `gsettings get org.gnome.desktop.interface font-rendering` → `'manual'`
- Running shell has the env: `tr '\0' '\n' </proc/$(pgrep -x gjs)/environ | grep FREETYPE`

## Cleanup / state
- No temporary system state. No bench processes left running. AGS was restarted once via the Super+Shift+R command and runs a single instance.
- Uncommitted: nothing. AGS log of the current instance: `$XDG_RUNTIME_DIR/ags-tracking.log`.
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
