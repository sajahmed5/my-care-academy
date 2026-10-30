import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/components/structured-data";
import { SIGNATURE_HEADER } from "@/lib/alert-signing";

export const metadata: Metadata = {
  title: "API for rota and care systems — My Care Academy",
  description:
    "How a rota or care management system connects to My Care Academy: send staff in, assign training, read training records and certificates, and receive alerts.",
  alternates: { canonical: "/developers" },
};

const API = `${SITE_URL}/api/portal`;

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-[#0f2f3c] p-4 text-xs leading-5 text-[#dff4f1]">
      <code>{children.trim()}</code>
    </pre>
  );
}

function Endpoint({ method, path, children }: { method: string; path: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex flex-wrap items-baseline gap-2 text-base font-semibold text-foreground">
        <span className="rounded-md bg-[#134f63]/10 px-2 py-0.5 font-mono text-xs text-[#134f63]">{method}</span>
        <span className="font-mono text-sm">{path}</span>
      </h3>
      {children}
    </section>
  );
}

/**
 * The published API (INTEGRATION-WHITE-LABEL.md, 29 Oct 2026): what another
 * system's developers build against, with a key the company makes in
 * Settings. It documents what /api/portal/* and lib/alerts actually do —
 * change one and change this with it.
 */
export default function DevelopersPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 pb-12 pt-12 sm:pt-16">
      <h1 className="font-display text-4xl font-semibold tracking-tight text-[#0f2f3c]">API for rota and care systems</h1>
      <p className="mt-3 text-base text-muted-foreground">
        A rota or care management system can connect to My Care Academy to send a company&apos;s staff in as
        learners, assign their training, read back their training records and certificates, and be told when a
        certificate is issued or training goes overdue. MyRoster uses exactly this.
      </p>

      <div className="mt-10 space-y-10 text-sm leading-6 text-muted-foreground">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Getting a key</h2>
          <p>
            Each company connects its own systems. A manager opens <strong>Settings, Integration, Other systems and
            alerts</strong> in My Care Academy, makes a key for your system and gives it to you. A key belongs to one
            company: everything you send or read with it is that company&apos;s, and nobody else&apos;s. The manager
            can switch it off at any time. The API is part of the Enterprise package.
          </p>
          <p>Send the key on every request:</p>
          <Code>{`Authorization: Bearer mca_…`}</Code>
          <p>
            All addresses below are under <code className="font-mono text-foreground">{API}</code>. Requests and
            answers are JSON. A wrong or switched-off key answers <code>401</code>; a company whose package
            doesn&apos;t include the API, or that isn&apos;t active, answers <code>403</code>.
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-foreground">Requests</h2>

          <Endpoint method="POST" path="/sync-learners">
            <p>
              Send the company&apos;s staff, up to 1,000 at a time. Each person is matched by your id for them
              (<code>externalRef</code>), then by email address; someone new is sent an invitation to set a password.
              A person sent as <code>archived</code> is signed out and can&apos;t sign in. With{" "}
              <code>updateOnly: true</code> nobody new is invited: use it for automatic syncs, and leave it off when
              someone has asked for a person to be given an account.
            </p>
            <Code>{`
{
  "learners": [
    { "externalRef": "carer-118", "email": "sam@example.com", "fullName": "Sam Jones", "status": "active" }
  ],
  "updateOnly": false
}
            `}</Code>
            <p>Every person sent gets an outcome, in the order sent:</p>
            <Code>{`
{
  "results": [{ "externalRef": "carer-118", "outcome": "invited", "userId": "…" }],
  "counts": { "invited": 1 }
}
            `}</Code>
            <p>
              Outcomes: <code>invited</code>, <code>adopted</code> (already here, now matched to your id),{" "}
              <code>updated</code>, <code>skipped_archived</code>, <code>skipped_not_on_platform</code> (with{" "}
              <code>updateOnly</code>) and <code>error</code>, with the reason. The company&apos;s managers see the
              last sync, and anything that went wrong, in plain words on their settings page.
            </p>
          </Endpoint>

          <Endpoint method="GET" path="/catalogue">
            <p>What can be assigned: the courses, grouped by topic, and the programmes made of them.</p>
            <Code>{`
{
  "topics": [{ "id": "…", "title": "Safeguarding" }],
  "courses": [{ "id": "…", "topicId": "…", "title": "Safeguarding Adults", "summary": "…",
                "expiryMonths": 12, "estimatedMinutes": 45 }],
  "pathways": [{ "id": "…", "title": "Care Certificate", "kind": "…", "summary": "…", "courseIds": ["…"] }]
}
            `}</Code>
          </Endpoint>

          <Endpoint method="POST" path="/assign">
            <p>
              Assign courses or programmes to people, by your ids for them. Assigning something a person already has
              never resets their progress. Without a <code>dueDate</code>, new training is due at the end of this
              month.
            </p>
            <Code>{`
{ "externalRefs": ["carer-118"], "courseIds": ["…"], "pathwayIds": [], "dueDate": "2026-12-31" }
            `}</Code>
            <Code>{`
{ "assigned": 3, "newlyAssigned": 1, "learners": 1, "courses": 3, "unknownRefs": [], "inactiveRefs": [] }
            `}</Code>
          </Endpoint>

          <Endpoint method="GET" path="/records">
            <p>
              Everyone matched to your system, with their training and certificates. Each certificate has a download
              link that works for an hour; ask again for a fresh one.
            </p>
            <Code>{`
{
  "courses": [{ "id": "…", "title": "Safeguarding Adults", "expiryMonths": 12 }],
  "learners": [{
    "externalRef": "carer-118", "fullName": "Sam Jones", "email": "sam@example.com",
    "status": "active", "lastSeenAt": "2026-10-30T09:12:00Z",
    "enrolments": [{ "courseId": "…", "status": "in_progress", "progress": 40, "dueDate": "2026-12-31",
                     "completionCount": 0, "assignedAt": "…" }],
    "certificates": [{ "certificateNumber": "MCA-…", "courseId": "…", "issuedAt": "…",
                       "expiresAt": "…", "downloadUrl": "https://…" }]
  }]
}
            `}</Code>
          </Endpoint>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Alerts</h2>
          <p>
            Instead of asking us over and over, your system can be told. The company&apos;s manager adds the address
            you give them, chooses the alerts, and gives you a signing secret (<code>whsec_…</code>). We then send a{" "}
            <code>POST</code> with a JSON body to that address. Answer with any <code>2xx</code> within 10 seconds.
            Anything else is tried twice more straight away, then once a day for three days. The address must be{" "}
            <code>https</code>.
          </p>
          <p>Every alert has the same outline:</p>
          <Code>{`
{
  "id": "6f1c…",                     // the same on every retry: use it to ignore repeats
  "type": "certificate.issued",
  "createdAt": "2026-10-30T14:02:11Z",
  "organisation": { "id": "…", "name": "Example Care Ltd" },
  "data": { … }
}
          `}</Code>

          <h3 className="text-base font-semibold text-foreground">certificate.issued</h3>
          <p>Someone has earned a certificate, online or in a classroom.</p>
          <Code>{`
"data": {
  "certificate": { "id": "…", "number": "MCA-…", "issuedAt": "…", "expiresAt": "…",
                   "verifyUrl": "${SITE_URL}/verify?number=MCA-…" },
  "learner": { "id": "…", "externalRef": "carer-118", "fullName": "Sam Jones", "email": "sam@example.com" },
  "course": { "id": "…", "title": "Safeguarding Adults" }
}
          `}</Code>

          <h3 className="text-base font-semibold text-foreground">training.overdue</h3>
          <p>
            Once a day, every course that has gone past its due date since the last one: one alert listing them all,
            and none on a day with nothing new. Training that was already overdue before the alerts were set up is in{" "}
            <code>GET /records</code>.
          </p>
          <Code>{`
"data": {
  "items": [{ "enrolmentId": "…", "dueDate": "2026-10-29",
              "learner": { "id": "…", "externalRef": "carer-118", "fullName": "Sam Jones", "email": "…" },
              "course": { "id": "…", "title": "Moving and Handling" } }]
}
          `}</Code>

          <h3 className="text-base font-semibold text-foreground">ping</h3>
          <p>Sent when the manager presses &ldquo;Send a test&rdquo;.</p>

          <h3 className="text-base font-semibold text-foreground">Checking an alert came from us</h3>
          <p>
            Each alert has a <code>{SIGNATURE_HEADER}</code> header, <code>t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</code>,
            where the hex is the HMAC-SHA256, keyed with your signing secret, of the timestamp, a full stop, and the
            body exactly as it arrived. Refuse an alert whose signature doesn&apos;t match, or whose timestamp is more
            than five minutes out. The headers <code>MCA-Event</code> and <code>MCA-Delivery</code> carry the type and
            the alert&apos;s id.
          </p>
          <Code>{`
import crypto from "node:crypto";

function fromMyCareAcademy(secret, rawBody, header) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  return v1?.length === expected.length && crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}
          `}</Code>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Certificates</h2>
          <p>
            Anyone can check a certificate is genuine on{" "}
            <Link href="/verify" className="font-medium text-[#134f63] underline-offset-2 hover:underline">
              our verification page
            </Link>
            , with the number printed on it.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">Questions</h2>
          <p>
            If you&apos;re building a connection and something here isn&apos;t clear, or you need something it
            doesn&apos;t do,{" "}
            <Link href="/contact?topic=integration" className="font-medium text-[#134f63] underline-offset-2 hover:underline">
              get in touch
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
