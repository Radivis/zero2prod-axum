use crate::startup::AppState;
use crate::telemetry::error_chain_fmt;
use anyhow::Context;
use axum::extract::{Json, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use secrecy::{ExposeSecret, Secret};

use crate::authentication::{AuthError, Credentials, UserId, validate_credentials};
use crate::routes::admin::utils::get_username;

#[derive(serde::Deserialize)]
pub struct ChangePasswordFormData {
    current_password: Secret<String>,
    new_password: Secret<String>,
    new_password_check: Secret<String>,
}

#[derive(thiserror::Error)]
pub enum ChangePasswordError {
    #[error("You entered two different new passwords - the field values must match.")]
    PasswordMismatch,
    #[error("The new password must have at least 12 characters besides spaces.")]
    PasswordTooShort,
    #[error("The new password must not have more than 128 characters.")]
    PasswordTooLong,
    #[error("The current password is incorrect.")]
    InvalidCurrentPassword,
    #[error(transparent)]
    UnexpectedError(#[from] anyhow::Error),
}

impl std::fmt::Debug for ChangePasswordError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        error_chain_fmt(self, f)
    }
}

#[derive(serde::Serialize)]
pub struct ChangePasswordResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl IntoResponse for ChangePasswordError {
    fn into_response(self) -> axum::response::Response {
        let (status, error_msg) = match self {
            ChangePasswordError::PasswordMismatch => (
                StatusCode::BAD_REQUEST,
                "You entered two different new passwords - the field values must match.",
            ),
            ChangePasswordError::PasswordTooShort => (
                StatusCode::BAD_REQUEST,
                "The new password must have at least 12 characters besides spaces.",
            ),
            ChangePasswordError::PasswordTooLong => (
                StatusCode::BAD_REQUEST,
                "The new password must not have more than 128 characters.",
            ),
            ChangePasswordError::InvalidCurrentPassword => (
                StatusCode::UNAUTHORIZED,
                "The current password is incorrect.",
            ),
            ChangePasswordError::UnexpectedError(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "Something went wrong")
            }
        };
        (
            status,
            Json(ChangePasswordResponse {
                success: false,
                error: Some(error_msg.to_string()),
            }),
        )
            .into_response()
    }
}

pub async fn change_password(
    user_id: UserId,
    State(state): State<AppState>,
    Json(form): Json<ChangePasswordFormData>,
) -> Result<impl IntoResponse, ChangePasswordError> {
    // Validate password match
    if form.new_password.expose_secret() != form.new_password_check.expose_secret() {
        return Err(ChangePasswordError::PasswordMismatch);
    }

    // Validate password length (excluding spaces)
    if form.new_password.expose_secret().replace(" ", "").len() < 12 {
        return Err(ChangePasswordError::PasswordTooShort);
    }

    // Validate maximum password length
    if form.new_password.expose_secret().len() > 128 {
        return Err(ChangePasswordError::PasswordTooLong);
    }

    // Get username for credential validation
    let username = get_username(*user_id, &state.db)
        .await
        .context("Failed to retrieve username")?;

    let credentials = Credentials {
        username,
        password: form.current_password,
    };

    // Validate current password
    if let Err(e) = validate_credentials(credentials, &state.db).await {
        match e {
            AuthError::InvalidCredentials(_) => {
                return Err(ChangePasswordError::InvalidCurrentPassword);
            }
            AuthError::UnexpectedError(err) => {
                return Err(ChangePasswordError::UnexpectedError(err));
            }
        }
    }

    // Change password
    crate::authentication::change_password(*user_id, form.new_password, &state.db)
        .await
        .context("Failed to change password")?;

    Ok((
        StatusCode::OK,
        Json(ChangePasswordResponse {
            success: true,
            error: None,
        }),
    ))
}
