import { describe, expect, it } from "vitest";
import { companyHostRedirect, dnsRecord, isApex, isOurHost, normaliseDomain } from "@/lib/custom-domain";

describe("normaliseDomain", () => {
  it("takes what people paste", () => {
    expect(normaliseDomain("https://Training.HGCare.co.uk/login")).toEqual({ ok: true, domain: "training.hgcare.co.uk" });
    expect(normaliseDomain(" training.hgcare.co.uk. ")).toEqual({ ok: true, domain: "training.hgcare.co.uk" });
    expect(normaliseDomain("training.hgcare.co.uk:443")).toEqual({ ok: true, domain: "training.hgcare.co.uk" });
  });

  it("refuses what can't be one, or is ours", () => {
    for (const bad of ["", "hgcare", "10.0.0.1", "bad_name.co.uk", "-x.co.uk", "training.mycareacademy.co.uk", "x.vercel.app"]) {
      expect(normaliseDomain(bad).ok, bad).toBe(false);
    }
  });
});

describe("the DNS record", () => {
  it("is a CNAME for an address under the company's domain", () => {
    expect(dnsRecord("training.hgcare.co.uk")).toEqual({ type: "CNAME", name: "training", value: "cname.vercel-dns.com" });
    expect(dnsRecord("learn.staff.example.com")).toEqual({ type: "CNAME", name: "learn.staff", value: "cname.vercel-dns.com" });
  });

  it("is an A record for a bare domain", () => {
    expect(isApex("hgcare.co.uk")).toBe(true);
    expect(isApex("example.com")).toBe(true);
    expect(isApex("training.example.com")).toBe(false);
    expect(dnsRecord("hgcare.co.uk")).toEqual({ type: "A", name: "@", value: "76.76.21.21" });
  });
});

describe("whose address a request is on", () => {
  const site = "https://www.mycareacademy.co.uk";
  it("knows ours", () => {
    for (const h of ["www.mycareacademy.co.uk", "mycareacademy.co.uk", "my-care-academy-git-x.vercel.app", "localhost:3000", "127.0.0.1:3005", null]) {
      expect(isOurHost(h, site), String(h)).toBe(true);
    }
  });

  it("treats anything else as a company's", () => {
    expect(isOurHost("training.hgcare.co.uk", site)).toBe(false);
    expect(isOurHost("demo-care.localhost:3005", site)).toBe(false);
  });
});

describe("companyHostRedirect", () => {
  const site = "https://www.mycareacademy.co.uk";
  it("opens a company's address on sign-in", () => {
    expect(companyHostRedirect("/", site)).toBe("/login");
  });

  it("sends our public pages, verification included, to our address", () => {
    expect(companyHostRedirect("/verify", site)).toBe("https://www.mycareacademy.co.uk/verify");
    expect(companyHostRedirect("/training/pricing", site)).toBe("https://www.mycareacademy.co.uk/training/pricing");
  });

  it("leaves the app alone", () => {
    for (const p of ["/login", "/learn", "/org/settings", "/auth/confirm", "/survey/abc", "/apply/x", "/trainingx"]) {
      expect(companyHostRedirect(p, site), p).toBeNull();
    }
  });
});
