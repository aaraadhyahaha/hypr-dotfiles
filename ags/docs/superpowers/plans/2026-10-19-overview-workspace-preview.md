# Overview Workspace Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SUPER+Tab opens the overview with the focused *workspace* selected, and moving between workspaces previews that workspace's windows (live screenshots when cached, app icons otherwise).

**Architecture:** Pull the overview's selection logic and screenshot-cache logic out of `Overview.tsx` into two pure, GTK-free modules (`nav.ts`, `shots.ts`) that `node --test` can test. `Overview.tsx` keeps a single `Sel` state, derives the previewed workspace from it, and lists that workspace's windows. Hyprland doesn't render hidden workspaces and grim only sees the screen, so screenshots are cached per window. The cache is refreshed for whichever workspace you are on, both when the overview opens and ~800 ms after every workspace switch, and the overview shows the last cached shot for other workspaces.

**Tech Stack:** AGS v3 (gnim JSX, GTK4, GJS), AstalHyprland, `hyprctl clients -j`, `grim`, Node 26 `node --test` (native TS type-stripping) for the pure modules.

**Spec (from the user's request):**
> Pressing SUPER+Tab brings up the overview and arrow keys navigate, but it always selects the window present rather than the main workspace, and navigating through the workspaces doesn't preview the windows present on it. Fix that.

## Global Constraints

- **Precondition:** the working tree holds the uncommitted UI-consistency pass (styles/, Bar.tsx, Overview.tsx `overflow`). Commit it on its own (or confirm with the user) before Task 1, so this plan's commits contain only overview work.
- The git repo root is `~/.config`, which has unrelated dirty files (fish, gtk, kitty…). Every commit step `git add`s explicit paths only, never `-A` or `.`.
- Hyprland ≥ 0.55 dispatch syntax: keep using the existing `hyprDispatch(lua, legacy)` helper in `Overview.tsx`. Do not call AstalHyprland's `dispatch()`/`focus()`.
- `nav.ts` and `shots.ts` must not import `gi://*`, `ags*` or `gnim`. Plain TS only, so Node can run their tests.
- Styling uses tokens from `styles/_tokens.scss` (see `DESIGN.md`). No hardcoded colors.
- The workspace list stays the existing `WORKSPACES` constant (ids 1–4).
- Screenshot dir stays `/tmp/ags-overview`.

## Review Focus

1. **Closing the last window on the previewed workspace with ✕ while the window row is selected.** Selection should drop back to the workspace row with no dangling highlight. Pinned by `reconcile` tests in Task 1.
2. **A workspace with a fullscreen window.** Only the fullscreen window should be captured. Others underneath would otherwise be screenshotted showing the fullscreen app's pixels. Pinned by `captureTargets` tests in Task 2.
3. **Tabbed/grouped (hidden) or unmapped windows.** They should not be captured (grim would grab the wrong pixels), so their cards fall back to icons. Pinned in Task 2.
4. **A window on another workspace that was closed since its last capture.** Its card should disappear and its PNG get deleted, not leak. Pinned by `mergeShots` tests in Task 2.
5. **Rapid workspace switching** (holding a workspace key or scrolling): this should produce one capture after things settle, and captures must never interleave or overwrite each other. The debounce and serialized queue in Task 4 handle it, checked manually in Task 4 Step 4.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `widget/overview/nav.ts` (new) | Pure selection model: initial selection, arrow-key stepping, reconciling with a changed window count |
| `widget/overview/nav.test.ts` (new) | `node --test` tests for nav.ts |
| `widget/overview/shots.ts` (new) | Pure capture model: parse `hyprctl clients -j`, choose which windows can be captured, merge new shots into the cache |
| `widget/overview/shots.test.ts` (new) | `node --test` tests for shots.ts |
| `widget/overview/Overview.tsx` (modify) | Wire the models in: one `sel` state, preview follows the selected workspace, hover-to-preview, empty state, persistent cache, background capture |
| `styles/_overview.scss` (modify) | `.win-empty` label style |
| `tsconfig.json` (modify) | Exclude `**/*.test.ts` (they import `node:test`, which has no types here) |
| `package.json` (modify) | `"test"` script |

---

### Task 1: Navigation model

**Files:**
- Create: `widget/overview/nav.ts`
- Create: `widget/overview/nav.test.ts`
- Modify: `tsconfig.json` (add `"exclude": ["node_modules", "**/*.test.ts"]`)
- Modify: `package.json` (add `"scripts": { "test": "node --test widget/**/*.test.ts" }`)

**Interfaces:**
- Produces:
  - `export type Row = "ws" | "win"`
  - `export type NavKey = "left" | "right" | "up" | "down" | "tab"`
  - `export interface Sel { row: Row; ws: number; win: number }`, where `ws` is an index into `WORKSPACES` and `win` an index into the previewed workspace's window list
  - `export function initialSel(focusedId: number | undefined, wsIds: number[]): Sel`
  - `export function step(sel: Sel, key: NavKey, wsCount: number, winCount: number): Sel`
  - `export function reconcile(sel: Sel, winCount: number): Sel`

- [ ] **Step 1: Write the failing tests** in `widget/overview/nav.test.ts`

```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { initialSel, step, reconcile } from "./nav.ts"

const IDS = [1, 2, 3, 4]

test("opens on the focused workspace, workspace row selected", () => {
  assert.deepEqual(initialSel(3, IDS), { row: "ws", ws: 2, win: 0 })
})

test("unknown or missing focused workspace falls back to the first", () => {
  assert.deepEqual(initialSel(9, IDS), { row: "ws", ws: 0, win: 0 })
  assert.deepEqual(initialSel(undefined, IDS), { row: "ws", ws: 0, win: 0 })
})

test("left/right move between workspaces, clamped, and reset the window index", () => {
  assert.deepEqual(step({ row: "ws", ws: 1, win: 2 }, "right", 4, 3), { row: "ws", ws: 2, win: 0 })
  assert.deepEqual(step({ row: "ws", ws: 1, win: 2 }, "left", 4, 3), { row: "ws", ws: 0, win: 0 })
  assert.deepEqual(step({ row: "ws", ws: 0, win: 0 }, "left", 4, 3), { row: "ws", ws: 0, win: 0 })
  assert.deepEqual(step({ row: "ws", ws: 3, win: 0 }, "right", 4, 3), { row: "ws", ws: 3, win: 0 })
})

test("tab behaves like right", () => {
  assert.deepEqual(step({ row: "ws", ws: 0, win: 0 }, "tab", 4, 0), { row: "ws", ws: 1, win: 0 })
  assert.deepEqual(step({ row: "win", ws: 0, win: 0 }, "tab", 4, 2), { row: "win", ws: 0, win: 1 })
})

test("down enters the window row only when the previewed workspace has windows", () => {
  assert.deepEqual(step({ row: "ws", ws: 1, win: 0 }, "down", 4, 2), { row: "win", ws: 1, win: 0 })
  assert.deepEqual(step({ row: "ws", ws: 1, win: 0 }, "down", 4, 0), { row: "ws", ws: 1, win: 0 })
})

test("left/right in the window row move between windows, clamped, workspace unchanged", () => {
  assert.deepEqual(step({ row: "win", ws: 2, win: 0 }, "right", 4, 3), { row: "win", ws: 2, win: 1 })
  assert.deepEqual(step({ row: "win", ws: 2, win: 2 }, "right", 4, 3), { row: "win", ws: 2, win: 2 })
  assert.deepEqual(step({ row: "win", ws: 2, win: 0 }, "left", 4, 3), { row: "win", ws: 2, win: 0 })
})

test("up returns to the workspace row, keeping the workspace", () => {
  assert.deepEqual(step({ row: "win", ws: 2, win: 1 }, "up", 4, 3), { row: "ws", ws: 2, win: 1 })
})

test("reconcile clamps the window index when the list shrinks", () => {
  assert.deepEqual(reconcile({ row: "win", ws: 1, win: 3 }, 2), { row: "win", ws: 1, win: 1 })
  assert.deepEqual(reconcile({ row: "ws", ws: 1, win: 0 }, 5), { row: "ws", ws: 1, win: 0 })
})

test("reconcile drops to the workspace row when the last window closes", () => {
  assert.deepEqual(reconcile({ row: "win", ws: 1, win: 0 }, 0), { row: "ws", ws: 1, win: 0 })
})

test("reconcile returns the same object when nothing changes (avoids state churn)", () => {
  const s = { row: "win" as const, ws: 0, win: 1 }
  assert.equal(reconcile(s, 3), s)
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd ~/.config/ags && node --test widget/overview/nav.test.ts`
Expected: FAIL, `Cannot find module '.../nav.ts'`

- [ ] **Step 3: Implement `initialSel`, `step`, `reconcile` in `widget/overview/nav.ts`**

`step` is a pure reducer: in the `ws` row, left/right/tab change `ws` (clamped to `[0, wsCount-1]`) and set `win: 0` only when `ws` actually changed (otherwise return `sel` unchanged); in the `win` row they change `win` (clamped to `[0, winCount-1]`). `down` → `{...sel, row: "win", win: clamp(sel.win)}` iff `winCount > 0`. `up` → `{...sel, row: "ws"}`. `reconcile` returns the same object if nothing changes.

- [ ] **Step 4: Run tests and typecheck**

Run: `cd ~/.config/ags && npm test && ./node_modules/.bin/tsc --noEmit -p . 2>&1 | grep -c 'overview/nav'`
Expected: all tests PASS; grep count `0` (no tsc errors in nav.ts; pre-existing @girs/Power/Tray errors are expected and unrelated)

- [ ] **Step 5: Commit**

```bash
cd ~/.config && git add ags/widget/overview/nav.ts ags/widget/overview/nav.test.ts ags/tsconfig.json ags/package.json
git commit -m "ags(overview): pure navigation model with tests"
```

---

### Task 2: Screenshot-cache model

**Files:**
- Create: `widget/overview/shots.ts`
- Create: `widget/overview/shots.test.ts`

**Interfaces:**
- Produces:
  - `export const addr = (a: string) => string` (moved verbatim from Overview.tsx: ensures a `0x` prefix)
  - `export interface WinInfo { address: string; ws: number; x: number; y: number; w: number; h: number; fullscreen: number; hidden: boolean; mapped: boolean }`
  - `export function parseClients(json: string): WinInfo[]`: maps hyprctl's `address`, `workspace.id`, `at[0..1]`, `size[0..1]`, `fullscreen`, `hidden`, `mapped`; `address` passed through `addr`; returns `[]` on invalid JSON
  - `export function captureTargets(infos: WinInfo[], wsId: number): WinInfo[]`
  - `export function mergeShots(prev: Record<string, string>, fresh: Record<string, string>, live: Set<string>): { shots: Record<string, string>; stale: string[] }`

- [ ] **Step 1: Write the failing tests** in `widget/overview/shots.test.ts`

```ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { addr, parseClients, captureTargets, mergeShots, type WinInfo } from "./shots.ts"

const win = (o: Partial<WinInfo>): WinInfo => ({
  address: "0x1", ws: 1, x: 0, y: 0, w: 800, h: 600,
  fullscreen: 0, hidden: false, mapped: true, ...o,
})

test("addr adds a missing 0x prefix only", () => {
  assert.equal(addr("abc"), "0xabc")
  assert.equal(addr("0xabc"), "0xabc")
})

test("parseClients maps hyprctl JSON", () => {
  const json = JSON.stringify([{
    address: "abc", at: [10, 20], size: [800, 600],
    workspace: { id: 2, name: "2" }, fullscreen: 0, hidden: false, mapped: true,
  }])
  assert.deepEqual(parseClients(json), [
    { address: "0xabc", ws: 2, x: 10, y: 20, w: 800, h: 600, fullscreen: 0, hidden: false, mapped: true },
  ])
})

test("parseClients returns [] on garbage", () => {
  assert.deepEqual(parseClients("not json"), [])
})

test("captureTargets keeps visible, mapped, sized windows on the workspace", () => {
  const list = [
    win({ address: "0xa" }),
    win({ address: "0xb", ws: 2 }),
    win({ address: "0xc", hidden: true }),
    win({ address: "0xd", mapped: false }),
    win({ address: "0xe", w: 0 }),
  ]
  assert.deepEqual(captureTargets(list, 1).map((i) => i.address), ["0xa"])
})

test("captureTargets captures only the fullscreen window when one exists", () => {
  const list = [win({ address: "0xa" }), win({ address: "0xb", fullscreen: 2 })]
  assert.deepEqual(captureTargets(list, 1).map((i) => i.address), ["0xb"])
})

test("mergeShots overlays fresh shots, keeps other live ones, and reports replaced and dead files", () => {
  const prev = { "0xa": "/s/a-1.png", "0xb": "/s/b-1.png", "0xc": "/s/c-1.png" }
  const fresh = { "0xa": "/s/a-2.png" }
  const { shots, stale } = mergeShots(prev, fresh, new Set(["0xa", "0xb"]))
  assert.deepEqual(shots, { "0xa": "/s/a-2.png", "0xb": "/s/b-1.png" })
  assert.deepEqual([...stale].sort(), ["/s/a-1.png", "/s/c-1.png"])
})

test("mergeShots never reports a path that is still in use", () => {
  const prev = { "0xa": "/s/a-1.png" }
  const { stale } = mergeShots(prev, { "0xa": "/s/a-1.png" }, new Set(["0xa"]))
  assert.deepEqual(stale, [])
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd ~/.config/ags && node --test widget/overview/shots.test.ts`
Expected: FAIL, `Cannot find module '.../shots.ts'`

- [ ] **Step 3: Implement `addr`, `parseClients`, `captureTargets`, `mergeShots` in `widget/overview/shots.ts`**

`captureTargets`: first filter to `ws === wsId && mapped && !hidden && w > 0 && h > 0`; if any of those has `fullscreen > 0`, return only those with `fullscreen > 0`.
`mergeShots`: `shots` = entries of `prev` whose key is in `live`, overwritten by `fresh` (only `fresh` keys in `live`); `stale` = every path in `prev` that is not a value in the resulting `shots`.

- [ ] **Step 4: Run tests and typecheck**

Run: `cd ~/.config/ags && npm test && ./node_modules/.bin/tsc --noEmit -p . 2>&1 | grep -c 'overview/shots'`
Expected: all nav and shots tests PASS; grep count `0`

- [ ] **Step 5: Commit**

```bash
cd ~/.config && git add ags/widget/overview/shots.ts ags/widget/overview/shots.test.ts
git commit -m "ags(overview): pure screenshot-cache model with tests"
```

---

### Task 3: Workspace-first selection and per-workspace preview

**Files:**
- Modify: `widget/overview/Overview.tsx` (selection state, `windows`, `onShow`, `onKey`, `WorkspaceCard`, `WindowCard`, window-row JSX)
- Modify: `styles/_overview.scss` (add `.win-empty` inside `window.Overview`)

**Interfaces:**
- Consumes: `Sel`, `NavKey`, `initialSel`, `step`, `reconcile` from `./nav` (Task 1). Import without the `.ts` extension; esbuild resolves it.
- Produces (used by Task 4): a module-level accessor `previewId: Accessor<number>` (the selected workspace's Hyprland id) and `windows: Accessor<Hyprland.Client[]>` (clients on `previewId`).

- [ ] **Step 1: Replace the three states (`row`, `wsIdx`, `winIdx`) and the local `Row` type with one state**

`const [sel, setSel] = createState<Sel>({ row: "ws", ws: 0, win: 0 })`. Derive `previewId = sel((s) => WORKSPACES[s.ws].id)`. Change `windows` to `createComputed([clients, previewId], (cs, id) => cs.filter((c) => c.workspace?.id === id))`. Subscribe `windows` once at module scope: `windows.subscribe(() => setSel((s) => reconcile(s, windows.get().length)))`.

- [ ] **Step 2: Rewire `onShow` and `onKey`**

`onShow` calls `setSel(initialSel(focused.get()?.id, WORKSPACES.map((w) => w.id)))` instead of selecting the window row. In `onKey`, map `Gdk.KEY_Left/Right/Up/Down/Tab` to the matching `NavKey` and call `setSel(step(sel.get(), key, WORKSPACES.length, windows.get().length))`. Escape and Enter keep their current behavior (Enter on the ws row → `focusWorkspace`; on the win row → `focusWindow(windows.get()[sel.get().win])`; then `close()`). Delete the local `move`/`clamp` helpers.

- [ ] **Step 3: Update the cards**

- `WorkspaceCard`: the `sel` class comes from `sel` (`s.row === "ws" && s.ws === index`) and `active` still from `focused`. Add a `Gtk.EventControllerMotion` with `onEnter={() => sel.get().ws !== index && setSel({ row: "ws", ws: index, win: 0 })}` so hovering previews.
- `WindowCard`: the `sel` class is `s.row === "win" && s.win === ix`.
- In the `win-row` box, after `<For>`, add `<label class="win-empty" label="No windows" visible={windows((l) => l.length === 0)} />`.
- `styles/_overview.scss` inside `window.Overview`: `.win-empty { color: $text-faint; font-size: $font-size-lg; }`

- [ ] **Step 4: Verify in the running shell**

Run: `cd ~/.config/ags && ./node_modules/.bin/tsc --noEmit -p . 2>&1 | grep 'overview/' ; ags quit; setsid ags run >/tmp/ags-run.log 2>&1 & sleep 4; cat /tmp/ags-run.log`
Expected: no new tsc errors in `overview/` (the pre-existing `$=` typing errors elsewhere are unchanged), and an empty log.
Then press SUPER+Tab and check by hand:
- The focused workspace card has the selection ring. No window card is ringed.
- ←/→ moves the ring across workspace cards, and the row below changes to that workspace's windows. Workspaces you haven't visited since AGS started show icon cards (screenshots come in Task 4). An empty workspace shows "No windows".
- ↓ selects the first window card (does nothing on an empty workspace), ↑ goes back.
- Enter on a window from another workspace switches to it and focuses it.
- Closing the only window on the previewed workspace with ✕ while it's selected moves the ring back to the workspace card.

- [ ] **Step 5: Commit**

```bash
cd ~/.config && git add ags/widget/overview/Overview.tsx ags/styles/_overview.scss
git commit -m "ags(overview): select workspace on open and preview its windows while navigating"
```

---

### Task 4: Persistent screenshot cache with background capture

**Files:**
- Modify: `widget/overview/Overview.tsx` (`readGeometry`, `capture`, `onShow`, module init; remove the local `addr` and `Geo`)

**Interfaces:**
- Consumes: `addr`, `WinInfo`, `parseClients`, `captureTargets`, `mergeShots` from `./shots` (Task 2); `previewId`, `windows`, `focused` (Task 3 / existing).
- Produces: `async function captureWorkspace(wsId: number): Promise<void>` (module-private), and `const CAPTURE_DELAY_MS = 800`, which waits out the workspace slide animation (`speed = 6` in `hypr/hyprland.lua`).

- [ ] **Step 1: Swap the data types**

Replace `Geo`/`geos` with `const [infos, setInfos] = createState<Record<string, WinInfo>>({})`. `fit()` now takes `WinInfo | undefined` (it only reads `w`/`h`), and `WindowCard` sizes from `infos((m) => fit(m[a]))`. Import `addr` from `./shots` and delete the local copy.

- [ ] **Step 2: Implement `captureWorkspace(wsId)`, serialized**

1. Read `hyprctl clients -j`, run `parseClients`, and `setInfos` keyed by address.
2. Run `grim -g "x,y wxh" ${SHOT_DIR}/${address}-${Date.now()}.png` for each `captureTargets(list, wsId)`, in parallel, collecting `fresh`.
3. Run `mergeShots(shots.get(), fresh, new Set(list.map((i) => i.address)))`, then `setShots(result.shots)`, then `rm -f ...result.stale` if any are stale.

Chain every call through a module-level `let queue: Promise<void> = Promise.resolve()` (`queue = queue.then(() => run(wsId)).catch(() => {})`) so two captures never merge concurrently. Delete the old `capture(list)` and `readGeometry`.

- [ ] **Step 3: Rewire the triggers**

- At module init: run `rm -rf ${SHOT_DIR} && mkdir -p ${SHOT_DIR}` once, replacing the per-open wipe. The cache must survive between openings.
- `onShow`: keep the `win.opacity = 0` → capture → `win.opacity = 1` pattern, but call `await captureWorkspace(focused.get()?.id)` (skip the capture if the id is undefined).
- Background: `focused.subscribe(...)` cancels any pending timer and starts `timeout(CAPTURE_DELAY_MS, ...)` from `ags/time`. When the timer fires, it captures the then-focused workspace, but only if `app.get_window("overview")?.visible` is false. Schedule the same timer once at startup so the initial workspace gets cached.

- [ ] **Step 4: Verify in the running shell**

Run: `cd ~/.config/ags && ./node_modules/.bin/tsc --noEmit -p . 2>&1 | grep 'overview/' ; npm test; ags quit; setsid ags run >/tmp/ags-run.log 2>&1 & sleep 4; cat /tmp/ags-run.log`
Expected: tests PASS, no new tsc errors in `overview/`, empty log.
Then:
- Visit workspaces 1→4 (wait ~1 s on each), go back to 1, press SUPER+Tab, and arrow through all four. Every visited workspace shows real screenshots: `ls /tmp/ags-overview | wc -l` equals the number of open, non-hidden windows.
- Open a fullscreen app on a workspace, leave, and preview it. Only the fullscreen window has a screenshot, and the windows beneath it show icons.
- Close a window on workspace 2 from workspace 1 (e.g. `hyprctl dispatch` or its own quit). On the next capture its PNG is gone from `/tmp/ags-overview`.
- Hold SUPER+scroll or spam workspace keys for ~2 s. `ls -l --time-style=+%T /tmp/ags-overview` shows one burst of new files after you stop, not one per switch.
- The overview never appears in a screenshot.

- [ ] **Step 5: Commit**

```bash
cd ~/.config && git add ags/widget/overview/Overview.tsx
git commit -m "ags(overview): cache window screenshots per workspace and refresh on workspace switch"
```

---

## Known limitation (accepted)

Screenshots for workspaces other than the current one show those windows as they looked the last time you were on that workspace. Live capture of off-screen windows would need Hyprland's `hyprland-toplevel-export-v1` protocol, which grim and GJS don't expose. That's out of scope here. Windows that were never on screen (opened directly onto another workspace) show their app icon until you visit that workspace.
