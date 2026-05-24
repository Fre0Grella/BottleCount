# Design System Strategy: Engineered Hospitality

## 1. Overview & Creative North Star

**Creative North Star: "The Architectural Maître D’"**

This design system moves away from the chaotic neon of "nightlife apps" and the sterile rigidity of "accounting software." Instead, it occupies the space of a high-end architectural blueprint for a social event. We are building a "Digital Curator"—an experience that feels as precise as a Swiss watch but as welcoming as a hand-written invitation.

To break the "template" look, this system utilizes **Intentional Asymmetry**. We pair high-contrast typographic scales (oversized numbers against petite labels) with a "Paper-on-Glass" layering technique. The layout should feel engineered—logical, justified, and snapped to a grid—yet lightweight, using generous breathing room (Spacing: 2) and tonal shifts rather than heavy lines to guide the eye.

---

## 2. Colors & Surface Logic

Our palette is anchored in professional stability (`primary` deep navy) and punctuated by "Social Accelerants" (`secondary` orange and `tertiary` teal). This version of the system uses a **Dark Mode** foundation to create a sophisticated, late-night architectural aesthetic.

### The "No-Line" Rule

Standard UI relies on 1px borders to define sections. **We prohibit this.** Boundaries must be defined exclusively through background color shifts. A `surface-container-low` section sitting on a `surface` background provides all the containment a user needs without the visual "noise" of a wireframe.

### Surface Hierarchy & Nesting

Treat the UI as physical layers of fine stationery in a dark environment.

- **Base Layer:** `surface` (#F8F9FA/Dark variant) – The foundation.
- **Section Layer:** `surface-container-low` – For grouping related content blocks.
- **Content Cards:** `surface-container-lowest` – Used for the highest priority interactive elements to make them "pop" against the darker base.
- **Interactive Depth:** Use `surface-bright` for hover states to simulate a light catching the edge of a surface.

### The Glass & Gradient Rule

For floating elements (like a "Total Cost" sticky bar), use **Glassmorphism**. Apply a semi-transparent `surface` color with a 12px backdrop-blur.
_Signature Polish:_ Use a subtle linear gradient from `primary` (#1B263B) to `primary_container` for primary action buttons to give them a "machined" depth that feels premium and tactile.

---

## 3. Typography: Data as Hero

We use a dual-font approach to balance precision with approachable modernity.

- **Display & Headlines (Space Grotesk):** This is our "Engineered" voice. Its geometric, slightly technical terminals give headers an authoritative, modern feel.
- **Body & Labels (Inter):** Our "Social" voice. Highly legible, neutral, and warm.

**The Numeric Hierarchy:** Numbers are the soul of this system. Use `display-lg` for KPIs (e.g., total bottle count) to make data feel like art. Always pair large numbers with a `label-sm` in `on_surface_variant` to maintain the "Blueprint" aesthetic.

---

## 4. Elevation & Depth: Tonal Layering

We eschew traditional drop shadows for **Tonal Layering**.

- **The Layering Principle:** Instead of a shadow, place a `surface-container-lowest` card on a `surface-container-high` background. The difference in luminance creates a "soft lift."
- **Ambient Shadows:** If an element must float (e.g., a QR code modal), use an ultra-diffused shadow. In dark mode, the shadow color is a deep tint of our `on_surface` color, providing a subtle glow or silhouette rather than a heavy black smudge.
- **The Ghost Border:** For accessibility in input fields, use a "Ghost Border"—the `outline_variant` token at 15% opacity. It should be felt, not seen.

---

## 5. Signature Components

### KPI Cards (The "Data Jewel")

- **Structure:** No borders. Background: `surface-container-lowest`.
- **Top-left:** `label-md` (All Caps, tracked out +10%) for the metric name.
- **Center:** `display-md` in `primary` (#1B263B) for the value.
- **Bottom:** A subtle `secondary` (#FF7D00) accent bar (2px height) at the very bottom to denote "Social energy."

### List Items (Shopping & Inventory)

- **Constraint:** Forbid divider lines.
- **Layout:** Use normal-to-spacious vertical padding (leveraging `spacing: 2`). Separate items by alternating background colors slightly or simply using whitespace.
- **Trailing Element:** Use a `surface-container-high` pill for quantities (e.g., "x12") to make them look like modular components.

### QR Code Containers

- **Style:** Treat the QR code as a gallery piece.
- **Container:** `surface-container-lowest` with a subtle corner radius (`roundedness: 1`).
- **Padding:** Generous padding (defined by `spacing: 2`) around the code to ensure it "breathes."
- **Caption:** A centered `title-sm` below the code using `on_surface_variant`.

### Controls (Steppers & Sliders)

- **Steppers:** Avoid the +/- buttons. Use a "Drum" metaphor—a large numeric value that feels like it can be flicked, flanked by `surface-variant` touch targets.
- **Sliders:** The track should be `surface-container-highest`, and the thumb should be a crisp `primary` square with subtle roundedness to maintain the "Engineered" feel.

---

## 6. Do’s and Don’ts

### Do:

- **Use Monospaced Numbers:** When displaying inventory counts, use Inter with `font-variant-numeric: tabular-nums;` to ensure numbers align perfectly in lists.
- **Embrace Asymmetry:** Align primary text to the left and secondary meta-data to the far right to create a "Ledger" look.
- **Maintain Spacing:** Respect the `spacing: 2` (Normal) setting to ensure the dark interface remains legible and airy.

### Don’t:

- **No Glossy Buttons:** Avoid "bubble" aesthetics. Keep surfaces matte or glass-frosted.
- **No Neon:** Avoid "Nightlife Blue" or "Club Purple." Stick to the `tertiary` teal (#2EC4B6) for a "Calculated Social" vibe.
- **No Borders:** If you feel the urge to add a border, add more whitespace instead. If it still feels messy, shift the background color by one increment on the `surface-container` scale.
