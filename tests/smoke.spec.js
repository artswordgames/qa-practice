const { test, expect } = require("@playwright/test");

const BASE_URL = "http://localhost:5001/api";

async function getAuthToken(request) {
  const email = `testuser${Date.now()}@example.com`;
  await request.post(`${BASE_URL}/auth/register`, {
    data: { email, password: "Test1234!", name: "Test User" },
  });
  const loginRes = await request.post(`${BASE_URL}/auth/login`, {
    data: { email, password: "Test1234!" },
  });
  return (await loginRes.json()).token;
}

// ===================================================================
// SMOKE TESTS: Critical happy paths only
// If these fail, stop the build. They verify core functionality works.
// ===================================================================

test.describe("SMOKE: Core Functionality", () => {
  test("GET /api/health - returns 200", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("POST /api/auth/register - happy path", async ({ request }) => {
    const email = `smoke${Date.now()}@example.com`;
    const res = await request.post(`${BASE_URL}/auth/register`, {
      data: { email, password: "Test1234!", name: "Smoke User" },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.email).toBe(email);
    expect(body).toHaveProperty("id");
  });

  test("POST /api/auth/login - happy path", async ({ request }) => {
    const email = `login${Date.now()}@example.com`;
    await request.post(`${BASE_URL}/auth/register`, {
      data: { email, password: "Test1234!", name: "Login User" },
    });
    const res = await request.post(`${BASE_URL}/auth/login`, {
      data: { email, password: "Test1234!" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("token");
  });

  test("POST /api/tasks - creates task (with auth)", async ({ request }) => {
    const token = await getAuthToken(request);
    const res = await request.post(`${BASE_URL}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: "Smoke test task" },
    });
    expect(res.status()).toBe(201);
    const task = await res.json();
    expect(task.title).toBe("Smoke test task");
  });

  test("GET /api/tasks/:id - returns task", async ({ request }) => {
    const token = await getAuthToken(request);
    const createRes = await request.post(`${BASE_URL}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: "Fetch me" },
    });
    const created = await createRes.json();

    const res = await request.get(`${BASE_URL}/tasks/${created.id}`);
    expect(res.status()).toBe(200);
    const task = await res.json();
    expect(task.id).toBe(created.id);
  });

  test("DELETE /api/tasks/:id - deletes task", async ({ request }) => {
    const token = await getAuthToken(request);
    const createRes = await request.post(`${BASE_URL}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: "Delete me" },
    });
    const created = await createRes.json();

    const delRes = await request.delete(`${BASE_URL}/tasks/${created.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(delRes.status()).toBe(200);
  });
});
