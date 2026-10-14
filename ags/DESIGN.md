## Color roles

| Role | Variable | Use |
|---|---|---|
| Background surface | $surface | Panels, popovers, base layer |
| Bar surface | $bar | Top bar only (translucent) |
| Primary text/icons | $fg | Default content on surfaces |
| Accent | $accent | Primary actions, active states, focus |
| On-accent | $accent-fg | Text/icons on $accent fills |
| Secondary accent | $accent-2 | Secondary highlights, badges |
| Error | $error | Errors, destructive actions, critical battery |

Principles:
- The palette is generated, so design in roles and relationships, not hues.
- Hierarchy comes from tone steps (surface levels) and opacity, not extra colors.
- Interaction states are derived from the base role, never new literals.
- Everything must remain legible across any wallpaper.