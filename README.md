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
The same commands also updates the hooks, if you update the config file lefthook.yml.

If you don't have lefthook installed, you need to install it first.
I've tried Rust-based alternatives, but they are still a far cry from the simplicity of lefthook.

When you perform a commit, it is suggested to do so in a console in which you can see the output.

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
Some improvements over the solutions from the book

- Switched to a React front-end
- Switched from actix-web to Axum
- Integration test logs are written into per test logfiles when run via nextest
- The TestApp struct is refactored into two versions: One without user, and one with a user
- Added basic blogging features
- Added unsubscribe functionality

## Roadmap

- Unify blog posting and newsletter sending
  - When publishing a blog post the release channels need to be selected via checkboxes:
    - Release as blog post (checked by default)
    - Release as newsletter <- in this case we should use a library that transforms markdown into proper HTML using the light theme of the frontend
- Optimize full stack deployment
- Backend: Improve error handling to make use of the e* helpers

### Future Options
- Refactor to Tailwind + shadcn/ui. Reason: MUI Update 6 -> 7 was a complete and utter failure.
- Integrate precise agentic workflow into the repo