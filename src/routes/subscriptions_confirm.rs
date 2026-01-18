use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use crate::startup::AppState;
use uuid::Uuid;

#[derive(serde::Deserialize)]
#[allow(unused)]
pub struct Parameters {
    subscription_token: String,
}
#[tracing::instrument(
    name = "Mark subscriber as confirmed",
    skip(subscriber_id, db)
)]
pub async fn confirm_subscriber(
    db: &sqlx::PgPool,
    subscriber_id: Uuid,
) -> Result<(), sqlx::Error> {
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

#[tracing::instrument(
    name = "Get subscriber_id from token",
    skip(subscription_token, db)
)]
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

#[tracing::instrument(
    name = "Confirm a pending subscriber",
    skip(parameters, state)
)]
pub async fn confirm(
    State(state): State<AppState>,
    Query(parameters): Query<Parameters>,
) -> impl IntoResponse {
    let subscriber_id =
        match get_subscriber_id_from_token(&state.db, &parameters.subscription_token)
            .await
        {
            Ok(subscriber_id) => subscriber_id,
            Err(_) => return StatusCode::INTERNAL_SERVER_ERROR,
        };
    match subscriber_id {
        // Non-existing token!
        None => StatusCode::UNAUTHORIZED,
        Some(subscriber_id_) => {
            if confirm_subscriber(&state.db, subscriber_id_)
                .await
                .is_err()
            {
                return StatusCode::INTERNAL_SERVER_ERROR;
            }
            StatusCode::OK
        }
    }
}
