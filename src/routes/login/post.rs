use crate::session_state::TypedSession;
use crate::startup::AppState;
use axum::extract::{Json, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use secrecy::Secret;
use tower_sessions::Session;

use crate::authentication::{AuthError, Credentials, validate_credentials};

#[derive(serde::Deserialize)]
pub struct FormData {
    username: String,
    password: Secret<String>,
}

#[derive(serde::Serialize)]
pub struct LoginResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
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
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(LoginResponse {
                        success: false,
                        error: Some("Something went wrong".to_string()),
                    }),
                )
                    .into_response();
            }
            (
                StatusCode::OK,
                Json(LoginResponse {
                    success: true,
                    error: None,
                }),
            )
                .into_response()
        }
        Err(e) => {
            let error_msg = match e {
                AuthError::InvalidCredentials(_) => "Authentication failed",
                AuthError::UnexpectedError(_) => "Something went wrong",
            };
            (
                StatusCode::UNAUTHORIZED,
                Json(LoginResponse {
                    success: false,
                    error: Some(error_msg.to_string()),
                }),
            )
                .into_response()
        }
    }
}
