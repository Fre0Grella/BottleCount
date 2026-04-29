# BottleCount

BottleCount is a party planning and ticketing application. This context defines the canonical language for user-facing appearance controls.

## Language

**Theme**:
The visual appearance mode selected for the app.
_Avoid_: Mode, palette, skin

**Dark Theme**:
The Theme variant optimized for low-light viewing with dark surfaces.
_Avoid_: Night mode, black mode

**Light Theme**:
The Theme variant optimized for bright environments with light surfaces.
_Avoid_: Day mode, white mode

**Theme Switch**:
The user control that toggles Theme between Dark Theme and Light Theme.
_Avoid_: Theme button, dark/light toggle

**System Theme**:
The Theme indicated by the user’s operating system color-scheme preference.
_Avoid_: Device theme, browser theme

**Manual Override**:
A persisted user-selected Theme that takes priority over System Theme after the user uses the Theme Switch.
_Avoid_: Forced mode, locked mode

**Theme-Sensitive Assets**:
Visual identity assets (logo and favicon) that change to match the active Theme.
_Avoid_: Dynamic icons, adaptive branding

**Theme Resolution Order**:
The precedence rule used to determine active Theme at load time.
_Avoid_: Theme fallback chain, theme priority stack

## Relationships

- The **Theme Switch** sets exactly one active **Theme**
- **Theme** has two allowed values: **Dark Theme** and **Light Theme**
- The **Theme Switch** is a global control in the site navigation
- Before any **Manual Override**, active **Theme** follows **System Theme**
- If **System Theme** is unavailable and no **Manual Override** exists, active **Theme** defaults to **Dark Theme**
- Once set, **Manual Override** determines active **Theme** until changed again by the **Theme Switch**
- **Theme Resolution Order** is: **Manual Override** -> **System Theme** -> **Dark Theme**
- After first use of **Theme Switch**, the app remains in **Manual Override** mode unless browser storage is cleared
- **Theme-Sensitive Assets** must reflect the active **Theme**
- Ticket images and QR export visuals are outside **Theme** scope and remain fixed branding

## Example dialogue

> **Dev:** "Should the **Theme Switch** cycle through more than two options?"
> **Domain expert:** "No. **Theme** is binary in BottleCount: **Dark Theme** or **Light Theme**."
> **Dev:** "What wins: **System Theme** or a user change?"
> **Domain expert:** "A **Manual Override** wins once the user toggles; before that, we follow **System Theme**."
> **Dev:** "Should logos and favicon stay static?"
> **Domain expert:** "No, they are **Theme-Sensitive Assets** and follow the active **Theme**."
> **Dev:** "Do generated ticket visuals also follow Theme?"
> **Domain expert:** "No, ticket visuals are fixed branding and outside Theme scope."

## Flagged ambiguities

- "button", "toggle", and "switch" were used interchangeably — resolved canonical term: **Theme Switch**.
