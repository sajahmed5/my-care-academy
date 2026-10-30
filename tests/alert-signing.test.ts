import { describe, expect, it } from "vitest";
import { checkAlertUrl, isPrivateAddress, signAlert, verifyAlert } from "@/lib/alert-signing";

describe("alert signatures", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ type: "ping" });
  const at = new Date("2026-10-30T12:00:00Z");

  it("verifies what it signed, within five minutes", () => {
    const header = signAlert(secret, body, at);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verifyAlert(secret, body, header, new Date(at.getTime() + 60_000))).toBe(true);
  });

  it("refuses another secret, a changed body, or an old alert", () => {
    const header = signAlert(secret, body, at);
    expect(verifyAlert("whsec_other", body, header, at)).toBe(false);
    expect(verifyAlert(secret, body + " ", header, at)).toBe(false);
    expect(verifyAlert(secret, body, header, new Date(at.getTime() + 10 * 60_000))).toBe(false);
    expect(verifyAlert(secret, body, "nonsense", at)).toBe(false);
  });
});

describe("where alerts may go", () => {
  it("knows private addresses", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "192.168.1.5", "172.20.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.1.2.3"])
      expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "172.32.0.1", "2a00:1450::1"]) expect(isPrivateAddress(ip)).toBe(false);
  });

  it("needs https on a public host in production", () => {
    expect(checkAlertUrl("https://hooks.example.com/mca", true).ok).toBe(true);
    expect(checkAlertUrl("http://hooks.example.com/mca", true).ok).toBe(false);
    expect(checkAlertUrl("https://localhost/x", true).ok).toBe(false);
    expect(checkAlertUrl("https://10.0.0.4/x", true).ok).toBe(false);
    expect(checkAlertUrl("https://user:pw@hooks.example.com", true).ok).toBe(false);
    expect(checkAlertUrl("not a url", true).ok).toBe(false);
  });

  it("allows a local receiver outside production", () => {
    expect(checkAlertUrl("http://localhost:4010/hook", false).ok).toBe(true);
    expect(checkAlertUrl("http://hooks.example.com", false).ok).toBe(false);
  });
});
