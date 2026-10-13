import { createBinding, With } from "ags"
import Pango from "gi://Pango?version=1.0"
import AstalHyprland from "gi://AstalHyprland"
import Sep from "../common/Sep"

export default function WindowTitle() {
  const hypr = AstalHyprland.get_default()
  const focused = createBinding(hypr, "focusedClient")

  return (
    <box>
      <With value={focused}>
        {(client) =>
          client && (
            <box class="wintitle">
              <Sep />
              <label
                maxWidthChars={36}
                ellipsize={Pango.EllipsizeMode.END}
                label={createBinding(client, "title")}
              />
            </box>
          )
        }
      </With>
    </box>
  )
}
