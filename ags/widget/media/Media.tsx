import { Gtk } from "ags/gtk4"
import { createBinding, createComputed, createState, With } from "ags"
import Pango from "gi://Pango"
import AstalMpris from "gi://AstalMpris"
import Sep from "../bar/common/Sep"
import { fmtTime, pickPlayer } from "./model"

const G = { play: "", pause: "", prev: "", next: "", note: "" }

const playing = (p: AstalMpris.Player) =>
  createBinding(p, "playbackStatus").as((s) => s === AstalMpris.PlaybackStatus.PLAYING)

function Card({
  player,
  players,
  pick,
}: {
  player: AstalMpris.Player
  players: AstalMpris.Player[]
  pick: (busName: string) => void
}) {
  const length = createBinding(player, "length")
  const position = createBinding(player, "position")
  const canSeek = createBinding(player, "canSeek")
  const seekable = createComputed(() => canSeek() && length() > 0)
  const cover = createBinding(player, "coverArt")

  return (
    <box class="media-card" orientation={Gtk.Orientation.VERTICAL}>
      <box spacing={12}>
        <box class="cover" valign={Gtk.Align.START} overflow={Gtk.Overflow.HIDDEN}>
          <image
            pixelSize={64}
            file={cover.as((c) => c || "")}
            visible={cover.as(Boolean)}
          />
          <image
            class="cover-fallback"
            visible={cover.as((c) => !c)}
            iconName={player.entry || "audio-x-generic-symbolic"}
          />
        </box>
        <box orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} hexpand>
          <label
            class="media-title"
            xalign={0}
            maxWidthChars={26}
            ellipsize={Pango.EllipsizeMode.END}
            label={createBinding(player, "title").as((t) => t || player.identity)}
          />
          <label
            class="media-artist"
            xalign={0}
            maxWidthChars={26}
            ellipsize={Pango.EllipsizeMode.END}
            label={createBinding(player, "artist").as((a) => a || "")}
          />
        </box>
      </box>

      <box class="seek" orientation={Gtk.Orientation.VERTICAL} visible={seekable}>
        <Gtk.Scale
          drawValue={false}
          $={(self) => {
            const sync = () => {
              self.set_range(0, Math.max(1, player.length))
              self.set_value(player.position)
            }
            sync()
            position.subscribe(sync)
            length.subscribe(sync)
            // change-value fires only for user input, so syncing never seeks
            self.connect("change-value", (_, _scroll, v) => {
              player.position = v
              return false
            })
          }}
        />
        <box>
          <label class="media-time" hexpand xalign={0} label={position.as(fmtTime)} />
          <label class="media-time" xalign={1} label={length.as(fmtTime)} />
        </box>
      </box>

      <box class="media-controls" halign={Gtk.Align.CENTER} spacing={8}>
        <button
          class="media-ctl"
          sensitive={createBinding(player, "canGoPrevious")}
          onClicked={() => player.previous()}
        >
          <label class="glyph" label={G.prev} />
        </button>
        <button
          class={playing(player).as((p) => (p ? "media-ctl main on" : "media-ctl main"))}
          onClicked={() => player.play_pause()}
        >
          <label class="glyph" label={playing(player).as((p) => (p ? G.pause : G.play))} />
        </button>
        <button
          class="media-ctl"
          sensitive={createBinding(player, "canGoNext")}
          onClicked={() => player.next()}
        >
          <label class="glyph" label={G.next} />
        </button>
      </box>

      <box class="players" halign={Gtk.Align.CENTER} spacing={4} visible={players.length > 1}>
        {players.map((p) => (
          <button
            class={p === player ? "player-chip on" : "player-chip"}
            onClicked={() => pick(p.busName)}
          >
            <label label={p.identity} />
          </button>
        ))}
      </box>
    </box>
  )
}

// Bar pill for whatever is playing; hidden when no player is running.
export default function Media() {
  const mpris = AstalMpris.get_default()
  const players = createBinding(mpris, "players")
  const [preferred, setPreferred] = createState("")

  // playback status changes don't touch the list, so re-pick on each player's status too
  const [tick, setTick] = createState(0)
  const watch = (list: AstalMpris.Player[]) =>
    list.forEach((p) => p.connect("notify::playback-status", () => setTick(tick.get() + 1)))
  watch(players.get())
  mpris.connect("player-added", (_, p: AstalMpris.Player) => watch([p]))

  const current = createComputed(() => {
    tick()
    return pickPlayer(players(), preferred())
  })

  return (
    <box visible={current.as(Boolean)}>
      <Sep />
      <With value={current}>
        {(player) =>
          player && (
            <menubutton class="media-pill">
              <box spacing={8}>
                <Gtk.EventControllerScroll
                  flags={Gtk.EventControllerScrollFlags.VERTICAL}
                  onScroll={(_, _dx, dy) => (dy > 0 ? player.next() : player.previous())}
                />
                <Gtk.GestureClick button={2} onPressed={() => player.play_pause()} />
                <label
                  class="glyph"
                  label={playing(player).as((p) => (p ? G.pause : G.note))}
                />
                <label
                  maxWidthChars={28}
                  ellipsize={Pango.EllipsizeMode.END}
                  label={createBinding(player, "title").as((t) => t || player.identity)}
                />
              </box>
              <popover class="qs-pop" hasArrow={false}>
                <With value={players}>
                  {(list) => <Card player={player} players={list} pick={setPreferred} />}
                </With>
              </popover>
            </menubutton>
          )
        }
      </With>
    </box>
  )
}
