import { describe, expect, it } from "vitest";
import { redactSignInLinks, REMOVED_LINK_TEXT } from "@/lib/email-record";
import { emailButton, emailLayout, emailLinkFallback } from "@/lib/email-layout";

const SETUP = "https://www.mycareacademy.co.uk/auth/setup?t=0402eb33-4698-407a-bd72-683d66f04e82.1795000000.AbCdEf_-123";
const CONFIRM = "https://training.hgcare.co.uk/auth/confirm?token_hash=pkce_abc123&type=recovery&next=/auth/set-password";

describe("the stored copy of an account email", () => {
  it("keeps no sign-in link: the button is switched off and the pasted link is replaced", () => {
    for (const url of [SETUP, CONFIRM]) {
      const html = emailLayout({
        heading: "You've been invited",
        body: `<p>Hello</p>${emailButton(url, "Accept invitation")}${emailLinkFallback(url)}`,
      });
      const copy = redactSignInLinks(html);
      expect(copy).not.toContain("token_hash");
      expect(copy).not.toContain("/auth/setup?t=");
      expect(copy).toContain(REMOVED_LINK_TEXT);
      expect(copy).toContain('aria-disabled="true"');
      expect(copy).toContain("Accept invitation");
      expect(copy).not.toMatch(/<a[^>]*href=/);
    }
  });

  it("also catches a link written with &amp; and Supabase's own verify link", () => {
    const html = `<a href="https://x.supabase.co/auth/v1/verify?token=abc&amp;type=invite">Go</a> https://x.supabase.co/auth/v1/verify?token=abc&type=invite`;
    const copy = redactSignInLinks(html);
    expect(copy).not.toContain("verify?token");
    expect(copy).toContain(REMOVED_LINK_TEXT);
  });

  it("leaves every other link alone", () => {
    const html = `${emailButton("https://www.mycareacademy.co.uk/org/billing#change", "Choose a package")}<a href="https://www.mycareacademy.co.uk/privacy">Privacy</a>`;
    expect(redactSignInLinks(html)).toBe(html);
  });
});
