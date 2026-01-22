use crate::session_state::TypedSession;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde::Serialize;
use tower_sessions::Session;

#[derive(Serialize)]
pub struct LogoutResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

pub async fn log_out(session: Session) -> impl IntoResponse {
    let typed_session = TypedSession(session);
    match typed_session.get_user_id().await {
        Ok(None) => (
            StatusCode::UNAUTHORIZED,
            Json(LogoutResponse {
                success: false,
                error: Some("Not logged in".to_string()),
            }),
        )
            .into_response(),
        Ok(Some(_)) => {
            // Logout (removes user_id, cycles session ID)
            typed_session.log_out().await;
            (
                StatusCode::OK,
                Json(LogoutResponse {
                    success: true,
                    error: None,
                }),
            )
                .into_response()
        }
        Err(_) => (
            StatusCode::UNAUTHORIZED,
            Json(LogoutResponse {
                success: false,
                error: Some("Not logged in".to_string()),
            }),
        )
            .into_response(),
    }
}
