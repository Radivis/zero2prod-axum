use crate::startup::AppState;
use crate::telemetry::error_chain_fmt;
use anyhow::Context;
use axum::extract::{Json, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use secrecy::{ExposeSecret, Secret};

#[derive(serde::Deserialize)]
pub struct InitialPasswordFormData {
    username: String,
    password: Secret<String>,
    password_confirmation: Secret<String>,
}

#[derive(thiserror::Error)]
pub enum InitialPasswordError {
    #[error("You entered two different passwords - the field values must match.")]
    PasswordMismatch,
    #[error("The password must have at least 12 characters besides spaces.")]
    PasswordTooShort,
    #[error("The password must not have more than 128 characters.")]
    PasswordTooLong,
    #[error("Users already exist. Initial password setup is only available when no users exist.")]
    UsersAlreadyExist,
    #[error(transparent)]
    UnexpectedError(#[from] anyhow::Error),
}

impl std::fmt::Debug for InitialPasswordError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        error_chain_fmt(self, f)
    }
}

impl IntoResponse for InitialPasswordError {
    fn into_response(self) -> axum::response::Response {
        match self {
            InitialPasswordError::PasswordMismatch
            | InitialPasswordError::PasswordTooShort
            | InitialPasswordError::PasswordTooLong
            | InitialPasswordError::UsersAlreadyExist => {
                // Return JSON error for frontend to handle
                (
                    StatusCode::BAD_REQUEST,
                    axum::Json(serde_json::json!({ "error": self.to_string() })),
                )
                    .into_response()
            }
            InitialPasswordError::UnexpectedError(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(serde_json::json!({ "error": "Internal server error" })),
            )
                .into_response(),
        }
    }
}

#[tracing::instrument(skip(form, state))]
pub async fn create_initial_password(
    State(state): State<AppState>,
    Json(form): Json<InitialPasswordFormData>,
) -> Result<impl IntoResponse, InitialPasswordError> {
    // First check if users already exist - this is a security check
    let users_exist = crate::authentication::check_users_exist(&state.db)
        .await
        .context("Failed to check if users exist")?;

    if users_exist {
        return Err(InitialPasswordError::UsersAlreadyExist);
    }

    // Validate password match
    if form.password.expose_secret() != form.password_confirmation.expose_secret() {
        return Err(InitialPasswordError::PasswordMismatch);
    }

    // Validate password length (excluding spaces)
    if form.password.expose_secret().replace(" ", "").len() < 12 {
        return Err(InitialPasswordError::PasswordTooShort);
    }

    // Validate maximum password length
    if form.password.expose_secret().len() > 128 {
        return Err(InitialPasswordError::PasswordTooLong);
    }

    // Create admin user with provided username
    let _user_id =
        crate::authentication::create_admin_user(form.username.clone(), form.password, &state.db)
            .await
            .context("Failed to create admin user")?;

    // Return JSON response for API clients
    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "success": true,
            "username": form.username.to_string(),
            "message": "Admin user created successfully. Please log in."
        })),
    ))
}
