use actix_web::{HttpResponse, web};
use actix_web_flash_messages::FlashMessage;
use axum::extract::{Form, State};
use axum::response::{Redirect, IntoResponse};
use tower_sessions::Session;
use crate::flash_messages::FlashMessageSender;
use crate::startup_axum::AppState;
use secrecy::{ExposeSecret, Secret};
use sqlx::PgPool;

use crate::authentication::{AuthError, Credentials, UserId, validate_credentials};
use crate::routes::admin::dashboard::get_username;
use crate::utils::{e500, see_other};

#[derive(serde::Deserialize)]
pub struct ChangePasswordFormData {
    current_password: Secret<String>,
    new_password: Secret<String>,
    new_password_check: Secret<String>,
}

pub async fn change_password(
    form: web::Form<ChangePasswordFormData>,
    pool: web::Data<PgPool>,
    user_id: web::ReqData<UserId>,
) -> Result<HttpResponse, actix_web::Error> {
    let user_id = user_id.into_inner();

    if form.new_password.expose_secret() != form.new_password_check.expose_secret() {
        FlashMessage::error(
            "You entered two different new passwords - the field values must match.",
        )
        .send();
        return Ok(see_other("/admin/password"));
    }

    if form.new_password.expose_secret().replace(" ", "").len() < 12 {
        FlashMessage::error("The new password must have at least 12 characters besides spaces.")
            .send();
        return Ok(see_other("/admin/password"));
    }

    if form.new_password.expose_secret().len() > 128 {
        FlashMessage::error("The new password must not have more than 128 characters.").send();
        return Ok(see_other("/admin/password"));
    }

    let username = get_username(*user_id, &pool).await.map_err(e500)?;
    let credentials = Credentials {
        username,
        password: form.0.current_password,
    };
    if let Err(e) = validate_credentials(credentials, &pool).await {
        return match e {
            AuthError::InvalidCredentials(_) => {
                FlashMessage::error("The current password is incorrect.").send();
                Ok(see_other("/admin/password"))
            }
            AuthError::UnexpectedError(_) => Err(e500(e)),
        };
    }
    crate::authentication::change_password(*user_id, form.0.new_password, &pool)
        .await
        .map_err(e500)?;
    FlashMessage::info("Your password has been changed.").send();
    Ok(see_other("/admin/password"))
}

// Axum version
pub async fn change_password_axum(
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
            ).into_response();
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
                if let Err(err) = flash_sender.error("The current password is incorrect.").await {
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
    if let Err(_) = crate::authentication::change_password(*user_id, form.new_password, &state.db).await {
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
