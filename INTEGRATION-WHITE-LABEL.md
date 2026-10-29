# Rostering integration and white label — agreed plan (29 Oct 2026)

Agreed with Saj on 29 Oct 2026. Nothing below is built yet beyond what's
marked as today's. Both are Enterprise (see PACKAGES.md).

## Rostering integration

### Today

Built 25 Oct 2026 (v2.18.5–v2.18.6, `lib/portal-api.ts`, `/api/portal/*`): a
connection for MyRoster. MyRoster sends its carers in as the company's
learners (matched on MyRoster's id, then email), reads the course list,
assigns training, and reads every carer's training record and certificates.
A platform admin issues the company's key on its Integration tab. One company
uses it.

### Plan

- **Companies connect it themselves.** A manager presses "Connect MyRoster" on
  the Account page and copies a key into MyRoster. Replacing or revoking the
  key is there too.
- **Connection status.** When the last sync was, how many carers matched, and
  any problems in plain words ("2 carers have no email address in MyRoster").
- **Other rostering systems** (Birdie, CareLineLive, Access, Log my Care…).
  Two ways a connection can work, and they need different things:
  - **They connect to us.** We publish documentation for our API and send
    alerts to another system ("certificate issued", "training overdue"). The
    other system's developers build against it, using a key the company gets
    from us. Nothing is needed from them.
  - **We connect to them**, to read their carers or rota. That needs the
    company's API key for that system and the system's API documentation —
    and many rota systems only give API access to approved partners, so it
    can need an agreement with the vendor.

  We publish our API for anyone, and only build a connector into a specific
  system when a customer asks for it.
- **What else passes between MyRoster and us** — hired candidates, the client
  list, holidays, spot checks and QAs from the rota — is the MyRoster review,
  after the remaining add-ons are planned.

## White label

### Today

Built 25 Oct 2026 (v2.18.7–v2.18.8, `lib/branding.ts`): a manager uploads the
company logo on the Account page; it shows on new certificates, in the menu,
on the company's copy of each policy, and on its feedback surveys — while the
package includes white label.

### Plan

- **The company's own web address** — training.hgcare.co.uk, say. Carers and
  office staff sign in there, and every link we send (invites, reminders,
  password resets) points there. This is white label's main feature, not an
  extra. Setting it up: the company adds one DNS record at whoever runs its
  domain (we give the exact instruction); we add the address to the site and
  to sign-in. (Replaces the idea of a mycareacademy.co.uk/hgcare link.)
- **The logo everywhere** — every email and letter, every PDF (evidence pack,
  governance report, completed forms, training record), and the sign-in page.
- **The company's colour.** Buttons and the menu in its brand colour, chosen on
  the Account page, checked automatically so text on it stays readable.
- **Emails as the company.** The company's name as the sender, and replies to
  its own email address. Sending from its own email domain needs its IT to
  change settings, so that's on request.
- **"Powered by My Care Academy"** stays as a small footer line, and
  certificates are still verified on our verification page — a certificate is
  trusted because a neutral site confirms it.
