import { Gtk } from "ags/gtk4"
import { createBinding, For } from "ags"
import AstalTray from "gi://AstalTray?version=0.1"
import Sep from "../common/Sep"

const HIDDEN = /nm-applet|network|blueman/i

export default function Tray() {
  const tray = AstalTray.get_default()
  const items = createBinding(tray, "items").as((l) =>
    l.filter((i) => !HIDDEN.test(`${i.id} ${i.title}`)),
  )

  return (
    <box class="tray" visible={items.as((l) => l.length > 0)}>
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
            <image gicon={createBinding(item, "gicon")} />
          </menubutton>
        )}
      </For>
      <Sep />
    </box>
  )
}
