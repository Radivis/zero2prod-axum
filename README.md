# zero2prod-axum
Template app based on the book "Zero To Production in Rust" by Luca Palmieri with Axum instead of actix-web.

In this context "template app" means that this repo is intended to be a conventient "starter package" for more specific apps using a Rust + Axum + React or similar stack.

## Requirements
- Docker
    - Postgres
    - Redis / Valkey
    - The indentation means that the app expects those servers to run in Docker containers. All you really need is Docker
- Rust
- Optional, but suggested for developers: Go and lefthook for the Git hooks

## Development
### Initialization
#### Git hooks
For CD there is a lefthook.yml file. You need to run

`lefthook install`

for the Git hooks to actually work.
The same commands also updates the hooks, if you update the config file lefthook.yml.

If you don't have lefthook installed, you need to install it first.
I've tried Rust-based alternatives, but they are still a far cry from the simplicity of lefthook.

When you perform a commit, it is suggested to do so in a console in which you can see the output.

### Startup
Don't forget to start the Postgres and Redis/Valkey servers/Docker containers before trying anything!

See initialization logic under scripts/

### Coding Guidelines
Both humans and agents should adhere to `.cursor/rules`. The file `.cursor/rules/coding-codex.mdc` is the canonical starting point.

### Testing
#### Backend
Testing works with the default

`cargo test`

but using nextest is preferred:

`cargo nextest run`

#### Frontend

There is a convenient script that can run all e2e tests conveniently in the background and issues a notification (currently only tested on Linux) on test success / failure:
`./scripts/run-e2e-background.sh`

Otherwise change to frontend directory first:
`cd frontend`

Component tests:
`npm run test`

e2e tests:
`npm run test:e2e`

## Deployment

The app is fully Dockerized and can run on any VPS or machine with Docker and Docker Compose.

### Quick Start (Production)

1. Copy the example environment file and fill in your values:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your actual secrets and domain:
   - `DOMAIN` -- your domain name (e.g., `myapp.example.com`)
   - `APP_BASE_URL` -- full URL including scheme (e.g., `https://myapp.example.com`)
   - `APP_HMAC_SECRET` -- a long random string for HMAC verification
   - `APP_EMAIL_CLIENT__SENDER_EMAIL` — Postmark-approved sender email address
   - `POSTGRES_APP_PASSWORD` -- a strong database password
   - `POSTMARK_API_TOKEN` -- your Postmark API token for sending emails

3. Start everything:
   ```bash
   docker compose up -d
   ```

This brings up four containers:
- **caddy** -- reverse proxy with automatic HTTPS via Let's Encrypt
- **zero2prod** -- the Rust API server, also serving the React SPA
- **postgres** -- PostgreSQL 16 database (data persisted in a Docker volume)
- **valkey** -- Valkey 8 for session storage (data persisted in a Docker volume)

Database migrations run automatically on startup.

### Local Testing with Docker

Leave `DOMAIN=localhost` in `.env`. Caddy will use its built-in local CA (expect a self-signed certificate warning in the browser).

### DNS Setup

Point your domain's A record to the VPS IP address. Caddy will automatically obtain and renew TLS certificates once DNS resolves correctly.

## Improvements
Some improvements over the solutions from the book

- Switched to a React front-end
- Switched from actix-web to Axum
- Integration test logs are written into per test logfiles when run via nextest
- The TestApp struct is refactored into two versions: One without user, and one with a user
- Added basic blogging features
- Added unsubscribe functionality
- Added a nice start page

### Future Options
- Refactor to Tailwind + shadcn/ui. Reason: MUI Update 6 -> 7 was a complete and utter failure.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.