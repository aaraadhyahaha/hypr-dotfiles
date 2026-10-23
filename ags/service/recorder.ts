import GLib from "gi://GLib"
import { createState } from "ags"
import { interval } from "ags/time"
import { subprocess, type Process } from "ags/process"

// Screen recording through wf-recorder. One recording at a time; the Control Center tile
// and the bar indicator both read `recording` / `elapsed` and call `toggleRecording`.

const DIR = `${GLib.get_home_dir()}/Videos/Recordings`
const stamp = () => GLib.DateTime.new_now_local().format("%Y%m%d_%H%M%S")!

export const [recording, setRecording] = createState(false)
export const [elapsed, setElapsed] = createState(0) // seconds

let proc: Process | null = null
let tick: ReturnType<typeof interval> | null = null

const finish = () => {
  proc = null
  tick?.cancel()
  tick = null
  setRecording(false)
  setElapsed(0)
}

// geometry: wf-recorder's "x,y WxH" (none = the whole output); audio: the default source
export function startRecording({ geometry, audio = false }: { geometry?: string; audio?: boolean } = {}) {
  if (proc) return
  GLib.mkdir_with_parents(DIR, 0o755)
  const args = ["wf-recorder", "-f", `${DIR}/rec_${stamp()}.mp4`]
  if (geometry) args.push("-g", geometry)
  if (audio) args.push("-a")
  try {
    proc = subprocess(args, () => {}, () => {})
  } catch (e) {
    console.error(`recorder: ${e}`)
    return
  }
  proc.connect("exit", finish)
  const t0 = GLib.get_monotonic_time()
  setElapsed(0)
  setRecording(true)
  tick = interval(1000, () => setElapsed(Math.floor((GLib.get_monotonic_time() - t0) / 1e6)))
}

// SIGINT lets wf-recorder finalise the file
export const stopRecording = () => proc?.signal(2)

export const toggleRecording = () => (proc ? stopRecording() : startRecording())

// 00:42, 1:02:03
export function fmtElapsed(s: number) {
  const p = (n: number) => String(n).padStart(2, "0")
  const h = Math.floor(s / 3600)
  return h ? `${h}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}` : `${p(Math.floor(s / 60))}:${p(s % 60)}`
}
