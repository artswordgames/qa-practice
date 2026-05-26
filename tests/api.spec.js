// @ts-check
const { test, expect } = require("@playwright/test");

const BASE_URL = "http://localhost:5000/api";

// ---------------------------------------------------------------------------
// Helper: register + login, return token
// ---------------------------------------------------------------------------
async function getAuthToken(request, suffix = "") {
  const email = `testuser${suffix}${Date.now()}@example.com`;
  await request.post(`${BASE_URL}/auth/register`, {
    data: { email, password: "Test1234!", name: "Test User" },
  });
  const loginRes = await request.post(`${BASE_URL}/auth/login`, {
    data: { email, password: "Test1234!" },
  });
  const body = await loginRes.json();
  return body.token;
}

// ===================================================================
// HEALTH CHECK
// ===================================================================
test.describe("GET /api/health", () => {
  test("returns 200 with status ok", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/health`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body).toHaveProperty("timestamp");
  });
});

// ===================================================================
// AUTH - REGISTRATION
// ===================================================================
test.describe("POST /api/auth/register", () => {
  test("registers a new user successfully", async ({ request }) => {
    const email = `newuser${Date.now()}@example.com`;
    const res = await request.post(`${BASE_URL}/auth/register`, {
      data: { email, password: "SecurePass1!", name: "Jane Doe" },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.email).toBe(email);
    expect(body.name).toBe("Jane Doe");
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("created_at");
    // Password hash should NEVER be returned
    expect(body).not.toHaveProperty("password_hash");
    expect(body).not.toHaveProperty("password");
  });

  test("rejects duplicate email with 409", async ({ request }) => {
    const email = `dupe${Date.now()}@example.com`;
    const payload = { email, password: "SecurePass1!", name: "First" };

    await request.post(`${BASE_URL}/auth/register`, { data: payload });
    const res = await request.post(`${BASE_URL}/auth/register`, { data: payload });

    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("already registered");
  });

  test("rejects missing required fields with 400", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/auth/register`, {
      data: { email: "x@y.com" }, // missing password and name
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("details");
    expect(body.details.length).toBeGreaterThanOrEqual(2);
  });

  test("rejects invalid email format", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/auth/register`, {
      data: { email: "not-an-email", password: "Test1234!", name: "Nope" },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects short password", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/auth/register`, {
      data: { email: `short${Date.now()}@example.com`, password: "abc", name: "Short" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("8 characters");
  });
});

// ===================================================================
// AUTH - LOGIN
// ===================================================================
test.describe("POST /api/auth/login", () => {
  test("returns token on valid credentials", async ({ request }) => {
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
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.user.email).toBe(email);
  });

  test("rejects wrong password with 401", async ({ request }) => {
    const email = `wrongpw${Date.now()}@example.com`;
    await request.post(`${BASE_URL}/auth/register`, {
      data: { email, password: "Test1234!", name: "WrongPW" },
    });

    const res = await request.post(`${BASE_URL}/auth/login`, {
      data: { email, password: "WrongPassword!" },
    });
    expect(res.status()).toBe(401);
  });

  test("rejects non-existent email with 401", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/auth/login`, {
      data: { email: "ghost@nowhere.com", password: "whatever" },
    });
    expect(res.status()).toBe(401);
    // Verify error message doesn't leak whether the email exists
    const body = await res.json();
    expect(body.error).toBe("Invalid email or password");
  });
});

// ===================================================================
// TASKS - CRUD
// ===================================================================
test.describe("Tasks CRUD", () => {
  let token;

  test.beforeEach(async ({ request }) => {
    token = await getAuthToken(request);
  });

  // ---------------------------------------------------------------
  // CREATE
  // ---------------------------------------------------------------
  test("POST /api/tasks - creates a task", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: "Write API tests",
        description: "Cover all CRUD endpoints",
        priority: "high",
      },
    });

    expect(res.status()).toBe(201);
    const task = await res.json();
    expect(task.title).toBe("Write API tests");
    expect(task.status).toBe("todo"); // default
    expect(task.priority).toBe("high");
    expect(task).toHaveProperty("id");
    expect(task).toHaveProperty("created_at");
    expect(task).toHaveProperty("updated_at");
  });

  test("POST /api/tasks - rejects missing title", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { description: "No title here" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/tasks - rejects title over 200 chars", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: "x".repeat(201) },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/tasks - rejects invalid status", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: "Bad status", status: "yolo" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/tasks - requires authentication", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/tasks`, {
      data: { title: "No auth" },
    });
    expect(res.status()).toBe(401);
  });

  // ---------------------------------------------------------------
  // READ (single)
  // ---------------------------------------------------------------
  test("GET /api/tasks/:id - returns a task", async ({ request }) => {
    const createRes = await request.post(`${BASE_URL}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: "Fetch me" },
    });
    const created = await createRes.json();

    const res = await request.get(`${BASE_URL}/tasks/${created.id}`);
    expect(res.status()).toBe(200);
    const task = await res.json();
    expect(task.id).toBe(created.id);
    expect(task.title).toBe("Fetch me");
  });

  test("GET /api/tasks/:id - returns 404 for non-existent id", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/tasks/does-not-exist`);
    expect(res.status()).toBe(404);
  });

  // ---------------------------------------------------------------
  // UPDATE
  // ---------------------------------------------------------------
  test("PUT /api/tasks/:id - updates fields", async ({ request }) => {
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
    expect(updated.title).toBe("Original"); // unchanged field preserved
    // updated_at should have changed
    expect(updated.updated_at).not.toBe(created.updated_at);
  });

  test("PUT /api/tasks/:id - rejects empty title", async ({ request }) => {
    const createRes = await request.post(`${BASE_URL}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: "Will try to blank" },
    });
    const created = await createRes.json();

    const res = await request.put(`${BASE_URL}/tasks/${created.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: "" },
    });
    expect(res.status()).toBe(400);
  });

  // ---------------------------------------------------------------
  // DELETE
  // ---------------------------------------------------------------
  test("DELETE /api/tasks/:id - deletes a task", async ({ request }) => {
    const createRes = await request.post(`${BASE_URL}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: "Delete me" },
    });
    const created = await createRes.json();

    const delRes = await request.delete(`${BASE_URL}/tasks/${created.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(delRes.status()).toBe(200);

    // Verify it's actually gone
    const getRes = await request.get(`${BASE_URL}/tasks/${created.id}`);
    expect(getRes.status()).toBe(404);
  });

  test("DELETE /api/tasks/:id - returns 404 for non-existent", async ({ request }) => {
    const res = await request.delete(`${BASE_URL}/tasks/nope`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(404);
  });
});

// ===================================================================
// TASKS - FILTERING & PAGINATION
// ===================================================================
test.describe("Tasks filtering and pagination", () => {
  let token;

  test.beforeAll(async ({ request }) => {
    // Seed several tasks
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

  test("rejects invalid status filter", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/tasks?status=banana`);
    expect(res.status()).toBe(400);
  });

  test("paginates results", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/tasks?per_page=2&page=1`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.tasks.length).toBeLessThanOrEqual(2);
    expect(body.pagination.per_page).toBe(2);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination).toHaveProperty("total");
    expect(body.pagination).toHaveProperty("total_pages");
  });

  test("rejects invalid pagination params", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/tasks?page=-1`);
    expect(res.status()).toBe(400);
  });

  test("rejects per_page over 100", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/tasks?per_page=999`);
    expect(res.status()).toBe(400);
  });
});

// ===================================================================
// EDGE CASES & SECURITY
// ===================================================================
test.describe("Edge cases and security", () => {
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
