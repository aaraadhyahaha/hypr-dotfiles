import { Accessor } from "ags"

export default function Tile({ icon, glyph, label, on, onClick }: {
  icon?: string
  glyph?: string
  label: string
  on: Accessor<boolean>
  onClick: () => void
}) {
  return (
    <button class={on.as((o) => (o ? "qs-tile on" : "qs-tile"))} onClicked={onClick}>
      <box>
        {glyph ? <label class="glyph" label={glyph} /> : <image iconName={icon} />}
        <label label={label} />
      </box>
    </button>
  )
}
