"""
QA Practice API - Task Tracker
A simple Flask API with enough surface area to practice real-world API testing.

Endpoints:
  POST   /api/auth/register     - Register a new user
  POST   /api/auth/login         - Login, get a token
  GET    /api/tasks              - List tasks (supports ?status=, ?priority=, ?page=, ?per_page=)
  POST   /api/tasks              - Create a task (requires auth)
  GET    /api/tasks/<id>         - Get a single task
  PUT    /api/tasks/<id>         - Update a task (requires auth)
  DELETE /api/tasks/<id>         - Delete a task (requires auth)
  GET    /api/health             - Health check
"""

from flask import Flask, request, jsonify
from functools import wraps
import uuid
import hashlib
import secrets
from datetime import datetime

app = Flask(__name__)

# ---------------------------------------------------------------------------
# In-memory "database"
# ---------------------------------------------------------------------------
users = {}       # email -> { id, email, password_hash, name, created_at }
tokens = {}      # token -> email
tasks = {}       # id -> { id, title, description, status, priority, assignee, created_at, updated_at }

VALID_STATUSES = ["todo", "in_progress", "in_review", "done"]
VALID_PRIORITIES = ["low", "medium", "high", "critical"]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def hash_password(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or malformed Authorization header"}), 401
        token = auth_header.split(" ", 1)[1]
        if token not in tokens:
            return jsonify({"error": "Invalid or expired token"}), 401
        request.current_user = users[tokens[token]]
        return f(*args, **kwargs)
    return decorated

# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "timestamp": datetime.utcnow().isoformat()})

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    errors = []
    if not data.get("email"):
        errors.append("email is required")
    if not data.get("password"):
        errors.append("password is required")
    if not data.get("name"):
        errors.append("name is required")
    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 400

    email = data["email"].strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        return jsonify({"error": "Invalid email format"}), 400

    if len(data["password"]) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    if email in users:
        return jsonify({"error": "Email already registered"}), 409

    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": hash_password(data["password"]),
        "name": data["name"].strip(),
        "created_at": datetime.utcnow().isoformat(),
    }
    users[email] = user

    return jsonify({
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "created_at": user["created_at"],
    }), 201

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    if not data.get("email") or not data.get("password"):
        return jsonify({"error": "email and password are required"}), 400

    email = data["email"].strip().lower()
    user = users.get(email)

    if not user or user["password_hash"] != hash_password(data["password"]):
        return jsonify({"error": "Invalid email or password"}), 401

    token = secrets.token_hex(32)
    tokens[token] = email

    return jsonify({"token": token, "user": {"id": user["id"], "email": user["email"], "name": user["name"]}})

# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------
@app.route("/api/tasks", methods=["GET"])
def list_tasks():
    result = list(tasks.values())

    # Filtering
    status_filter = request.args.get("status")
    if status_filter:
        if status_filter not in VALID_STATUSES:
            return jsonify({"error": f"Invalid status. Must be one of: {VALID_STATUSES}"}), 400
        result = [t for t in result if t["status"] == status_filter]

    priority_filter = request.args.get("priority")
    if priority_filter:
        if priority_filter not in VALID_PRIORITIES:
            return jsonify({"error": f"Invalid priority. Must be one of: {VALID_PRIORITIES}"}), 400
        result = [t for t in result if t["priority"] == priority_filter]

    # Sorting (newest first by default)
    result.sort(key=lambda t: t["created_at"], reverse=True)

    # Pagination
    try:
        page = int(request.args.get("page", 1))
        per_page = int(request.args.get("per_page", 20))
    except ValueError:
        return jsonify({"error": "page and per_page must be integers"}), 400

    if page < 1 or per_page < 1 or per_page > 100:
        return jsonify({"error": "page must be >= 1, per_page must be 1-100"}), 400

    total = len(result)
    start = (page - 1) * per_page
    result = result[start : start + per_page]

    return jsonify({
        "tasks": result,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": max(1, -(-total // per_page)),  # ceiling division
        },
    })

@app.route("/api/tasks", methods=["POST"])
@require_auth
def create_task():
    data = request.get_json(silent=True) or {}

    if not data.get("title"):
        return jsonify({"error": "title is required"}), 400

    if len(data["title"]) > 200:
        return jsonify({"error": "title must be 200 characters or less"}), 400

    status = data.get("status", "todo")
    if status not in VALID_STATUSES:
        return jsonify({"error": f"Invalid status. Must be one of: {VALID_STATUSES}"}), 400

    priority = data.get("priority", "medium")
    if priority not in VALID_PRIORITIES:
        return jsonify({"error": f"Invalid priority. Must be one of: {VALID_PRIORITIES}"}), 400

    now = datetime.utcnow().isoformat()
    task = {
        "id": str(uuid.uuid4()),
        "title": data["title"].strip(),
        "description": data.get("description", "").strip(),
        "status": status,
        "priority": priority,
        "assignee": data.get("assignee", request.current_user["email"]),
        "created_by": request.current_user["email"],
        "created_at": now,
        "updated_at": now,
    }
    tasks[task["id"]] = task

    return jsonify(task), 201

@app.route("/api/tasks/<task_id>", methods=["GET"])
def get_task(task_id):
    task = tasks.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    return jsonify(task)

@app.route("/api/tasks/<task_id>", methods=["PUT"])
@require_auth
def update_task(task_id):
    task = tasks.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    data = request.get_json(silent=True) or {}

    if "title" in data:
        if not data["title"]:
            return jsonify({"error": "title cannot be empty"}), 400
        if len(data["title"]) > 200:
            return jsonify({"error": "title must be 200 characters or less"}), 400
        task["title"] = data["title"].strip()

    if "description" in data:
        task["description"] = data["description"].strip()

    if "status" in data:
        if data["status"] not in VALID_STATUSES:
            return jsonify({"error": f"Invalid status. Must be one of: {VALID_STATUSES}"}), 400
        task["status"] = data["status"]

    if "priority" in data:
        if data["priority"] not in VALID_PRIORITIES:
            return jsonify({"error": f"Invalid priority. Must be one of: {VALID_PRIORITIES}"}), 400
        task["priority"] = data["priority"]

    if "assignee" in data:
        task["assignee"] = data["assignee"]

    task["updated_at"] = datetime.utcnow().isoformat()

    return jsonify(task)

@app.route("/api/tasks/<task_id>", methods=["DELETE"])
@require_auth
def delete_task(task_id):
    task = tasks.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    del tasks[task_id]
    return jsonify({"message": "Task deleted"}), 200


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------
@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "Method not allowed"}), 405

@app.errorhandler(500)
def internal_error(e):
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    app.run(debug=True, port=port)
