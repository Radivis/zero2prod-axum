# zero2prod-axum
Template app based on the book "Zero To Production in Rust" by Luca Palmieri with Axum instead of actix-web.

## Requirements
- Postgres
- Redis / Valkey

Don't forget to start those servers / Docker containers before trying anything!

See initialization logic under scripts/

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