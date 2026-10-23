import { Gtk } from "ags/gtk4"
import { createBinding, createComputed, createState, For, onCleanup, With } from "ags"
import Pango from "gi://Pango"
import AstalMpris from "gi://AstalMpris"
import { Motion, ENTER, MOTION, onShow } from "../common/motion"
import { fmtTime, pickPlayer } from "./model"
import Icon from "../common/Icon"

const playing = (p: AstalMpris.Player) =>
  createBinding(p, "playbackStatus").as((s) => s === AstalMpris.PlaybackStatus.PLAYING)

function Card({ player }: { player: AstalMpris.Player }) {
  const length = createBinding(player, "length")
  const position = createBinding(player, "position")
  const canSeek = createBinding(player, "canSeek")
  const seekable = createComputed(() => canSeek() && length() > 0)
  const cover = createBinding(player, "coverArt")
  const album = createBinding(player, "album")
  const shuffle = createBinding(player, "shuffleStatus")
  const loop = createBinding(player, "loopStatus")

  return (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={12}>
      <box spacing={14}>
        <box class="cover" valign={Gtk.Align.START} overflow={Gtk.Overflow.HIDDEN} homogeneous>
          <image
            pixelSize={72}
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
            maxWidthChars={24}
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
          <label
            class="media-album"
            xalign={0}
            maxWidthChars={30}
            ellipsize={Pango.EllipsizeMode.END}
            visible={album.as(Boolean)}
            label={album.as((a) => a || "")}
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
            // subscriptions outlive the scope unless handed to it; the card is rebuilt per player
            onCleanup(position.subscribe(sync))
            onCleanup(length.subscribe(sync))
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

      <box class="media-controls" halign={Gtk.Align.CENTER} spacing={28}>
        <button
          class={shuffle.as((s) =>
            s === AstalMpris.Shuffle.ON ? "media-ctl side on" : "media-ctl side",
          )}
          valign={Gtk.Align.CENTER}
          tooltipText="Shuffle"
          sensitive={shuffle.as((s) => s !== AstalMpris.Shuffle.UNSUPPORTED)}
          onClicked={() => player.shuffle()}
        >
          <Icon name="shuffle" />
        </button>
        <button
          class="media-ctl skip"
          valign={Gtk.Align.CENTER}
          sensitive={createBinding(player, "canGoPrevious")}
          onClicked={() => player.previous()}
        >
          <Icon name="skip_previous" fill />
        </button>
        <button class="media-ctl main" onClicked={() => player.play_pause()}>
          <Icon name={playing(player).as((p) => (p ? "pause" : "play_arrow"))} fill />
        </button>
        <button
          class="media-ctl skip"
          valign={Gtk.Align.CENTER}
          sensitive={createBinding(player, "canGoNext")}
          onClicked={() => player.next()}
        >
          <Icon name="skip_next" fill />
        </button>
        <button
          class={loop.as((l) =>
            l === AstalMpris.Loop.TRACK || l === AstalMpris.Loop.PLAYLIST
              ? "media-ctl side on"
              : "media-ctl side",
          )}
          valign={Gtk.Align.CENTER}
          tooltipText="Repeat"
          sensitive={loop.as((l) => l !== AstalMpris.Loop.UNSUPPORTED)}
          onClicked={() => player.loop()}
        >
          <Icon name={loop.as((l) => (l === AstalMpris.Loop.TRACK ? "repeat_one" : "repeat"))} />
        </button>
      </box>
    </box>
  )
}

// Bar pill for whatever is playing; hidden when no player is running.
// The menubutton and popover persist; only their contents follow the current player,
// so switching players or pausing never closes an open popover.
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

  let last: string | undefined
  const current = createComputed(() => {
    tick()
    const p = pickPlayer(players(), preferred(), last)
    last = p?.busName
    return p
  })

  let lastScroll = 0
  let motion: Motion

  return (
    <box visible={current.as(Boolean)}>
      <menubutton class="media-pill">
        <box spacing={8}>
          <Gtk.EventControllerScroll
            flags={Gtk.EventControllerScrollFlags.VERTICAL}
            onScroll={(_, _dx, dy) => {
              const now = Date.now()
              if (dy === 0 || now - lastScroll < MOTION.base) return
              lastScroll = now
              const p = current.get()
              dy > 0 ? p?.next() : p?.previous()
            }}
          />
          <Gtk.GestureClick button={2} onPressed={() => current.get()?.play_pause()} />
          <With value={current}>
            {(player) =>
              player && (
                <box spacing={8}>
                  <Icon
                    name={playing(player).as((p) => (p ? "graphic_eq" : "music_note"))}
                    fill
                    class="media-eq"
                  />
                  <label
                    maxWidthChars={28}
                    ellipsize={Pango.EllipsizeMode.END}
                    label={createBinding(player, "title").as((t) => t || player.identity)}
                  />
                  <label
                    class="media-pill-artist"
                    maxWidthChars={20}
                    ellipsize={Pango.EllipsizeMode.END}
                    visible={createBinding(player, "artist").as(Boolean)}
                    label={createBinding(player, "artist").as((a) => a || "")}
                  />
                </box>
              )
            }
          </With>
        </box>
        <popover class="qs-pop" hasArrow={false} $={(self) => onShow(self, motion, ENTER.popover)}>
          <Motion origin="top" $={(self) => (motion = self)}>
            <box class="media-card" orientation={Gtk.Orientation.VERTICAL} spacing={12}>
              {/* own box: With re-inserts its child, which would otherwise land after the chips */}
              <box orientation={Gtk.Orientation.VERTICAL}>
                <With value={current}>{(player) => player && <Card player={player} />}</With>
              </box>
              <box
                class="players"
                halign={Gtk.Align.START}
                spacing={6}
                visible={players.as((l) => l.length > 1)}
              >
                <For each={players}>
                  {(p) => (
                    <button
                      class={current.as((c) => (c === p ? "player-chip on" : "player-chip"))}
                      onClicked={() => setPreferred(p.busName)}
                    >
                      <label label={p.identity} />
                    </button>
                  )}
                </For>
              </box>
            </box>
          </Motion>
        </popover>
      </menubutton>
    </box>
  )
}
