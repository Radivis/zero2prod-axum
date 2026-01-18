use actix_web::error::InternalError;
use actix_web::http::header::LOCATION;
use actix_web::{HttpResponse, web};
use actix_web_flash_messages::FlashMessage;
use axum::extract::{Form, State};
use axum::response::Redirect;
use tower_sessions::Session;
use crate::flash_messages::FlashMessageSender;
use crate::session_state::TypedSessionAxum;
use crate::startup_axum::AppState;
use secrecy::Secret;
use sqlx::PgPool;

use crate::authentication::{AuthError, Credentials, validate_credentials};
use crate::session_state::TypedSession;
use crate::telemetry::error_chain_fmt;

#[allow(dead_code)]
#[derive(serde::Deserialize)]
pub struct FormData {
    username: String,
    password: Secret<String>,
}

#[derive(thiserror::Error)]
pub enum LoginError {
    #[error("Authentication failed")]
    AuthError(#[source] anyhow::Error),
    #[error("Something went wrong")]
    UnexpectedError(#[from] anyhow::Error),
}

impl std::fmt::Debug for LoginError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        error_chain_fmt(self, f)
    }
}

#[tracing::instrument(
    skip(form, pool, session),
    fields(username=tracing::field::Empty, user_id=tracing::field::Empty)
)]
pub async fn login(
    form: web::Form<FormData>,
    pool: web::Data<PgPool>,
    session: TypedSession,
) -> Result<HttpResponse, InternalError<LoginError>> {
    let credentials = Credentials {
        username: form.0.username,
        password: form.0.password,
    };
    tracing::Span::current().record("username", tracing::field::display(&credentials.username));

    match validate_credentials(credentials, &pool).await {
        Ok(user_id) => {
            tracing::Span::current().record("user_id", tracing::field::display(&user_id));
            session.renew();
            let _ = session
                .insert_user_id(user_id)
                .map_err(|e| login_redirect(LoginError::UnexpectedError(e.into())));
            Ok(HttpResponse::SeeOther()
                .insert_header((LOCATION, "/admin/dashboard"))
                .finish())
        }
        Err(e) => {
            let e = match e {
                AuthError::InvalidCredentials(_) => LoginError::AuthError(e.into()),
                AuthError::UnexpectedError(_) => LoginError::UnexpectedError(e.into()),
            };
            Err(login_redirect(e))
        }
    }
}

// Redirect to the login page with an error message.
fn login_redirect(e: LoginError) -> InternalError<LoginError> {
    FlashMessage::error(e.to_string()).send();
    let response = HttpResponse::SeeOther()
        .insert_header((LOCATION, "/login"))
        .finish();
    InternalError::from_response(e, response)
}

// Axum version
#[tracing::instrument(
    skip(form, state, session),
    fields(username=tracing::field::Empty, user_id=tracing::field::Empty)
)]
pub async fn login_axum(
    session: Session,
    State(state): State<AppState>,
    Form(form): Form<FormData>,
) -> impl axum::response::IntoResponse {
    let typed_session = TypedSessionAxum(session.clone());
    let credentials = Credentials {
        username: form.username,
        password: form.password,
    };
    tracing::Span::current().record("username", tracing::field::display(&credentials.username));

    match validate_credentials(credentials, &state.db).await {
        Ok(user_id) => {
            tracing::Span::current().record("user_id", tracing::field::display(&user_id));
            typed_session.renew().await;
            if let Err(e) = typed_session.insert_user_id(user_id).await {
                tracing::error!("Failed to insert user_id into session: {:?}", e);
                return Redirect::to("/login");
            }
            Redirect::to("/admin/dashboard")
        }
        Err(e) => {
            let flash_sender = FlashMessageSender::new(session);
            let error_msg = match e {
                AuthError::InvalidCredentials(_) => "Authentication failed".to_string(),
                AuthError::UnexpectedError(_) => "Something went wrong".to_string(),
            };
            if let Err(err) = flash_sender.error(error_msg).await {
                tracing::error!("Failed to set flash message: {:?}", err);
            }
            Redirect::to("/login")
        }
    }
}
