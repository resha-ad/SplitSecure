/**
 * Integration test - requires a real Postgres and Redis (DATABASE_URL /
 * REDIS_URL, as in .github/workflows/ci.yml).
 *
 * VULN-08: /logout-all-devices was exposed via GET. verifyCsrf skips CSRF
 * checking entirely for GET/HEAD/OPTIONS by design (they're supposed to be
 * "safe" methods with no side effects, per RFC 7231) - so this route had
 * the CSRF middleware attached, but it never actually ran its check. A
 * state-changing action (revoking every session) was therefore reachable
 * cross-site with no CSRF token at all, e.g. via a plain `<img src="...">`
 * on an attacker's page while the victim's session cookie was still valid.
 */
import crypto from "crypto";
import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../config/db";

const app = createApp();

function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@test.local`;
}

function extractCsrfToken(setCookieHeader: string[] | undefined): string | undefined {
  const csrfCookie = setCookieHeader?.find((c) => c.startsWith("ssc_csrf="));
  return csrfCookie?.split(";")[0].split("=")[1].split(".")[0];
}

describe("logout-all-devices CSRF protection (integration)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects the request with no CSRF token at all (cross-site simulation)", async () => {
    const email = uniqueEmail("csrfpost");
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "Correct-Horse-Battery9!", displayName: "CSRF Test" });
    const accessToken = registerRes.body.accessToken as string;

    // No CSRF header, no cookies forwarded at all - exactly what a
    // cross-site request driven by an attacker's page can produce
    // (it cannot read or set this app's cookies, only trigger requests).
    const res = await request(app)
      .post("/api/auth/logout-all-devices")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
  });

  it("succeeds for a genuine same-site request carrying a matching CSRF token", async () => {
    const email = uniqueEmail("csrfpost2");
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "Correct-Horse-Battery9!", displayName: "CSRF Test 2" });
    const accessToken = registerRes.body.accessToken as string;
    const cookies = registerRes.headers["set-cookie"] as unknown as string[];
    const csrfToken = extractCsrfToken(cookies);

    const res = await request(app)
      .post("/api/auth/logout-all-devices")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrfToken ?? "");

    expect(res.status).toBe(204);
  });
});
