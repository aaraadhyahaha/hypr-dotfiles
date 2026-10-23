import { Gtk } from "ags/gtk4"
import { createBinding, createState, For } from "ags"
import { interval } from "ags/time"
import AstalNotifd from "gi://AstalNotifd"
import { Motion, ENTER, onShow } from "../../common/motion"
import Sep from "../common/Sep"
import Clock from "./Clock"
import DateCalendar from "./DateCalendar"
import Icon from "../../common/Icon"
import NotifRow from "../../notifications/NotifRow"
import { groupByApp, relTime } from "../../notifications/model"

let toggleFn = () => {}
export const toggleDateMenu = () => toggleFn()

const nowSec = () => Math.floor(Date.now() / 1000)

// Clock and bell in one bar item; the popover pairs grouped notifications with a calendar.
export default function DateMenu() {
  const notifd = AstalNotifd.get_default()
  const list = createBinding(notifd, "notifications")
  const dnd = createBinding(notifd, "dontDisturb")
  const groups = list.as((l) => groupByApp(l))
  const [now, setNow] = createState(nowSec())
  let calendar: { reset: () => void }
  let motion: Motion
  let ticker: { cancel: () => void } | null = null

  const onOpen = (visible: boolean) => {
    ticker?.cancel()
    ticker = null
    if (!visible) return
    // ages only tick while someone can see them
    setNow(nowSec())
    ticker = interval(30_000, () => setNow(nowSec()))
    calendar.reset()
  }

  return (
    <menubutton
      class="datemenu"
      $={(self) => {
        self.connect("notify::active", () => onOpen(self.active))
        toggleFn = () => (self.active = !self.active)
      }}
    >
      <box>
        <Clock />
        <Sep />
        <box class="bell">
          <Icon name={dnd.as((d) => (d ? "notifications_off" : "notifications"))} fill />
          <label
            class="count"
            valign={Gtk.Align.CENTER}
            visible={list.as((l) => l.length > 0)}
            label={list.as((l) => String(l.length))}
          />
        </box>
      </box>
      <popover class="qs-pop" hasArrow={false} $={(self) => onShow(self, motion, ENTER.popover)}>
        <Motion origin="top" $={(self) => (motion = self)}>
          <box class="datemenu-panel" spacing={16}>
            <box class="notif-list" orientation={Gtk.Orientation.VERTICAL} spacing={8}>
              <box class="notif-head" spacing={8}>
                <label class="notif-title" hexpand xalign={0} label="Notifications" />
                <button
                  class={dnd.as((d) => (d ? "dnd on" : "dnd"))}
                  tooltipText="Do not disturb"
                  onClicked={() => (notifd.dontDisturb = !notifd.dontDisturb)}
                >
                  <Icon name="do_not_disturb_on" />
                </button>
                <button
                  class="clear"
                  sensitive={list.as((l) => l.length > 0)}
                  onClicked={() => list.get().forEach((n) => n.dismiss())}
                >
                  <label label="Clear" />
                </button>
              </box>
              <label
                class="empty"
                vexpand
                visible={list.as((l) => l.length === 0)}
                label="No notifications"
              />
              <scrolledwindow
                propagateNaturalHeight
                maxContentHeight={420}
                hscrollbarPolicy={Gtk.PolicyType.NEVER}
                visible={list.as((l) => l.length > 0)}
              >
                <box orientation={Gtk.Orientation.VERTICAL} spacing={8}>
                  <For each={groups}>
                    {(g) => (
                      <box class="notif-group" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
                        <box class="group-head" spacing={8}>
                          <label class="group-app" xalign={0} label={g.app} />
                          <label
                            class="group-time"
                            hexpand
                            xalign={0}
                            label={now.as((t) => relTime(t, g.items[0].time))}
                          />
                          <button
                            class="x"
                            tooltipText="Clear"
                            onClicked={() => g.items.forEach((n) => n.dismiss())}
                          >
                            <Icon name="close" />
                          </button>
                        </box>
                        {g.items.map((n) => (
                          <NotifRow n={n} showApp={false} />
                        ))}
                      </box>
                    )}
                  </For>
                </box>
              </scrolledwindow>
            </box>
            <box class="datemenu-sep" />
            <DateCalendar onReady={(api) => (calendar = api)} />
          </box>
        </Motion>
      </popover>
    </menubutton>
  )
}
