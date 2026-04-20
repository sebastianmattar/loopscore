---
id: hello-world-api
title: Implement a simple REST API
prompt: |
  Implement a simple REST API server in TypeScript using Node.js built-ins (no frameworks).
  The server should run on port 3000 and handle the following endpoints:
    - GET  /health         → { status: "ok" }
    - GET  /items          → returns array of all items
    - POST /items          → creates a new item (body: { name: string }), returns created item with id
    - GET  /items/:id      → returns a single item by id, 404 if not found
  Items should be stored in-memory. Include a README with usage instructions.
acceptance_criteria:
  - 'GET /health returns 200 with {"status":"ok"}'
  - GET /items returns an array (initially empty)
  - POST /items creates an item and returns it with a unique id
  - GET /items/:id returns the correct item or 404
  - Code compiles and runs with ts-node or tsx
  - A README.md is present with usage instructions
---

## Additional Context

- Use TypeScript with strict mode enabled
- No external HTTP framework dependencies (use Node.js `http` module)
- Items should have at minimum: `id` (uuid or incremental), `name` (string), `createdAt` (ISO string)
