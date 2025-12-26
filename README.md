# slot2

Mobile-first slot machine simulator (demo).

Quick start

1. Install dependencies:

```bash
cd /workspaces/slot2
npm install
```

2. Start the server:

```bash
npm start
```

3. Open http://localhost:3000 on a mobile browser or emulator.

Notes

- Default starting funds on registration: 100.
- Admin credit API: POST /api/admin/credit with JSON {"email":"user@...","amount":NUMBER,"secret":"admin-secret"} (change secret via `ADMIN_SECRET` env var).
# slot2