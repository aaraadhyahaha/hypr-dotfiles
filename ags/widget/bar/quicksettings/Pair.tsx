import { Gtk } from "ags/gtk4"
import { Accessor, createState } from "ags"
import Pango from "gi://Pango?version=1.0"

export interface Half {
  icon: string | Accessor<string>
  title: string
  subtitle: Accessor<string>
  active?: Accessor<boolean>
  onToggle?: () => void
  onExpand?: () => void
  list: any
}

function PairTile({ h, expanded, onChev }: {
  h: Half
  expanded: Accessor<boolean>
  onChev: () => void
}) {
  return (
    <box
      class={h.active ? h.active.as((a) => (a ? "qs-half on" : "qs-half")) : "qs-half"}
      hexpand
    >
      <button
        class="qs-half-main"
        hexpand
        onClicked={() => (h.onToggle ? h.onToggle() : onChev())}
      >
        <box>
          <image iconName={h.icon} />
          <box orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} hexpand>
            <label class="qs-name" xalign={0} label={h.title} />
            <label
              class="qs-sub"
              xalign={0}
              maxWidthChars={10}
              ellipsize={Pango.EllipsizeMode.END}
              label={h.subtitle}
            />
          </box>
        </box>
      </button>
      <button class="qs-half-chev" onClicked={onChev}>
        <image
          iconName={expanded.as((e) => (e ? "pan-up-symbolic" : "pan-down-symbolic"))}
        />
      </button>
    </box>
  )
}

export default function Pair({ a, b }: { a: Half; b: Half }) {
  const [open, setOpen] = createState("")

  const flip = (k: string, h: Half) => {
    const next = open.get() === k ? "" : k
    setOpen(next)
    if (next) h.onExpand?.()
  }

  return (
    <box class="qs-pair" orientation={Gtk.Orientation.VERTICAL}>
      <box homogeneous>
        <PairTile h={a} expanded={open.as((o) => o === "a")} onChev={() => flip("a", a)} />
        <PairTile h={b} expanded={open.as((o) => o === "b")} onChev={() => flip("b", b)} />
      </box>
      <revealer
        transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
        transitionDuration={250}
        revealChild={open.as((o) => o === "a")}
      >
        {a.list}
      </revealer>
      <revealer
        transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
        transitionDuration={250}
        revealChild={open.as((o) => o === "b")}
      >
        {b.list}
      </revealer>
    </box>
  )
}
