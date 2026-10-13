import { Accessor, createBinding, For } from "ags"
import { Gtk } from "ags/gtk4"
import Pango from "gi://Pango?version=1.0"
import AstalWp from "gi://AstalWp?version=0.1"
import Pair from "./Pair"

export default function AudioPair() {
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
