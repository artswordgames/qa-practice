const { test, expect } = require("@playwright/test");

const BASE_URL = "http://localhost:5001/api";

// ===================================================================
// EDGE CASES & SECURITY: Boundaries, security, error conditions
// Runs periodically. Catches security regressions and edge cases.
// ===================================================================

test.describe("EDGE CASES: Validation Boundaries", () => {
  test("rejects invalid status filter", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/tasks?status=banana`);
    expect(res.status()).toBe(400);
  });

  test("rejects invalid pagination params", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/tasks?page=-1`);
    expect(res.status()).toBe(400);
  });

  test("rejects per_page > 100", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/tasks?per_page=999`);
    expect(res.status()).toBe(400);
  });
});

test.describe("EDGE CASES: Security", () => {
  test("returns 404 for unknown endpoints", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/nonexistent`);
    expect(res.status()).toBe(404);
  });

  test("returns 405 for wrong HTTP method", async ({ request }) => {
    const res = await request.patch(`${BASE_URL}/health`);
    expect(res.status()).toBe(405);
  });

  test("rejects invalid Bearer token", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/tasks`, {
      headers: { Authorization: "Bearer fake-token-123" },
      data: { title: "Should fail" },
    });
    expect(res.status()).toBe(401);
  });

  test("rejects malformed Authorization header", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/tasks`, {
      headers: { Authorization: "NotBearer abc123" },
      data: { title: "Should fail" },
    });
    expect(res.status()).toBe(401);
  });
});
