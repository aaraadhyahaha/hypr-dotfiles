import { Gtk } from "ags/gtk4"
import { createBinding, For } from "ags"
import AstalNotifd from "gi://AstalNotifd?version=0.1"

export default function Notifications() {
  const notifd = AstalNotifd.get_default()
  const list = createBinding(notifd, "notifications")

  return (
    <menubutton class="bell">
      <box>
        <image iconName="preferences-system-notifications-symbolic" />
        <label
          class="count"
          visible={list.as((l) => l.length > 0)}
          label={list.as((l) => String(l.length))}
        />
      </box>
      <popover hasArrow={false}>
        <box orientation={Gtk.Orientation.VERTICAL} class="notif-list">
          <label
            class="empty"
            visible={list.as((l) => l.length === 0)}
            label="No notifications"
          />
          <scrolledwindow
            propagateNaturalHeight
            maxContentHeight={400}
            visible={list.as((l) => l.length > 0)}
          >
            <box orientation={Gtk.Orientation.VERTICAL}>
              <For each={list}>
                {(n) => (
                  <box class="notif" orientation={Gtk.Orientation.VERTICAL}>
                    <box>
                      <label class="app" hexpand xalign={0} label={n.appName} />
                      <button class="x" onClicked={() => n.dismiss()}>
                        <image iconName="window-close-symbolic" />
                      </button>
                    </box>
                    <label class="summary" xalign={0} wrap label={n.summary} />
                    <label class="notif-body" xalign={0} wrap visible={!!n.body} label={n.body} />
                  </box>
                )}
              </For>
            </box>
          </scrolledwindow>
          <button
            class="clear"
            visible={list.as((l) => l.length > 0)}
            onClicked={() => list.get().forEach((n) => n.dismiss())}
          >
            <label label="Clear all" />
          </button>
        </box>
      </popover>
    </menubutton>
  )
}
