# Cloudflare static website

The repository includes a static website and a separate Express/SQLite server.
The Cloudflare configuration deploys only the static website.

In Cloudflare Workers Builds, use:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: the repository root

Wrangler also runs the build when deploying from the command line. The build
copies public pages and assets into `dist/` and checks the 25 MiB per-file limit.
Server code, dependencies, databases, and environment files are not copied.
Do not change the assets directory to `.`.

## Booking and staff features

A static deployment does not run `server/index.js` or its `/api/*` endpoints.
For the complete application, run `npm ci` and `npm start` on a Node.js host with
persistent storage for SQLite. Set `NODE_ENV=production`, a stable
`SESSION_SECRET`, and `DATA_DIR` pointing at that persistent storage.
The Node server serves both the website and API on the same origin.

If keeping the frontend on Cloudflare, route `/api/*` to that backend on the
same origin, or migrate the backend and database to Workers-compatible services.
Uploading the static assets alone does not complete that migration.
