import { createBinding, With } from "ags"
import Pango from "gi://Pango?version=1.0"
import AstalHyprland from "gi://AstalHyprland"

export default function WindowTitle() {
  const hypr = AstalHyprland.get_default()
  const focused = createBinding(hypr, "focusedClient")

  return (
    <box>
      <With value={focused}>
        {(client) =>
          client && (
            <box class="wintitle">
              <label
                maxWidthChars={36}
                ellipsize={Pango.EllipsizeMode.END}
                // title goes null while a closing client is torn down
                label={createBinding(client, "title").as((t) => t ?? "")}
              />
            </box>
          )
        }
      </With>
    </box>
  )
}
