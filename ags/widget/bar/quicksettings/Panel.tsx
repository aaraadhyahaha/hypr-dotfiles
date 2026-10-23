import { Gtk } from "ags/gtk4"
import { Accessor } from "ags"
import Pango from "gi://Pango"
import Icon from "../../common/Icon"
import Switch from "./Switch"

// building blocks of the Wi-Fi / Bluetooth / Audio panels (styles in _popovers.scss)

const cls = (base: string, on?: Accessor<boolean>) =>
  on ? on.as((o) => (o ? `${base} selected` : base)) : base

// 340px glass panel; `title` with a switch heads the Wi-Fi and Bluetooth panels
export function Panel({ title, on, onToggle, children }: {
  title?: string
  on?: Accessor<boolean>
  onToggle?: () => void
  children?: JSX.Element | JSX.Element[]
}) {
  return (
    <box class="pnl" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
      {title && (
        <box class="pnl-head">
          <label class="pnl-title" xalign={0} hexpand label={title} />
          {on && onToggle && <Switch on={on} onToggle={onToggle} />}
        </box>
      )}
      {children}
    </box>
  )
}

// icon · title / sub · trailing; selected = selection colors
export function Row({ icon, title, sub, end, selected, onClick }: {
  icon: string | Accessor<string>
  title: string | Accessor<string>
  sub?: string | Accessor<string>
  end?: JSX.Element
  selected?: Accessor<boolean>
  onClick?: () => void
}) {
  return (
    <button class={cls("pnl-row", selected)} onClicked={() => onClick?.()}>
      <box spacing={10}>
        <Icon name={icon} fill class="pnl-row-icon" />
        <box orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} hexpand spacing={2}>
          <label
            class="pnl-row-title"
            xalign={0}
            maxWidthChars={24}
            ellipsize={Pango.EllipsizeMode.END}
            label={title}
          />
          {sub !== undefined && <label class="pnl-row-sub" xalign={0} label={sub} />}
        </box>
        {end}
      </box>
    </button>
  )
}

export const Section = ({ label, first }: { label: string; first?: boolean }) => (
  <label class={first ? "pnl-section first" : "pnl-section"} xalign={0} label={label} />
)

export const Sep = () => <box class="pnl-sep" />

// a scrolling list that grows to its content, up to `max` px
export function List({ max = 320, children }: { max?: number; children?: JSX.Element | JSX.Element[] }) {
  return (
    <Gtk.ScrolledWindow
      hscrollbarPolicy={Gtk.PolicyType.NEVER}
      propagateNaturalHeight
      maxContentHeight={max}
    >
      <box orientation={Gtk.Orientation.VERTICAL} spacing={4}>
        {children}
      </box>
    </Gtk.ScrolledWindow>
  )
}
