import app from "ags/gtk4/app"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import { createBinding, createComputed, createState, For, Accessor } from "ags"
import { execAsync } from "ags/process"
import Gio from "gi://Gio"
import Hyprland from "gi://AstalHyprland"
import Pango from "gi://Pango"
import { type NavKey, type Sel, initialSel, reconcile, step } from "./nav"

const hypr = Hyprland.get_default()
const { TOP, BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor

// Edit to taste. Ids must match your Hyprland workspaces.
const WORKSPACES = [
  { id: 1, name: "Code" },
  { id: 2, name: "Web" },
  { id: 3, name: "Music" },
  { id: 4, name: "Files" },
]

// Each window preview is scaled to fit inside this box, keeping the window's own
// aspect ratio, so cards have no empty bars around the screenshot.
const PREVIEW_MAX_W = 460
const PREVIEW_MAX_H = 300
const SHOT_DIR = "/tmp/ags-overview"

// ---------- hyprland helpers ----------

// Hyprland normally gives addresses as "0x...", make sure of it.
const addr = (a: string) => (a.startsWith("0x") ? a : `0x${a}`)

// Hyprland >= 0.55 replaced `hyprctl dispatch workspace 2` with Lua expressions
// (`hl.dsp.focus({ workspace = "2" })`), and AstalHyprland's dispatch()/focus()/kill()
// still use the old syntax, so they silently do nothing. Try the Lua form first and
// fall back to the legacy form for older Hyprland. Success prints "ok".
async function hyprDispatch(lua: string, legacy: string[]) {
  try {
    const out = await execAsync(["hyprctl", "dispatch", lua])
    if (out.trim() === "ok") return
  } catch {}
  try {
    await execAsync(["hyprctl", "dispatch", ...legacy])
  } catch {}
}

const focusWorkspace = (id: number) =>
  hyprDispatch(`hl.dsp.focus({ workspace = "${id}" })`, ["workspace", String(id)])

const focusWindow = (c: Hyprland.Client) =>
  hyprDispatch(`hl.dsp.focus({ window = "address:${addr(c.address)}" })`, [
    "focuswindow",
    `address:${addr(c.address)}`,
  ])

const closeWindow = (c: Hyprland.Client) =>
  hyprDispatch(`hl.dsp.window.close({ window = "address:${addr(c.address)}" })`, [
    "closewindow",
    `address:${addr(c.address)}`,
  ])

// ---------- data ----------

const clients = createBinding(hypr, "clients")
const focused = createBinding(hypr, "focusedWorkspace")

// Keyboard selection: which row is active and which item inside each row (see nav.ts).
const [sel, setSel] = createState<Sel>({ row: "ws", ws: 0, win: 0 })

// The selected workspace is the one being previewed.
const previewId = sel((s) => WORKSPACES[s.ws].id)

// Windows on the previewed workspace, recomputed on any client/selection change.
const windows = createComputed(
  [clients, previewId],
  (cs: Hyprland.Client[], id: number) => cs.filter((c) => c.workspace?.id === id),
)

// A window closing under the selection must not leave it pointing at nothing.
windows.subscribe(() => setSel((s) => reconcile(s, windows.get().length)))

type Geo = { x: number; y: number; w: number; h: number }
// Window geometry (from hyprctl) and screenshots, both keyed by window address.
const [geos, setGeos] = createState<Record<string, Geo>>({})
const [shots, setShots] = createState<Record<string, string>>({})

// ---------- helpers ----------

function close() {
  const win = app.get_window("overview")
  if (win) win.visible = false
}

// Use the window class as icon name only if the theme has it, else a generic icon.
function iconFor(cls: string): string {
  const display = Gdk.Display.get_default()
  const name = cls.toLowerCase()
  if (display && Gtk.IconTheme.get_for_display(display).has_icon(name)) return name
  return "application-x-executable"
}

// Preview size that fits the window's aspect ratio inside the max box.
function fit(g?: Geo): { w: number; h: number } {
  if (!g || g.w <= 0 || g.h <= 0)
    return { w: PREVIEW_MAX_W, h: Math.round((PREVIEW_MAX_W * 10) / 16) }
  const s = Math.min(PREVIEW_MAX_W / g.w, PREVIEW_MAX_H / g.h)
  return { w: Math.max(160, Math.round(g.w * s)), h: Math.max(100, Math.round(g.h * s)) }
}

async function readGeometry(): Promise<Record<string, Geo>> {
  const geo: Record<string, Geo> = {}
  try {
    const out = await execAsync(["hyprctl", "clients", "-j"])
    for (const c of JSON.parse(out)) {
      geo[addr(c.address)] = { x: c.at[0], y: c.at[1], w: c.size[0], h: c.size[1] }
    }
  } catch {}
  return geo
}

// Grab every window on screen with grim. Runs BEFORE the overview becomes visible,
// so the overlay is not in the screenshots. Needs `grim` installed.
async function capture(list: Hyprland.Client[]) {
  try {
    await execAsync(["bash", "-c", `mkdir -p ${SHOT_DIR} && rm -f ${SHOT_DIR}/*.png`])
  } catch {}
  const geo = await readGeometry()
  setGeos(geo)

  const stamp = Date.now() // new filename each time so GTK never shows a cached image
  const out: Record<string, string> = {}
  await Promise.all(
    list.map(async (c) => {
      const a = addr(c.address)
      const g = geo[a]
      if (!g || g.w <= 0 || g.h <= 0) return
      const path = `${SHOT_DIR}/${a}-${stamp}.png`
      try {
        await execAsync(["grim", "-g", `${g.x},${g.y} ${g.w}x${g.h}`, path])
        out[a] = path
      } catch {
        // grim missing or capture failed: the card falls back to the app icon
      }
    }),
  )
  setShots(out)
}

async function onShow(win: Astal.Window) {
  setSel(initialSel(focused.get()?.id, WORKSPACES.map((w) => w.id)))
  const list = windows.get()

  win.opacity = 0 // invisible while we screenshot, so the overlay is not captured
  await capture(list)
  win.opacity = 1
}

const NAV_KEYS: Record<number, NavKey> = {
  [Gdk.KEY_Left]: "left",
  [Gdk.KEY_Right]: "right",
  [Gdk.KEY_Up]: "up",
  [Gdk.KEY_Down]: "down",
  [Gdk.KEY_Tab]: "tab",
}

function onKey(keyval: number): boolean {
  const list = windows.get()
  const nav = NAV_KEYS[keyval]
  if (nav) {
    setSel(step(sel.get(), nav, WORKSPACES.length, list.length))
    return true
  }

  switch (keyval) {
    case Gdk.KEY_Escape:
      close()
      return true
    case Gdk.KEY_Return:
    case Gdk.KEY_KP_Enter: {
      const s = sel.get()
      if (s.row === "ws") {
        focusWorkspace(WORKSPACES[s.ws].id)
      } else {
        const c = list[s.win]
        if (c) focusWindow(c)
      }
      close()
      return true
    }
  }
  return false
}

// ---------- widgets ----------

function WorkspaceCard({ id, name, index }: { id: number; name: string; index: number }) {
  const cls = createComputed(
    [focused, sel],
    (w: Hyprland.Workspace, s: Sel) =>
      ["ws", w?.id === id ? "active" : "", s.row === "ws" && s.ws === index ? "sel" : ""]
        .filter(Boolean)
        .join(" "),
  )

  return (
    <button
      class={cls}
      onClicked={() => {
        focusWorkspace(id)
        close()
      }}
    >
      {/* hovering a workspace previews its windows, same as arrowing onto it */}
      <Gtk.EventControllerMotion
        onEnter={() => sel.get().ws !== index && setSel({ row: "ws", ws: index, win: 0 })}
      />
      <label xalign={0} yalign={0} label={`${id} · ${name}`} />
    </button>
  )
}

function WindowCard({ client, index }: { client: Hyprland.Client; index: Accessor<number> }) {
  const a = addr(client.address)
  const title = createBinding(client, "title")
  const appClass = createBinding(client, "class")
  const shot = shots((s) => s[a])
  const size = geos((g) => fit(g[a]))
  const cls = createComputed(
    [sel, index],
    (s: Sel, ix: number) => (s.row === "win" && s.win === ix ? "win sel" : "win"),
  )

  return (
    <box
      class={cls}
      orientation={Gtk.Orientation.VERTICAL}
      valign={Gtk.Align.START}
      overflow={Gtk.Overflow.HIDDEN}
      widthRequest={size((s) => s.w)}
    >
      <box class="win-head">
        {/* maxWidthChars=1 + hexpand: the title takes the card's width and gets
            ellipsized, instead of stretching the card to fit a long title */}
        <label
          hexpand
          xalign={0}
          maxWidthChars={1}
          ellipsize={Pango.EllipsizeMode.END}
          label={title((t) => t || client.class)}
        />
        <button class="win-close" onClicked={() => closeWindow(client)}>
          <label label="✕" />
        </button>
      </box>
      <button
        class="win-body"
        onClicked={() => {
          focusWindow(client)
          close()
        }}
      >
        {/* children of type "overlay" don't affect the size, so a big screenshot can't stretch the card */}
        <overlay widthRequest={size((s) => s.w)} heightRequest={size((s) => s.h)}>
          <Gtk.Picture
            $type="overlay"
            visible={shot((p) => !!p)}
            // null while there is no screenshot (the picture is hidden then); the
            // prop's type just doesn't admit null, hence the cast
            file={
              shot((p) => (p ? Gio.File.new_for_path(p) : null)) as unknown as Accessor<Gio.File>
            }
            contentFit={Gtk.ContentFit.FILL}
          />
          <image
            $type="overlay"
            visible={shot((p) => !p)}
            pixelSize={64}
            iconName={appClass((c) => iconFor(c))}
          />
        </overlay>
      </button>
    </box>
  )
}

export default function Overview() {
  // namespace "overview" is what the Hyprland blur layerrule matches
  return (
    <window
      name="overview"
      namespace="overview"
      class="Overview"
      application={app}
      visible={false}
      layer={Astal.Layer.OVERLAY}
      exclusivity={Astal.Exclusivity.IGNORE}
      keymode={Astal.Keymode.EXCLUSIVE}
      anchor={TOP | BOTTOM | LEFT | RIGHT}
      $={(self) => {
        // Capture phase: we see arrow keys before the focused button can use them.
        const keys = new Gtk.EventControllerKey()
        keys.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
        keys.connect("key-pressed", (_ctrl, keyval) => onKey(keyval))
        self.add_controller(keys)

        // Screenshot + reset selection every time the overview opens.
        self.connect("notify::visible", () => {
          if (self.visible) onShow(self)
        })
      }}
    >
      {/* fills the screen so a click on empty space closes the overview */}
      <box
        class="content"
        orientation={Gtk.Orientation.VERTICAL}
        $={(self) => {
          const click = new Gtk.GestureClick()
          click.connect("pressed", () => close())
          self.add_controller(click)
        }}
      >
        <box class="ws-strip" halign={Gtk.Align.CENTER}>
          {WORKSPACES.map((w, i) => (
            <WorkspaceCard id={w.id} name={w.name} index={i} />
          ))}
        </box>
        <box class="win-row" halign={Gtk.Align.CENTER} valign={Gtk.Align.START}>
          <For each={windows}>
            {(client, index) => <WindowCard client={client} index={index} />}
          </For>
          <label class="win-empty" label="No windows" visible={windows((l) => l.length === 0)} />
        </box>
      </box>
    </window>
  )
}