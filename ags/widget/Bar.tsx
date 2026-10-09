import app from "ags/gtk4/app"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import { createBinding, createState, For, Accessor, With } from "ags"
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
import AstalTray from "gi://AstalTray?version=0.1"
import GLib from "gi://GLib"
import { readFile } from "ags/file"
import PomodoroPill from "./PomodoroPill"

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

function WindowTitle() {
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

const HIDDEN = /nm-applet|network|blueman/i

function Tray() {
  const tray = AstalTray.get_default()
  const items = createBinding(tray, "items").as((l) =>
    l.filter((i) => !HIDDEN.test(`${i.id} ${i.title}`)),
  )

  return (
    <box class="tray" visible={items.as((l) => l.length > 0)}>
      <For each={items}>
        {(item) => (
          <menubutton
            $={(self) => {
              self.insert_action_group("dbusmenu", item.actionGroup)

              // left click = activate the app, right click = its menu
              const left = new Gtk.GestureClick({ button: 1 })
              left.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
              left.connect("pressed", () => {
                left.set_state(Gtk.EventSequenceState.CLAIMED)
                item.activate(0, 0)
              })
              self.add_controller(left)

              const right = new Gtk.GestureClick({ button: 3 })
              right.connect("pressed", () => self.popup())
              self.add_controller(right)
            }}
            tooltipMarkup={createBinding(item, "tooltipMarkup")}
            menuModel={createBinding(item, "menuModel")}
          >
            <image gicon={createBinding(item, "gicon")} />
          </menubutton>
        )}
      </For>
      <Sep />
    </box>
  )
}

function Slider({ icon, value, onChange }: {
  icon: string | Accessor<string>
  value: Accessor<number>
  onChange: (v: number) => void
}) {
  return (
    <box class="qs-slider">
      <image iconName={icon} />
      <Gtk.Scale
        hexpand
        drawValue={false}
        $={(self) => {
          self.set_range(0, 1)
          self.set_value(value.get())
          value.subscribe(() => {
            if (Math.abs(self.get_value() - value.get()) > 0.005) self.set_value(value.get())
          })
          self.connect("value-changed", () => {
            if (Math.abs(self.get_value() - value.get()) > 0.005) onChange(self.get_value())
          })
        }}
      />
    </box>
  )
}

function VolumeSlider() {
  const speaker = AstalWp.get_default()!.audio.defaultSpeaker
  return (
    <Slider
      icon={createBinding(speaker, "volumeIcon")}
      value={createBinding(speaker, "volume")}
      onChange={(v) => (speaker.volume = v)}
    />
  )
}

function BrightnessSlider() {
  const level = createPoll(
    0.5, 1500,
    ["sh", "-c", "brightnessctl -m | cut -d, -f4 | tr -d %"],
    (out) => Number(out) / 100,
  )
  return (
    <Slider
      icon="display-brightness-symbolic"
      value={level}
      onChange={(v) =>
        execAsync(["brightnessctl", "set", `${Math.max(1, Math.round(v * 100))}%`])
      }
    />
  )
}

function Tile({ icon, glyph, label, on, onClick }: {
  icon?: string
  glyph?: string
  label: string
  on: Accessor<boolean>
  onClick: () => void
}) {
  return (
    <button class={on.as((o) => (o ? "qs-tile on" : "qs-tile"))} onClicked={onClick}>
      <box>
        {glyph ? <label class="glyph" label={glyph} /> : <image iconName={icon} />}
        <label label={label} />
      </box>
    </button>
  )
}

function Tiles() {
  const notifd = AstalNotifd.get_default()
  const mic = AstalWp.get_default()!.audio.defaultMicrophone
  const micMuted = mic ? createBinding(mic, "mute") : createState(false)[0]
  const night = createPoll("0", 2000, [
    "sh", "-c", "pgrep -x hyprsunset >/dev/null && echo 1 || echo 0",
  ])
  const plane = createPoll("0", 2000, [
    "sh", "-c", "rfkill list all | grep -q 'Soft blocked: no' && echo 0 || echo 1",
  ])

  return (
    <box class="qs-tiles" orientation={Gtk.Orientation.VERTICAL}>
      <box homogeneous>
        <Tile
          icon="night-light-symbolic"
          label="Night Light"
          on={night.as((s) => s.trim() === "1")}
          onClick={() =>
            execAsync([
              "sh", "-c",
              night.get().trim() === "1"
                ? "pkill -x hyprsunset"
                : "setsid hyprsunset -t 4000 >/dev/null 2>&1 &",
            ])
          }
        />
        <Tile
          icon="notifications-disabled-symbolic"
          label="DND"
          on={createBinding(notifd, "dontDisturb")}
          onClick={() => (notifd.dontDisturb = !notifd.dontDisturb)}
        />
      </box>
      <box homogeneous>
        <Tile
          icon="airplane-mode-symbolic"
          label="Airplane"
          on={plane.as((s) => s.trim() === "1")}
          onClick={() =>
            execAsync(["rfkill", plane.get().trim() === "1" ? "unblock" : "block", "all"])
          }
        />
        <Tile
          icon="microphone-sensitivity-muted-symbolic"
          label="Mic Mute"
          on={micMuted}
          onClick={() => mic && (mic.mute = !mic.mute)}
        />
      </box>
    </box>
  )
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const deg = (v: number) => `${Math.round(v * 100)}°C`

function Stat({ label, source, format, active }: {
  label: string
  source: Accessor<number>
  format: (v: number) => string
  active: Accessor<boolean>
}) {
  const HISTORY = 40
  const history: number[] = new Array(HISTORY).fill(0)
  const [text, setText] = createState("--")

  return (
    <box class="qs-stat" orientation={Gtk.Orientation.VERTICAL} hexpand>
      <box>
        <label class="qs-stat-name" xalign={0} hexpand label={label} />
        <label class="qs-stat-val" label={text} />
      </box>
      <Gtk.DrawingArea
        class="qs-graph"
        hexpand
        heightRequest={44}
        $={(self) => {
          self.set_draw_func((_area: Gtk.DrawingArea, cr: any, w: number, h: number) => {
            const c = self.get_color()
            const step = w / (HISTORY - 1)
            const ys = history.map((v) => h - 1 - v * (h - 3))

            const trace = () => {
              cr.moveTo(0, ys[0])
              for (let i = 1; i < ys.length; i++) {
                const x0 = (i - 1) * step
                const x1 = i * step
                const mx = (x0 + x1) / 2
                cr.curveTo(mx, ys[i - 1], mx, ys[i], x1, ys[i])
              }
            }

            trace()
            cr.lineTo(w, h)
            cr.lineTo(0, h)
            cr.closePath()
            cr.setSourceRGBA(c.red, c.green, c.blue, 0.15)
            cr.fill()

            trace()
            cr.setLineWidth(1.6)
            cr.setSourceRGBA(c.red, c.green, c.blue, 0.9)
            cr.stroke()
          })

          const push = () => {
            const v = Math.min(1, Math.max(0, source.get()))
            history.push(v)
            history.shift()
            setText(format(v))
            self.queue_draw()
          }

          let unsub: (() => void) | null = null
          const sync = () => {
            if (active.get()) {
              if (!unsub) {
                push()
                unsub = source.subscribe(push)
              }
            } else if (unsub) {
              unsub()
              unsub = null
            }
          }
          active.subscribe(sync)
          sync()
        }}
      />
    </box>
  )
}

function Resources({ active }: { active: Accessor<boolean> }) {
  let last = { total: 0, idle: 0 }

  const cpu = createPoll(0, 1000, ["head", "-n1", "/proc/stat"], (out) => {
    const n = out.trim().split(/\s+/).slice(1).map(Number)
    const idle = n[3] + (n[4] || 0)
    const total = n.slice(0, 8).reduce((a, b) => a + b, 0)
    const first = last.total === 0
    const dt = total - last.total
    const di = idle - last.idle
    last = { total, idle }
    return first || dt <= 0 ? 0 : 1 - di / dt
  })

  const ram = createPoll(
    0, 2000,
    ["sh", "-c", "free -b | awk '/Mem:/ {print ($2-$7)/$2}'"],
    (out) => Number(out) || 0,
  )

  const disk = createPoll(
    0, 30000,
    ["sh", "-c", "df --output=pcent / | tail -1 | tr -d ' %'"],
    (out) => (Number(out) || 0) / 100,
  )

  const temp = createPoll(
    0, 3000,
    ["sh", "-c", "cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | sort -n | tail -1"],
    (out) => (Number(out) || 0) / 100000,
  )

  return (
    <box class="qs-stats" orientation={Gtk.Orientation.VERTICAL}>
      <box homogeneous>
        <Stat label="CPU" source={cpu} format={pct} active={active} />
        <Stat label="RAM" source={ram} format={pct} active={active} />
      </box>
      <box homogeneous>
        <Stat label="Disk" source={disk} format={pct} active={active} />
        <Stat label="Temp" source={temp} format={deg} active={active} />
      </box>
    </box>
  )
}

interface Half {
  icon: string | Accessor<string>
  title: string
  subtitle: Accessor<string>
  active?: Accessor<boolean>
  onToggle?: () => void
  onExpand?: () => void
  list: any
}

function PairTile({ h, expanded, onChev }: {
  h: Half
  expanded: Accessor<boolean>
  onChev: () => void
}) {
  return (
    <box
      class={h.active ? h.active.as((a) => (a ? "qs-half on" : "qs-half")) : "qs-half"}
      hexpand
    >
      <button
        class="qs-half-main"
        hexpand
        onClicked={() => (h.onToggle ? h.onToggle() : onChev())}
      >
        <box>
          <image iconName={h.icon} />
          <box orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} hexpand>
            <label class="qs-name" xalign={0} label={h.title} />
            <label
              class="qs-sub"
              xalign={0}
              maxWidthChars={10}
              ellipsize={Pango.EllipsizeMode.END}
              label={h.subtitle}
            />
          </box>
        </box>
      </button>
      <button class="qs-half-chev" onClicked={onChev}>
        <image
          iconName={expanded.as((e) => (e ? "pan-up-symbolic" : "pan-down-symbolic"))}
        />
      </button>
    </box>
  )
}

function Pair({ a, b }: { a: Half; b: Half }) {
  const [open, setOpen] = createState("")

  const flip = (k: string, h: Half) => {
    const next = open.get() === k ? "" : k
    setOpen(next)
    if (next) h.onExpand?.()
  }

  return (
    <box class="qs-pair" orientation={Gtk.Orientation.VERTICAL}>
      <box homogeneous>
        <PairTile h={a} expanded={open.as((o) => o === "a")} onChev={() => flip("a", a)} />
        <PairTile h={b} expanded={open.as((o) => o === "b")} onChev={() => flip("b", b)} />
      </box>
      <revealer
        transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
        transitionDuration={250}
        revealChild={open.as((o) => o === "a")}
      >
        {a.list}
      </revealer>
      <revealer
        transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
        transitionDuration={250}
        revealChild={open.as((o) => o === "b")}
      >
        {b.list}
      </revealer>
    </box>
  )
}

function NetPair() {
  const wifi = AstalNetwork.get_default().wifi!
  const bt = AstalBluetooth.get_default()
  const ssid = createBinding(wifi, "ssid")

  const aps = createBinding(wifi, "accessPoints").as((l) => {
    const seen = new Set<string>()
    return [...l]
      .filter((a) => a.ssid && !seen.has(a.ssid) && seen.add(a.ssid))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 8)
  })
  const devices = createBinding(bt, "devices").as((l) => l.filter((d) => d.paired))

  const wifiList = (
    <box class="qs-list" orientation={Gtk.Orientation.VERTICAL}>
      <For each={aps}>
        {(ap) => (
          <button
            class={ssid.as((s) => (s === ap.ssid ? "qs-item active" : "qs-item"))}
            onClicked={() => execAsync(["nmcli", "device", "wifi", "connect", ap.ssid!])}
          >
            <box>
              <image iconName={ap.iconName} />
              <label hexpand xalign={0} label={ap.ssid ?? ""} />
              <image visible={ap.requiresPassword} iconName="channel-secure-symbolic" />
            </box>
          </button>
        )}
      </For>
    </box>
  )

  const btList = (
    <box class="qs-list" orientation={Gtk.Orientation.VERTICAL}>
      <For each={devices}>
        {(d) => (
          <button
            class={createBinding(d, "connected").as((c) => (c ? "qs-item active" : "qs-item"))}
            onClicked={() =>
              execAsync(["bluetoothctl", d.connected ? "disconnect" : "connect", d.address])
            }
          >
            <box>
              <image iconName={d.icon ? `${d.icon}-symbolic` : "bluetooth-symbolic"} />
              <label hexpand xalign={0} label={d.name} />
            </box>
          </button>
        )}
      </For>
    </box>
  )

  return (
    <Pair
      a={{
        icon: createBinding(wifi, "iconName"),
        title: "Wi-Fi",
        subtitle: ssid.as((s) => s ?? "Not connected"),
        active: createBinding(wifi, "enabled"),
        onToggle: () => (wifi.enabled = !wifi.enabled),
        onExpand: () => wifi.scan(),
        list: wifiList,
      }}
      b={{
        icon: createBinding(bt, "isPowered").as((p) =>
          p ? "bluetooth-active-symbolic" : "bluetooth-disabled-symbolic",
        ),
        title: "Bluetooth",
        subtitle: createBinding(bt, "isConnected").as((c) => (c ? "Connected" : "Not connected")),
        active: createBinding(bt, "isPowered"),
        onToggle: () => bt.toggle(),
        list: btList,
      }}
    />
  )
}

function AudioPair() {
  const audio = AstalWp.get_default()!.audio
  const speakers = createBinding(audio, "speakers").as((l): AstalWp.Endpoint[] => l ?? [])
  const mics = createBinding(audio, "microphones").as((l): AstalWp.Endpoint[] => l ?? [])
  const defSp = createBinding(audio, "defaultSpeaker")
  const defMic = createBinding(audio, "defaultMicrophone")

  const epList = (list: Accessor<AstalWp.Endpoint[]>) => (
    <box class="qs-list" orientation={Gtk.Orientation.VERTICAL}>
      <For each={list}>
        {(ep) => (
          <button
            class={createBinding(ep, "isDefault").as((d) => (d ? "qs-item active" : "qs-item"))}
            onClicked={() => (ep.isDefault = true)}
          >
            <label
              hexpand
              xalign={0}
              maxWidthChars={30}
              ellipsize={Pango.EllipsizeMode.END}
              label={ep.description ?? ""}
            />
          </button>
        )}
      </For>
    </box>
  )

  return (
    <Pair
      a={{
        icon: "audio-speakers-symbolic",
        title: "Output",
        subtitle: defSp.as((d) => d?.description || (d ? "Default" : "None")),
        list: epList(speakers),
      }}
      b={{
        icon: "audio-input-microphone-symbolic",
        title: "Input",
        subtitle: defMic.as((d) => d?.description || (d ? "Default" : "None")),
        list: epList(mics),
      }}
    />
  )
}

const MODE_FILE = `${GLib.get_home_dir()}/.cache/theme_mode`

const IDX_FILE = `${GLib.get_home_dir()}/.cache/theme_idx`
const WALL_FILE = `${GLib.get_home_dir()}/.cache/last_wall`

const readFileOr = (path: string, fallback: string) => {
  try {
    return readFile(path).trim()
  } catch (e) {
    return fallback
  }
}

const [themeMode, setThemeMode] = createState(readFileOr(MODE_FILE, "dark"))
const [themeIdx, setThemeIdx] = createState(Number(readFileOr(IDX_FILE, "0")) || 0)

function ThemeMode() {
  const choose = (m: string) => {
    setThemeMode(m)
    execAsync([
      "sh", "-c",
      `echo ${m} > ~/.cache/theme_mode && ~/.config/hypr/scripts/theme-apply.sh`,
    ])
  }

  return (
    <box class="qs-mode" homogeneous>
      <button
        class={themeMode.as((m) => (m === "light" ? "qs-seg" : "qs-seg on"))}
        onClicked={() => choose("dark")}
      >
        <box halign={Gtk.Align.CENTER}>
          <label class="glyph" label={"\uf186"} />
          <label label="Dark" />
        </box>
      </button>
      <button
        class={themeMode.as((m) => (m === "light" ? "qs-seg on" : "qs-seg"))}
        onClicked={() => choose("light")}
      >
        <box halign={Gtk.Align.CENTER}>
          <label class="glyph" label={"\uf185"} />
          <label label="Light" />
        </box>
      </button>
    </box>
  )
}

type Sw = { dark: string; light: string } | null

let swProvider: Gtk.CssProvider | null = null
const getProvider = () => {
  if (!swProvider) {
    swProvider = new Gtk.CssProvider()
    Gtk.StyleContext.add_provider_for_display(
      Gdk.Display.get_default()!,
      swProvider,
      Gtk.STYLE_PROVIDER_PRIORITY_USER + 1,
    )
  }
  return swProvider
}

const pickPrimary = (j: any, m: "dark" | "light"): string | null =>
  j?.colors?.primary?.[m]?.color ?? j?.colors?.[m]?.primary ?? null

const parseSwatches = (out: string): Sw[] =>
  out
    .split("@@@")
    .slice(0, 4)
    .map((chunk): Sw => {
      try {
        const j = JSON.parse(chunk)
        const dark = pickPrimary(j, "dark")
        const light = pickPrimary(j, "light")
        return dark && light ? { dark, light } : null
      } catch (e) {
        return null
      }
    })

const SWATCH_CMD =
  'img="$(cat ~/.cache/last_wall)"; for i in 0 1 2 3; do ' +
  'matugen image "$img" --source-color-index $i --dry-run --json hex 2>/dev/null; ' +
  "echo @@@; done"

function Accents({ active }: { active: Accessor<boolean> }) {
  const [sw, setSw] = createState<Sw[]>([null, null, null, null])
  let loaded = ""

  const paint = () => {
    const m = themeMode.get() === "light" ? "light" : "dark"
    const css = sw
      .get()
      .map((s, i) => (s ? `.sw-${i} { background: ${s[m]}; }` : ""))
      .join("\n")
    getProvider().load_from_string(css)
  }
  sw.subscribe(paint)
  themeMode.subscribe(paint)

  const refresh = () => {
    const wall = readFileOr(WALL_FILE, "")
    if (!wall || wall === loaded) return
    loaded = wall
    execAsync(["sh", "-c", SWATCH_CMD])
      .then((out) => setSw(parseSwatches(out)))
      .catch(() => {
        loaded = ""
      })
  }
  active.subscribe(() => {
    if (active.get()) refresh()
  })
  refresh()

  const choose = (n: number) => {
    setThemeIdx(n)
    execAsync([
      "sh", "-c",
      `echo ${n} > ~/.cache/theme_idx && ~/.config/hypr/scripts/theme-apply.sh`,
    ])
  }

  return (
    <box class="qs-accents">
      <label class="qs-name" xalign={0} hexpand label="Accent" />
      {[0, 1, 2, 3].map((n) => (
        <button
          class={themeIdx.as((i) => (i === n ? `qs-sw on sw-${n}` : `qs-sw sw-${n}`))}
          visible={sw.as((l) => !!l[n])}
          onClicked={() => choose(n)}
        />
      ))}
    </box>
  )
}

function QuickSettings() {
  const wifi = AstalNetwork.get_default().wifi
  const bt = AstalBluetooth.get_default()
  const speaker = AstalWp.get_default()!.audio.defaultSpeaker
  const [open, setOpen] = createState(false)

  return (
    <menubutton class="qs-btn">
      <box class="qs-pill">
        {wifi && <image iconName={createBinding(wifi, "iconName")} />}
        <image
          iconName={createBinding(bt, "isPowered").as((p) =>
            p ? "bluetooth-active-symbolic" : "bluetooth-disabled-symbolic",
          )}
        />
        <image iconName={createBinding(speaker, "volumeIcon")} />
      </box>
      <popover
        class="qs-pop"
        hasArrow={false}
        $={(self) => self.connect("notify::visible", () => setOpen(self.visible))}
      >
        <revealer
          transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
          transitionDuration={300}
          revealChild={open}
        >
          <box class="qs" orientation={Gtk.Orientation.VERTICAL}>
            <label class="qs-title" xalign={0} label="Quick settings" />
            <VolumeSlider />
            <BrightnessSlider />
            <Tiles />
            <NetPair />
            <AudioPair />
            <ThemeMode />
            <Accents active={open} />
            <Resources active={open} />
          </box>
        </revealer>
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
          <WindowTitle />
        </box>
        <box $type="center">
          <Clock />
          <Sep />
          <Notifications />
        </box>
        <box $type="end" class="end">
          <Tray />
          <Sep />
          <Wifi />
          <Bluetooth />
          <Sep />
          <Battery />
          <Sep />
          <Volume />
          <Sep />
          <PomodoroPill />
          <QuickSettings />
          <Sep />
          <Caffeine />
          <Power />
        </box>
      </centerbox>
    </window>
  )
}