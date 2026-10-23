import { createBinding, createComputed, With } from "ags"
import Pango from "gi://Pango?version=1.0"
import AstalHyprland from "gi://AstalHyprland"

export default function WindowTitle() {
  const hypr = AstalHyprland.get_default()
  const focused = createBinding(hypr, "focusedClient")

  return (
    <box>
      <With value={focused}>
        {(client) => {
          if (!client) return
          const cls = createBinding(client, "class")
          const title = createBinding(client, "title")
          return (
            <box class="wintitle">
              <label
                maxWidthChars={48}
                ellipsize={Pango.EllipsizeMode.END}
                // "kitty — ~/.config/ags"; title goes null while a closing client is torn down
                label={createComputed(() =>
                  [cls(), title()].filter(Boolean).join(" — "),
                )}
              />
            </box>
          )
        }}
      </With>
    </box>
  )
}
