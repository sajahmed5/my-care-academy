Redesign the logged-in manager app (/org/*) of My Care Academy to match the mockup images in docs/redesign/ (My-Care-Academy-1-Today-dashboard.png, -2-Compliance-menu-open.png, -3-Staff-list.png, -4-Staff-profile.png, -5-Phone.png). Keep all existing routes, data and features working; this is a UI/UX change only. Names and numbers in the mockups are sample data.

1. Top navigation (replace the current 9-item dark bar)
- White top bar, 68px tall: logo left; nav items: Today, Due (with an amber count badge of everything overdue/due now), People ▾, Training ▾, Compliance ▾, Documents ▾; right side: Search (⌘K), "Trial · N days left" pill linking to /org/billing (only while on trial), "+ New" primary button (quick-create: add staff, assign training, book supervision, start audit), notifications, account avatar menu.
- Regroup menus:
  - People: Staff, Clients, Recruitment, Absence & holidays, Probation reviews, Disciplinary & grievance, Leavers
  - Training: Courses, Assign training, Certificates, Care Certificate, Face-to-face & classroom
  - Compliance (merge old "Staff audits" + "Quality"): Supervisions & appraisals, Spot checks & competency, Performance plans, Service audits, Governance report, Complaints & safeguarding, Feedback
  - Documents: Policies, Forms, Reports & exports
- Dropdowns open as a panel with section headings, an icon tile, a one-line description per item and a due-count badge where relevant (see image 2). "Incidents" in that image is a suggested new feature - skip it unless asked.
- When inside a section, show that section's pages as an underlined tab row under the top bar (see image 3). Remove the duplicated sub-tab rows that currently repeat the dropdown items.
- Remove the full-width yellow trial banner on every page; the trial pill replaces it.
- On mobile (<900px) collapse the nav into a hamburger menu; keep search and menu buttons in the top bar (see image 5).

2. Visual system
- Font: Plus Jakarta Sans (400-800). Body 14.5-15px, headings 800 weight, page title 30px.
- Colours: page bg #F4F7F6, cards #FFFFFF with 1px #E1E9E7 border and 18px radius, text #13302E, muted #5B6B69, primary #0F766E (hover #0B5A54), active nav tint #E6F4F1, amber #FEF3C7/#92400E for "due", red #FDECEA/#B42318 for "overdue/never". Check all text meets 4.5:1 contrast.
- Buttons 40-44px tall, 10-12px radius. Status shown as rounded pill badges.
- Content max-width 1320px, centred, 32px padding.

3. Overview (/org) -> "Today" (image 1)
- Greeting + date + org name.
- Row of 4 cards: inspection-readiness ring (% of compliance checks met), Training complete %, Supervisions up to date (x / y), Service audits due. Each with a progress bar and a one-line consequence.
- "Needs your attention" list (from the existing Who's due data): icon tile, title, meta line, status pill, and an inline action button (Book / Start) that goes straight to the right form.
- Right column: "Finish setting up" checklist for new orgs (create org, add manager, invite staff, assign mandatory training, add clients); hide it once complete. "Who's off this week" 7-day strip.
- Replace the 10 zero-value stat tiles with one stacked "Training across the team" bar and legend, linking to the training matrix.

4. Staff list (/org/learners) (image 3)
- Header: title, "N people · N need attention", buttons: Training matrix, Import, + Add staff.
- Replace the 11 filter chips with a segmented control: All, Needs attention, Never signed in, Leavers; plus search and a "Filters" button opening the remaining filters.
- Table columns: Name (avatar + role), Training (progress bar + %), Supervision (status pill), Appraisal (status pill), Last active, chevron. Whole row links to the profile. Table scrolls horizontally on small screens.

5. Staff profile (/org/staff/:id) (image 4)
- Breadcrumb, header card with avatar, name, role pill, email, start date, and actions: Evidence pack, Assign course, Book supervision (primary).
- Replace the left sub-menu with horizontal tabs: Overview, Training, Certificates, Care Certificate, Supervisions, Spot checks, Documents, Employment, More ▾ (Forms, Concerns & compliments, Policies, Actions & tasks).
- New Overview tab: compliance checklist cards (Supervision, Appraisal, Mandatory training, Right to work & DBS, Policies read, Profile details) each with a status pill and a one-click action; a compliance ring; recent activity.

6. Quality bar
- Make empty states helpful (explain what goes here + primary action), never just "0".
- Real <button>/<a> elements, visible focus states, aria-labels on icon buttons, 44px touch targets on mobile.
- Do it in small commits per area (nav, tokens, overview, staff list, profile), run the existing tests and check each page at 390px and 1440px before moving on.
