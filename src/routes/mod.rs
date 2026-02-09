pub mod admin;
pub mod blog;
pub mod constants;
pub mod health_check; // Public for OpenAPI annotations
pub mod initial_password; // Public for OpenAPI annotations
pub mod login; // Public for OpenAPI annotations
mod subscriptions;
mod subscriptions_confirm;
pub mod users; // Public for OpenAPI annotations

pub use admin::*;
pub use blog::*;
pub use health_check::*;
// Re-export only handler functions to avoid ambiguous glob re-exports
pub use initial_password::create_initial_password;
pub use login::login;
pub use subscriptions::*;
pub use subscriptions_confirm::*;
pub use users::*;
