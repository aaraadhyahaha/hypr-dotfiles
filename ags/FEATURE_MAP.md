# AGS Shell — Feature Map

A lookup table from **feature → the exact files (and line ranges) that implement it**.
Name a section ID (e.g. `cc.wifi`, `desktop.frame.resize`) and only those files need to be opened.

- Line ranges are anchors as of 2026-10-24; they drift as code changes, so treat them as "start reading here".
- Every feature that has pure logic keeps it in a `*Model.ts` / `model.ts` / `*.ts` next to it, with a `*.test.ts` (`npm test`, Node's test runner). Change the model → run its test.
- Visual rules (tokens, motion, on-state, gotchas) live in `DESIGN.md`. This file only says *where* things are.

**How to use it:** find the section, open the files listed under **Code**, the partial under **Style**, and check **Touches** for anything else the change could ripple into.

---

## 0. Index

| ID | Feature | Main file |
|---|---|---|
| `core.app` | Startup, IPC requests, window list | `app.ts` |
| `core.motion` | `<Motion>`, `ENTER`/`LEAVE` presets, easing | `widget/common/motion.ts` |
| `core.icons` | Material Symbols `<Icon>`, live wifi/bt/volume/battery glyphs | `widget/common/Icon.tsx`, `icons.ts` |
| `core.styles` | Tokens, mixins, globals, matugen colors | `styles/_tokens.scss`, `_mixins.scss` |
| `svc.system` | CPU/RAM/disk/temp polls | `service/system.ts` |
| `svc.recorder` | wf-recorder screen recording | `service/recorder.ts` |
| `svc.pomodoro` | Pomodoro timer engine + history | `service/pomodoro.ts` |
| `svc.fx` | fx focus-tracker data | `service/fx.ts` |
| `bar.shell` | Bar window & item order | `widget/bar/Bar.tsx` |
| `bar.workspaces` | Workspace pips, scratchpad, urgency | `bar/modules/Workspaces.tsx` |
| `bar.wintitle` | Focused window title | `bar/modules/WindowTitle.tsx` |
| `bar.datemenu` | Clock + bell, notification center, calendar | `bar/modules/DateMenu.tsx` |
| `bar.media` | Media pill + player popover | `widget/media/Media.tsx` |
| `bar.recording` | Recording indicator | `bar/modules/Recording.tsx` |
| `bar.sysmini` | CPU/RAM readout + System popover | `bar/modules/SysMini.tsx`, `SysPanel.tsx` |
| `bar.screenshot` | Screenshot button + capture toolbar | `bar/modules/ScreenshotBtn.tsx`, `screenshot/Toolbar.tsx` |
| `bar.battery` | Battery item + battery popover | `bar/modules/Battery.tsx`, `BatteryPanel.tsx` |
| `bar.pomodoro` | Pomodoro pill + popover + heatmap | `widget/pomodoropill/*` |
| `bar.tray` | System tray | `bar/modules/Tray.tsx` |
| `bar.caffeine` | Keep-awake (hypridle) toggle | `bar/modules/Caffeine.tsx` |
| `bar.power` | Power menu | `bar/modules/Power.tsx` |
| `cc.*` | Control Center (quick settings) | `widget/bar/quicksettings/*` |
| `notif.row` | One notification row (shared) | `widget/notifications/NotifRow.tsx` |
| `toasts` | Notification popups | `widget/toasts/Toasts.tsx` |
| `osd` | Volume/brightness/mic/caps/kbd OSD | `widget/osd/Osd.tsx` |
| `launcher` | App launcher | `widget/launcher/Launcher.tsx` |
| `files` | Fuzzy file search | `widget/files/Files.tsx` |
| `clipboard` | Clipboard history | `widget/clipboard/Clipboard.tsx` |
| `wallpapers` | Wallpaper picker | `widget/wallpapers/Wallpapers.tsx` |
| `shot.*` | Region selector, capture, preview toast | `widget/screenshot/Screenshot.tsx` |
| `overview.*` | Workspace overview with window previews | `widget/overview/Overview.tsx` |
| `desktop.*` | Desktop widgets, grid, edit mode, gallery | `widget/desktop/*` |
| `ext.hypr` | Hyprland keybinds, layer rules, scripts | `~/.config/hypr/*` |

---

## 1. Core

### `core.app` — startup & IPC
- **Code:** `app.ts` (57 lines). `requestHandler` maps `ags request <cmd>` → toggle functions; `main()` creates every window once (Desktop, one Bar per monitor, Toasts, Launcher, OSD, Wallpapers, Files, Screenshot, ShotPreview, Clipboard, Overview).
- **IPC commands:** `toggle-launcher`, `osd-brightness`, `toggle-wallpapers`, `toggle-files`, `screenshot`, `screenshot-full`, `toggle-clipboard`, `toggle-overview`, `toggle-datemenu`, `toggle-cc`, `toggle-widgets`.
- **Pattern for a new IPC command:** export `toggleX` from the widget (module-level `let toggleFn`), add one `if` in `app.ts`, bind it in `ext.hypr`.
- **Also:** `style.scss` (only `@use` lines — add new partials here), `env.d.ts` (module typings), `tsconfig.json`, `package.json` (`npm test`).

### `core.motion` — animation system
- **Code:** `widget/common/motion.ts`
  - `MOTION` durations L14 · `bezier`/`EASE` L18–52 · `Pose`/`Anim` types L54–66
  - `Motion` GObject class (paint-time transform) L83–175
  - `ENTER` presets L177–195 · `settle`/`LIFT` L197–200 · `LEAVE` L202–207 · `onShow()` L209–214
- **Mirror:** SCSS `$dur*`/`$ease*` in `styles/_tokens.scss`. Rules: `DESIGN.md › Motion`.
- **Touches:** every popover and layer window.

### `core.icons`
- **Code:** `widget/common/Icon.tsx` (ligature label, `fill` variant) · `widget/common/icons.ts` (`wifiIcon`, `btIcon`, `volumeIcon`, `batteryIcon`).
- **Used by:** bar pill (`cc.pill`), battery, OSD, CC panels.

### `core.surface`
- **Code:** `widget/common/surface.ts` — `surfaceTop()`: top margin (16% of monitor height) for launcher, files, clipboard.

### `core.styles`
- `colors.scss` — **generated by matugen**; edit `~/.config/matugen/templates/ags-colors.scss` instead.
- `styles/_tokens.scss` — spacing, radii, type, motion, state layers, semantic colors (`$panel-bg`, `$card-bg`, `$edit-scrim`…).
- `styles/_mixins.scss` — `flat-button`, `interactive`, `tile`, `on-state`, `panel`, `field`, `track`, `glass-*`, `notif-text`.
- `styles/_base.scss` — globals: `.icon`, `.glyph`, `.sep`, `.pulse`.

---

## 2. Services (`service/`)

### `svc.system` — system readings
- **Code:** `service/system.ts` — `read()` helper, `cpu` (1s), `ram`/`ramGb` (2s), `disk` (30s), `temp` (3s) polls; `zones` = thermal zone paths. Polls only run while subscribed.
- **Model:** `service/systemModel.ts` — `cpuSample`, `cpuUsage`, `memUsage`, `memUsedGb`, `tempFraction`, `procStat`, `topProcs`, `fmtBytes`, `cpuName`, `sparkHeights`. **Test:** `systemModel.test.ts`.
- **Used by:** `bar.sysmini`, `cc.stats`, `desktop.w.system`.

### `svc.recorder` — screen recording
- **Code:** `service/recorder.ts` — `recording`/`elapsed` state, `startRecording({geometry, audio})`, `stopRecording` (SIGINT), `toggleRecording`, `fmtElapsed`. Output: `~/Videos/Recordings/rec_<stamp>.mp4`.
- **Used by:** `bar.recording`, `cc.tiles` (Record), `bar.screenshot` toolbar (video mode).

### `svc.pomodoro` — timer engine
- **Code:** `service/pomodoro.ts` — singleton `pomodoro`.
  - Types L3–41 · persistence `load`/`save` L52–76 (`~/.local/share/pomodoro/data.json`)
  - getters `settings`/`days`/`today`/`streak`/`fraction` L116–145
  - controls `toggle`/`start`/`pause`/`reset`/`skip`/`setTask`/`setSettings` L148–195
  - `persist`/`restore` (survives restarts via wall-clock end) L197–234
  - `tick` L251–265 · `advance` (phase change, day stats, notify-send + paplay) L267–298
- **Used by:** `bar.pomodoro`.

### `svc.fx` — fx focus tracker (read-only)
- **Code:** `service/fx.ts` — `fxStatus`, `fxProblem` state; `useFx()` starts a 60s refresh + `Gio.FileMonitor` on `~/.local/share/fx/fx.db*`. Runs `~/.local/bin/fx status --json` (or `fx` on PATH).
- **Model:** `service/fxModel.ts` — `parseStatus`, `hm`, `padTimes`, `sinceMinutes`. **Test:** `fxModel.test.ts`.
- **Used by:** `desktop.w.fxtoday`, `desktop.w.fxtasks`.

---

## 3. Bar (`widget/bar/`)

### `bar.shell` — bar window & layout
- **Code:** `widget/bar/Bar.tsx` — layer window (`namespace="bar"`, exclusive, top). Start: launcher button, Sep, Workspaces, WindowTitle. Center: DateMenu, Media. End: Recording, SysMini, ScreenshotBtn, Battery, Sep, PomodoroPill, QuickSettings, Sep, Tray, Caffeine, Power. Takes `.editing` class from `desktop.state`.
- `widget/bar/common/Sep.tsx` — bar separator.
- **Style:** `styles/_bar.scss` — window/edit scrim L1–37, shared item shape & state L38–96, wintitle L97–112, workspaces L113–155, clock L156–162, battery L163–167, sysmini L168–174, recording L175–197, separators L198–219, QS pill L220–221, caffeine L222–226, pomodoro pill L227–end.

### `bar.workspaces`
- **Code:** `bar/modules/Workspaces.tsx` — refresh on Hyprland signals L16–35, urgency tracking L29–34, scroll-to-switch L51–59, pips L60–66, scratchpad (`special:magic`) button L67–74. Dispatches Lua `hl.dsp.*` via `hyprctl dispatch`.
- **Model:** `bar/modules/wsSlots.ts` (`slots`, `pruneUrgent`). **Test:** `wsSlots.test.ts`.
- **Style:** `_bar.scss` L113–155.

### `bar.wintitle`
- **Code:** `bar/modules/WindowTitle.tsx` — "class — title", 48 chars max. **Style:** `_bar.scss` L97–112.

### `bar.datemenu` — clock, bell, notification center, calendar
- **Code:**
  - `bar/modules/DateMenu.tsx` — bar item (Clock · Sep · bell + count) L47–59; popover: header with DND + Clear L64–80, empty state, grouped list via `<For>` L87–120, calendar L123. `toggleDateMenu` export L13–14. Relative times tick only while open L29–37.
  - `bar/modules/Clock.tsx` — `date +%H:%M` / `'%a %-d %b'` polls.
  - `bar/modules/DateCalendar.tsx` — month grid, chevrons, scroll to flip months, `reset()` on open.
- **Model:** `widget/notifications/model.ts` (`groupByApp`, `relTime`); `widget/desktop/dates.ts` (`monthGrid`, `isoDay`).
- **Uses:** `notif.row`.
- **Style:** `styles/_notifications.scss` — date menu panel L65–180, calendar L181–end; clock in `_bar.scss` L156–162.

### `bar.media` — media pill & popover
- **Code:** `widget/media/Media.tsx` — `Card` (cover, title/artist, seek slider, shuffle/prev/play/next/repeat) L12–136; bar pill + persistent popover, re-picks player on status change L137–234.
- **Model:** `widget/media/model.ts` (`fmtTime`, `pickPlayer`). **Test:** `model.test.ts`.
- **Style:** `styles/_media.scss` — pill L5–24, card L25–71, seek L72–108, controls L109–end.
- **Related:** CC mini player is separate → `cc.media`.

### `bar.recording`
- **Code:** `bar/modules/Recording.tsx` — visible only while `svc.recorder` records; click stops. **Style:** `_bar.scss` L175–197.

### `bar.sysmini` — CPU/RAM readout + System popover
- **Code:**
  - `bar/modules/SysMini.tsx` — readout (`cpu`, `ramGb`), popover starts/stops sampling on show/hide.
  - `bar/modules/SysPanel.tsx` — own sampler (`start`/`stop`/`step`) L79–118: CPU history sparkline (32 bars), memory, temperature, disk meters, top 3 processes.
- **Model:** `service/systemModel.ts`.
- **Style:** `_popovers.scss` L330–end (`.sys*`); readout `_bar.scss` L168–174.

### `bar.screenshot` — screenshot / record toolbar
- **Code:** `bar/modules/ScreenshotBtn.tsx` (menubutton + popover) → `widget/screenshot/Toolbar.tsx`: mode (region/window/screen), photo/video, mic, timer, Capture. `target()` L26–46 resolves geometry (region via `pickRegion`, window via `hyprctl activewindow -j`).
- **Model:** `widget/screenshot/model.ts` (`TIMERS`, `nextTimer`, `timerLabel`, `windowGeometry`). **Test:** `model.test.ts`.
- **Calls into:** `shot.capture` (photo), `svc.recorder` (video).
- **Style:** `styles/_screenshot.scss` (`.tb*`, `.mode`, `.kind`).

### `bar.battery` — battery item & popover
- **Code:**
  - `bar/modules/Battery.tsx` — icon + %, low = pulse; popover refreshes profile on show.
  - `bar/modules/BatteryPanel.tsx` — power profiles via `powerprofilesctl` L11–24, L77–96; UPower D-Bus battery device (health, cycles, charge-limit toggle, watts) L26–75; layout L98–142.
- **Model:** `bar/modules/batteryModel.ts` (`dur`, `batteryStatus`, `health`, `watts`). **Test:** `batteryModel.test.ts`.
- **Style:** `_popovers.scss` L267–329 (`.batt*`); bar item `_bar.scss` L163–167.
- **Related:** CC footer also shows battery → `cc.footer`.

### `bar.pomodoro` — pomodoro pill & popover
- **Code:**
  - `widget/pomodoropill/PomodoroPill.tsx` — state bridge from `svc.pomodoro` L11; `Ring` drawing L22–66; `Stepper` (settings ±) L67–96; pill + popover (big ring, phase, task entry, reset/play/skip, steppers, stats) L97–222.
  - `widget/pomodoropill/PomodoroStats.tsx` — `Streak` L13–26, `Heatmap` (18×7 weeks, animated) L45–131.
- **Model:** `widget/pomodoropill/model.ts` (`sessionOf`, `HEAT_*`, `heatCell`, `heatAlpha`). **Test:** `model.test.ts`.
- **Style:** `styles/_pomodoro.scss` (popover); pill colors `_bar.scss` L227–end.

### `bar.tray`
- **Code:** `bar/modules/Tray.tsx` — AstalTray items, hides nm-applet/network/blueman (`HIDDEN` L6), left-click activate, right-click menu. **Style:** `_bar.scss` (`.tray`), menus `_popovers.scss` L26–36.

### `bar.caffeine`
- **Code:** `bar/modules/Caffeine.tsx` — polls `pgrep hypridle`; click kills/starts hypridle. **Style:** `_bar.scss` L222–226.

### `bar.power` — power menu
- **Code:** `bar/modules/Power.tsx` — items Lock/Suspend/Log out/Restart/Shut down L15–21, live key shortcuts L53–61, `openPowerMenu` export (used by CC header). **Style:** `_popovers.scss` L37–75.

---

## 4. Control Center (`widget/bar/quicksettings/`)

### `cc.shell` — pill, popover, page stack
- **Code:** `QuickSettings.tsx` — bar pill (night-light, wifi, bt, volume icons; scroll = volume, middle-click = mute) L31–46; popover with `Gtk.Stack` pages `cc` / `wifi` / `bt` / `audio` L47–89; CC section order L68–77.
- **Shared state:** `cc.ts` — `open`, popover handle, `closeCC`, `toggleCC`, `page`/`setPage`, `run()` (safe shell), night light (`hyprsunset`, `NIGHT_K`=4000) L31–46.
- **Style:** `styles/_quicksettings.scss` L1–44 (panel + cards); pill `_bar.scss` L220–221 & L76–80.

### `cc.header`
- **Code:** `Header.tsx` — avatar, name, uptime (refreshed while open), buttons: Settings (`nwg-look`), Lock, Power (→ `bar.power`). **Style:** `_quicksettings.scss` L45–65.

### `cc.pair` — Wi-Fi / Bluetooth split buttons
- **Code:** `Pair.tsx` — `Half` (toggle + chevron → panel) L10–41, `Wifi` L43–67, `Bluetooth` L68–91. **Style:** `_quicksettings.scss` L66–118.

### `cc.tiles` — 3×2 toggle tiles
- **Code:** `Tiles.tsx` — Night Light, Do Not Disturb, Airplane (`rfkill`), Mic Mute, Screenshot, Record. `afterClose()` L34–38 hides the CC before capturing. **Style:** `_quicksettings.scss` L119–138.

### `cc.sliders` — volume / brightness
- **Code:** `Sliders.tsx` — `SliderRow` L8–46, `Volume` (+ chevron → audio panel) L48–62, `Brightness` (`brightnessctl`, hidden without backlight) L63–89. **Style:** `_quicksettings.scss` L139–195.

### `cc.media` — mini player
- **Code:** `MediaMini.tsx` — playing player (else first), prev/play/next. **Style:** `_quicksettings.scss` L196–241.

### `cc.stats` — CPU/RAM/Temp sparklines
- **Code:** `Stats.tsx` — 12-bar history per reading, follows polls only while CC is open. **Style:** `_quicksettings.scss` L242–263.
- **Note:** `quicksettings/Stat.tsx` + `styles/_stat.scss` is a *different* component, used only by `desktop.w.system`.

### `cc.theme` — Dark / Light segment
- **Code:** `ThemeMode.tsx` — writes `~/.cache/theme_mode`, runs `~/.config/hypr/scripts/theme-apply.sh`. State/paths in `theme.ts` (`MODE_FILE`, `IDX_FILE`, `WALL_FILE`, `readFileOr`). **Style:** `_quicksettings.scss` L264–279.

### `cc.footer`
- **Code:** `Footer.tsx` — battery % · time left · current power profile. **Style:** `_quicksettings.scss` L280–end.

### `cc.wifi` — Wi-Fi panel
- **Code:** `WifiPanel.tsx` — signal/security helpers L8–24, one row per SSID `networks()` L25–38, `Network` row with inline password prompt + connect L39–93, panel with rescan on show L94–142.
- **Building blocks:** `Panel.tsx` (`Panel`, `Row`, `Section`, `Sep`, `List`), `Switch.tsx`.
- **Style:** `_popovers.scss` L108–220 (`.pnl*`), switch L81–107.

### `cc.bt` — Bluetooth panel
- **Code:** `BluetoothPanel.tsx` — `deviceIcon` L9–20, `DeviceRow` (connect/battery) L30–63, panel, sort, discovery only while visible L64–118. **Style:** same as `cc.wifi`.

### `cc.audio` — audio panel
- **Code:** `AudioPanel.tsx` — `shortNames` L13–24, `outputIcon` L25–32, `DeviceRow` L33–49, per-app `AppRow` mixer L50–81, panel (outputs, inputs, apps) L82–112. **Style:** `_popovers.scss` L108–266 (mixer L221–266).

---

## 5. Notifications

### `notif.row` — one notification (shared)
- **Code:** `widget/notifications/NotifRow.tsx` — `safeMarkup` L12–21, icon `Tile` L22–38, row (app, summary, body, actions, dismiss / toast variant) L39–109.
- **Model:** `widget/notifications/model.ts` (`toastTimeout`, `relTime`, `groupByApp`). **Test:** `model.test.ts`.
- **Style:** `styles/_notifications.scss` L1–64; `_mixins.scss` `notif-text`.
- **Used by:** `bar.datemenu`, `toasts`.

### `toasts` — notification popups
- **Code:** `widget/toasts/Toasts.tsx` — `show()` builds a toast in its own root, timeout, slide-in/out & slot collapse L16–86; DND filter (critical still shows) L87–95; window (`namespace="toasts"`, top-right) L96–106.
- **Style:** `styles/_toasts.scss`.

---

## 6. OSD

### `osd`
- **Code:** `widget/osd/Osd.tsx` — glyphs L11–16, LED discovery L17–31, bar tween L47–63, `show`/`showText`/`present` L64–106, **volume** L107–125, **mic mute** L126–131, **caps lock / kbd backlight** (sysfs poll) L132–154, **brightness** (`showBrightness`, via `ags request osd-brightness`) L155–163, window (bottom) L164–182.
- **Model:** `widget/osd/model.ts` (`ledEvents`). **Test:** `model.test.ts`.
- **Style:** `styles/_osd.scss`.

---

## 7. Search-style cards (launcher family)

All three share the card/field/row look in `styles/_launcher.scss` and use `surfaceTop()`.

### `launcher`
- **Code:** `widget/launcher/Launcher.tsx` — `Item` type & extra entries (Wallpapers, Search Files) L10–30; selection/scroll `setSel` L52–62; row rendering L69–110; query (`apps.fuzzy_query`, extras) L112–125; keys & window (`namespace="launcher"`) L126–192.
- **Style:** `_launcher.scss` L73–end.

### `files` — fuzzy file search
- **Code:** `widget/files/Files.tsx` — open (`nautilus` for dirs, `xdg-open` for files) L40–46; search (`fzf --filter` over the index, top 8) L105–122; `reindex()` (`fd` over `$HOME` → `~/.cache/ags-files.txt`) L124–140; window L170–200.
- **Style:** `_launcher.scss` L9–72 (`window.Files`, `.ffsearch*`), `_files.scss`.

### `clipboard` — clipboard history
- **Code:** `widget/clipboard/Clipboard.tsx` — `parse()` cliphist list L18–28; copy (`cliphist decode | wl-copy`) L48–52; image thumbnails cached in `~/.cache/ags-clip` L70–80; list load L128–135; window L150–184.
- **Style:** `_launcher.scss` L9–72 (`window.Clip`), `_clipboard.scss`.

### `wallpapers` — wallpaper picker
- **Code:** `widget/wallpapers/Wallpapers.tsx` — source `~/Pictures/Wallpapers`, thumbs cached in `~/.cache/ags-wp` (240×135) L10–17; `listImages`/`texture` L30–64; grid `render()` + idle thumbnail fill L65–112; open/close L113–121; `apply()` → `~/.config/hypr/scripts/wallpaper-set.sh` L122–126; window L150–183.
- **Style:** `styles/_wallpapers.scss`.

---

## 8. Screenshot (`widget/screenshot/`)

### `shot.capture` — region selector & capture
- **Code:** `Screenshot.tsx` `Screenshot()` L137–299 — region picker overlay (`namespace="shot"`, no anim, no blur), `pickRegion()` hand-back mode L145–160, capture with `grim` → `~/Pictures/Screenshots`, copy with `wl-copy`, then preview L160–190; window L250–299.
- **Exports:** `screenshotRegion`, `screenshotFull`, `screenshotGeometry`, `pickRegion` L19–28.
- **Style:** `styles/_screenshot.scss` (`window.Shot`).

### `shot.preview` — post-capture toast
- **Code:** `Screenshot.tsx` `ShotPreview()` L30–136 — thumbnail, Copy / Edit (`satty` if installed) / Open actions, slides in from the edge (`namespace="shotpreview"`).
- **Style:** `_screenshot.scss` (`.shot-toast`, `.shot-thumb`).

### `shot.toolbar` → see `bar.screenshot`.

### `shot.menu` — centered toolbar window (Print key)
- **Code:** `widget/screenshot/ShotMenu.tsx` — `<Toolbar>` in an unanchored (centered) overlay layer, `namespace="shotmenu"`, Escape closes; `toggleShotMenu` ← IPC `toggle-shotmenu` in `app.ts`.
- **Style:** `_screenshot.scss` (`window.ShotMenu`).

---

## 9. Overview (`widget/overview/`)

### `overview.config`
- `Overview.tsx` L16–30 — `WORKSPACES` list (edit to taste), preview max size, `/tmp/ags-overview`, capture delay.

### `overview.hypr` — dispatch helpers
- `Overview.tsx` L32–62 — Lua-first `hyprctl dispatch` with legacy fallback; `focusWorkspace`, `focusWindow`, `closeWindow`.

### `overview.capture` — window screenshot cache
- `Overview.tsx` L83–87 (state), L126–171 (`captureWorkspace`, queue, `switchGen`), L319–330 (`scheduleCapture` after workspace switches), L331–340 (cache reset on startup).
- **Model:** `widget/overview/shots.ts` (`addr`, `parseClients`, `captureTargets`, `mergeShots`, `captureStillValid`). **Test:** `shots.test.ts`.

### `overview.nav` — keyboard & hover selection
- `Overview.tsx` L172–225 (pointer arming, `NAV_KEYS`, `onKey`).
- **Model:** `widget/overview/nav.ts` (`initialSel`, `step`, `reconcile`, `hoverSel`, `pointerMoved`). **Test:** `nav.test.ts`.

### `overview.ui`
- `Overview.tsx` — `toggleOverview` (captures before mapping) L88–109, `iconFor`/`fit` L110–125, `WorkspaceCard` L228–254, `WindowCard` L255–318, window (`namespace="overview"`, full screen) L331–398.
- **Style:** `styles/_overview.scss`.

---

## 10. Desktop widgets (`widget/desktop/`)

Architecture & rules: `DESIGN.md › Desktop widgets`. Style: `styles/_desktop.scss` (section anchors below).

### `desktop.state` — edit mode & visibility
- **Code:** `state.ts` — `editing`/`setEditing`, `uncovered` (no tiled/fullscreen window), `live` = edit mode or uncovered.
- **Touches:** `bar.shell` (`.editing` scrim), every ticking widget.

### `desktop.layout` — grid model (pure)
- **Code:** `layout.ts` — constants `CELL`/`GAP`/`MARGIN`/`SPANS` L20–33; `gridFor`/`NOMINAL` L35–46; px↔cell L48–62; `fits`, `nearestFree`, `firstFree` L63–96; `nearestSize` L97–111; `reflow` L112–130; `makeId`, `serialize`, `parseLayout` L131–161.
- **Test:** `layout.test.ts`.

### `desktop.catalog` — widget kinds (pure)
- **Code:** `catalog.ts` — `CATEGORIES` L21–28; `CATALOG` (fx-today, fx-tasks, clock, calendar, system, note, goal, countdown: name, category, sizes, default) L29–104; `entry`/`sizesOf`/`search` L105–114; `SIZE_NAMES`; `DEFAULT_LAYOUT` L117–124.
- **Test:** `catalog.test.ts`.
- **Adding a widget kind:** entry in `catalog.ts` + render (and optional editor) in `registry.ts` + file in `widgets/` + styles in `_desktop.scss`.

### `desktop.registry`
- **Code:** `registry.ts` — `RENDER` (kind → component), `EDIT` (goal, countdown), fallback label.

### `desktop.store` — persistence
- **Code:** `store.ts` — `~/.local/state/ags/desktop.json`; `load` (corrupt → `.bak` + default) L27–46; `grid` L48–51; `items`, debounced atomic `save` L53–70; API `setGrid`, `slotFor`, `add`, `move`, `resize`, `remove`, `setConfig` L79–127.

### `desktop.window` — the desktop layer
- **Code:** `Desktop.tsx` — `toggleEditWidgets` L20; `DesktopFixed` (measures surface → `setGrid`) L22–43; ghost slot L45–86; right-click desktop menu L87–116; frame sync with store L117–156; click on empty desktop L157–177; gallery drag-out proxy & drop L178–258; window (BOTTOM ↔ TOP in edit mode, keymode switch) L259–295.
- **Style:** `_desktop.scss` L1–18 (window/scrim), ghost L86–103, menus L104–123, proxy L587–end.

### `desktop.frame` — one widget card
- **Code:** `Frame.tsx` — types/`BLEED`/`THRESHOLD` L17–31; `blocksDrag` L33–46; content build per size L76–103; `place` L104–108
  - `desktop.frame.drag` — drag to move L109–155
  - `desktop.frame.resize` — corner handle L156–183
  - `desktop.frame.remove` — edit-mode badge L184–211
  - `desktop.frame.menu` — right-click menu (sizes, edit, remove) L212–277
  - `desktop.frame.lifecycle` — resize morph, reflow glide, dispose L278–336
  - `previewCard` (gallery miniature) L338–351
- **Style:** `_desktop.scss` card L19–34, affordances/handle/badge L35–85.

### `desktop.gallery` — widget gallery sheet
- **Code:** `Gallery.tsx` — `Scaled` miniature L20–58; `sampleConfig` L59–65; tiles per kind with size picker, click-to-add & drag L83–192; `refresh` (filter) L193–217; sidebar search + categories L218–291; fade while dragging L292–297.
- **Style:** `_desktop.scss` L503–586.

### Widgets (`widget/desktop/widgets/`)
Shared: `types.ts` (`WidgetProps`, `Config`), `common.ts` (`label`, `box`, `Ring`, `Meter`, `Bars`, `EmptyState`, `SeverityDot`, `onNewDay`), `draw.ts` (cairo `roundRect`/`ring`/`bars`, `canvas`, `tickWhile`, `tween`), `editor.ts` (`editorPopover`, `field`). Shared styles `_desktop.scss` L124–137, L163–237.

| ID | File | What | Style (`_desktop.scss`) |
|---|---|---|---|
| `desktop.w.clock` | `Clock.tsx` | S analog (sweeping second hand, `tickWhile`), M digital | L138–162 |
| `desktop.w.calendar` | `Calendar.tsx` | S date tile, L month grid (uses `dates.ts`) | L302–348 |
| `desktop.w.system` | `System.tsx` (+ `bar/quicksettings/Stat.tsx`, `_stat.scss`) | S four rings, M sparklines; polls only while `live` | L349–378 |
| `desktop.w.note` | `Note.tsx` | Sticky note, debounced save into config | L379–403 |
| `desktop.w.goal` | `Goal.tsx` | Vision image + title/caption; async cover decode; editor with file chooser | L404–466 |
| `desktop.w.countdown` | `Countdown.tsx` | Days until a date, ring; editor | L404–466 |
| `desktop.w.fxtoday` | `FxToday.tsx` | fx score ring, focus vs target, streak, hourly, up next; `openFx` (kitty) | L238–301 |
| `desktop.w.fxtasks` | `FxTasks.tsx` | fx task list by severity | L238–301 |
| `desktop.editor` | `editor.ts` | "Edit Widget…" popover | L467–502 |

- **Dates model:** `widget/desktop/dates.ts` (`isoDay`, `daysUntil`, `countdownLabel`, `progressBetween`, `monthGrid`). **Test:** `dates.test.ts`. Also used by `bar.datemenu`.

---

## 11. External integration (`ext.hypr`, outside this repo folder)

- `~/.config/hypr/hyprland.lua`
  - L50 `ags run` at startup (the `~/.local/bin/ags` wrapper sets `GDK_WAYLAND_DISABLE` for blur).
  - Keybinds → IPC, L269–345: Super+Space launcher · Super+Shift+F files · Super+Shift+V clipboard · Super+W wallpapers · Super+G widgets · Super+Shift+R restart AGS · Super+Tab overview · brightness keys → `osd-brightness` · Print → `toggle-shotmenu` (centered toolbar) / Shift+Print full screenshot.
  - Layer rules L388–405: `shot` no-anim; blur for `bar|desktop|launcher|files|clipboard|wallpapers|overview|toasts|osd|shotpreview|shotmenu`; `blur_popups` for `bar|desktop`. **A new layer window needs its namespace added here.**
- `~/.config/hypr/scripts/theme-apply.sh` — called by `cc.theme`.
- `~/.config/hypr/scripts/wallpaper-set.sh` — called by `wallpapers`.
- `~/.config/matugen/templates/ags-colors.scss` → generates `colors.scss`.

## 12. State & cache files written by the shell

| Path | Owner |
|---|---|
| `~/.local/state/ags/desktop.json` (+ `.bak`) | `desktop.store` |
| `~/.local/share/pomodoro/data.json` | `svc.pomodoro` |
| `~/.cache/theme_mode`, `theme_idx`, `last_wall` | `cc.theme` (read by `desktop.gallery` for the Goal sample) |
| `~/.cache/ags-files.txt` | `files` |
| `~/.cache/ags-clip/` | `clipboard` |
| `~/.cache/ags-wp/` | `wallpapers` |
| `/tmp/ags-overview/` | `overview.capture` |
| `~/Pictures/Screenshots/`, `~/Videos/Recordings/` | `shot.capture`, `svc.recorder` |

## 13. Reference docs (not code)

- `DESIGN.md` — design system & rules.
- `docs/design_handoff_frosted_shell/` — frosted-glass design handoff (HTML mock + README).
- `docs/design/*.png` — reference screenshots.
- `docs/superpowers/plans/`, `docs/superpowers/specs/` — past implementation plans (overview previews, shell gaps, desktop widgets).
