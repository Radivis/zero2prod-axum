use crate::startup::AppState;
use crate::telemetry::error_chain_fmt;
use anyhow::Context;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use uuid::Uuid;

#[derive(serde::Deserialize, utoipa::IntoParams)]
#[allow(unused)]
pub struct Parameters {
    /// Subscription confirmation token received via email
    subscription_token: String,
}
#[tracing::instrument(name = "Mark subscriber as confirmed", skip(subscriber_id, db))]
pub async fn confirm_subscriber(db: &sqlx::PgPool, subscriber_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE subscriptions SET status = 'confirmed' WHERE id = $1"#,
        subscriber_id,
    )
    .execute(db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to execute query: {:?}", e);
        e
    })?;
    Ok(())
}

#[tracing::instrument(name = "Get subscriber_id from token", skip(subscription_token, db))]
pub async fn get_subscriber_id_from_token(
    db: &sqlx::PgPool,
    subscription_token: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    let result = sqlx::query!(
        "SELECT subscriber_id FROM subscription_tokens \
        WHERE subscription_token = $1",
        subscription_token,
    )
    .fetch_optional(db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to execute query: {:?}", e);
        e
    })?;
    Ok(result.map(|r| r.subscriber_id))
}

#[derive(thiserror::Error)]
pub enum ConfirmError {
    #[error("Invalid or expired subscription token")]
    InvalidToken,
    #[error(transparent)]
    UnexpectedError(#[from] anyhow::Error),
}

impl std::fmt::Debug for ConfirmError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        error_chain_fmt(self, f)
    }
}

impl IntoResponse for ConfirmError {
    fn into_response(self) -> axum::response::Response {
        let status = match self {
            ConfirmError::InvalidToken => StatusCode::UNAUTHORIZED,
            ConfirmError::UnexpectedError(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (status, self.to_string()).into_response()
    }
}

/// Confirm newsletter subscription
///
/// Activates a subscription using the token received via email.
/// This endpoint is called when a user clicks the confirmation link in their email.
#[utoipa::path(
    get,
    path = "/api/subscriptions/confirm",
    tag = "subscriptions",
    params(Parameters),
    responses(
        (status = 200, description = "Subscription confirmed successfully"),
        (status = 401, description = "Invalid or expired subscription token"),
        (status = 500, description = "Internal server error"),
    )
)]
#[tracing::instrument(name = "Confirm a pending subscriber", skip(parameters, state))]
pub async fn confirm(
    State(state): State<AppState>,
    Query(parameters): Query<Parameters>,
) -> Result<impl IntoResponse, ConfirmError> {
    let subscriber_id = get_subscriber_id_from_token(&state.db, &parameters.subscription_token)
        .await
        .context("Failed to retrieve subscriber ID from token")?;

    let subscriber_id = subscriber_id.ok_or(ConfirmError::InvalidToken)?;

    confirm_subscriber(&state.db, subscriber_id)
        .await
        .context("Failed to confirm subscriber")?;

    Ok(StatusCode::OK)
}
