import { Gdk, Gtk } from "ags/gtk4"
import { Accessor, createState } from "ags"
import { execAsync } from "ags/process"
import { themeMode, themeIdx, setThemeIdx, readFileOr, WALL_FILE } from "./theme"

type Sw = { dark: string; light: string } | null

let swProvider: Gtk.CssProvider | null = null
const getProvider = () => {
  if (!swProvider) {
    swProvider = new Gtk.CssProvider()
    Gtk.StyleContext.add_provider_for_display(
      Gdk.Display.get_default()!,
      swProvider,
      Gtk.STYLE_PROVIDER_PRIORITY_USER + 1,
    )
  }
  return swProvider
}

const pickPrimary = (j: any, m: "dark" | "light"): string | null =>
  j?.colors?.primary?.[m]?.color ?? j?.colors?.[m]?.primary ?? null

const parseSwatches = (out: string): Sw[] =>
  out
    .split("@@@")
    .slice(0, 4)
    .map((chunk): Sw => {
      try {
        const j = JSON.parse(chunk)
        const dark = pickPrimary(j, "dark")
        const light = pickPrimary(j, "light")
        return dark && light ? { dark, light } : null
      } catch (e) {
        return null
      }
    })

const SWATCH_CMD =
  'img="$(cat ~/.cache/last_wall)"; for i in 0 1 2 3; do ' +
  'matugen image "$img" --source-color-index $i --dry-run --json hex 2>/dev/null; ' +
  "echo @@@; done"

export default function Accents({ active }: { active: Accessor<boolean> }) {
  const [sw, setSw] = createState<Sw[]>([null, null, null, null])
  let loaded = ""

  const paint = () => {
    const m = themeMode.get() === "light" ? "light" : "dark"
    const css = sw
      .get()
      .map((s, i) => (s ? `.sw-${i} { background: ${s[m]}; }` : ""))
      .join("\n")
    getProvider().load_from_string(css)
  }
  sw.subscribe(paint)
  themeMode.subscribe(paint)

  const refresh = () => {
    const wall = readFileOr(WALL_FILE, "")
    if (!wall || wall === loaded) return
    loaded = wall
    execAsync(["sh", "-c", SWATCH_CMD])
      .then((out) => setSw(parseSwatches(out)))
      .catch(() => {
        loaded = ""
      })
  }
  active.subscribe(() => {
    if (active.get()) refresh()
  })
  refresh()

  const choose = (n: number) => {
    setThemeIdx(n)
    execAsync([
      "sh", "-c",
      `echo ${n} > ~/.cache/theme_idx && ~/.config/hypr/scripts/theme-apply.sh`,
    ])
  }

  return (
    <box class="qs-accents">
      <label class="qs-name" xalign={0} hexpand label="Accent" />
      {[0, 1, 2, 3].map((n) => (
        <button
          class={themeIdx.as((i) => (i === n ? `qs-sw on sw-${n}` : `qs-sw sw-${n}`))}
          visible={sw.as((l) => !!l[n])}
          onClicked={() => choose(n)}
        />
      ))}
    </box>
  )
}
