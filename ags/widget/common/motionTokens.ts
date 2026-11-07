// The one place to change the shell's speed and feel (DESIGN.md › Motion).
// After editing, run `npm run motion`: it regenerates styles/_motion.scss and
// ~/.config/hypr/conf/motion.lua; widget/common/motion.ts imports this file directly.
// Then reload Hyprland (`hyprctl reload`) and AGS.

// durations in ms, shared by AGS (MOTION.*, $dur-*) and Hyprland's layer and popup fades
export const DURATIONS = {
  fast: 90, // hover, press, colour
  base: 160, // routine state change ($dur)
  enter: 260, // geometry settling in; Hyprland fades shell layers in over the same time
  exit: 140, // geometry leaving; Hyprland fades shell layers out over the same time
  slide: 320, // toasts arriving from the screen edge
  lift: 70, // the corner note picked up
  swoop: 200, // the corner note thrown off
}

// durations in ms that only Hyprland uses (its windows, not the shell)
export const COMPOSITOR = {
  window: 250, // windowsIn, windowsMove
  workspace: 300, // workspace slide
}

// cubic-bezier(x1, y1, x2, y2), shared by AGS (EASE.*, $ease-*) and Hyprland's curves
export const CURVES = {
  standard: [0.25, 0.1, 0.25, 1], // state changes ($ease, Hyprland "ease")
  out: [0.16, 1, 0.3, 1], // arrivals: fast, then a long quiet settle
  in: [0.4, 0, 1, 1], // departures
  back: [0.34, 1.56, 0.64, 1], // the corner note: overshoots past rest, then settles (the one bounce)
  lift: [0.2, 0, 0, 1], // a quick pick-up
  swoop: [0.55, 0, 1, 0.45], // gathers speed until it's gone
} satisfies Record<string, readonly [number, number, number, number]>
