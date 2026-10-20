import { Gtk } from "ags/gtk4"
import { createBinding, createState, For } from "ags"
import { interval } from "ags/time"
import GLib from "gi://GLib"
import AstalNotifd from "gi://AstalNotifd"
import { MOTION } from "../../common/motion"
import Sep from "../common/Sep"
import Clock from "./Clock"
import NotifRow from "../../notifications/NotifRow"
import { groupByApp, relTime } from "../../notifications/model"

let toggleFn = () => {}
export const toggleDateMenu = () => toggleFn()

const nowSec = () => Math.floor(Date.now() / 1000)
const today = () => GLib.DateTime.new_now_local()

// Clock and bell in one bar item; the popover pairs grouped notifications with a calendar.
export default function DateMenu() {
  const notifd = AstalNotifd.get_default()
  const list = createBinding(notifd, "notifications")
  const dnd = createBinding(notifd, "dontDisturb")
  const groups = list.as((l) => groupByApp(l))
  const [open, setOpen] = createState(false)
  const [now, setNow] = createState(nowSec())
  const [heading, setHeading] = createState("")
  let calendar: Gtk.Calendar
  let ticker: { cancel: () => void } | null = null

  const onOpen = (visible: boolean) => {
    setOpen(visible)
    ticker?.cancel()
    ticker = null
    if (!visible) return
    // ages only tick while someone can see them
    setNow(nowSec())
    ticker = interval(30_000, () => setNow(nowSec()))
    setHeading(today().format("%A, %d %B %Y") ?? "")
    calendar.select_day(today())
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
          <image iconName="preferences-system-notifications-symbolic" />
          <label
            class="count"
            valign={Gtk.Align.CENTER}
            visible={list.as((l) => l.length > 0)}
            label={list.as((l) => String(l.length))}
          />
        </box>
      </box>
      <popover class="qs-pop" hasArrow={false}>
        <revealer
          transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
          transitionDuration={MOTION.base}
          revealChild={open}
        >
          <box class="datemenu-panel" spacing={16}>
            <box class="notif-list" orientation={Gtk.Orientation.VERTICAL}>
              <box class="notif-head">
                <label class="qs-title" hexpand xalign={0} label="Notifications" />
                <button
                  class={dnd.as((d) => (d ? "dnd on" : "dnd"))}
                  tooltipText="Do not disturb"
                  onClicked={() => (notifd.dontDisturb = !notifd.dontDisturb)}
                >
                  <image iconName="notifications-disabled-symbolic" />
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
                <box orientation={Gtk.Orientation.VERTICAL}>
                  <For each={groups}>
                    {(g) => (
                      <box class="notif-group" orientation={Gtk.Orientation.VERTICAL}>
                        <box class="group-head">
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
                            <image iconName="edit-clear-all-symbolic" />
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
              <button
                class="clear"
                halign={Gtk.Align.END}
                visible={list.as((l) => l.length > 0)}
                onClicked={() => list.get().forEach((n) => n.dismiss())}
              >
                <label label="Clear all" />
              </button>
            </box>
            <box class="cal-col" orientation={Gtk.Orientation.VERTICAL}>
              <label class="cal-heading" xalign={0} label={heading} />
              <Gtk.Calendar
                $={(self) => (calendar = self)}
                showHeading
                showDayNames
                showWeekNumbers={false}
              />
            </box>
          </box>
        </revealer>
      </popover>
    </menubutton>
  )
}
