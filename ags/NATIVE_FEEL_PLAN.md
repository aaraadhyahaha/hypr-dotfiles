# Make the shell feel native: fix the causes before changing framework

## Context

The shell feels less smooth than macOS: animations are slow or jittery, scroll speed differs by app, and not everything is fast. The question is whether AGS/GTK is the wrong base, and whether a custom Rust framework is needed.

**Recommendation: don't build a Rust framework.** Most of the visible symptoms come from layers a new shell would not replace. Fix those first, measure, and only then test Quickshell if the shell's own animations still drop frames.

## What the system shows

| Symptom | Evidence | Who owns it | Would a Rust shell fix it? |
|---|---|---|---|
| Different scroll speed per app | `scroll_factor` is unset at both levels and no per-app rules exist. Each app runs its own scroll physics; kitty, Zen, GTK and Electron all differ | Compositor and apps | No |
| Slow window and workspace motion | `speed` is in 100ms units, so `workspaces` = 600ms, `windowsMove` = 500ms, `windowsIn` = 400ms (`hypr/conf/animations.lua`) | Hyprland config | No |
| Motion feels inconsistent | About 9 Hyprland curves plus separate SCSS and TS durations. A panel opening runs a 180ms compositor fade alongside a 260ms AGS move, on separate clocks | Config and design | No |
| Possible compositor frame drops (to be measured) | 3-pass blur at size 8, at 1.33× scale, on Iris Xe. `active_opacity 0.9` / `inactive_opacity 0.8` makes every normal window translucent, so blur sits behind them all the time | Hyprland config | No |
| Possible shell jank (to be measured) | Animation and rendering work starts on one GJS thread, so a JS stall or GC pause can drop a frame | AGS/GTK | Partly |
| Text shimmer during scale or move (hypothesis) | `scale 0.96 → 1` redraws text each frame at a fractional scale | GTK and design | Partly |

Hardware limit: the panel is 60Hz with no VRR. It can match a 60Hz MacBook Air, but not ProMotion.

Why macOS feels smooth: one system scroll curve, and animations that run in a separate render server, so a busy app can't stall them. Rust doesn't provide either by itself. **gtk4-rs uses the same GTK renderer**, and the compositor still owns blur, window motion and scroll delivery.

## Framework options

| Option | Smoothness | Customization | Cost | Verdict |
|---|---|---|---|---|
| **AGS, tuned** | Fixes everything in the compositor and config rows | Good once tokens are unified | Days | **Do first** |
| **Quickshell (QML)** | Qt Quick can run animators on a render thread, which directly addresses single-thread stalls (confirm on this machine) | Best fit: declarative, built-in `Behavior` and spring animations, live reload | Rewrite of 129 TS/TSX files and about 3.4k lines of SCSS; pure `*Model.ts` logic ports most easily | **Only if the gate below fails** |
| **Rust toolkit (Slint, iced, libcosmic)** | Removes GJS pauses | Worse: more code and a compile step on each change. `layer-shika` (Slint) was still labelled early-stage in the docs found | Full rewrite | Not recommended |
| **Custom Rust framework** | Depends on years of work | Worst until mature: you'd own text, IME, accessibility, layout and popups | Very large | **No** |

Rust remains useful for small background services if profiling finds a slow one, not as the UI layer. It conflicts with the "few lines to customize" goal.

## Plan

Make small changes and test after each. Commit only on request.

### 0. Baseline (no repo changes)
- Install `sysprof` and `igt-gpu-tools` (`sysprof-cli`, `intel_gpu_top`; both are missing today).
- Capture a repeatable script: open the launcher, open the control center, switch workspaces with the 3-finger gesture, and scroll in Zen.
- Record GTK frame timing and GPU busy %, with blur at the current setting, at reduced passes, and off. Use temporary runtime changes.
- This confirms or rejects the two "possible" rows and shows where frames are lost.

### 1. Motion timing and curves
- Cut slow compositor motion in `hypr/conf/animations.lua`: try about 300ms for workspaces and about 250ms for `windowsMove` and `windowsIn`. Tune by feel.
- Reduce to about 3 shared curves and align panel fade and move timing so they read as one motion.
- Update `DESIGN.md › Motion` if the rules change.

### 2. Scrolling
- Set a global `input:touchpad:scroll_factor` as the baseline.
- Add per-app rules using `scroll_touchpad` and `scroll_mouse` (both exist in the installed Hyprland binary; confirm the Lua rule syntax first) in `hypr/conf/rules.lua`, tuning Zen, VS Code/Electron, GTK apps and kitty to a similar distance per swipe.
- Check that Electron apps run natively, not through XWayland. No flags files exist, and only Zen and kitty were open to check.
- This evens out speed, not physics: momentum curves will still differ by app.

### 3. Compositor load
- Apply only what step 0 justifies. Likely candidates: lower blur passes, or keep blur on shell surfaces and make active windows opaque.
- Translucent windows are a look you chose, so **this needs your sign-off with a before/after comparison**.

### 4. Shell hot paths
- Profile and fix what step 0 finds in `widget/common/motion.ts`, and in launcher and overview opening.
- Check for synchronous work near animations (`readFile` in `Launcher.tsx`, `Wallpapers.tsx`, `Osd.tsx`).
- If shimmer is confirmed, shorten or remove scale on text-heavy panels and keep the `swap` fade pattern.

### 5. One-file customization
- Add one motion token source that generates the SCSS tokens, the `MOTION`/`EASE` values in `widget/common/motion.ts`, and the Lua curves. These are hand-mirrored today.
- Follow the existing generated-`colors.scss` pattern, with `node --test` coverage for the generator.
- Changing the shell's speed or feel then becomes a one-line edit, whichever framework comes next.

### 6. Decision gate
Re-run the step 0 script.
- **Pass:** at least 99% of frames on time at 60Hz (16.7ms) in the launcher and control center. Stay on AGS.
- **Fail, with the cause in GJS/GTK:** build a Quickshell OSD and launcher spike (`quickshell` 0.3.2 is in `extra`; Qt 6.12 is installed), run it on the same script, and compare frame timing, memory (AGS is about 253MB now) and lines of code. Migrate only if it clearly wins. Move one widget at a time, and never run both shells' copies of the same surface at once.

## Baseline results (2026-11-07, on AC, `performance` profile)

Compositor, measured with a repainting probe surface, panels and workspaces 1 and 3, two runs each:

| Phase | Old config | Step 1 config |
|---|---|---|
| Launcher | 99.69%, 100% | 100%, 100% |
| Control center | 100%, 100% | 100%, 100% |
| Workspace switch | 99.08%, 98.77% | 99.69%, 99.38% |

AGS, measured with `sysprof-cli --gtk` over 8 opens of each panel, first 260ms of the animated surface, warm opens:

| Panel | Frames (of about 16) | On time | Missed | `Widget render` p50 / max | Renders over 16.7ms |
|---|---|---|---|---|---|
| Launcher | 17 | 100% | 0 | 8.3ms / 11.5ms | 0 of 119 |
| Control center | 9 | 45.5% | 61 | 22.8ms / 35.8ms | 40 of 63 |

Control center fails the 99% gate and runs at about 33fps. Time is in `Widget render`, not snapshot, layout or JS. The compositor stays on time throughout, so this is a step 4 target. The request handler also blocks for 20–30ms before the first frame.

Not measured: the 3-finger gesture and Zen scrolling, which need a person. `igt-gpu-tools` isn't in the repos, so GPU busy comes from `rc6_residency_ms`.

## Step 4 results (2026-11-07)

Same `sysprof-cli --gtk` capture, control center only, 8 opens per build. A/B bundles isolated two causes:

- **Scale on the popover preset.** `ENTER.popover` animated `scale 0.97 → 1`. Re-rasterizing the CC's icon glyphs and text at a new fractional scale each frame cost 20–55ms per `Widget render`. A build with only the 4px drop rendered at 4.5ms max and hit 100% on warm opens. The scale is removed from the preset, which every bar popover shares (`motion.ts`, `DESIGN.md › Motion`).
- **Process spawns before the first frame.** `setOpen(true)` ran `open` subscribers synchronously for about 19ms, mostly four process spawns at about 3ms each (rfkill, pgrep, brightnessctl, powerprofilesctl). Airplane and brightness now read sysfs. Night light and power profile re-check through `afterOpen()` after `MOTION.enter` (`cc.ts`, `Tiles.tsx`, `Sliders.tsx`, `Footer.tsx`).

| Build (warm opens) | On time | Missed | `Widget render` max | Request → first frame (median) |
|---|---|---|---|---|
| Before | 72.2% | 32 | 56.5ms | 96ms |
| No scale only | 100% | 0 | 4.5ms | 89ms |
| Step 4 (both fixes) | 98.4% | 2 | 1.6ms | 17ms |

The first (cold) open is 94.7% on time, with one 18ms render while glyph caches fill. The close phase's lower figure counts idle gaps of 100ms+ after the popover has gone; closing has no AGS motion. Not changed: `ENTER.card` (launcher was already at 100%), the `readFile` calls in `Launcher.tsx`, `Wallpapers.tsx` and `Osd.tsx` (none showed up in the open path), and the overview (no step 0 data).

## Step 2 results (2026-11-07)

- `input.touchpad.scroll_factor = 1.0` is now set explicitly as the baseline (`hypr/conf/input.lua`).
- Lua syntax confirmed: `scroll_touchpad = <number>` as an effect key in `hl.window_rule`. `hyprctl getprop address:<addr> scroll_touchpad` reads it back.
- Per-app touchpad multipliers (`hypr/conf/rules.lua`), as starting values not yet tuned by feel: Zen 0.75, VS Code and Obsidian 1.25, kitty 0.6. GTK apps stay at 1.0. Mouse wheel is unchanged.
- Electron: VS Code (`com.microsoft.VSCode`) and Obsidian (`md.obsidian.Obsidian`) both run natively on Wayland (`xwayland=false`) with no flags files.
- Still open: the swipe-distance check in each app needs a person.

## Step 3 results (2026-11-07)

Reverted: `decoration.blur.xray = true` was applied, then removed at the user's request (it looked bad). Workspace-switch frame drops are open again.

Same compositor probe as the baseline, workspaces 3 and 1, on AC with the `performance` profile. Each variant was a temporary `hyprctl eval` on top of the current config, undone with `hyprctl reload`. The launcher and control center were 100% on time in every variant. Only the workspace switch differs:

| Variant | Workspace switch on time (runs) | Missed | GPU busy, launcher open | Visual change |
|---|---|---|---|---|
| Current (3 passes, size 8) | 98.16, 98.77, 98.77, 97.23 | 4–9 | 37–40% | — |
| 2 passes | 97.85, 98.77 | 4–7 | 33–34% | Softer blur. Doesn't help |
| Active windows opaque | 97.85 (1 run) | 7 | 38% | Active window solid. Doesn't help |
| `blur:xray = true` | 99.38, 100 | 0–2 | 36–38% | Windows blur only the wallpaper, so a floating window over another window shows blurred wallpaper. Tiled windows look the same |
| Windows `no_blur`, shell keeps blur | 100, 100 | 0 | 34–35% | Translucent windows show a sharp wallpaper behind them |
| Blur off | 100, 99.69 | 0–1 | 16–22% | No glass anywhere, including the shell |

The workspace switch fails the 99% gate with blur on as configured, and the step 1 figures (99.69, 99.38) were a lucky pair. Fewer passes and opaque active windows don't fix it. The cost is re-blurring what's behind every translucent window on each frame of the slide. `xray` is the smallest visual change that passes. It is already used for `bar` and `desktop` in `shell.lua`.

## Step 5 results (2026-11-07)

All motion timing and curves now come from one file: `widget/common/motionTokens.ts` (`DURATIONS`, `COMPOSITOR`, `CURVES`).

- `widget/common/motion.ts` imports it directly. `MOTION` is `DURATIONS` and `EASE.*` is built from `CURVES`.
- `npm run motion` (`scripts/motion.ts`, which renders through the pure `widget/common/motionTokensModel.ts`) writes two generated files, each with a "do not edit" header like `colors.scss`:
  - `styles/_motion.scss`: `$ease*` and `$dur*`, forwarded by `_tokens.scss` so every partial's `@use "tokens"` still sees them.
  - `~/.config/hypr/conf/motion.lua`: `ms` and `curves`. `animations.lua` registers the curves and sets each leaf's `speed = ms / 100`.
- `motionTokensModel.test.ts` (6 tests) covers naming, rendering and non-finite values, and fails if either generated file drifts from the source.
- No values changed. Hyprland reloads without config errors and reports the same curves and speeds (layersIn 2.6, layersOut 1.4, windowsIn 2.5, workspaces 3.0, fade 1.6). `sass` compiles `style.scss`, `npm test` passes 240/240, and AGS starts on the new bundle.
- Changing the shell's speed or feel is now: edit one number in `motionTokens.ts`, run `npm run motion`, then `hyprctl reload` and restart AGS.
- `tsconfig.json` excludes `scripts/` the same way it excludes tests, because it runs under Node and has no GJS types.

## Step 6 results: decision gate (2026-11-07, on AC, `performance` profile)

Same `sysprof-cli --gtk` capture as the baseline: 8 opens of each panel, warm opens, on the current workspace. Each bundle was replayed under sysprof.

| Run | Launcher on time | Launcher `Widget render` max | CC on time | CC `Widget render` max |
|---|---|---|---|---|
| Step 5 bundle, run 1 | 67.2% | 22.3ms | 97.6% | 3.2ms |
| Step 5 bundle, run 2 | 98.5% | 10.8ms | — | — |
| Step 5 bundle, run 3 | 64.1% | 22.6ms | 93.5% | 4.0ms |
| Step 5 bundle, run 4 | 66.9% | 20.6ms | 94.5% | 3.4ms |
| Step 4 bundle (A/B control) | 66.1% | 24.7ms | — | — |

**Gate: not passed.** Neither panel reaches 99% on every run. The step 4 bundle measures the same today, so step 5 is neutral, as expected with unchanged values. Launcher results are bimodal: either about 98–100% at about 140 frames, or about 65% at about 90 frames. In the slow mode it settles near 30fps, with `Widget render` p50 at about 12ms against 8.3ms at baseline. That mode didn't occur in the baseline's runs.

**The cause isn't the GTK/GJS framework, so the Quickshell spike isn't triggered yet.** What the capture points to:
- **The launcher's IPC request blocks the main thread for 25–50ms on every open** (`gdbusconnection call_in_idle_cb`, 8 of 8 opens). That is `toggle-launcher`'s own work before the first frame, the same pattern step 4 fixed for the control center (96ms → 17ms). It's a shell hot path to fix in AGS.
- **Bimodal render cost.** The same bundle, on the same machine, swings between about 8ms and about 12–22ms renders. The Iris Xe GPU starts each open from idle (RC6, 0MHz) and reaches 1200MHz within about 200ms. That's consistent with a power-state effect, but it isn't proven.
- **Control center cold first open** is 77–94% (one 20–35ms render while glyph caches fill). Warm opens miss 3–8 frames.

Next, in order:
1. Step 4b: profile `toggle-launcher` (`app.ts` request handler → `Launcher.tsx` open). Defer whatever runs before the first frame, as `afterOpen()` does in the CC.
2. Re-run the gate with 3 or more runs per bundle, and report the median and the worst run. A single run can't separate a regression from noise here.
3. Consider the Quickshell spike only if both panels are still under 99% after that, with the time in GTK render rather than our JS.

Still open from earlier steps: the workspace switch at 97–99% with blur on (step 3, xray rejected), and the person-only checks (3-finger gesture, Zen scroll distance).

## Step 4b results: launcher open path (2026-11-07)

Timing inside `open()` showed 22–30ms on the main thread before the first frame: `refreshActions()` 9–14ms (two `pgrep` spawns), `apps.reload()` 4–6ms, `setQuery()` 4–7ms (building rows, needed) and mapping the window 3–7ms.

- `refreshActions()` now runs after the open motion (`MOTION.enter`), is cancelled if the launcher closes first, and runs once at startup so the first open has its state.
- `apps.reload()` no longer runs on every open. A `Gio.FileMonitor` on each XDG `applications` dir rescans 500ms after a `.desktop` file changes, and re-renders if the launcher is open. A test entry appeared and disappeared within about a second.
- Request → first frame went from 54–61ms to about 24–30ms (median of warm opens). The 25–50ms `call_in_idle_cb` stall is gone.
- Frame rate is unchanged: `Widget render` stays at about 12ms per frame, and the launcher is 51–66% on time across 3 runs (CC warm 93–94%). The per-frame render cost is what's left.

## Step 6 re-run, partial (stopped by the user)

Step 4b build, 3 runs each planned:

| Renderer | Launcher warm on time | CC warm on time |
|---|---|---|
| default | 50.8%, 66.0%, 64.7% | 94.4%, 93.0%, 92.9% |
| `GSK_RENDERER=ngl` (1 run) | 70.1% (first open 229ms: shader compile) | 93.8% |
| `vulkan` | not run | not run |

Not done yet: the remaining `ngl` and `vulkan` runs, and the GPU clock test (needs root: `echo 1300 | sudo tee /sys/class/drm/card1/gt_min_freq_mhz`, undo with `100`). The gate is still failing, and the launcher's per-frame render cost is the open question.

## Files involved
- `~/.config/hypr/conf/animations.lua`, `look.lua`, `input.lua`, `rules.lua`
- `~/.config/ags/widget/common/motion.ts`, `motionTokens.ts`, `motionTokensModel.ts` (+ test), `scripts/motion.ts`, `styles/_tokens.scss`, generated `styles/_motion.scss` and `hypr/conf/motion.lua`, `DESIGN.md`, `FEATURE_MAP.md`
- `~/.config/ags/widget/launcher/Launcher.tsx`, plus other hot paths step 0 identifies

## Verification
- Same capture script before and after each step, with results kept in a small table.
- `npm test` through the `runner` subagent after any AGS logic change.
- Scroll: one identical swipe in each app should move a similar distance.
- Feel check after each step, including that blur still fades with the panels (`DESIGN.md › Motion`).
- Reload Hyprland after config edits, and confirm only one `ags run` is active.

## Sources
- [GTK 4.24 release notes (Phoronix)](https://www.phoronix.com/news/GTK-4.24-Released)
- [layer-shika (Slint layer shell)](https://docs.rs/crate/layer-shika/latest)
- [libcosmic](https://git.tfcconnection.org/chris/libcosmic/src/commit/6f2c893cf5dfb4554de93715d49bf06d11245fb1)
- [Hyprland high-resolution scroll thread (Level1Techs)](https://forum.level1techs.com/t/scroll-lag-with-logitech-mx-mouse-on-wayland-hyprland/231067)

The Qt render-thread claim comes from my knowledge of Qt, not from these sources, and the spike would need to confirm it on this hardware.
