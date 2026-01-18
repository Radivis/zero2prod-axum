use crate::flash_messages::FlashMessageSender;
use crate::startup::AppState;
use crate::telemetry::error_chain_fmt;
use anyhow::Context;
use axum::extract::{Form, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Redirect};
use secrecy::{ExposeSecret, Secret};
use tower_sessions::Session;

use crate::authentication::{AuthError, Credentials, UserId, validate_credentials};
use crate::routes::admin::dashboard::get_username;

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

impl IntoResponse for ChangePasswordError {
    fn into_response(self) -> axum::response::Response {
        match self {
            ChangePasswordError::PasswordMismatch
            | ChangePasswordError::PasswordTooShort
            | ChangePasswordError::PasswordTooLong
            | ChangePasswordError::InvalidCurrentPassword => {
                // Flash message already set in handler, just redirect
                Redirect::to("/admin/password").into_response()
            }
            ChangePasswordError::UnexpectedError(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error").into_response()
            }
        }
    }
}

pub async fn change_password(
    user_id: UserId,
    session: Session,
    State(state): State<AppState>,
    Form(form): Form<ChangePasswordFormData>,
) -> Result<impl IntoResponse, ChangePasswordError> {
    // Validate password match
    if form.new_password.expose_secret() != form.new_password_check.expose_secret() {
        let flash_sender = FlashMessageSender::new(session.clone());
        if let Err(e) = flash_sender
            .error("You entered two different new passwords - the field values must match.")
            .await
        {
            tracing::error!("Failed to set flash message: {:?}", e);
        }
        return Err(ChangePasswordError::PasswordMismatch);
    }

    // Validate password length (excluding spaces)
    if form.new_password.expose_secret().replace(" ", "").len() < 12 {
        let flash_sender = FlashMessageSender::new(session.clone());
        if let Err(e) = flash_sender
            .error("The new password must have at least 12 characters besides spaces.")
            .await
        {
            tracing::error!("Failed to set flash message: {:?}", e);
        }
        return Err(ChangePasswordError::PasswordTooShort);
    }

    // Validate maximum password length
    if form.new_password.expose_secret().len() > 128 {
        let flash_sender = FlashMessageSender::new(session.clone());
        if let Err(e) = flash_sender
            .error("The new password must not have more than 128 characters.")
            .await
        {
            tracing::error!("Failed to set flash message: {:?}", e);
        }
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
                let flash_sender = FlashMessageSender::new(session.clone());
                if let Err(err) = flash_sender
                    .error("The current password is incorrect.")
                    .await
                {
                    tracing::error!("Failed to set flash message: {:?}", err);
                }
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

    // Set success flash message
    let flash_sender = FlashMessageSender::new(session);
    if let Err(e) = flash_sender.info("Your password has been changed.").await {
        tracing::error!("Failed to set flash message: {:?}", e);
    }

    Ok(Redirect::to("/admin/password"))
}
