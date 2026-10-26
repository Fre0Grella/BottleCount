# ADR 0007 — Cover photos and posters

Status: accepted
Date: 2026-10-26
Follows: [ADR 0001](0001-cloudflare-tiers.md), [ADR 0002](0002-invite-links-and-the-funnel.md), [ADR 0003](0003-co-organisers.md)

## Context

A party's cover was one of six emoji-and-gradient presets (`COVERS`). Hosts
asked to use their own image instead (#13), and in practice that image is often
the party's **poster**, with the date, place and line-up written on it, rather
than a photo. So the image has to keep small print legible and must never be
cropped.

The question was whether that is affordable and safe to run, and where the bytes
should live. Prices were checked on 2026-10-26.

- **Cloudflare R2** (last updated 2026-10-01): 10 GB stored, 1M writes and 10M
  reads a month free, then $0.015 per GB-month. No egress fees through the
  Worker.
- **D1 BLOBs** were considered and rejected. A 750 KB image is within D1's 2 MB
  row limit, but a database is capped at 500 MB on Workers Free (10 GB on Paid),
  so about 700 posters would crowd out the users, parties and invites sharing
  it. Storage beyond 5 GB costs $0.75 per GB-month, fifty times R2's price, and
  every invite opened would pull the image through the same database that
  takes the RSVPs.

R2 is the same account and the same `wrangler` as everything else, so no new
provider joins the stack.

## Decision

**Yes, for Pro parties, stored in R2 and served through the Worker.**

- **Tier.** The `coverPhotos` feature is Pro, read from the party owner's tier
  like every other party feature (ADR 0003): any organiser of a Pro party may
  set the photo. The free, browser-only tier keeps the emoji covers. An image
  kept in IndexedDB would never reach a guest, which is the point of the
  feature.
- **One image per party.** Uploading replaces the previous one, so there is no
  count to police. That one image is the count limit.
- **Size: at most 2000 px on the longest side and 750 KB.** The browser does
  the work: it draws the image on a canvas and encodes WebP at quality 0.9,
  stepping the quality down, then the size, until the image fits. It falls back
  to JPEG where the browser cannot encode WebP (Safari). These limits keep a
  poster's text sharp across a phone at 3x, and about 14,000 of them fit the
  free 10 GB. No server-side image transforms, which would be paid.
- **Privacy.** Re-encoding through a canvas keeps only the pixels, so the EXIF
  block goes with it, location included. The image is shown to the party's
  organisers and to guests holding the open invite link, and the privacy policy
  says so.
- **Abuse.** A public page that shows any uploaded file would be free hosting,
  so the Worker:
  - accepts only bytes whose header is WebP or JPEG, whatever the content type
    claims;
  - refuses anything over 750 KB, reading the body a chunk at a time so a lying
    `content-length` cannot get past the limit;
  - serves with `x-content-type-options: nosniff`;
  - serves guests only while the invite link is open, behind the invite rate
    limit.

  Together with the paid tier and the single image per party, this leaves
  little to abuse.

- **Keys.** Objects live at `covers/<partyId>/<token>`, where the token is a
  fresh 20-character random string on every upload. The document stores only
  the token (`coverPhoto`), and the Worker builds the key from the party it has
  already authorised, so a document cannot point at another party's image. A
  token is never reused, so organisers may cache their copy for good.
- **Deletion.** Replacing, removing (`DELETE /api/parties/:id/cover`) and
  deleting the party (`DELETE /api/parties/:id`) each clear the party's prefix.
- **The document follows the bytes.** `PUT /api/parties/:id/cover` stores the
  image and patches the document's `coverPhoto` in the same request, so
  co-organisers get the new image through the existing sync.
- **Display.** The image is never cropped. On the invite page it replaces the
  gradient banner, shown whole (up to 75% of the screen height) and tappable for
  full size, with the name and date below it as text. On the Plan tab it is a
  contained thumbnail on the cover.

## Consequences

- **The bucket is optional.** The Worker reads `COVER_PHOTOS` through
  `deployment()`; without it, uploads answer 501 and `/api/session` reports
  `coverPhotos: false`, so the app does not offer them. Only the `local`
  environment binds it in `wrangler.jsonc`. Production and preview get the
  binding once their bucket exists (`wrangler r2 bucket create`), because a
  binding to a missing bucket fails the deploy (`backend/README.md`).
- **Self-hosters** get photos by creating a bucket and adding the binding;
  `SELF_HOSTED` already grants them `pro`.
- **Two organisers uploading at the same moment** can leave the document naming
  the image the other upload just deleted. The invite page then falls back to
  the emoji cover, and uploading again fixes it. Not worth a lock.
- **A refunded owner's party keeps its image** until someone removes it, as it
  keeps its other Pro-era state. A new image needs Pro again.
- **Account deletion** (by email, ADR 0001) has to delete each owned party
  through the same route, or clear its `covers/<partyId>/` prefix by hand.
- **Home cards, tickets and the join page keep the emoji covers.** Ticket images
  are fixed branding drawn on a canvas (`CONTEXT.md`), and the other two do not
  carry the photo token.
