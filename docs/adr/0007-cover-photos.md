# ADR 0007 — Cover photos and posters

Status: accepted
Date: 2026-10-26 (amended the same day: the free-tier budget, then a
banner beside the poster)
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
- **Two images per party, one per slot** (migration 0008). The **banner**
  replaces the gradient behind the party's name and is cropped to it, like any
  header photo. The **poster** is shown whole on the invite. Uploading into a
  slot replaces what it held, so there is no count to police: the two slots
  are the count limit. Every party starts with neither, and a party with one
  photo from before slots keeps it as its poster.
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
  the token, per slot (`photos.banner`, `photos.poster`), and the Worker builds
  the key from the party it has
  already authorised, so a document cannot point at another party's image. A
  token is never reused, so organisers may cache their copy for good.
- **Deletion.** Replacing, removing (`DELETE /api/parties/:id/photos/:slot`)
  and deleting the party (`DELETE /api/parties/:id`, both slots) each delete
  the objects. Deletes are free in R2.
- **The document follows the bytes.** `PUT /api/parties/:id/photos/:slot`
  stores the image and patches the document's `photos` in the same request, so
  co-organisers get the new image through the existing sync.
- **A hard budget keeps R2 free.** R2 has no spending cap of its own, and the
  owner must never be billed for it, so the Worker enforces one
  (`R2_BUDGET` in `backend/src/lib/coverPhotos.ts`). Each limit is spent from a
  D1 ledger before the R2 operation it pays for, and the operation is refused
  once the limit is reached:

  | Free allowance (monthly) | Budget                   | Worst bill (any 31 days) |
  | ------------------------ | ------------------------ | ------------------------ |
  | 10 GB stored             | 5 GB stored, at any time | 5 GB                     |
  | 1M Class A (writes)      | 500 uploads a day        | 15,500                   |
  | 10M Class B (reads)      | 30,000 photos served/day | 930,000                  |

  The limits are **daily** because Cloudflare bills from the account's billing
  date, not the calendar month: a monthly counter could let two full months land
  in one bill, while 31 days of a daily one cannot pass the table. Over a limit,
  an upload answers 503 (today's uploads) or 507 (storage full), and a photo
  answers 503, which both pages show as the emoji cover.

  The ledger (`cover_photos`, migration 0007) records each party's current
  photo and its size. That gives the storage total as a `SUM`, so nothing ever
  lists the bucket (R2 bills a listing as a write). It also says which token is
  current, so a replaced photo is never served. A row is written before its
  object and removed after it, so the ledger can over-count for a moment but
  never under-counts. Each read is one D1 row written (`r2_usage`), which keeps
  the read budget under a third of D1's own free 100,000 writes a day.

- **Display.** The banner fills the header behind the party's name, on the
  Plan tab and the invite, cropped to fit. The poster is never cropped: on the
  invite it sits in the body, shown whole (up to 75% of the screen height) and
  tappable for full size; on the Plan tab it is a contained thumbnail. Tickets
  keep the emoji cover, which is fixed branding (`CONTEXT.md`).
- **A refused photo is invisible.** A photo shows only once it has loaded.
  Until then, and for good if it is refused (today's reads spent) or fails,
  the page is exactly the one it would be without it: the gradient and emoji,
  no poster. A guest never sees an error, a broken image or its alt text.

## Consequences

- **The bucket is optional.** The Worker reads `COVER_PHOTOS` through
  `deployment()`; without it, uploads answer 501 and `/api/session` reports
  `coverPhotos: false`, so the app does not offer them. Each environment gets
  the binding only once its bucket exists (`wrangler r2 bucket create`),
  because a binding to a missing bucket fails the deploy
  (`backend/README.md`).
- **Self-hosters** get photos by creating a bucket and adding the binding;
  `SELF_HOSTED` already grants them `pro`.
- **Two organisers uploading at the same moment** can leave the document naming
  the image the other upload just deleted. The invite page then falls back to
  the emoji cover, and uploading again fixes it. Not worth a lock.
- **A refunded owner's party keeps its image** until someone removes it, as it
  keeps its other Pro-era state. A new image needs Pro again.
- **Account deletion** (by email, ADR 0001) has to delete each owned party
  through the same route, or clear its `covers/<partyId>/` prefix and ledger
  row by hand.
- **A busy day can switch photos off until midnight UTC.** One Pro host can
  spend the day's uploads for everyone, and a party whose invite goes viral can
  spend the day's reads. Both cost nothing and recover the next day; staying
  free is the requirement, not uptime. Raising a limit is a one-line change,
  which the table above has to justify.
- **`r2_usage` grows by two rows a day.** That is about 730 rows a year, not
  worth pruning.
- **Home cards, tickets and the join page keep the emoji covers.** Ticket images
  are fixed branding drawn on a canvas (`CONTEXT.md`), and the other two do not
  carry the photo token.
