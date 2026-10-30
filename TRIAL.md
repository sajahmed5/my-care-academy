# Free trials and the "From the same team" card — agreed (30 Oct 2026)

Agreed with Saj on 30 Oct 2026. Nothing below is built yet: the next step is
mock-ups, then the build once they're approved. First company: **The Care
Bureau**, trial from Monday 2 November 2026 to the end of Monday 9 November.

## The trial

- **7 days of Enterprise.** A trial company is on the Enterprise package
  (`full`), so every feature and add-on is on. Nothing new in entitlements.
- **`organisations.trial_ends_at`** — empty means not on a trial. Set from
  the platform's organisation page: **Start 7-day trial** (Enterprise, ends
  at the end of the 7th day, UK time), **Extend 7 days**, and **Convert**
  (the package they chose, date cleared). The organisations list shows
  "Trial · 3 days left".
- **During the trial** managers and office staff see a thin banner with the
  days left, the end date and **Choose a package** (the Account page).
  Carers never see it.
- **When the date passes, the whole company pauses** — carers too, so
  training doesn't carry on for free. Checked on every request beside the
  suspended check (`lib/auth.ts`), so it's exact to the minute, no cron.
  - Managers: "Your trial has ended" — what they used, the four packages,
    the request button, and that their data is kept for 30 days.
  - Office staff and carers: the trial has ended, speak to your manager.
- **Data is kept for 30 days** after the trial ends, then removed. Converting
  in that time keeps everything; anything outside the chosen package is
  locked but kept, as today.
- **Emails:** the manager on day 5 (2 days left) and on the end day; Saj on
  the end day.

## What a trial can't do

- **Face-to-face booking** — off. They see the page and the sessions, with
  "Booking opens once you choose a package"; nothing can be booked.
- **Bespoke reports** — they can send a request, but are told first that it's
  a trial and the report won't be built during it.
- **AI** — stays off and can't be switched on. Wherever AI is offered (offer
  letters, HR letters, references, the governance report, the AI card on the
  Account page) they see that AI is built in, but unavailable during the
  trial.

## From the same team

A card advertising our other products. Shown to **managers and office staff
in every company**, never to carers, with a Hide button.

- **Where:** on the right of the Overview page, on the Account page, and on
  the "trial ended" page.
- **Each advert in its own brand**, taken from its website; the rest of the
  card is ours.
- **Yellowloaf** (yellowloaf.com) — yolk yellow (#FFC824) panel, charcoal
  text, the loaf logo, Bricolage Grotesque headline, rounded charcoal button.
  "Websites, freshly baked." / "We build websites. Need a new one for your
  care company? Talk to us."
- **MyRoster** (myroster.care) — pale green panel, dark green (#164D42)
  button, the MyRoster mark. "Care rostering made simple." / "Rotas, visits,
  ECM and e-MAR for home care, and it connects straight to your training
  here." Hidden for a company already connected to MyRoster.
- Each has a link to the site and **I'm interested**, which sends Saj the
  enquiry with the company and person, like the upgrade request.

## Build order

One change per release commit, as always.

1. Trial date, the platform buttons and the banner — before Monday 2 Nov.
2. The trial ending, and the trial-ended pages — before Monday 2 Nov, so
   it's tested.
3. Trial limits: face-to-face, bespoke reports, AI.
4. The day-5 and end-day emails.
5. The From the same team card.
6. Removing a lapsed trial's data after 30 days.
