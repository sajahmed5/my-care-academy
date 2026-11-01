import type { UserRole } from "@/lib/auth";
import type { FeatureKey } from "@/lib/features";
import type { TrialState } from "@/lib/trial";

/**
 * The trial walkthrough (1 Nov 2026, mock-ups at
 * claude.ai/artifact/FMY2qtX6qciWk3rWyfqYY6): a welcome on a console user's
 * first sign-in while the company is on a trial, a seven-step tour of the
 * bar, a Getting started list on Today that ticks itself off, and Help in
 * the bar that replays any of it. Everything here is pure — the words, the
 * order and the arithmetic — so it is tested rather than trusted to the
 * components in components/walkthrough.
 */

// --- Per-person state -------------------------------------------------------

/** users.walkthrough, as stored: two timestamps, both optional. */
export interface WalkthroughFlags {
  tourSeenAt: string | null;
  listHiddenAt: string | null;
}

/** The column is jsonb and may hold anything an older build wrote; read it defensively. */
export function parseWalkthrough(raw: unknown): WalkthroughFlags {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return { tourSeenAt: str(o.tour_seen_at), listHiddenAt: str(o.list_hidden_at) };
}

/**
 * Whether the welcome card opens by itself: a manager or office worker, the
 * company on a trial that is still running, and they have not seen it. A
 * carer never does; a company that has bought a package is past it.
 */
export function shouldOfferTour(role: UserRole | null, trial: TrialState, flags: WalkthroughFlags): boolean {
  if (role !== "org_admin" && role !== "org_office") return false;
  if (trial.kind !== "active") return false;
  return !flags.tourSeenAt;
}

// --- The tour ---------------------------------------------------------------

/** Below the nav breakpoint (1,280px) the bar is a hamburger, so the tour points at that. */
export type Layout = "wide" | "phone";

export interface TourStep {
  key: string;
  /** After the counter: "Step 2 of 7 · Due". */
  label: string;
  title: string;
  body: string;
  /** data-tour values to light up; the spotlight is drawn round all of them together. */
  targets: string[];
  /** The bar's drop-down to open for the step (TopNav's key), or none. */
  menu: string | null;
  /** Left out when the company's package has not got it. */
  feature?: FeatureKey;
}

const WIDE_STEPS: TourStep[] = [
  {
    key: "today",
    label: "Today",
    title: "Start here each morning",
    body: "Everything that's late or falling due, from every part of the service, with one button to deal with it. Red is overdue; amber is coming up. When this list is empty, you're inspection ready.",
    targets: ["today-attention"],
    menu: null,
  },
  {
    key: "due",
    label: "Due",
    title: "Who's due what",
    body: "The count in the bar is everything late across the company. Click it for everyone who's due anything: supervisions, appraisals, spot checks, audits and policies to read, each a tab on one page.",
    targets: ["nav-due"],
    menu: null,
    feature: "people.supervisions",
  },
  {
    key: "people",
    label: "People",
    title: "Everyone you employ or support",
    body: "Your staff, your clients, and the whole of HR: recruitment, absence and holidays, probation, cases and leavers. Click Staff to see everyone on one line, with their training, supervision and appraisal, and open anyone's file.",
    targets: ["nav-People", "panel-People"],
    menu: "People",
  },
  {
    key: "training",
    label: "Training",
    title: "Courses, assigning and certificates",
    body: "The course library, Assign training to give courses to people with a due date, and every certificate with its expiry date. Training held in person lives here too.",
    targets: ["nav-Training", "panel-Training"],
    menu: "Training",
  },
  {
    key: "compliance",
    label: "Compliance",
    title: "Supervisions, spot checks, audits, incidents",
    body: "What an inspector asks about: 1:1s, spot checks, service audits, feedback, and the register of incidents, complaints and safeguarding. The Governance report, at the foot, builds your CQC evidence pack in one click.",
    targets: ["nav-Compliance", "panel-Compliance"],
    menu: "Compliance",
  },
  {
    key: "new",
    label: "+ New and Search",
    title: "Start anything from here",
    body: "+ New adds staff, assigns training, books a supervision or starts an audit from whatever page you're on. Search, or ⌘K, finds any page or any person by name.",
    targets: ["nav-search", "nav-new", "panel-new"],
    menu: "__new",
  },
  {
    key: "you",
    label: "You",
    title: "Your own training lives here",
    body: "You have training too, as every member of staff does. My training is where you do any course assigned to you, the way your carers will; Console brings you back. Settings and your account live here as well.",
    targets: ["nav-person", "panel-person"],
    menu: "__person",
  },
];

const PHONE_STEPS: TourStep[] = [
  WIDE_STEPS[0],
  {
    key: "menu",
    label: "Menu",
    title: "On a phone, everything is behind the menu",
    body: "Today, Due, People, Training, Compliance and Documents are all in here, with the same pages under each. Due carries a count of everything late across the company.",
    targets: ["nav-menu"],
    menu: null,
  },
  {
    key: "new",
    label: "+ New and Search",
    title: "Start anything from here",
    body: "The quick buttons at the top of the menu add staff, assign training, book a supervision or start an audit. The magnifier finds any page or any person by name.",
    targets: ["nav-search", "nav-menu"],
    menu: null,
  },
  {
    key: "you",
    label: "You",
    title: "Your own training lives here",
    body: "Your name is at the foot of the menu. You have training too, as every member of staff does: My training is where you do any course assigned to you, and Console brings you back. Settings and your account are there as well.",
    targets: ["nav-menu"],
    menu: null,
  },
];

/** The steps for a layout, less any whose feature the company has not got. */
export function tourSteps(layout: Layout, enabled: Partial<Record<string, boolean>>): TourStep[] {
  const steps = layout === "phone" ? PHONE_STEPS : WIDE_STEPS;
  return steps.filter((s) => !s.feature || enabled[s.feature]);
}

/**
 * Drop a step none of whose targets is on the page right now, so the tour
 * never points at nothing. The menu-opening steps keep their button as a
 * target, which is always there, so only a missing Due or list drops out.
 */
export function stepsPresent(steps: TourStep[], present: (target: string) => boolean): TourStep[] {
  return steps.filter((s) => s.targets.some(present));
}

/** "Step 2 of 7 · Due". */
export function stepLabel(index: number, total: number, label: string): string {
  return `Step ${index + 1} of ${total} · ${label}`;
}

/** The step after this one, or null past the end. */
export function nextStep(index: number, total: number): number | null {
  return index + 1 < total ? index + 1 : null;
}

/** The step before this one, or null at the start. */
export function prevStep(index: number): number | null {
  return index > 0 ? index - 1 : null;
}

// --- Coach marks: "Show me" and "How do I…" ---------------------------------

/**
 * One coach mark on one page, reached with ?show=<key> in the URL. The page
 * marks the button with data-coach="<key>"; the shell draws the card.
 */
export interface CoachMark {
  title: string;
  body: string;
}

export const COACH_MARKS: Record<string, CoachMark> = {
  invite: { title: "Invite your staff", body: "Type a name and email and they get an email to join and set a password. The spreadsheet on the right adds everyone at once." },
  assign: { title: "Assign the mandatory training", body: "Pick the courses, or a whole set, and the people. Every assignment gets a due date; it defaults to the end of the month." },
  course: { title: "Do a course yourself", body: "This is your own training, the way your carers see theirs. Press Start to try one; Console in the menu brings you back." },
  supervision: { title: "Book a supervision", body: "Pick someone. Their file opens on Supervisions, where Book supervision sets a date and the form asks the questions on the day." },
  audit: { title: "Carry out an audit", body: "Choose an audit, answer it on a phone as you walk round, and anything answered No becomes an action with an owner and a date." },
  client: { title: "Add your clients", body: "Type them in one at a time, or upload your list as a spreadsheet with the button beside this one." },
  evidence: { title: "Download an evidence pack", body: "One PDF of this person's whole record, dated, the kind an inspector asks for. Leave the date empty for everything." },
  concern: { title: "Record an accident or a complaint", body: "Raise a concern starts the record: an accident, a near miss, a complaint or a safeguarding alert, then the steps to investigate and close it." },
  governance: { title: "Get ready for an inspection", body: "The Governance report gathers the month's audits, training, supervisions and incidents into one evidence pack. Download it as a PDF from here." },
};

// --- Getting started list ---------------------------------------------------

export interface TaskDef {
  key: string;
  title: string;
  /** Where it is, in plain English: "People → Staff → Add staff". */
  route: string;
  /** Where Show me goes; ?show=<key> adds the coach mark. */
  href: string;
  feature?: FeatureKey;
}

export const TASKS: TaskDef[] = [
  { key: "invite", title: "Invite your staff", route: "People → Staff → Add staff, or import a spreadsheet.", href: "/org/learners/admin?section=invite&show=invite" },
  { key: "assign", title: "Assign the mandatory training", route: "Training → Assign training: pick people, courses and a due date.", href: "/org/courses/admin?show=assign" },
  { key: "course", title: "Do a course yourself", route: "Your avatar → My training. You have training too; try one course the way your carers will, on your phone.", href: "/learn?show=course" },
  { key: "supervision", title: "Book your first supervision", route: "People → Staff → open someone → Book supervision. The form asks the questions and both of you sign on the phone.", href: "/org/due/supervisions?show=supervision", feature: "people.supervisions" },
  { key: "audit", title: "Carry out an audit", route: "Compliance → Service audits. Start with Infection prevention and control; it takes ten minutes on a phone.", href: "/org/audits?show=audit", feature: "quality.audits" },
  { key: "client", title: "Add your clients", route: "People → Clients. Type them in, or upload your list as a spreadsheet.", href: "/org/clients?show=client", feature: "clients.list" },
  { key: "evidence", title: "Download an evidence pack", route: "Open anyone's file and press Evidence pack: one PDF of their whole record, the kind an inspector asks for.", href: "/org/staff/me?show=evidence" },
];

/** What the list is ticked off from: counts read from the company's own data. */
export interface TaskFacts {
  /** Staff on the list, the manager included, and how many have signed in. */
  staff: number;
  staffSignedIn: number;
  /** Courses assigned across the company. */
  assigned: number;
  /** The signed-in person's own courses: assigned to them, and finished. */
  ownAssigned: number;
  ownCompleted: number;
  /** Supervisions and appraisals held or booked. */
  supervisions: number;
  /** Service audits and client QAs carried out. */
  audits: number;
  clients: number;
  /** Evidence packs exported, from the audit trail. */
  evidencePacks: number;
}

export interface Task extends TaskDef {
  done: boolean;
  /** Under the title: what has been done, or where to do it. */
  detail: string;
}

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/**
 * The list for this company and this person: each task done or not from
 * real data, never ticked by hand, and a line saying what counts.
 */
export function gettingStarted(facts: TaskFacts, enabled: Partial<Record<string, boolean>>, myUserId: string): Task[] {
  return TASKS.filter((t) => !t.feature || enabled[t.feature]).map((t) => {
    const href = t.href.replace("/org/staff/me", `/org/staff/${myUserId}`);
    switch (t.key) {
      case "invite": {
        const others = Math.max(0, facts.staff - 1);
        const done = others > 0;
        return { ...t, href, done, detail: done ? `${plural(others, "person", "people")} added · ${facts.staffSignedIn} signed in` : t.route };
      }
      case "assign": {
        const done = facts.assigned > 0;
        return { ...t, href, done, detail: done ? `${plural(facts.assigned, "course")} assigned` : t.route };
      }
      case "course": {
        const done = facts.ownCompleted > 0;
        return {
          ...t,
          href,
          done,
          detail: done
            ? `You've completed ${plural(facts.ownCompleted, "course")}`
            : facts.ownAssigned > 0
              ? `${t.route} You have ${plural(facts.ownAssigned, "course")} waiting.`
              : `${t.route} Assign yourself one first.`,
        };
      }
      case "supervision": {
        const done = facts.supervisions > 0;
        return { ...t, href, done, detail: done ? `${plural(facts.supervisions, "supervision")} held or booked` : t.route };
      }
      case "audit": {
        const done = facts.audits > 0;
        return { ...t, href, done, detail: done ? `${plural(facts.audits, "audit")} carried out` : t.route };
      }
      case "client": {
        const done = facts.clients > 0;
        return { ...t, href, done, detail: done ? `${plural(facts.clients, "client")} on the list` : t.route };
      }
      case "evidence": {
        const done = facts.evidencePacks > 0;
        return { ...t, href, done, detail: done ? `${plural(facts.evidencePacks, "pack")} downloaded` : t.route };
      }
      default:
        return { ...t, href, done: false, detail: t.route };
    }
  });
}

/**
 * Which card the right column of Today carries: the Getting started list
 * for a company on a trial until it is all done or hidden, the older
 * "Finish setting up" card otherwise, and nothing once either is complete.
 */
export function todayChecklist(trial: TrialState, flags: WalkthroughFlags, tasks: Task[]): "getting-started" | "setup" | "none" {
  if (trial.kind !== "active") return "setup";
  if (flags.listHiddenAt) return "none";
  if (tasks.length > 0 && tasks.every((t) => t.done)) return "none";
  return "getting-started";
}

// --- Help: How do I… --------------------------------------------------------

export interface HowTo {
  key: string;
  /** Two letters on the tile. */
  code: string;
  title: string;
  route: string;
  href: string;
  feature?: FeatureKey;
}

export const HOW_TOS: HowTo[] = [
  { key: "invite", code: "ST", title: "Add staff and get them signed in", route: "People → Staff → Add staff, or import a spreadsheet", href: "/org/learners/admin?section=invite&show=invite" },
  { key: "assign", code: "AT", title: "Assign the mandatory training", route: "Training → Assign training, pick people and a due date", href: "/org/courses/admin?show=assign" },
  { key: "supervision", code: "SV", title: "Book and hold a supervision", route: "From someone's file, or + New → Book a supervision", href: "/org/due/supervisions?show=supervision", feature: "people.supervisions" },
  { key: "audit", code: "SA", title: "Carry out an audit", route: "Compliance → Service audits → Carry out an audit", href: "/org/audits?show=audit", feature: "quality.audits" },
  { key: "concern", code: "IC", title: "Record an accident or a complaint", route: "Compliance → Incidents, complaints & safeguarding → Raise", href: "/org/complaints?show=concern", feature: "complaints.register" },
  { key: "course", code: "MY", title: "Do a course assigned to me", route: "Your avatar → My training. Managers and office staff have training too", href: "/learn?show=course" },
  { key: "governance", code: "GR", title: "Get ready for an inspection", route: "Compliance → Governance report builds the evidence pack", href: "/org/audits/governance?show=governance", feature: "quality.audits" },
];

/** The How do I… list for a company: nothing its package leaves out. */
export function howTos(enabled: Partial<Record<string, boolean>>): HowTo[] {
  return HOW_TOS.filter((h) => !h.feature || enabled[h.feature]);
}
