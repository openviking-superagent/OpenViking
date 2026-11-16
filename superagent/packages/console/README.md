# OVSA Console

React + TypeScript frontend for [RFC OVSA-CONSOLE-001](https://github.com/volcengine/OpenViking/discussions/7700), with an isolated in-memory Mock Server for reviewing Slices A–D. The production Shared Web integration remains read-only; demo mutations never pass through it.

## Frontend

- Instance health, Connector degradation, Runtime snapshot, Worker slots, tasks, delivery stages, Sessions, Activity, and metrics.
- Capability `enabled / available / effective` states and actionable reason codes.
- Task cancellation with `expectedRevision`, confirmation of external side effects, and separate `stopRequested` / `termination` states.
- Runtime, model, and effort transitions; new cognition Session confirmation.
- Allowlisted configuration editing, validate-only probes, `If-Match`, desired/effective drift, instance process controls, setup, and persistent Operation steps.
- Provider health and bindings, validate-only checks, write-only credential rotation, logs, diagnostics, and redacted audit entries.
- Responsive navigation and light/dark themes. The sidebar reuses Web Studio's brand assets and color tokens, and collapses to a persistent Logo + icon rail on desktop.

Outside explicit demo mode the UI issues GET requests only. The Shared Web allowlist still proxies only Slice A GET routes. The Root Key login below belongs to the isolated mock, not production Shared Web. This PR does **not** implement production owner authentication, Local Control Broker, PM2 actions, TaskManager writes, Provider secret storage, or real diagnostics.

## Run the interactive demo

From `superagent/`:

```sh
npm install --include=dev
npm run demo --workspace @ov-superagent/console
```

Open **http://127.0.0.1:3740/?demo=1**. The command builds the frontend and starts a loopback-only server serving the bundle plus the RFC API. State is in memory and resets when the process stops. The page always displays an “Interactive mock demo” banner.

### Listener and Root Key

The listener defaults to `127.0.0.1:3740` without authentication. To configure it, copy `packages/console/console.config.example.json`, replace the example key with a long random secret, and start:

```sh
npm run demo --workspace @ov-superagent/console -- --config /path/to/console.json
```

```json
{
  "host": "0.0.0.0",
  "port": 3740,
  "root_api_key": "replace-with-a-long-random-secret",
  "secure_cookies": false
}
```

`host` accepts IP literals and `localhost`; `127.0.0.0/8`, `::1`, and IPv4-mapped loopback are recognized as local. Binding any non-loopback address without a non-empty `root_api_key` fails before the socket opens. Configuring a key also enables authentication on loopback. Use an IP literal in the browser URL; arbitrary Host names are rejected to limit DNS rebinding.

The login form exchanges the key for a random in-memory session stored only as a digest by the server. Its 12-hour cookie is `HttpOnly` and `SameSite=Strict`; the key is not put in the frontend bundle, browser storage, or the cookie. Logout revokes the session. API clients can instead use the OpenViking-style headers:

```sh
curl -H 'X-API-Key: replace-with-a-long-random-secret' http://SERVER:3740/api/v1/instances
# Authorization: Bearer <root_api_key> is also accepted.
```

`OVSA_CONSOLE_CONFIG` can supply the config path. `OVSA_CONSOLE_HOST`, `OVSA_CONSOLE_PORT`, and `OVSA_CONSOLE_ROOT_API_KEY` override file values, which avoids writing the key into a file when needed. An explicitly empty key is invalid.

The mock serves plain HTTP. For access beyond a trusted test network, put it behind an HTTPS reverse proxy and set `secure_cookies` to `true` so session cookies carry `Secure`; do not expose this stateful demo as production infrastructure. Config file permissions should restrict the key to the owner.

For hot-reload frontend work, use two terminals:

```sh
node packages/console/test/mock-server.mjs
npm run demo:dev --workspace @ov-superagent/console
```

Open **http://127.0.0.1:5173/console/?demo=1**. `demo:dev` points Vite at the mock rather than Shared Web on 3737. Without `?demo=1`, controls stay disabled even if a backend reports an effective control module.

The Mock Server exercises the contract rather than a happy-path-only UI:

- Root Key startup enforcement, `X-API-Key` / Bearer authentication, HttpOnly login sessions, and logout;
- same-origin and CSRF checks, viewer boundaries, body limits, and structured RFC errors;
- unknown/repeated query rejection, cursor parameter checks, and log stream allowlists;
- `expectedRevision` / `If-Match` conflicts and idempotency replay/conflict handling;
- 202 Operations with independent validate/save/restart/verify steps;
- no secret persistence or return values beyond an opaque `credentialRef`.

It is test/demo code under `packages/console/test/`; no production module imports it.

## Legacy backend behavior

When v1 discovery returns 404, the console uses the existing GET endpoints for health, Connector, Session, and Activity observation. Task and metric panels show `workers_not_merged`; unverifiable Runtime details stay unavailable. No Task data is inferred from message activities. The previous timeline remains at `/activity`.

## Build and test

```sh
npm run build:console
npm run test:console
npm run test:browser --workspace @ov-superagent/console
npm run test:demo-browser --workspace @ov-superagent/console
npm run test:auth-browser --workspace @ov-superagent/console
```

The normal browser suite retains its assertion that production Shared Web flows issue GET only. The demo suite drives Runtime effort, configuration apply, credential rotation, Task cancellation, and mobile layout against the Mock Server. Screenshots are written to `docs/console/` (`demo-*.png`).

The build is committed under `packages/web/public/console/` because the release packager archives committed files rather than running a frontend build. Rebuild after changing console source.

Install Chromium once if needed:

```sh
npx playwright install chromium
```
