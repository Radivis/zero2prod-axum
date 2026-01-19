use crate::startup::AppState;
use axum::Json;
use axum::extract::State;
use serde::Serialize;

#[derive(Serialize)]
pub struct UsersExistResponse {
    pub users_exist: bool,
}

pub async fn check_users_exist_endpoint(
    State(state): State<AppState>,
) -> Result<Json<UsersExistResponse>, axum::http::StatusCode> {
    match crate::authentication::check_users_exist(&state.db).await {
        Ok(exists) => Ok(Json(UsersExistResponse {
            users_exist: exists,
        })),
        Err(e) => {
            tracing::error!("Failed to check if users exist: {:?}", e);
            Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}
