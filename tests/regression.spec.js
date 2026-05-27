const { test, expect } = require("@playwright/test");

const BASE_URL = process.env.API_URL || "http://localhost:5001/api";

async function getAuthToken(request, suffix = "") {
  const email = `testuser${suffix}${Date.now()}@example.com`;
  await request.post(`${BASE_URL}/auth/register`, {
    data: { email, password: "Test1234!", name: "Test User" },
  });
  const loginRes = await request.post(`${BASE_URL}/auth/login`, {
    data: { email, password: "Test1234!" },
  });
  return (await loginRes.json()).token;
}

// ===================================================================
// REGRESSION TESTS: All normal behaviors and expected validation errors
// Runs on every build. Catches behavioral regressions.
// ===================================================================

test.describe("REGRESSION: Auth - Registration", () => {
  test("rejects duplicate email with 409", async ({ request }) => {
    const email = `dupe${Date.now()}@example.com`;
    await request.post(`${BASE_URL}/auth/register`, {
      data: { email, password: "SecurePass1!", name: "First" },
    });
    const res = await request.post(`${BASE_URL}/auth/register`, {
      data: { email, password: "SecurePass1!", name: "Second" },
    });
    expect(res.status()).toBe(409);
  });

  test("rejects missing required fields", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/auth/register`, {
      data: { email: "x@y.com" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("details");
  });

  test("rejects invalid email format", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/auth/register`, {
      data: { email: "not-an-email", password: "Test1234!", name: "Nope" },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects password < 8 chars", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/auth/register`, {
      data: { email: `short${Date.now()}@example.com`, password: "abc", name: "Short" },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("REGRESSION: Auth - Login", () => {
  test("rejects wrong password", async ({ request }) => {
    const email = `wrongpw${Date.now()}@example.com`;
    await request.post(`${BASE_URL}/auth/register`, {
      data: { email, password: "Test1234!", name: "WrongPW" },
    });
    const res = await request.post(`${BASE_URL}/auth/login`, {
      data: { email, password: "WrongPassword!" },
    });
    expect(res.status()).toBe(401);
  });

  test("rejects non-existent email", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/auth/login`, {
      data: { email: "ghost@nowhere.com", password: "whatever" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid email or password"); // no info leak
  });
});

test.describe("REGRESSION: Tasks - CRUD Validation", () => {
  let token;

  test.beforeEach(async ({ request }) => {
    token = await getAuthToken(request);
  });

  test("rejects missing title", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { description: "No title" },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects title > 200 chars", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: "x".repeat(201) },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects invalid status", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: "Bad status", status: "yolo" },
    });
    expect(res.status()).toBe(400);
  });

  test("requires authentication on create", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/tasks`, {
      data: { title: "No auth" },
    });
    expect(res.status()).toBe(401);
  });

  test("returns 404 for non-existent task", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/tasks/does-not-exist`);
    expect(res.status()).toBe(404);
  });

  test("updates task fields", async ({ request }) => {
    const createRes = await request.post(`${BASE_URL}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: "Original", status: "todo", priority: "low" },
    });
    const created = await createRes.json();

    const res = await request.put(`${BASE_URL}/tasks/${created.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: "in_progress", priority: "critical" },
    });

    expect(res.status()).toBe(200);
    const updated = await res.json();
    expect(updated.status).toBe("in_progress");
    expect(updated.priority).toBe("critical");
  });

  test("rejects empty title on update", async ({ request }) => {
    const createRes = await request.post(`${BASE_URL}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: "Will blank" },
    });
    const created = await createRes.json();

    const res = await request.put(`${BASE_URL}/tasks/${created.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: "" },
    });
    expect(res.status()).toBe(400);
  });

  test("returns 404 on delete non-existent", async ({ request }) => {
    const res = await request.delete(`${BASE_URL}/tasks/nope`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe("REGRESSION: Tasks - Filtering & Pagination", () => {
  let token;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request, "filter");
    const headers = { Authorization: `Bearer ${token}` };
    const tasks = [
      { title: "Filter A", status: "todo", priority: "low" },
      { title: "Filter B", status: "todo", priority: "high" },
      { title: "Filter C", status: "done", priority: "high" },
      { title: "Filter D", status: "in_progress", priority: "medium" },
      { title: "Filter E", status: "done", priority: "low" },
    ];
    for (const t of tasks) {
      await request.post(`${BASE_URL}/tasks`, { headers, data: t });
    }
  });

  test("filters by status", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/tasks?status=done`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const task of body.tasks) {
      expect(task.status).toBe("done");
    }
  });

  test("filters by priority", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/tasks?priority=high`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const task of body.tasks) {
      expect(task.priority).toBe("high");
    }
  });

  test("paginates results", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/tasks?per_page=2&page=1`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.tasks.length).toBeLessThanOrEqual(2);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.per_page).toBe(2);
  });
});
