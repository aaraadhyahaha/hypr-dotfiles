# Handoff: Frosted AGS Shell (bar + popovers)

## Overview
A frosted-glass restyle and extension of the AGS v2 / GTK4 shell in `aaraadhyahaha/hypr-dotfiles` (`ags/`). It covers the bar and every popover: Control Center (quick settings), date menu (notifications + calendar), pomodoro, Wi-Fi, Bluetooth, audio, media, battery, system stats, launcher, power menu, screenshot/record toolbar, toasts and OSDs. Dark and light (matugen) themes. Target is 1920×1080, Hyprland.

## About the design files
`AGS Shell.dc.html` is a **design reference built in HTML**. Do not ship it. Recreate it in the existing AGS codebase (TSX widgets in `ags/widget/**`, SCSS partials in `ags/styles/**`) following `ags/DESIGN.md`: tokens from `_tokens.scss`, colors only from `colors.scss` (matugen), mixins `interactive`, `tile`, `on-state`, `panel`, `field`, `track`. Never hardcode hex/rgba numbers in SCSS. Every color below maps to an existing matugen role.

## Fidelity
**High fidelity.** Match spacing, radii, sizes and colors exactly. Icons in the mock are Material Symbols Rounded as stand-ins; keep the repo's icon approach (symbolic icons / JetBrainsMono Nerd Font Propo) and pick the equivalent glyph. Font in the mock is Figtree as a stand-in for the repo's `$font` ("SF Pro Text"); keep `$font`.

## Glass / blur (most important)
The frost is compositor blur, not CSS. Implement in Hyprland:
```lua
-- hypr/hyprland.lua (layer rules; adapt to your config syntax)
layerrule = blur, bar
layerrule = ignorezero, bar        -- or ignore_alpha 0.0
layerrule = blur, gtk4-layer-shell -- popovers / panels namespaces
layerrule = ignorealpha 0.3, <panel namespaces>
decoration.blur = { size = 8, passes = 3, vibrancy = 0.2, noise = 0.01 }
```
Mock values: `backdrop-filter: blur(28px) saturate(1.7)`. In Hyprland, roughly `size 7–9, passes 3, vibrancy ~0.2` gives the same look.

Tint changes (SCSS):
- `$bar-bg`: `rgba($surface, 0.50)` (mock: tint − 0.12, tint 0.62)
- `$panel-bg`: `rgba($surface-container, 0.62)` (was .82, lowered so blur reads)
- `$card-bg` (inside panels): **translucent** instead of solid: dark `rgba($on-surface, .075)`; light `rgba(#fff, .55)`. Suggest a new token `$glass-card` chosen by matugen mode.
- `$track-bg`: dark `rgba($on-surface, .14)`; light `rgba($on-surface, .10)`
- Hairline on every glass surface: `border: 1px solid` dark `rgba(#fff,.10)` / light `rgba(#fff,.65)`. Replaces `rgba($outline-variant,.6)` in `@mixin panel`.
- Separators: `rgba($outline-variant, .22)` look (dark) — use `rgba($on-surface-variant, .22)`.
- Panel shadow: `0 16px 48px rgba($shadow, .40)` (dark) / `.28` (light). If GTK shadow clips on layer surfaces, add margin to the popover contents.
- Fields (`@include field`): `rgba($surface, .45)`.

## Bar (`widget/bar/Bar.tsx`, `_bar.scss`)
- Window anchored TOP|LEFT|RIGHT, exclusive. `.body`: margin `8px 12px 0`, padding 4px, height 40px total (32 content), radius 12px (`$radius-md`), bg `$bar-bg`, 1px hairline. Variant "full-width": margin 0, radius 0.
- Text: 13px, weight 600, tabular numbers. Every item 24px tall, radius 8px, hover = `rgba($on-surface,.08)`.
- `centerbox`:
  - **Start**: launcher button (24×24, icon 17px) · Sep (1×14px, 8px side margin) · Workspaces · WindowTitle (`$text-muted`, padding 0 8px 0 12px, ellipsize).
    - Workspace pips: button 24px tall, 0 4px padding; pip 8×8 round. Empty `$outline-variant`, occupied `$on-surface-variant`, active 26px wide `$primary`, urgent `$error` (pulse), special = 8px ring 1.5px `$primary`. Unchanged from current SCSS.
  - **Center** (gap 4px): DateMenu button: `Fri 23 Oct` (500, muted) + 8px + `14:20` · Sep · bell 16px · count badge (16px tall, min-width 16, padding 0 5px, `$primary`/`$on-primary`, 10px/700). Shown with hover fill to indicate open state. Then Media pill: `$primary` equalizer icon 16px · title · artist (500, muted), gap 8px.
  - **End** (gap 2px), in order:
    1. Recording indicator (NEW, only while recording): pill radius 999, padding 0 8px, bg `rgba($error,.14)`, fg `$error`, 7px dot + elapsed `00:42` 12px. Click = stop. (Discussed: may become dot-only to avoid confusion with pomodoro time.)
    2. System stats mini (NEW): muted 12px, CPU icon + `12%`, RAM icon + `5.1G`. Click → System stats popover.
    3. Screenshot button (NEW, 24×24) → screenshot toolbar.
    4. Battery (static): icon + `78%`, gap 6px. `.low` → `$error`.
    5. Sep
    6. PomodoroPill: 16px ring (2.5px stroke, `$primary` / track 20% alpha) + `09:24` 12px `$text`.
    7. QuickSettings pill: night-light indicator (`$tertiary`, only when on) · wifi · bluetooth · volume, 16px icons, gap 6px.
    8. Sep
    9. Power (24×24).
- Tray/Caffeine from the current bar are not shown in the mock; keep them if wanted (Caffeine moves well into the CC tiles).

## Popovers: shared
- `popover` margin-top 8px (mock places panels 16px below the bar bottom, at top: 56px).
- Panel: `@include panel(16px)`, radius 16px, glass tint/hairline/shadow above.
- Rows: padding 8px 12px, radius 12px, icon 18px, gap 10px; title 600; sub 11px at 75% opacity.
- List selection = `$secondary-container` / `$on-secondary-container`. On-state = `$primary` / `$on-primary`.
- Section labels: 11px, 600, `$text-muted`.
- Switch: 40×22 pill, knob 16px inset 3px. On: track `$primary`, knob `$on-primary`. Off: track `$track-bg`, knob `$outline`.
- Motion: unchanged. `ENTER.popover`, Hyprland owns fades.

## Control Center (`quicksettings/*`, `_quicksettings.scss`). 380px wide, column gap 12px
1. **Header**: avatar 32px circle (`$primary`, initial), name 600 + `up 3 h 12 min` 11px muted, then three 32px round buttons on `$card-bg`: settings, lock, power.
2. **Wi-Fi / Bluetooth pairs** (2 cols, gap 8): radius 16, on = `$primary`. Left part: icon 20px, name 600, sub 11px (SSID / device). Right chevron segment with 1px left divider `rgba($on-primary,.18)`, padding 0 10px. Chevron opens the Wi-Fi/BT panel.
3. **Tiles**: grid 3×2, gap 8. Tile padding 12px 10px, radius 16, column: icon 20px, label 12px/600, sub 11px 75%. Tiles: Night Light (`4000 K`, on), Do Not Disturb, Airplane, Mic Mute, Screenshot (`Region`), Record (`00:42`, on while recording).
4. **Sliders card** (`$card-bg`, radius 16, padding 12, gap 14): Volume and Brightness rows: icon 18 · track 8px `$track-bg` / fill `$primary` · knob 16px `$primary` · value 12px muted (22px wide right-aligned) · volume chevron → Audio panel.
5. **Media mini** (card, padding 10): 44px cover radius 10 · title 600 / `artist · player` 12px muted · prev · 34px play/pause `$primary` · next.
6. **Stats** (3 cols): CPU / RAM / Temp. Card padding 10px 12px, label 11px muted, value 600, 12-bar sparkline 18px tall, 2px gap, bars `$primary` 85%.
7. **Theme segmented**: card padding 4, two segments padding 8px 0 radius 12, active = on-state.
8. **Footer**: battery icon, `78% · 3 h 12 min left`, power profile name right. 12px muted.

## Date menu (`DateMenu.tsx`, `_notifications.scss`)
Panel padding 16, two columns, 16px gap and a 1px separator.
- **Notifications (330px)**: header `Notifications` 15/700 · DND 28px round · `Clear` (`$primary`, 600). Groups: header row (app 12/600, time 11 `$outline`, close 16px). Card: `$card-bg`, radius 12, padding 10px 12px, 32px icon tile (`$secondary-container`), summary 700, body muted, line-height 1.4. Critical: `inset 2px 0 $error`.
- **Calendar (270px)**: `Friday` 12 muted / `23 October 2026` 22/700 · month row with chevrons · 7-col grid Monday first, day names 11 muted, days 30px circles 12px/500 inside 34px rows; today = on-state 700; other-month `$outline`. Below: event card with 3px `$tertiary` bar, title 600, time 11 muted.

## Pomodoro (`PomodoroPill.tsx`, `_pomodoro.scss`). 332px wide, gap 12
Phase `Focus` (600 muted) + `Session 3 of 4` 12 faint · 150px ring, 7px stroke, `09:24` 34/600 · controls: reset 38px tile, play/pause 52px on-state, skip 38px · task field (`field`) · `Today · 2 / 8 sessions` + streak (flame `$primary`, `5` 600, `days` 12 muted) · 6px goal track · heatmap 18 cols × 7 rows, 3px gap, `$primary` at 0.06–1.0 opacity · steppers 2×2 (Focus 25, Short 5, Long 15, Goal 8), 22px round − / + buttons. Break phases use `$tertiary`, as the repo does today.

## Wi-Fi panel (340px)
Title 15/700 + switch · networks (signal icon, SSID, `Connected · WPA3` / `Saved` / `Open` / `Secured`, lock 15px) · active = selection colors · separator · `Network settings…` muted.

## Bluetooth panel (340px)
Title + switch · devices (icon, name, `Connected`/`Paired`, battery % right 12px). Connected = selection colors · separator · `Scanning…` with icon.

## Audio panel (340px)
`Output` list (headphones ✓ selected, speakers, HDMI) · `Input` list · `Applications` mixer: 24px app tile, name 12/600, 6px volume track.

## Media card (340px, gap 12)
72px cover radius 12 · title 15/700, artist muted, album 11 faint · seek 4px track, 12px knob · times 11 muted, tabular · controls: shuffle 20 muted, prev 28, play 48px on-state, next 28, repeat 20 `$primary` (on) · player chips (radius 999, 11/600, active on-state).

## Battery popover (300px, gap 14)
`78%` 32/700 + `3 h 12 min left` muted · 8px charge track · power profile segmented (Saver / Balanced / Performance; icon 18 + label 11/600; active on-state; uses `powerprofilesctl`) · `Limit charge to 80%` switch · `Health 94% · 412 cycles` and `11.8 W`, 12px muted.

## System stats popover (320px, gap 10)
CPU card with 32-bar history (36px tall) · meters (Memory `$primary`, Temperature `$tertiary`, Disk `$error` when >90%): icon 16, name 12/600, value 12 muted, 6px track · top 3 processes (name, CPU 48px, mem 64px, right-aligned, muted). Poll only while open.

## Launcher (`_launcher.scss`, 520px, padding 8)
Entry 46px tall, radius 12, `field` bg, search icon 20 muted, 15px text, `Super` hint (mono 11 faint) · rows: 32px icon tile radius 9 · name 700 / desc 12 at 75% · key hint · selected = selection colors.

## Power menu (200px, padding 8)
Rows radius 8, padding 8px 12px: Lock, Suspend, Log out, Restart, Shut down, each with a mono key hint (L/S/E/R/P). `.danger` hover = `rgba($error,.16)` bg + `$error` fg (shown on Restart).

## Screenshot / record toolbar
Horizontal glass pill, padding 6, gap 6: mode segmented (Region active / Window / Screen; 34px tall, radius 9) · Sep · photo/video segmented (photo selected = selection colors) · mic toggle · timer `3s` · `Capture` 40px, radius 12, on-state, 700. Backends: `grim`/`slurp`, `wf-recorder` or `gpu-screen-recorder`.

## Toast (360px, padding 12)
48px thumbnail · app 11 muted / `now` faint · summary 700 · action buttons (`tile`, radius 8, 12/600). Enters with `ENTER.edge`.

## OSD (`_osd.scss`, 250px)
Padding 10px 16px, icon 22 · 6px track · value 700. Muted state: fill `$outline`, value `—`. Bottom-center, 100px from the bottom.

## Design tokens (dark → light matugen)
- surface `#131318` → `#fbf8ff`; surface-container `#1f1f25` → `#efedf4`
- on-surface `#e4e1e9` → `#1b1b21`; on-surface-variant `#c7c5d0` → `#46464f`; outline `#90909a` → `#767680`
- primary `#bcc2ff` → `#535a92`; on-primary `#242b61` → `#ffffff`
- secondary-container `#434559` → `#e0e0f9`; on-secondary-container `#e0e0f9` → `#181a2c`
- tertiary `#e6bad6` → `#7d5470`; error `#ffb4ab` → `#ba1a1a`
- Spacing 4px grid; radii 8 / 12 / 16 / 999; type 10 / 11 / 12 / 13 / 15 / 22 / 32 / 34.

## Assets
- Wallpaper: `wallpaper.jpg` (the user's own, abstract blue).
- Icons: Material Symbols in the mock; map them to the repo's icon set.
- Cover art and thumbnails are striped placeholders.

## Files
- `AGS Shell.dc.html`: the design (open in a browser; needs `support.js` next to it). Section A is dark, B is light; each has a full desktop and a sheet of every panel.
