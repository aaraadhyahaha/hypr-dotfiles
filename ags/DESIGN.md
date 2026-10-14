# AGS Design System

This document describes the design system implemented in the AGS (Astonishing GTK Shell) configuration.

## Spacing System

All spacing values use a 4px base unit for consistency:

| Variable | Value | Use Case |
|----------|-------|----------|
| $spacing-0 | 0px | No spacing |
| $spacing-1 | 4px | Small spacing (e.g., input padding) |
| $spacing-2 | 8px | Default spacing (e.g., button padding, margin) |
| $spacing-3 | 12px | Medium spacing (e.g., card padding) |
| $spacing-4 | 16px | Large spacing (e.g., section padding) |
| $spacing-5 | 20px | Extra large spacing (e.g., input min-height) |
| $spacing-6 | 24px | Major section spacing |
| $spacing-7 | 32px | Significant spacing |
| $spacing-8 | 40px | Maximum spacing (e.g., input min-height) |

## Border Radius System

Consistent border-radius values for visual harmony:

| Variable | Value | Use Case |
|----------|-------|----------|
| $radius-xs | 4px | Small radius (e.g., subtle rounding) |
| $radius-sm | 8px | Small-medium radius (e.g., buttons, inputs) |
| $radius-md | 12px | Medium radius (e.g., cards, panels) |
| $radius-lg | 16px | Large radius (e.g., prominent containers) |
| $radius-xl | 20px | Extra large radius |
| $radius-circle | 99px | Fully circular/pill shapes |
| $radius-pill | 999px | Ultra circular (for special effects) |

## Typography System

Systematic font sizes for consistent hierarchy:

| Variable | Value | Use Case |
|----------|-------|----------|
| $font-size-xs | 10px | Tiny text (e.g., captions, subtle labels) |
| $font-size-sm | 11px | Small text (e.g., secondary info) |
| $font-size-base | 12px | Base text size |
| $font-size-lg | 13px | Default UI text (window bar, primary text) |
| $font-size-xl | 14px | Slightly larger text |
| $font-size-2xl | 15px | Medium-large text (e.g., headers, labels) |
| $font-size-3xl | 16px | Large text (e.g., section headers) |
| $font-size-pomo | 34px | Pomodoro timer large display |

## Color System

Defined in colors.scss and referenced throughout:

- `$surface`: Base background (#121318)
- `$fg`: Foreground/text (#e3e2e9)
- `$accent`: Primary accent (#b3c5ff)
- `$accent-fg`: Text on accent (#192e60)
- `$accent-2`: Secondary accent (#e1bbdc)
- `$error`: Error/destructive (#ffb4ab)
- `$bar`: Translucent bar background (rgba($surface, 0.55))

## Usage Guidelines

1. **Spacing**: Use the spacing variables for all padding and margin values to maintain consistent vertical and horizontal rhythm.
2. **Border Radius**: Apply the radius variables consistently - prefer $radius-sm for interactive elements, $radius-md for containers.
3. **Typography**: Use the font scale for text sizing - base UI text should use $font-size-lg, with hierarchical steps as needed.
4. **Colors**: Use the color roles semantically (e.g., $accent for primary actions, $fg for primary text).
5. **Consistency**: When adding new components, reference existing usage of these variables rather than hardcoding values.

## Component-Specific Standards

- **Buttons**: Use $spacing-2 for horizontal padding, $radius-sm for border radius
- **Cards/Containers**: Use $spacing-3 for padding, $radius-lg for border radius
- **Inputs**: Use $spacing-2 for padding, $spacing-5 for min-height
- **Icons**: Standard sizes are defined per-component but should align with text heights where applicable
- **Separators**: Use $spacing-1 for thin separators, $spacing-2 for thicker dividers

This design system ensures visual consistency, maintainability, and scalability across the AGS interface.