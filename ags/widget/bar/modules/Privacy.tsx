import { Gtk } from "ags/gtk4"
import { For } from "ags"
import { privacy, toggleMicMute } from "../../../service/privacy"
import type { Kind } from "../../../service/privacyModel"
import Icon from "../../common/Icon"
import { Motion, ENTER, onShow } from "../../common/motion"

// Only exists while another app captures the mic, camera or screen. Tinted by the most
// sensitive kind in use; the popover lists who uses what and mutes the mic.

const KIND: Record<Kind, { icon: string; text: string }> = {
  screen: { icon: "screen_share", text: "Screen" },
  camera: { icon: "videocam", text: "Camera" },
  mic: { icon: "mic", text: "Microphone" },
}

export default function Privacy() {
  let motion: Motion

  const kindIcon = (k: Kind) => (
    <box visible={privacy.as((p) => p[k])}>
      <Icon name={k === "mic" ? privacy.as((p) => (p.micMuted ? "mic_off" : "mic")) : KIND[k].icon} class={k} />
    </box>
  )

  return (
    <menubutton
      class={privacy.as((p) => `privacy ${p.level}${p.micMuted ? " muted" : ""}`)}
      visible={privacy.as((p) => p.level !== "none")}
      tooltipText={privacy.as((p) => p.apps.map((a) => a.app).join(", "))}
    >
      <box spacing={6}>
        <box class="rec-dot" valign={Gtk.Align.CENTER} />
        {kindIcon("screen")}
        {kindIcon("camera")}
        {kindIcon("mic")}
      </box>
      <popover
        class="qs-pop"
        hasArrow={false}
        $={(self: Gtk.Popover) => onShow(self, motion, ENTER.popover)}
      >
        <Motion origin="top" $={(self) => (motion = self)}>
          <box orientation={Gtk.Orientation.VERTICAL} class="menu privacy-menu" spacing={2}>
            <For each={privacy.as((p) => p.apps)}>
              {(a) => (
                <box class="privacy-row" spacing={12}>
                  <Icon name={KIND[a.kinds[0]].icon} class={a.kinds[0]} />
                  <label label={a.app} xalign={0} hexpand />
                  <label class="privacy-kinds" label={a.kinds.map((k) => KIND[k].text).join(" · ")} />
                </box>
              )}
            </For>
            <button
              class="menu-item"
              visible={privacy.as((p) => p.mic)}
              onClicked={toggleMicMute}
            >
              <box spacing={12}>
                <Icon name={privacy.as((p) => (p.micMuted ? "mic_off" : "mic"))} />
                <label label={privacy.as((p) => (p.micMuted ? "Unmute microphone" : "Mute microphone"))} xalign={0} hexpand />
              </box>
            </button>
          </box>
        </Motion>
      </popover>
    </menubutton>
  )
}
