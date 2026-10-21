import type { Accessor } from "ags"
import type { Size } from "../layout"

export type Config = Record<string, unknown>

// what every desktop widget is built from; a widget is rebuilt when its size changes
export type WidgetProps = {
  size: Size
  config: Accessor<Config>
  setConfig: (change: Config) => void
  // the desktop can be seen: run tickers and animations only while this is true
  live: Accessor<boolean>
  // rendered in the gallery: no side effects such as opening apps
  preview: boolean
  // a plain click on the card body (one that didn't turn into a drag)
  onActivate: (fn: () => void) => void
}
