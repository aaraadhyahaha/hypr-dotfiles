import { Gtk } from "ags/gtk4"
import { createBinding, createComputed, With } from "ags"
import Pango from "gi://Pango"
import AstalMpris from "gi://AstalMpris"
import { pickPlayer } from "../../media/model"

function Mini({ player }: { player: AstalMpris.Player }) {
  const cover = createBinding(player, "coverArt")
  const playing = createBinding(player, "playbackStatus").as(
    (s) => s === AstalMpris.PlaybackStatus.PLAYING,
  )
  const artist = createBinding(player, "artist").as((a) =>
    a ? `${a} · ${player.identity}` : player.identity,
  )

  return (
    <box class="cc-card cc-media" spacing={12}>
      <box class="cc-cover" valign={Gtk.Align.CENTER} overflow={Gtk.Overflow.HIDDEN}>
        <image pixelSize={44} file={cover.as((c) => c || "")} visible={cover.as(Boolean)} />
        <image
          class="cc-cover-fallback"
          hexpand
          visible={cover.as((c) => !c)}
          iconName="audio-x-generic-symbolic"
        />
      </box>
      <box orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} hexpand spacing={3}>
        <label
          class="cc-name"
          xalign={0}
          maxWidthChars={18}
          ellipsize={Pango.EllipsizeMode.END}
          label={createBinding(player, "title").as((t) => t || player.identity)}
        />
        <label
          class="cc-media-artist"
          xalign={0}
          maxWidthChars={22}
          ellipsize={Pango.EllipsizeMode.END}
          label={artist}
        />
      </box>
      <button class="cc-media-btn" valign={Gtk.Align.CENTER} onClicked={() => player.previous()}>
        <image iconName="media-skip-backward-symbolic" />
      </button>
      <button class="cc-media-play" valign={Gtk.Align.CENTER} onClicked={() => player.play_pause()}>
        <image
          iconName={playing.as((p) => (p ? "media-playback-pause-symbolic" : "media-playback-start-symbolic"))}
        />
      </button>
      <button class="cc-media-btn" valign={Gtk.Align.CENTER} onClicked={() => player.next()}>
        <image iconName="media-skip-forward-symbolic" />
      </button>
    </box>
  )
}

// the playing player, else the first; hidden with no player
export default function MediaMini() {
  const players = createBinding(AstalMpris.get_default(), "players")
  const current = createComputed(() => pickPlayer(players()))

  return (
    <box visible={current.as(Boolean)} orientation={Gtk.Orientation.VERTICAL}>
      <With value={current}>{(p) => p && <Mini player={p} />}</With>
    </box>
  )
}
