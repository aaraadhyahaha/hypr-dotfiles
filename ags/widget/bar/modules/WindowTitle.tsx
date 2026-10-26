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
                // a 0-char natural width + hexpand fills what's left of the bar's start half,
                // so a long title ellipsizes instead of shoving the centred pills off centre
                // (GtkCenterBox gives its start child its full natural width)
                hexpand
                xalign={0}
                maxWidthChars={0}
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
