import { Gtk } from "ags/gtk4"
import { recording, elapsed, stopRecording, fmtElapsed } from "../../../service/recorder"

// Only exists while wf-recorder runs; click stops it.
export default function Recording() {
  return (
    <button
      class="recording"
      visible={recording}
      tooltipText="Stop recording"
      onClicked={() => stopRecording()}
    >
      <box spacing={6}>
        <box class="rec-dot" valign={Gtk.Align.CENTER} />
        <label label={elapsed.as(fmtElapsed)} />
      </box>
    </button>
  )
}
