# Job Tracker Frontend

React 18, TypeScript, TailwindCSS, and `@hello-pangea/dnd` frontend for the
application tracker.

The page supports:

- vacancy URL submission through the .NET API;
- editable review of automatically extracted job details;
- creation of job applications;
- drag-and-drop status updates with optimistic UI and rollback;
- a disabled PDF action until a tailored CV exists.

## Run

```powershell
cd frontend
npm install
npm run dev
```

Vite serves the app on `http://localhost:5173` and proxies `/api` to the .NET API
on `http://localhost:5080`.

To use a different API origin, create `.env.local`:

```dotenv
VITE_API_BASE_URL=https://your-api.example
```

## Validate

```powershell
npm run typecheck
npm run build
```

## Key files

```text
frontend/
├── src/App.tsx
├── src/main.tsx
├── src/index.css
├── src/components/jobs/JobKanbanBoard.tsx
├── tailwind.config.ts
└── vite.config.ts
```

Cross-column moves update immediately and send:

```http
PUT /api/jobs/{id}/status
Content-Type: application/json

{ "status": "Interviewing" }
```

The card is temporarily disabled while its request is pending. A failed request
restores only that card to its original column and index, preserving unrelated
board changes, and displays an accessible toast.

Same-column reordering remains local because the current backend entity does not
contain a persistent sort-order field.
