# zero2prod-axum
Template app based on the book "Zero To Production in Rust" by Luca Palmieri with Axum instead of actix-web.

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

If you don't have lefthook installed, you need to install it first.
I've tried Rust-based alternatives, but they are still a far cry from the simplicity of lefthook.

### Startup
Don't forget to start the Postgres and Redis/Valkey servers/Docker containers before trying anything!

See initialization logic under scripts/

### Testing
Testing works with the default

`cargo test`

but using nextest is preferred:

`cargo nextest run`

## Deployment
Deploy as Digital Ocean App

## Improvements
Some minor improvements over the solutions from the book

- Integration test logs are written into per test logfiles when run via nextest
- The TestApp struct is refactored into two versions: One without user, and one with a user

## Roadmap

- Complete the exercises from the end of chapter 7
- Refactor test helpers
- Improve error handling to make use of the e* helpers
- Update dependencies
- Add React front-end