# ADR 0005 — BottleCount never handles the money

Status: accepted
Date: 2026-10-21
Follows: [ADR 0004](0004-shared-doors-and-ticket-codes.md)

## Context

Hosts charge for tickets — €15 to €25 for a house party is typical — and want
two things from the app: a way for guests to pay, and to know who has paid so
the ticket can go to the right people (#21, #24).

The obvious design is a payment integration that takes the money and confirms
it automatically: Stripe Connect, PayPal's platform programme, or a Satispay
Business account per host. Every one of them makes BottleCount the party that
moves money between a guest and a host, and that has consequences far larger
than the feature:

- **DAC7.** A platform that lets sellers be paid through it is a _platform
  operator_ under the EU's DAC7 directive (in Italy, D.Lgs. 32/2023). The
  operator, not the host, has to collect each host's identity and tax code,
  verify them, and report every host's income to the tax authority each year.
  For a planner whose hosts make a few hundred euros a party, that is a
  compliance burden on BottleCount out of all proportion to what it earns.
- **The host's position changes.** Income that arrives through a reporting
  platform is income the tax office is told about by a third party. Hosts
  using their own PayPal, Satispay or bank account are in the position they
  were already in, which is the one they chose.
- **Onboarding.** Connected accounts mean every host completing a KYC flow
  before their first party. That is the opposite of a tool you open the night
  before.

## Decision

**BottleCount never touches the money.** Guests pay the host directly, through
the host's own links, and the host confirms each payment by hand.

### Paying

The host sets where they want to be paid in the Plan tab (#27): a PayPal.me
username, a Satispay link, a Revolut link, a bank account. A guest who confirms
sees a button for each, with the price filled in where the provider allows it.
The details are withheld until the guest confirms, and validated on every read
because co-organisers' patches skip the publish checks.

A party is **paid** when it has a ticket price above zero _and_ at least one way
to pay (`isPaidParty` in `shared/payments.ts`). The price alone cannot decide
it: every party starts with one for the budget maths.

### Knowing who has paid

`invites.paid_at` (migration 0005) records when an organiser marked a guest as
paid, after checking their own account. Like check-in (ADR 0004) the server is
the authority: any organiser can set or clear it, every organiser's guest list
shows the server's answer after its next refresh, and marking twice keeps the
first time. Link holders never see it.

### Where the ticket goes

To send a ticket to someone who has paid, the app needs to reach them, so a
guest confirming a paid party leaves an email, a phone number (for WhatsApp),
or both — at least one — in `invites.email` and `invites.phone`. Either is
enough because the organiser sends the ticket from their own phone, by hand,
through whichever the guest gave.

- They are organiser-only. No public endpoint returns them, not even to the
  guest who entered them: the invite id that identifies a guest is a bearer
  token, and anything returned to it is returned to whoever holds it. The guest
  page remembers them in the guest's own browser instead.
- A guest who changes their answer to no has them cleared; a free party never
  stores them.
- They live on the invite row, not in the party document. The document syncs to
  every organiser and feeds the public card; contact details are neither.
- Deleting the party from the server deletes them with the invite rows. Closing
  the link does not — the host still has tickets to send and a door to run.

## Consequences

- **No automatic confirmation.** The host checks their PayPal, Satispay or bank
  and taps "Mark paid" for each guest. For tens of guests this is minutes of
  work; for hundreds it is real effort, and it is the price of this decision.
- **No fees and no onboarding.** Hosts start taking payments by typing a
  username.
- **BottleCount is not a DAC7 platform operator** for ticket income, and holds
  no host tax data.
- **Trust runs between guest and host,** as it does when a friend says "send me
  the money on Satispay". Refunds happen the same way, outside the app; an
  organiser can unmark a guest who was refunded.
- **The paid mark is a claim, not a proof.** It records that an organiser says
  they saw the money, which is all a tool that never sees the money can know.

If a host ever needs automatic confirmation, revisit this with the reporting
duty priced in — not as a payments feature, but as becoming a regulated
platform.
