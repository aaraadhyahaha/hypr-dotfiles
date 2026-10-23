import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import Pango from "gi://Pango"
import AstalNotifd from "gi://AstalNotifd"
import Icon from "../common/Icon"
import { relTime } from "./model"

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

// 32px tile: the notification's image or app icon, else a symbol on the secondary container
function Tile({ n }: { n: AstalNotifd.Notification }) {
  const src = n.image || n.appIcon || n.desktopEntry
  const inner = !src ? (
    <Icon name={n.urgency === CRITICAL ? "warning" : "notifications"} fill halign={Gtk.Align.CENTER} />
  ) : isFile(src) ? (
    <image class="notif-image" file={src.replace(/^file:\/\//, "")} halign={Gtk.Align.CENTER} />
  ) : (
    <image class="notif-app-icon" iconName={src} halign={Gtk.Align.CENTER} />
  )
  return (
    <box class="notif-tile" valign={Gtk.Align.START} homogeneous>
      {inner}
    </box>
  )
}

// One notification: icon, app, summary, body, action buttons and a dismiss button.
// `onDone` runs after an action is invoked (toasts use it to leave).
// `showApp` is off inside a group, whose header already names the app (and whose
// rows only show their dismiss button on hover). `toast`: the time stands where the
// dismiss button was (a click anywhere dismisses) and actions sit at their own width.
export default function NotifRow({
  n,
  onDone,
  showApp = true,
  toast = false,
}: {
  n: AstalNotifd.Notification
  onDone?: () => void
  showApp?: boolean
  toast?: boolean
}) {
  const actions = n.actions.filter((a) => a.id !== "default")
  // a wrapping label asks for its whole line as natural width: keep that small in a toast so
  // the toast's 360px min-width sets the width, and the labels wrap to fill it
  const cap = toast ? 20 : -1

  return (
    <box class={n.urgency === CRITICAL ? "notif critical" : "notif"} spacing={10}>
      <Tile n={n} />
      <box orientation={Gtk.Orientation.VERTICAL} hexpand spacing={3}>
        <box>
          {showApp ? (
            <label class="app" hexpand xalign={0} label={n.appName} />
          ) : (
            <label class="summary" hexpand xalign={0} wrap label={n.summary} />
          )}
          {toast ? (
            <label class="notif-time" label={relTime(Math.floor(Date.now() / 1000), n.time)} />
          ) : (
            <button class="x" valign={Gtk.Align.START} onClicked={() => n.dismiss()}>
              <Icon name="close" />
            </button>
          )}
        </box>
        <label class="summary" xalign={0} wrap maxWidthChars={cap} visible={showApp} label={n.summary} />
        <label
          class="notif-body"
          xalign={0}
          wrap
          maxWidthChars={cap}
          useMarkup
          visible={!!n.body}
          label={n.body ? safeMarkup(n.body) : ""}
        />
        <box
          class="actions"
          spacing={toast ? 6 : 4}
          homogeneous={!toast}
          halign={toast ? Gtk.Align.START : Gtk.Align.FILL}
          visible={actions.length > 0}
        >
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
