use crate::flash_messages::FlashMessageSender;
use crate::startup::AppState;
use axum::extract::{Form, State};
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

pub async fn change_password(
    user_id: UserId,
    session: Session,
    State(state): State<AppState>,
    Form(form): Form<ChangePasswordFormData>,
) -> axum::response::Response {
    if form.new_password.expose_secret() != form.new_password_check.expose_secret() {
        let flash_sender = FlashMessageSender::new(session.clone());
        if let Err(e) = flash_sender
            .error("You entered two different new passwords - the field values must match.")
            .await
        {
            tracing::error!("Failed to set flash message: {:?}", e);
        }
        return Redirect::to("/admin/password").into_response();
    }

    if form.new_password.expose_secret().replace(" ", "").len() < 12 {
        let flash_sender = FlashMessageSender::new(session.clone());
        if let Err(e) = flash_sender
            .error("The new password must have at least 12 characters besides spaces.")
            .await
        {
            tracing::error!("Failed to set flash message: {:?}", e);
        }
        return Redirect::to("/admin/password").into_response();
    }

    if form.new_password.expose_secret().len() > 128 {
        let flash_sender = FlashMessageSender::new(session.clone());
        if let Err(e) = flash_sender
            .error("The new password must not have more than 128 characters.")
            .await
        {
            tracing::error!("Failed to set flash message: {:?}", e);
        }
        return Redirect::to("/admin/password").into_response();
    }

    let username = match get_username(*user_id, &state.db).await {
        Ok(username) => username,
        Err(_) => {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error",
            )
                .into_response();
        }
    };
    let credentials = Credentials {
        username,
        password: form.current_password,
    };
    if let Err(e) = validate_credentials(credentials, &state.db).await {
        let flash_sender = FlashMessageSender::new(session.clone());
        match e {
            AuthError::InvalidCredentials(_) => {
                if let Err(err) = flash_sender
                    .error("The current password is incorrect.")
                    .await
                {
                    tracing::error!("Failed to set flash message: {:?}", err);
                }
                return Redirect::to("/admin/password").into_response();
            }
            AuthError::UnexpectedError(_) => {
                return (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error",
                )
                    .into_response();
            }
        }
    }
    if crate::authentication::change_password(*user_id, form.new_password, &state.db)
        .await
        .is_err()
    {
        return (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error",
        )
            .into_response();
    }
    let flash_sender = FlashMessageSender::new(session);
    if let Err(e) = flash_sender.info("Your password has been changed.").await {
        tracing::error!("Failed to set flash message: {:?}", e);
    }
    Redirect::to("/admin/password").into_response()
}
