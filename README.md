# zero2prod
"Zero To Production in Rust" Learning

The work in this project is based on the book "Zero To Production in Rust" by Luca Palmieri.

## Requirements
- Postgres
- Redis / Valkey

See initialization logic under scripts/

## Deployment
Deploy as Digital Ocean App

## Improvements
Some minor improvements over the solutions from the book

- Integration test logs are written into per test logfiles when run via nextest
- The TestApp struct is refactored into two versions: One without user, and one with a user

## Todos

- Complete the exercises from the end of chapter 7
- Refactor test helpers
- Improve error handling to make use of the e* helpers
- Update dependencies
- Replace actix-web with Axum
- Add React front-end