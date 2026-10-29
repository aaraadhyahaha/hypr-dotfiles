import { Gtk } from "ags/gtk4"
import { recording, elapsed, recFps, stopRecording, fmtElapsed } from "../../../service/recorder"
import { fpsLabel } from "../../screenshot/model"

// Only exists while wf-recorder runs; click stops it.
export default function Recording() {
  return (
    <button
      class="recording"
      visible={recording}
      tooltipText={recFps.as((f) => `Stop recording · ${fpsLabel(f)}`)}
      onClicked={() => stopRecording()}
    >
      <box spacing={6}>
        <box class="rec-dot" valign={Gtk.Align.CENTER} />
        <label label={elapsed.as(fmtElapsed)} />
      </box>
    </button>
  )
}
