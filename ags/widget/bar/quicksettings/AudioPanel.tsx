import { Gtk } from "ags/gtk4"
import { Accessor, createBinding, createComputed, For, onCleanup } from "ags"
import Pango from "gi://Pango"
import AstalWp from "gi://AstalWp?version=0.1"
import Icon from "../../common/Icon"
import { Panel, Row, Section } from "./Panel"

type Endpoint = AstalWp.Endpoint
type Stream = AstalWp.Stream

const full = (n: AstalWp.Node) => n.description || n.name || "Unknown"

// ALSA names every port "<card name> <port> (Stereo)": drop the words all of them share
// and the channel suffix, leaving "Speaker", "HDMI / DisplayPort 1 Output", "Digital Microphone"
function shortNames(nodes: AstalWp.Node[]) {
  const words = nodes.map((n) => full(n).split(" "))
  let k = 0
  if (words.length > 1)
    while (words.every((w) => k < w.length - 1 && w[k] === words[0][k])) k++
  return new Map(
    nodes.map((n, i) => [n, words[i].slice(k).join(" ").replace(/ \((Stereo|Mono)\)$/, "")]),
  )
}

// HDMI / DisplayPort sinks are screens; anything with a headset icon or name is headphones
function outputIcon(e: Endpoint) {
  const s = `${e.icon} ${e.description} ${e.name}`.toLowerCase()
  if (/hdmi|displayport/.test(s)) return "tv"
  if (/head(set|phone)|bluez/.test(s)) return "headphones"
  return "speaker"
}

function DeviceRow({ e, icon, names }: { e: Endpoint; icon: string; names: Accessor<Map<AstalWp.Node, string>> }) {
  const selected = createBinding(e, "isDefault")
  return (
    <Row
      icon={icon}
      title={names.as((m) => m.get(e) ?? full(e))}
      selected={selected}
      end={
        <box visible={selected}>
          <Icon name="check" class="pnl-row-check" />
        </box>
      }
      onClick={() => e.set_is_default(true)}
    />
  )
}

// app tile · name / 6px volume track
function AppRow({ s }: { s: Stream }) {
  const volume = createBinding(s, "volume")
  const name = s.get_pw_property("application.name") || s.name || s.description || "App"
  return (
    <box class="pnl-app" spacing={12}>
      <label class="pnl-app-tile" valign={Gtk.Align.CENTER} label={name.charAt(0).toUpperCase()} />
      <box orientation={Gtk.Orientation.VERTICAL} hexpand spacing={6}>
        <label class="pnl-app-name" xalign={0} ellipsize={Pango.EllipsizeMode.END} label={name} />
        <Gtk.Scale
          class="pnl-app-vol"
          hexpand
          drawValue={false}
          $={(self) => {
            self.set_range(0, 1)
            self.set_value(volume.get())
            onCleanup(
              volume.subscribe(() => {
                if (Math.abs(self.get_value() - volume.get()) > 0.005) self.set_value(volume.get())
              }),
            )
            self.connect("change-value", (_, _scroll, v) => {
              s.volume = Math.max(0, Math.min(1, v))
              return false
            })
          }}
        />
      </box>
    </box>
  )
}

export default function AudioPanel() {
  const audio = AstalWp.get_default()!.audio
  const byName = (l: Endpoint[] | null) => [...(l ?? [])].sort((a, b) => full(a).localeCompare(full(b)))
  const speakers = createBinding(audio, "speakers").as(byName)
  const mics = createBinding(audio, "microphones").as(byName)
  const names = createComputed(() => shortNames([...speakers(), ...mics()]))
  const apps = createBinding(audio, "streams").as((l) =>
    (l ?? []).filter((s) => s.mediaClass === AstalWp.MediaClass.STREAM_OUTPUT_AUDIO),
  )

  return (
    <Panel>
      <Section label="Output" first />
      <box orientation={Gtk.Orientation.VERTICAL} spacing={4}>
        <For each={speakers}>
          {(e: Endpoint) => <DeviceRow e={e} icon={outputIcon(e)} names={names} />}
        </For>
      </box>
      <Section label="Input" />
      <box orientation={Gtk.Orientation.VERTICAL} spacing={4}>
        <For each={mics}>{(e: Endpoint) => <DeviceRow e={e} icon="mic" names={names} />}</For>
      </box>
      <box orientation={Gtk.Orientation.VERTICAL} spacing={4} visible={apps.as((l) => l.length > 0)}>
        <Section label="Applications" />
        <box orientation={Gtk.Orientation.VERTICAL} spacing={4}>
          <For each={apps}>{(s: Stream) => <AppRow s={s} />}</For>
        </box>
      </box>
    </Panel>
  )
}
