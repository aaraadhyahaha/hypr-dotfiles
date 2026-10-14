## Theming (read before touching any style)

- DESIGN.md tells you everything regarding the colors
- Colors come from matugen, which regenerates `colors.scss` when the wallpaper changes.
  NEVER edit `colors.scss` by hand. To add a color role, edit the matugen template.
- Current variables: $surface, $fg, $accent, $accent-fg, $accent-2, $error, $bar.
- Hard rules:
  1. No hardcoded hex/rgb values anywhere in widget styles. Use the variables only.
  2. No new color variables without asking. Propose the role first.
  3. Derive hover/active/disabled/border states from existing variables with Sass
     (rgba(), mix(), color.adjust()), never new literals.
  4. Text on $accent uses $accent-fg. Never use $fg on $accent.
- Palette changes with the wallpaper, so every visual change must hold up on:
  very dark, very bright, low-saturation, and highly saturated wallpapers.
  Screenshot at least a dark and a bright case before calling it done.
- $bar is translucent (alpha 0.55). Text over it must stay legible on bright wallpapers.
- Styling is GTK4 CSS (via SCSS), not web CSS. Verify unfamiliar properties against GTK docs.
- Reload flow: <TODO: how SCSS is compiled and how the shell reloads after matugen runs>
