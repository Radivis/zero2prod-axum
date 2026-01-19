use crate::flash_messages::FlashMessageSender;
use crate::session_state::TypedSession;
use crate::startup::AppState;
use axum::extract::{Json, State};
use axum::response::Redirect;
use secrecy::Secret;
use tower_sessions::Session;

use crate::authentication::{AuthError, Credentials, validate_credentials};

#[derive(serde::Deserialize)]
pub struct FormData {
    username: String,
    password: Secret<String>,
}

#[tracing::instrument(
    skip(form, state, session),
    fields(username=tracing::field::Empty, user_id=tracing::field::Empty)
)]
pub async fn login(
    session: Session,
    State(state): State<AppState>,
    Json(form): Json<FormData>,
) -> impl axum::response::IntoResponse {
    let typed_session = TypedSession(session.clone());
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
