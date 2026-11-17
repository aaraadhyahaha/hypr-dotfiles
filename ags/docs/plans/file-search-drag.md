# Drag a file search result into any window

## Context
File results can only be opened (↵/click), shown in a folder (⇧↵) or have their path copied (Ctrl+C).
You want to drag a result straight into another app (a browser upload box, a chat, a terminal, Nautilus)
like a normal file drag. Decisions made: it works in **both** file lists (the File Search window
`files` and the launcher's `/` mode `launcher`). The card **gets out of the way as soon as the drag starts**,
**closes when the drop lands**, and **comes back unchanged** (same query and selection) if the drag is cancelled.

"Smooth" comes from this design: the dragged icon is a Wayland drag-icon surface that **Hyprland** moves
with the cursor, so AGS does no work per frame during the drag. Nothing is relaid out and no animation runs on the AGS side.

## Approach

### 1. Shared helper: `widget/common/fileDrag.ts` (new)
`attachFileDrag(row: Gtk.Widget, path: string, h: { begin: () => void; end: (dropped: boolean) => void })`
- `Gtk.DragSource`, `actions = Gdk.DragAction.COPY` (never MOVE: a drop must never move the user's file).
- `prepare` → `Gdk.ContentProvider.new_union([...])` with
  - `new_for_bytes("text/uri-list", uriList([Gio.File.new_for_path(path).get_uri()]))` (GTK apps, Chromium/Electron, Firefox, Nautilus, kitty all take this)
  - `new_for_bytes("text/plain;charset=utf-8", path)` (for terminals and text fields).
- `drag-begin` → `source.set_icon(paintable, size/2, size/2)`. The paintable is the result's themed icon:
  `Gtk.IconTheme.get_for_display(...).lookup_by_gicon(gicon, 48, row.get_scale_factor(), …)`, the same gicon the
  row already uses (`Gio.content_type_get_icon`, as in `Files.tsx` L82–83 and `preview.ts` `fileIcon`).
  It's a static paintable, not a `WidgetPaintable`, so nothing in AGS repaints during the drag. Then call `h.begin()`.
- `drag-cancel` → remember `cancelled = true`, return false. `drag-end` → `h.end(!cancelled)`.
- GTK's built-in drag threshold separates a click from a drag.

### 2. Pure bit: `uriList(uris)` in `widget/launcher/filesModel.ts`
Returns `uris.join("\r\n") + "\r\n"` (RFC 2483 line endings). Add a case to `filesModel.test.ts`.

### 3. Wire up `widget/files/Files.tsx`
- Row click: change `"pressed"` → `"released"` (L109). Opening on press would fire before a drag could start;
  once the DragSource claims the press, the click gesture is reset and `released` never fires.
- `attachFileDrag(row, path, { begin, end })`:
  - `begin`: `dragging = true; win.visible = false`. The window hides and Hyprland fades it, as with every surface
    (DESIGN › Motion: Hyprland owns layer opacity, so no AGS opacity fade that would snap the blur).
    Keyboard focus goes back to the window underneath.
  - `end(true)`: `dragging = false`. The window is already hidden, so this is the same as `close()`.
  - `end(false)`: `dragging = false; motion.animate(ENTER.card); win.visible = true; entry.grab_focus()`.
    This restores the card **without** the reset in `open()`, so the query, results and `sel` are kept.
- Ignore the `enter` hover handler while `dragging`.

### 4. Wire up `widget/launcher/Launcher.tsx`
- Row click (L315): `"pressed"` → `"released"`. This applies to all rows and keeps clicks consistent everywhere.
- In `render`, for items with `a.preview` (file rows from `fileItem` L96): `attachFileDrag(row, a.preview, …)`
  with the same begin/end as above. `begin` also cancels `settle` like `close()` does (L221).
  `end(true)` calls `addRecent(path)` so a dragged file counts as used, just like opening it.
  `end(false)` re-shows with `motion.animate(ENTER.card)` and keeps the query, mode tab and preview.
- Skip `setSel`/`showPreview` from hover while `dragging`.

### 5. Docs
- `FEATURE_MAP.md`: add drag to `files` and `launcher` Files mode (keys line: "drag a row → drop into any window"),
  and a `widget/common/fileDrag.ts` entry under common.

## Risk to probe first (step 0, before wiring both lists)
Hiding the source window mid-drag. gtk4-layer-shell keeps the same `wl_surface` across hide/show
(memory: gtk-layer-input-region), so the drag's origin surface survives. Still, check that GTK doesn't
cancel the `GdkDrag` when the source widget unmaps. Wire `Files.tsx` only, then drag into Nautilus and Firefox.
**Fallback if it cancels:** keep the window mapped during the drag, give it an empty input region
(`surface.set_input_region(new cairo.Region())` + `queue_draw()`, as the memory says) so the drop reaches the
windows below, and move the card off the pointer with a geometry-only `Motion` pose. Hide it on `drag-end`.

## Verification
- `node --test widget/launcher/filesModel.test.ts` (via runner) after step 2; `npm test` at the end.
- Restart AGS (`Super+Shift+R`, never two `ags run`). In both File Search and launcher `/`:
  - Click a row: it still opens. Drag a row: no open, the card fades, the icon follows the cursor smoothly.
  - Drop into Nautilus (copies), a Firefox/Chromium upload box (attaches), kitty (pastes the path),
    a GTK text field. The card stays closed afterwards.
  - Press Esc during the drag or drop on the desktop/bar: the card comes back with the same query and selection.
  - Folders drag too.
- Smoothness check: `sysprof-cli --gtk` during a drag should show no AGS frame work. Don't switch to Claude's
  workspace in any test script (memory: never-open-claude-workspace).
