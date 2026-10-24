/**
 * JSON-LD for search engines (7 Oct 2026). The site had none, so Google had
 * nothing machine-readable about who we are, where we are, or what we teach —
 * which matters most for the local searches ("care training Stockport",
 * "homecare training Manchester") we want to show up in.
 *
 * Only facts that are true and already published on the site go in here.
 */

export const SITE_URL = "https://www.mycareacademy.co.uk";

const ORGANISATION = {
  "@type": ["EducationalOrganization", "LocalBusiness"],
  "@id": `${SITE_URL}/#organisation`,
  name: "My Care Academy",
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  description:
    "Online care training for UK home care providers and care homes: CQC-aligned courses, verifiable certificates, mock CQC inspections and management support.",
  foundingDate: "2002",
  telephone: "+441616944701",
  email: "hello@mycareacademy.co.uk",
  address: {
    "@type": "PostalAddress",
    streetAddress: "107 Wellington Road",
    addressLocality: "Stockport",
    addressRegion: "Greater Manchester",
    postalCode: "SK4 2LR",
    addressCountry: "GB",
  },
  areaServed: [
    { "@type": "City", name: "Stockport" },
    { "@type": "City", name: "Manchester" },
    { "@type": "AdministrativeArea", name: "Greater Manchester" },
    { "@type": "Country", name: "United Kingdom" },
  ],
};

function Ld({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // Content is ours, not user input; JSON.stringify escapes the rest.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

/** Who we are and where — rendered in the marketing layout (the pages search engines crawl; the signed-in app does not need it). */
export function OrganisationLd() {
  return (
    <Ld
      data={{
        "@context": "https://schema.org",
        "@graph": [
          ORGANISATION,
          {
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            url: SITE_URL,
            name: "My Care Academy",
            publisher: { "@id": `${SITE_URL}/#organisation` },
            inLanguage: "en-GB",
          },
        ],
      }}
    />
  );
}

/**
 * The same business, stated on the page whose subject is the place. Local
 * results lean on an address being on the page it belongs to, not only in a
 * site-wide graph.
 */
export function LocalBusinessLd() {
  return (
    <Ld
      data={{
        "@context": "https://schema.org",
        ...ORGANISATION,
        "@id": `${SITE_URL}/care-training-manchester-stockport#localbusiness`,
        name: "My Care Academy — care training, Stockport",
      }}
    />
  );
}

/** The course catalogue, so the titles themselves can surface in search. */
export function CourseListLd({ courses }: { courses: readonly string[] }) {
  return (
    <Ld
      data={{
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Care training courses",
        numberOfItems: courses.length,
        itemListElement: courses.map((title, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "Course",
            name: title,
            description: `${title} — online care training for UK care staff, with an assessment and a verifiable certificate.`,
            provider: { "@id": `${SITE_URL}/#organisation` },
            inLanguage: "en-GB",
            educationalCredentialAwarded: "Certificate of completion",
            courseMode: "online",
            hasCourseInstance: {
              "@type": "CourseInstance",
              courseMode: "online",
              courseWorkload: "PT20M",
            },
          },
        })),
      }}
    />
  );
}

/** The pricing questions, as asked and answered on the page. */
export function FaqLd({ qa }: { qa: readonly (readonly [string, string])[] }) {
  return (
    <Ld
      data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: qa.map(([question, answer]) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      }}
    />
  );
}

/** Trail for a page one level below the home page. */
export function BreadcrumbLd({ trail }: { trail: { name: string; path: string }[] }) {
  return (
    <Ld
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [{ name: "Home", path: "/" }, ...trail].map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: c.name,
          item: `${SITE_URL}${c.path === "/" ? "" : c.path}`,
        })),
      }}
    />
  );
}
