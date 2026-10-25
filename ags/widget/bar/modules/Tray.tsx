import { Gdk, Gtk } from "ags/gtk4"
import { createBinding, For } from "ags"
import AstalTray from "gi://AstalTray?version=0.1"
import GdkPixbuf from "gi://GdkPixbuf"
import GLib from "gi://GLib"
import Sep from "../common/Sep"

const HIDDEN = /nm-applet|network|blueman/i
const SIZE = 16 // matches $icon-size

// Pixmap-only items (Electron apps like Claude) send one large edge-to-edge bitmap, which
// GTK downscales in one linear pass (jagged) and draws louder than the bar's font glyphs.
// Resample it once at device size, inset it to the glyphs' optical size, and tint
// single-colour ones with the bar's text colour, as GTK does for symbolic icons.
const INSET = 0.85

function renderPixmap(src: GdkPixbuf.Pixbuf, px: number, fg: Gdk.RGBA) {
  const inner = Math.round(px * INSET)
  const scaled = src.scale_simple(inner, inner, GdkPixbuf.InterpType.HYPER) ?? src
  const out = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, true, 8, px, px)!
  out.fill(0)
  const off = Math.floor((px - inner) / 2)
  scaled.composite(out, off, off, inner, inner, off, off, 1, 1, GdkPixbuf.InterpType.NEAREST, 255)

  const data = out.get_pixels()
  const stride = out.get_rowstride()
  let mono = true
  for (let y = 0; y < px && mono; y++)
    for (let x = 0; x < px; x++) {
      const i = y * stride + x * 4
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
      if (a > 0 && (Math.max(r, g, b) - Math.min(r, g, b) > 24 || r < 200)) {
        mono = false
        break
      }
    }
  if (!mono) return Gdk.Texture.new_for_pixbuf(out)

  const [fr, fg_, fb] = [fg.red, fg.green, fg.blue].map((c) => Math.round(c * 255))
  const tinted = new Uint8Array(data)
  for (let y = 0; y < px; y++)
    for (let x = 0; x < px; x++) {
      const i = y * stride + x * 4
      tinted[i] = fr
      tinted[i + 1] = fg_
      tinted[i + 2] = fb
      tinted[i + 3] = Math.round(tinted[i + 3] * fg.alpha)
    }
  return Gdk.Texture.new_for_pixbuf(
    GdkPixbuf.Pixbuf.new_from_bytes(new GLib.Bytes(tinted), GdkPixbuf.Colorspace.RGB, true, 8, px, px, stride),
  )
}

function TrayIcon({ item }: { item: AstalTray.TrayItem }) {
  return (
    <image
      $={(self) => {
        const sync = () => {
          const icon = item.gicon
          if (!(icon instanceof GdkPixbuf.Pixbuf)) return self.set_from_gicon(icon)
          const scale = self.get_native()?.get_surface()?.get_scale() ?? self.get_scale_factor()
          self.set_from_paintable(renderPixmap(icon, Math.ceil(SIZE * scale), self.get_color()))
        }
        const id = item.connect("notify::gicon", sync)
        self.connect("realize", sync)
        self.connect("destroy", () => item.disconnect(id))
        sync()
      }}
    />
  )
}

export default function Tray() {
  const tray = AstalTray.get_default()
  const items = createBinding(tray, "items").as((l) =>
    l.filter((i) => !HIDDEN.test(`${i.id} ${i.title}`)),
  )

  return (
    <box class="tray" spacing={4} visible={items.as((l) => l.length > 0)}>
      <For each={items}>
        {(item) => (
          <menubutton
            $={(self) => {
              self.insert_action_group("dbusmenu", item.actionGroup)

              // left click = activate the app, right click = its menu
              const left = new Gtk.GestureClick({ button: 1 })
              left.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
              left.connect("pressed", () => {
                left.set_state(Gtk.EventSequenceState.CLAIMED)
                item.activate(0, 0)
              })
              self.add_controller(left)

              const right = new Gtk.GestureClick({ button: 3 })
              right.connect("pressed", () => self.popup())
              self.add_controller(right)
            }}
            tooltipMarkup={createBinding(item, "tooltipMarkup")}
            menuModel={createBinding(item, "menuModel")}
          >
            <TrayIcon item={item} />
          </menubutton>
        )}
      </For>
      <Sep />
    </box>
  )
}
