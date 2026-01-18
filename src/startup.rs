use axum::Router;
use axum::routing::{get, post};
use secrecy::{ExposeSecret, Secret};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use std::net::TcpListener;
use tower_http::trace::TraceLayer;
use tower_sessions::SessionManagerLayer;
use tower_sessions_redis_store::{RedisStore, fred::prelude::*};

use crate::authentication::UserId;
use crate::configuration::{DatabaseSettings, Settings};
use crate::email_client::EmailClient;
use crate::routes::{
    admin_dashboard, change_password, change_password_form, confirm, health_check, home, log_out,
    login, login_form, publish_newsletter, publish_newsletter_form, subscribe,
};
use axum::extract::FromRequestParts;
use axum::extract::Request;
use axum::middleware::Next;
use axum::response::IntoResponse;
use tower_sessions::Expiry;

pub fn get_connection_pool(db_configuration: &DatabaseSettings) -> PgPool {
    PgPoolOptions::new().connect_lazy_with(db_configuration.connect_options())
}

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub email_client: EmailClient,
    pub base_url: ApplicationBaseUrl,
    pub hmac_secret: HmacSecret,
}

pub struct Application {
    port: u16,
    listener: TcpListener,
}

#[derive(Clone)]
pub struct HmacSecret(pub Secret<String>);

// We need to define a wrapper type in order to retrieve the URL
// in the `subscribe` handler.
// Retrieval from the context, in actix-web, is type-based: using
// a raw `String` would expose us to conflicts.
#[derive(Clone)]
pub struct ApplicationBaseUrl(pub String);

impl Application {
    pub async fn build(configuration: Settings) -> Result<Self, anyhow::Error> {
        let _connection_pool = get_connection_pool(&configuration.database);
        let _email_client = configuration.email_client.client();
        let address = format!(
            "{}:{}",
            configuration.application.host, configuration.application.port
        );
        let listener = TcpListener::bind(address)?;
        listener.set_nonblocking(true)?; // Set listener to non-blocking
        let port = listener.local_addr()?.port();

        Ok(Self { port, listener })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub async fn run_until_stopped(self, configuration: Settings) -> Result<(), std::io::Error> {
        let connection_pool = get_connection_pool(&configuration.database);
        let email_client = configuration.email_client.client();
        let app_state = AppState {
            db: connection_pool,
            email_client,
            base_url: ApplicationBaseUrl(configuration.application.base_url),
            hmac_secret: HmacSecret(configuration.application.hmac_secret),
        };

        // Set up RedisStore with fred (compatible with both Redis and Valkey)
        let redis_url = configuration.redis_uri.expose_secret();
        let redis_config = Config::from_url(redis_url.as_str())
            .map_err(|e| std::io::Error::other(format!("Invalid Redis URL: {}", e)))?;

        let pool = Pool::new(redis_config, None, None, None, 6)
            .map_err(|e| std::io::Error::other(format!("Failed to create Redis pool: {}", e)))?;

        pool.connect();
        pool.wait_for_connect()
            .await
            .map_err(|e| std::io::Error::other(format!("Failed to connect to Redis: {}", e)))?;

        let session_store = RedisStore::new(pool);
        let session_layer = SessionManagerLayer::new(session_store)
            .with_secure(false) // Set to true for HTTPS in production
            .with_expiry(Expiry::OnInactivity(
                tower_sessions::cookie::time::Duration::hours(1),
            ));

        let app = Router::new()
            .route("/health_check", get(health_check))
            .route("/", get(home))
            .route("/login", get(login_form).post(login))
            .route("/subscriptions", post(subscribe))
            .route("/subscriptions/confirm", get(confirm))
            .nest(
                "/admin",
                Router::new()
                    .route("/dashboard", get(admin_dashboard))
                    .route(
                        "/newsletters",
                        get(publish_newsletter_form).post(publish_newsletter),
                    )
                    .route("/password", get(change_password_form).post(change_password))
                    .route("/logout", post(log_out))
                    .route_layer(axum::middleware::from_fn(require_auth)),
            )
            .with_state(app_state)
            .layer(session_layer)
            .layer(TraceLayer::new_for_http());

        let listener = tokio::net::TcpListener::from_std(self.listener)?;
        axum::serve(listener, app).await?;
        Ok(())
    }
}

async fn require_auth(req: Request, next: Next) -> axum::response::Response {
    let (mut parts, body) = req.into_parts();
    match UserId::from_request_parts(&mut parts, &()).await {
        Ok(user_id) => {
            parts.extensions.insert(user_id);
            let req = Request::from_parts(parts, body);
            next.run(req).await
        }
        Err(redirect) => redirect.into_response(),
    }
}
