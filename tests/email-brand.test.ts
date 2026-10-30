import { describe, expect, it, vi } from "vitest";
import { brandEmailHtml, emailButton, emailLayout, pointLinksAt } from "@/lib/email-layout";
import { companyLookupOnce, fromAs } from "@/lib/email";

const email = emailLayout({
  heading: "Your training",
  body: `<p>Hello</p>${emailButton("https://example.com", "Open")}`,
  footer: "My Care Academy — sent for Example Care.",
});

describe("brandEmailHtml", () => {
  it("puts the company's logo where ours was", () => {
    const out = brandEmailHtml(email, { name: "Example Care", logoUrl: "https://cdn.example/logo.png", colour: null });
    expect(out).toContain('src="https://cdn.example/logo.png"');
    expect(out).toContain('alt="Example Care"');
    expect(out).not.toContain("/logo.png\" width=\"150\" alt=\"My Care Academy\"");
  });

  it("heads the email with the company's name when it has no logo", () => {
    const out = brandEmailHtml(email, { name: "Example Care", logoUrl: null, colour: null });
    expect(out).toContain(">Example Care</p>");
    expect(out).not.toContain('alt="My Care Academy"');
  });

  it("keeps our name as a small Powered by line, once", () => {
    const out = brandEmailHtml(email, { name: "Example Care", logoUrl: null, colour: null });
    expect(out).toContain("Sent for Example Care.");
    expect(out).toContain("Powered by My Care Academy");
    expect(out.match(/My Care Academy/g)).toHaveLength(1);
  });

  it("uses a readable shade of the company's colour for buttons", () => {
    const dark = brandEmailHtml(email, { name: "X", logoUrl: null, colour: "#1d4ed8" });
    expect(dark).toContain("background:#1d4ed8");
    expect(dark).not.toContain("#0f8178");
    const light = brandEmailHtml(email, { name: "X", logoUrl: null, colour: "#facc15" });
    expect(light).not.toContain("background:#facc15");
  });

  it("leaves an email not built with the layout alone", () => {
    expect(brandEmailHtml("<p>Plain</p>", { name: "X", logoUrl: null, colour: null })).toBe("<p>Plain</p>");
  });
});

describe("fromAs", () => {
  it("puts the company's name in front of our address", () => {
    expect(fromAs("My Care Academy <hello@mycareacademy.co.uk>", "Example Care Ltd")).toBe('"Example Care Ltd" <hello@mycareacademy.co.uk>');
    expect(fromAs("hello@mycareacademy.co.uk", "Example")).toBe('"Example" <hello@mycareacademy.co.uk>');
  });

  it("can't be made to break the header", () => {
    expect(fromAs("A <a@b.co>", 'Evil"\r\nBcc: x@y.z <>')).toBe('"EvilBcc: x@y.z" <a@b.co>');
    expect(fromAs("A <a@b.co>", "  ")).toBe("A <a@b.co>");
  });
});

describe("pointLinksAt", () => {
  const html = `<a href="https://www.mycareacademy.co.uk/auth/confirm?t=1">Open</a>
    <span>https://www.mycareacademy.co.uk/learn</span>
    <a href="http://localhost:3000/login">x</a>
    <a href="https://www.mycareacademy.co.uk/verify?number=MCA-1">check</a>
    <a href="https://www.mycareacademy.co.uk.evil.com/x">no</a>`;
  const out = pointLinksAt(html, ["https://www.mycareacademy.co.uk", "http://localhost:3000"], "https://training.hgcare.co.uk");

  it("sends the app's links to the company's address", () => {
    expect(out).toContain('href="https://training.hgcare.co.uk/auth/confirm?t=1"');
    expect(out).toContain("<span>https://training.hgcare.co.uk/learn</span>");
    expect(out).toContain('href="https://training.hgcare.co.uk/login"');
  });

  it("keeps certificate checks on our site, and leaves look-alikes", () => {
    expect(out).toContain('href="https://www.mycareacademy.co.uk/verify?number=MCA-1"');
    expect(out).toContain("https://www.mycareacademy.co.uk.evil.com/x");
  });
});

describe("companyLookupOnce", () => {
  it("looks each company up once however many messages it has", async () => {
    const lookup = vi.fn(async (_id: string) => null);
    const once = companyLookupOnce(lookup);
    await Promise.all([once("a"), once("a"), once("b"), once("a"), once("b")]);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(lookup.mock.calls.map((c) => c[0]).sort()).toEqual(["a", "b"]);
  });

  it("starts afresh for each batch", async () => {
    const lookup = vi.fn(async () => null);
    await companyLookupOnce(lookup)("a");
    await companyLookupOnce(lookup)("a");
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
