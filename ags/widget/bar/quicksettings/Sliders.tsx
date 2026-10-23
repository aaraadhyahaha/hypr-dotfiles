import { Gtk } from "ags/gtk4"
import { Accessor, createBinding, createState, onCleanup } from "ags"
import AstalWp from "gi://AstalWp?version=0.1"
import { open, run, setPage } from "./cc"
import Icon from "../../common/Icon"
import { volumeIcon } from "../../common/icons"

// icon · 0..1 scale · value 0..100 · optional chevron (opens a panel)
function SliderRow({ icon, value, onChange, onChevron }: {
  icon: string | Accessor<string>
  value: Accessor<number>
  onChange: (v: number) => void
  onChevron?: () => void
}) {
  return (
    <box class="cc-slider" spacing={12}>
      <Icon name={icon} fill class="cc-slider-icon" />
      <Gtk.Scale
        hexpand
        drawValue={false}
        $={(self) => {
          self.set_range(0, 1)
          self.set_value(value.get())
          onCleanup(
            value.subscribe(() => {
              if (Math.abs(self.get_value() - value.get()) > 0.005) self.set_value(value.get())
            }),
          )
          // change-value fires only for user input, so syncing from the source never writes back
          self.connect("change-value", (_, _scroll, v) => {
            onChange(Math.max(0, Math.min(1, v)))
            return false
          })
        }}
      />
      <label class="cc-slider-val" xalign={1} label={value.as((v) => `${Math.round(v * 100)}`)} />
      {onChevron ? (
        <button class="cc-slider-chev" onClicked={onChevron}>
          <Icon name="chevron_right" />
        </button>
      ) : (
        <box class="cc-slider-chev" />
      )}
    </box>
  )
}

function Volume() {
  const speaker = AstalWp.get_default()!.audio.defaultSpeaker
  return (
    <SliderRow
      icon={volumeIcon(speaker)}
      value={createBinding(speaker, "volume")}
      onChange={(v) => {
        speaker.volume = v
        if (speaker.mute && v > 0) speaker.mute = false
      }}
      onChevron={() => setPage("audio")}
    />
  )
}

// brightnessctl has no change events: read on open; hidden when there's no backlight
function Brightness() {
  const [level, setLevel] = createState(0)
  const [present, setPresent] = createState(false)
  const read = () =>
    run(["sh", "-c", "brightnessctl -m -c backlight | cut -d, -f4 | tr -d %"]).then((o) => {
      const n = Number(o.trim())
      setPresent(o.trim() !== "" && Number.isFinite(n))
      if (Number.isFinite(n)) setLevel(n / 100)
    })
  read()
  onCleanup(open.subscribe(() => open.get() && read()))

  return (
    <box visible={present}>
      <SliderRow
        icon="light_mode"
        value={level}
        onChange={(v) => {
          setLevel(v)
          run(["brightnessctl", "-c", "backlight", "set", `${Math.max(1, Math.round(v * 100))}%`])
        }}
      />
    </box>
  )
}

export default function Sliders() {
  return (
    <box class="cc-card cc-sliders" orientation={Gtk.Orientation.VERTICAL} spacing={14}>
      <Volume />
      <Brightness />
    </box>
  )
}
