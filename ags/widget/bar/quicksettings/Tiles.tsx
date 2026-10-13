import { Gtk } from "ags/gtk4"
import { createBinding, createState } from "ags"
import { createPoll } from "ags/time"
import { execAsync } from "ags/process"
import AstalWp from "gi://AstalWp?version=0.1"
import AstalNotifd from "gi://AstalNotifd?version=0.1"
import Tile from "./Tile"

export default function Tiles() {
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
