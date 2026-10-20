import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import Pango from "gi://Pango"
import AstalNotifd from "gi://AstalNotifd"

const CRITICAL = 2

const isFile = (s: string) => s.startsWith("/") || s.startsWith("file://")

// bodies are allowed a subset of Pango markup, but apps often send bare `&` or `<`
function safeMarkup(text: string) {
  try {
    Pango.parse_markup(text, -1, "\0")
    return text
  } catch {
    return GLib.markup_escape_text(text, -1)
  }
}

function Icon({ n }: { n: AstalNotifd.Notification }) {
  const src = n.image || n.appIcon || n.desktopEntry
  if (!src) return <box visible={false} />
  return isFile(src) ? (
    <image class="notif-icon" file={src.replace(/^file:\/\//, "")} valign={Gtk.Align.START} />
  ) : (
    <image class="notif-icon" iconName={src} valign={Gtk.Align.START} />
  )
}

// One notification: icon, app, summary, body, action buttons and a dismiss button.
// `onDone` runs after an action is invoked (toasts use it to leave).
export default function NotifRow({
  n,
  onDone,
}: {
  n: AstalNotifd.Notification
  onDone?: () => void
}) {
  const actions = n.actions.filter((a) => a.id !== "default")

  return (
    <box class={n.urgency === CRITICAL ? "notif critical" : "notif"} spacing={12}>
      <Icon n={n} />
      <box orientation={Gtk.Orientation.VERTICAL} hexpand>
        <box>
          <label class="app" hexpand xalign={0} label={n.appName} />
          <button class="x" onClicked={() => n.dismiss()}>
            <image iconName="window-close-symbolic" />
          </button>
        </box>
        <label class="summary" xalign={0} wrap label={n.summary} />
        <label
          class="notif-body"
          xalign={0}
          wrap
          useMarkup
          visible={!!n.body}
          label={n.body ? safeMarkup(n.body) : ""}
        />
        <box class="actions" spacing={4} homogeneous visible={actions.length > 0}>
          {actions.map((a) => (
            <button
              onClicked={() => {
                n.invoke(a.id)
                onDone?.()
              }}
            >
              <label label={a.label} />
            </button>
          ))}
        </box>
      </box>
    </box>
  )
}
