import app from "ags/gtk4/app"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import { createBinding, createState, For, Accessor } from "ags"
import { createPoll } from "ags/time"
import AstalHyprland from "gi://AstalHyprland"
import AstalBattery from "gi://AstalBattery?version=0.1"
import { execAsync } from "ags/process"
import AstalWp from "gi://AstalWp?version=0.1"
import AstalNetwork from "gi://AstalNetwork?version=0.1"
import Pango from "gi://Pango?version=1.0"
import AstalBluetooth from "gi://AstalBluetooth?version=0.1"
import AstalNotifd from "gi://AstalNotifd?version=0.1"
import { toggleLauncher } from "./Launcher"

const Sep = () => <box class="sep" />

function Volume() {
  const speaker = AstalWp.get_default()!.audio.defaultSpeaker
  const vol = createBinding(speaker, "volume")
  const muted = createBinding(speaker, "mute")

  return (
    <box class={muted.as((m) => (m ? "volume muted" : "volume"))}>
      <Gtk.EventControllerScroll
        flags={Gtk.EventControllerScrollFlags.VERTICAL}
        onScroll={(_, _dx, dy) => {
          speaker.volume = Math.max(0, Math.min(1, speaker.volume - dy * 0.05))
        }}
      />
      <Gtk.GestureClick onPressed={() => (speaker.mute = !speaker.mute)} />
      <image iconName={createBinding(speaker, "volumeIcon")} />
      <Swap text={vol.as((v) => `${Math.round(v * 100)}%`)} />
    </box>
  )
}

function Battery() {
  const bat = AstalBattery.get_default()
  const pct = createBinding(bat, "percentage")

  return (
    <box
      class={pct.as((p) => (p <= 0.2 ? "battery low pulse" : "battery"))}
      visible={createBinding(bat, "isPresent")}
    >
      <image iconName={createBinding(bat, "iconName")} />
      <label widthChars={4} xalign={1} label={pct.as((p) => `${Math.round(p * 100)}%`)} />
    </box>
  )
}

function Clock() {
  const time = createPoll("", 1000, "date +%H:%M")
  const date = createPoll("", 60000, "date '+%a, %d %b'")
  const [hover, setHover] = createState(false)

  return (
    <box class="clock">
      <Gtk.EventControllerMotion
        onEnter={() => setHover(true)}
        onLeave={() => setHover(false)}
      />
      <label label={time} />
      <revealer
        transitionType={Gtk.RevealerTransitionType.SLIDE_RIGHT}
        transitionDuration={250}
        revealChild={hover}
      >
        <label class="date" label={date} />
      </revealer>
    </box>
  )
}

function Workspaces() {
  const hypr = AstalHyprland.get_default()
  const focused = createBinding(hypr, "focusedWorkspace")

  return (
    <box class="workspaces" valign={Gtk.Align.CENTER}>
      {[1, 2, 3, 4, 5].map((id) => (
        <button
          valign={Gtk.Align.CENTER}
          class={focused.as((fw) => (fw.id === id ? "dot active" : "dot"))}
          onClicked={() => execAsync(["hyprctl", "dispatch", `hl.dsp.focus({ workspace = ${id} })`])}
        />
      ))}
    </box>
  )
}

function Wifi() {
  const wifi = AstalNetwork.get_default().wifi

  return (
    <box class="wifi" visible={!!wifi}>
      {wifi && (
        <>
          <image iconName={createBinding(wifi, "iconName")} />
          <label
            maxWidthChars={12}
            ellipsize={Pango.EllipsizeMode.END}
            label={createBinding(wifi, "ssid").as((s) => s ?? "Offline")}
          />
        </>
      )}
    </box>
  )
}

function Bluetooth() {
  const bt = AstalBluetooth.get_default()
  const powered = createBinding(bt, "isPowered")

  return (
    <button
      class={powered.as((p) => (p ? "bt" : "bt off"))}
      onClicked={() => bt.toggle()}
    >
      <image
        iconName={powered.as((p) =>
          p ? "bluetooth-active-symbolic" : "bluetooth-disabled-symbolic",
        )}
      />
    </button>
  )
}

function Notifications() {
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

function Swap({ text, chars = 4 }: { text: Accessor<string>; chars?: number }) {
  return (
    <stack
      transitionType={Gtk.StackTransitionType.CROSSFADE}
      transitionDuration={180}
      $={(self) => {
        let flip = false
        const a = new Gtk.Label({ label: text.get(), widthChars: chars, xalign: 1 })
        const b = new Gtk.Label({ widthChars: chars, xalign: 1 })
        self.add_named(a, "a")
        self.add_named(b, "b")
        text.subscribe(() => {
          flip = !flip
            ; (flip ? b : a).label = text.get()
          self.visibleChildName = flip ? "b" : "a"
        })
      }}
    />
  )
}

function Reveal({ show, children }: { show: Accessor<boolean>; children?: any }) {
  return (
    <revealer
      transitionType={Gtk.RevealerTransitionType.SLIDE_RIGHT}
      transitionDuration={250}
      revealChild={show}
    >
      {children}
    </revealer>
  )
}

function Caffeine() {
  // "1" while hypridle is running; stopping it = staying awake
  const state = createPoll("1", 1000, [
    "sh", "-c", "pgrep -x hypridle >/dev/null && echo 1 || echo 0",
  ])
  const awake = state.as((s) => s.trim() === "0")

  return (
    <button
      class={awake.as((a) => (a ? "icon-btn on" : "icon-btn"))}
      onClicked={() =>
        execAsync([
          "sh", "-c",
          state.get().trim() === "1"
            ? "pkill -x hypridle"
            : "setsid hypridle >/dev/null 2>&1 &",
        ])
      }
    >
      <label class="glyph" label={"\uf0f4"} />
    </button>
  )
}

function Power() {
  let pop: Gtk.Popover

  const item = (glyph: string, text: string, cmd: string[]) => (
    <button
      class="menu-item"
      onClicked={() => {
        pop.popdown()
        execAsync(cmd)
      }}
    >
      <box>
        <label class="glyph" label={glyph} />
        <label label={text} xalign={0} hexpand />
      </box>
    </button>
  )

  return (
    <menubutton class="power">
      <label class="glyph" label={"\uf011"} />
      <popover $={(self) => (pop = self)} hasArrow={false}>
        <box orientation={Gtk.Orientation.VERTICAL} class="menu">
          {item("\uf023", "Lock", ["loginctl", "lock-session"])}
          {item("\uf186", "Suspend", ["systemctl", "suspend"])}
          {item("\uf08b", "Log out", ["hyprctl", "dispatch", "hl.dsp.exit()"])}
          {item("\uf021", "Restart", ["systemctl", "reboot"])}
          {item("\uf011", "Shut down", ["systemctl", "poweroff"])}
        </box>
      </popover>
    </menubutton>
  )
}

export default function Bar(gdkmonitor: Gdk.Monitor) {
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor

  return (
    <window
      visible
      name="bar"
      namespace="bar"
      class="Bar"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={TOP | LEFT | RIGHT}
      application={app}
    >
      <centerbox class="body">
        <box $type="start">
          <button class="edge" onClicked={() => toggleLauncher()}>
            <label class="glyph" label={"\uf303"} />
          </button>
          <Sep />
          <Workspaces />
        </box>
        <box $type="center">
          <Clock />
          <Sep />
          <Notifications />
        </box>
        <box $type="end" class="end">
          <Wifi />
          <Bluetooth />
          <Sep />
          <Battery />
          <Sep />
          <Volume />
          <Sep />
          <Caffeine />
          <Power />
        </box>
      </centerbox>
    </window>
  )
}