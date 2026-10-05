import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { timeout } from "ags/time"
import { readFile } from "ags/file"
import { execAsync } from "ags/process"
import GLib from "gi://GLib"
import GdkPixbuf from "gi://GdkPixbuf"

const HOME = GLib.get_home_dir()
const DIR = `${HOME}/Pictures/Wallpapers`
const SCRIPT = `${HOME}/.config/hypr/scripts/wallpaper-set.sh`
const TW = 240
const TH = 135
const CACHE = `${HOME}/.cache/ags-wp`
const thumbPath = (path: string) =>
  `${CACHE}/${GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, path, -1)}.png`

let toggleFn = () => { }
export const toggleWallpapers = () => toggleFn()

export default function Wallpapers() {
  let win: Astal.Window
  let card: Gtk.Box
  let flow: Gtk.FlowBox
  let paths: string[] = []
  let currentIdx = 0
  let closing = false
  const cache = new Map<string, Gdk.Texture>()

  const listImages = (): string[] => {
    const out: string[] = []
    try {
      const d = GLib.Dir.open(DIR, 0)
      let n: string | null
      while ((n = d.read_name())) {
        if (/\.(jpe?g|png|webp)$/i.test(n)) out.push(`${DIR}/${n}`)
      }
    } catch (e) {
      console.error("wallpaper dir error:", e)
    }
    return out.sort()
  }

  const texture = (path: string): Gdk.Texture | null => {
    if (cache.has(path)) return cache.get(path)!
    try {
      const thumb = thumbPath(path)
      if (!GLib.file_test(thumb, GLib.FileTest.EXISTS)) {
        GLib.mkdir_with_parents(CACHE, 0o755)
        const pb = GdkPixbuf.Pixbuf.new_from_file_at_scale(path, TW, TH, true)
        pb.savev(thumb, "png", [], [])
      }
      const tex = Gdk.Texture.new_from_filename(thumb)
      cache.set(path, tex)
      return tex
    } catch (e) {
      console.error("thumb error:", e)
      return null
    }
  }

  const hasThumb = (path: string) =>
    cache.has(path) || GLib.file_test(thumbPath(path), GLib.FileTest.EXISTS)

  const render = () => {
    let c
    while ((c = flow.get_first_child())) flow.remove(c)

    let current = ""
    try { current = readFile(`${HOME}/.cache/last_wall`).trim() } catch { }

    paths = listImages()
    currentIdx = Math.max(0, paths.indexOf(current))

    if (!paths.length) {
      const l = new Gtk.Label({ label: "No images in ~/Pictures/Wallpapers" })
      l.add_css_class("wp-empty")
      flow.append(l)
      return
    }

    const queue: [Gtk.Picture, string][] = []
    paths.forEach((path) => {
      const tile = new Gtk.Box()
      tile.add_css_class("tile")
      if (path === current) tile.add_css_class("current")

      const pic = new Gtk.Picture({
        contentFit: Gtk.ContentFit.COVER,
        widthRequest: TW,
        heightRequest: TH,
      })
      pic.overflow = Gtk.Overflow.HIDDEN
      pic.add_css_class("thumb")
      tile.append(pic)
      flow.append(tile)
      const t = hasThumb(path) ? texture(path) : null
      if (t) pic.set_paintable(t)
      else queue.push([pic, path])
    })

    // fill thumbnails one per idle tick so opening never stalls
    let i = 0
    GLib.idle_add(GLib.PRIORITY_LOW, () => {
      if (i >= queue.length) return GLib.SOURCE_REMOVE
      const [pic, path] = queue[i++]
      const t = texture(path)
      if (t) pic.set_paintable(t)
      return GLib.SOURCE_CONTINUE
    })
  }

  const close = () => {
    if (!win.visible || closing) return
    closing = true
    card.remove_css_class("pop")
    card.add_css_class("out")
    timeout(220, () => {
      win.visible = false
      card.remove_css_class("out")
      closing = false
    })
  }

  const open = () => {
    render()
    card.remove_css_class("pop")
    win.visible = true
    timeout(16, () => {
      card.add_css_class("pop")
      flow.get_child_at_index(currentIdx)?.grab_focus()
    })
  }

  const apply = (path?: string) => {
    if (!path) return
    close()
    execAsync([SCRIPT, path]).catch(console.error)
  }

  toggleFn = () => (win.visible ? close() : open())

  timeout(3000, () => {
    const todo = listImages()
    let i = 0
    GLib.idle_add(GLib.PRIORITY_LOW, () => {
      if (i >= todo.length) return GLib.SOURCE_REMOVE
      texture(todo[i++])
      return GLib.SOURCE_CONTINUE
    })
  })

  return (
    <window
      $={(self) => {
        win = self
        const key = new Gtk.EventControllerKey()
        key.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
        key.connect("key-pressed", (_, keyval) => {
          if (keyval === Gdk.KEY_Escape) { close(); return true }
          return false
        })
        self.add_controller(key)
      }}
      visible={false}
      name="wallpapers"
      namespace="wallpapers"
      class="Wallpapers"
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.EXCLUSIVE}
      exclusivity={Astal.Exclusivity.IGNORE}
      application={app}
    >
      <box
        $={(self) => (card = self)}
        class="wp-card"
        orientation={Gtk.Orientation.VERTICAL}
      >
        <label class="wp-title" label="Wallpapers" xalign={0} />
        <scrolledwindow
          propagateNaturalHeight
          propagateNaturalWidth
          maxContentHeight={440}
          hscrollbarPolicy={Gtk.PolicyType.NEVER}
        >
          <Gtk.FlowBox
            $={(self) => (flow = self)}
            class="wp-grid"
            homogeneous
            minChildrenPerLine={3}
            maxChildrenPerLine={3}
            selectionMode={Gtk.SelectionMode.SINGLE}
            onChildActivated={(_, child) => apply(paths[child.get_index()])}
          />
        </scrolledwindow>
      </box>
    </window>
  )
}