---
name: BottleCount
description: Engineered hospitality UI for planning drinks and tickets
colors:
  primary-navy: '#1B263B'
  secondary-orange: '#FF7D00'
  tertiary-teal: '#2EC4B6'
  surface-dark: '#0F0F1A'
  surface-1-dark: '#1A1A2E'
  surface-2-dark: '#252538'
  surface-3-dark: '#2D2D44'
  outline-variant-dark: '#3D3D5C'
  on-surface-dark: '#E2E8F0'
  on-surface-variant-dark: '#94A3B8'
  surface-light: '#F6F7FA'
  surface-1-light: '#EEF1F6'
  surface-2-light: '#E3E7EF'
  outline-variant-light: '#C6CFDC'
  on-surface-light: '#1A2233'
  on-surface-variant-light: '#4B5A73'
typography:
  display:
    fontFamily: 'Space Grotesk, Inter, system-ui, sans-serif'
    fontSize: 'clamp(2.25rem, 5vw, 3.5rem)'
    fontWeight: 700
    lineHeight: 1.1
  headline:
    fontFamily: 'Space Grotesk, Inter, system-ui, sans-serif'
    fontSize: '1.5rem'
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: '1.125rem'
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: '0.08em'
rounded:
  sm: '8px'
  md: '12px'
  lg: '16px'
spacing:
  sm: '8px'
  md: '16px'
  lg: '24px'
components:
  button-primary:
    backgroundColor: '{colors.primary-navy}'
    textColor: '{colors.surface-light}'
    rounded: '{rounded.md}'
    padding: '10px 18px'
  button-primary-hover:
    backgroundColor: '{colors.secondary-orange}'
    textColor: '{colors.surface-light}'
    rounded: '{rounded.md}'
    padding: '10px 18px'
  button-ghost:
    backgroundColor: '{colors.surface-2-dark}'
    textColor: '{colors.on-surface-dark}'
    rounded: '{rounded.md}'
    padding: '10px 18px'
  card-surface:
    backgroundColor: '{colors.surface-1-dark}'
    textColor: '{colors.on-surface-dark}'
    rounded: '{rounded.lg}'
    padding: '16px'
  input-field:
    backgroundColor: '{colors.surface-2-dark}'
    textColor: '{colors.on-surface-dark}'
    rounded: '{rounded.sm}'
    padding: '8px 10px'
---

# Design System: BottleCount

## 1. Overview

**Creative North Star: "The Night Ledger"**

BottleCount should feel engineered and calm, with precise information delivery that never overwhelms. The interface is professional and intuitive, prioritizing the user’s confidence while keeping the workflow light and social. The system rejects neon nightlife tropes, playful gimmicks, and rigid accounting dashboards.

Key characteristics: precise, composed, practical, and quietly confident.

## 2. Colors

The palette is a navy-led base with warm orange energy and teal clarity, tuned for both dark and light themes.

### Primary

- **Architectural Navy** (#1B263B): The core brand tone for key metrics, navigation emphasis, and primary actions.

### Secondary

- **Social Orange** (#FF7D00): Controlled accent for highlights, success emphasis, and subtle energy.

### Tertiary

- **Measured Teal** (#2EC4B6): Support accent for secondary emphasis and informative states.

### Neutral

- **After Hours Slate** (#0F0F1A, #1A1A2E, #252538, #2D2D44): Dark surfaces and depth layers.
- **Quiet Light** (#F6F7FA, #EEF1F6, #E3E7EF): Light theme surfaces for daylight use.
- **Ink and Mist** (#E2E8F0, #94A3B8, #1A2233, #4B5A73): Text and supportive labels.

### Named Rules

**The No-Line Rule.** Do not use divider or border lines for layout separation. Use tonal surface steps and spacing instead.

## 3. Typography

**Display Font:** Space Grotesk (fallback to Inter and system sans)
**Body Font:** Inter (fallback to system sans)

**Character:** Geometric headlines convey precision while the body type stays warm and highly legible.

### Hierarchy

- **Display** (700, clamp 2.25 to 3.5rem, line-height 1.1): KPIs and key totals.
- **Headline** (600, 1.5rem, line-height 1.25): Section headers and major panels.
- **Title** (600, 1.125rem, line-height 1.35): Card titles and subsection headers.
- **Body** (400, 1rem, line-height 1.55): Primary content with a 65 to 75ch max line length.
- **Label** (700, 0.75rem, 0.08em tracking, uppercase): Field labels and metadata.

### Named Rules

**The Data First Rule.** Numeric values carry more weight than their labels, with labels always quieter.

## 4. Elevation

Use tonal layering by default. Shadows are rare and ambient, reserved for floating utilities such as a sticky save bar or QR modal.

### Shadow Vocabulary

- **Ambient Float** (`box-shadow: 0 12px 32px rgba(15, 17, 23, 0.35)`): Only for floating overlays.

### Named Rules

**The Flat By Default Rule.** No shadows for static panels. Depth is communicated by surface tone.

## 5. Components

### Buttons

- **Character:** Engineered, matte, precise, with subtle tactile feedback.
- **Primary:** Navy base with warm orange hover to indicate action without visual noise.
- **Ghost:** Neutral surface fill for secondary actions with clear contrast.

### Cards

- **Structure:** Surface tone shifts with generous internal spacing. No borders.

### Inputs

- **Structure:** Surface-2 fill with ghost outline on focus. Labels are uppercase and compact.

### Lists

- **Structure:** Use spacing and tonal alternation rather than dividers.

## 6. Do's and Don'ts

Do use tonal layering, clean hierarchies, and restrained accents to reduce overwhelm.

Do keep navigation stable across pages with quick access to Calculator and Event tools.

Do respect reduced motion and maintain strong contrast in both themes.

Do not use borders or divider lines as layout structure.

Do not use neon color schemes or playful party motifs.

Do not make cards identical or grid-repetitive when information hierarchy varies.
