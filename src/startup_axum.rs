use axum::routing::{get, post};
use axum::Router;
use tower_sessions::SessionManagerLayer;
use tower_sessions_redis_store::{RedisStore, fred::prelude::*};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use std::net::TcpListener;
use tower_http::trace::TraceLayer;
use secrecy::ExposeSecret;

use crate::authentication::UserId;
use axum::extract::FromRequestParts;
use crate::configuration::{DatabaseSettings, Settings};
use axum::extract::Request;
use axum::middleware::Next;
use axum::response::IntoResponse;
use crate::email_client::EmailClient;
use crate::routes::{
    admin_dashboard_axum, change_password_axum, change_password_form_axum,
    health_check_axum, home_axum, log_out_axum, login_axum, login_form_axum,
    publish_newsletter_axum, publish_newsletter_form_axum, subscribe_axum, confirm_axum,
};
use crate::startup::{ApplicationBaseUrl, HmacSecret};

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

impl Application {
    pub async fn build(configuration: Settings) -> Result<Self, anyhow::Error> {
        let _connection_pool = get_connection_pool(&configuration.database);
        let _email_client = configuration.email_client.client();
        let address = format!(
            "{}:{}",
            configuration.application.host, configuration.application.port
        );
        let listener = TcpListener::bind(address)?;
        listener.set_nonblocking(true)?;
        let port = listener.local_addr()?.port();

        Ok(Self { port, listener })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub async fn run_until_stopped(
        self,
        configuration: Settings,
    ) -> Result<(), std::io::Error> {
        let connection_pool = get_connection_pool(&configuration.database);
        let email_client = configuration.email_client.client();
        let app_state = AppState {
            db: connection_pool,
            email_client,
            base_url: ApplicationBaseUrl(configuration.application.base_url),
            hmac_secret: HmacSecret(configuration.application.hmac_secret),
        };

        // Set up session layer with RedisStore (compatible with Valkey)
        // fred v10+ supports both Redis and Valkey
        let redis_config = Config::from_url(configuration.redis_uri.expose_secret())
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        
        let pool = Pool::new(redis_config, None, None, None, 6)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        
        let redis_conn = pool.connect();
        pool.wait_for_connect()
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        
        // Keep the connection alive (will be dropped when the pool is dropped)
        tokio::spawn(async move {
            let _ = redis_conn.await;
        });
        
        let session_store = RedisStore::new(pool);
        let session_layer = SessionManagerLayer::new(session_store)
            .with_expiry(tower_sessions::Expiry::OnInactivity(
                tower_sessions::cookie::time::Duration::hours(1)
            ));

        let app = Router::new()
            .route("/health_check", get(health_check_axum))
            .route("/", get(home_axum))
            .route("/login", get(login_form_axum).post(login_axum))
            .route("/subscriptions", post(subscribe_axum))
            .route("/subscriptions/confirm", get(confirm_axum))
            .nest(
                "/admin",
                Router::new()
                    .route("/dashboard", get(admin_dashboard_axum))
                    .route("/newsletters", get(publish_newsletter_form_axum).post(publish_newsletter_axum))
                    .route("/password", get(change_password_form_axum).post(change_password_axum))
                    .route("/logout", post(log_out_axum))
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

async fn require_auth(
    req: Request,
    next: Next,
) -> axum::response::Response {
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
