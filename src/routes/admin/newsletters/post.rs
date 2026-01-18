use actix_web::http::header::HeaderValue;
use actix_web::http::{StatusCode, header};
use actix_web::{HttpResponse, ResponseError, web};
use actix_web_flash_messages::FlashMessage;
use axum::extract::{Form, State};
use axum::http::{HeaderValue as AxumHeaderValue, StatusCode as AxumStatusCode, header as AxumHeader};
use axum::response::{IntoResponse, Redirect, Response};
use tower_sessions::Session;
use crate::flash_messages::FlashMessageSender;
use crate::startup_axum::AppState;
use anyhow::Context;

use sqlx::{Executor, PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::authentication::UserId;
use crate::domain::SubscriberEmailAddress;
use crate::idempotency::{IdempotencyKey, NextAction, NextActionAxum, save_response, save_response_axum, try_processing, try_processing_axum};
use crate::telemetry::error_chain_fmt;
use crate::utils::see_other;

#[derive(Debug, serde::Deserialize)]
pub struct SendNewsletterFormData {
    title: String,
    html_content: String,
    text_content: String,
    idempotency_key: String,
}

#[allow(dead_code)]
struct ConfirmedSubscriber {
    email: SubscriberEmailAddress,
}

#[derive(thiserror::Error)]
pub enum PublishError {
    #[error("Authentication failed")]
    AuthError(#[source] anyhow::Error),
    #[error(transparent)]
    UnexpectedError(#[from] anyhow::Error),
}

impl std::fmt::Debug for PublishError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        error_chain_fmt(self, f)
    }
}

impl ResponseError for PublishError {
    fn error_response(&self) -> HttpResponse {
        match self {
            PublishError::UnexpectedError(_) => {
                HttpResponse::new(StatusCode::INTERNAL_SERVER_ERROR)
            }
            PublishError::AuthError(_) => {
                let mut response = HttpResponse::new(StatusCode::UNAUTHORIZED);
                let header_value = HeaderValue::from_str(r#"Basic realm="publish""#).unwrap();
                response
                    .headers_mut()
                    // actix_web::http::header provides a collection of constants
                    // for the names of several well-known/standard HTTP headers
                    .insert(header::WWW_AUTHENTICATE, header_value);
                response
            }
        }
    }
}

fn success_message() -> FlashMessage {
    FlashMessage::info(
        "The newsletter issue has been accepted - \
        emails will go out shortly.",
    )
}

#[tracing::instrument(
    name = "Publish Newsletter",
    skip(form, db_connection_pool, user_id)
    fields(username=tracing::field::Empty, user_id=tracing::field::Empty)
)]
pub async fn publish_newsletter(
    form: web::Form<SendNewsletterFormData>,
    db_connection_pool: web::Data<PgPool>,
    user_id: web::ReqData<UserId>,
) -> Result<HttpResponse, PublishError> {
    // We must destructure the form to avoid upsetting the borrow-checker
    let SendNewsletterFormData {
        title,
        text_content,
        html_content,
        idempotency_key,
    } = form.0;
    let idempotency_key: IdempotencyKey = idempotency_key.try_into()?;
    let user_id = user_id.into_inner();
    let mut transaction =
        match try_processing(&db_connection_pool, &idempotency_key, *user_id).await? {
            NextAction::StartProcessing(t) => t,
            NextAction::ReturnSavedResponse(saved_response) => {
                tracing::info!(
                    "Returning saved response due to idempotency: {:?}",
                    saved_response
                );
                success_message().send();
                return Ok(saved_response);
            }
        };

    tracing::Span::current().record("user_id", tracing::field::display(&user_id));
    let subscribers = get_confirmed_subscribers(&db_connection_pool).await?;
    tracing::info!(
        "Publishing new newsletter to {} confirmed subscribers",
        subscribers.len()
    );
    let issue_id = insert_newsletter_issue(&mut transaction, &title, &text_content, &html_content)
        .await
        .context("Failed to store newsletter issue details")?;
    enqueue_delivery_tasks(&mut transaction, issue_id)
        .await
        .context("Failed to enqueue delivery tasks")?;

    success_message().send();
    let response = see_other("/admin/newsletters");
    let response = save_response(transaction, &idempotency_key, *user_id, response).await?;
    Ok(response)
}

#[tracing::instrument(name = "Get confirmed subscribers", skip(db_connection_pool))]
async fn get_confirmed_subscribers(
    db_connection_pool: &PgPool,
) -> Result<Vec<Result<ConfirmedSubscriber, anyhow::Error>>, anyhow::Error> {
    let confirmed_subscribers = sqlx::query!(
        r#"
        SELECT email
        FROM subscriptions
        WHERE status = 'confirmed'
        "#,
    )
    .fetch_all(db_connection_pool)
    .await?
    .into_iter()
    .map(|r| match SubscriberEmailAddress::parse(r.email) {
        Ok(email) => Ok(ConfirmedSubscriber { email }),
        Err(error) => Err(anyhow::anyhow!(error)),
    })
    .collect();

    Ok(confirmed_subscribers)
}

#[tracing::instrument(skip_all)]
async fn insert_newsletter_issue(
    transaction: &mut Transaction<'_, Postgres>,
    title: &str,
    text_content: &str,
    html_content: &str,
) -> Result<Uuid, sqlx::Error> {
    let newsletter_issue_id = Uuid::new_v4();
    let query = sqlx::query!(
        r#"
        INSERT INTO newsletter_issues (
        newsletter_issue_id,
        title,
        text_content,
        html_content,
        published_at
        )
        VALUES ($1, $2, $3, $4, now())
        "#,
        newsletter_issue_id,
        title,
        text_content,
        html_content
    );
    transaction.execute(query).await?;
    Ok(newsletter_issue_id)
}

#[tracing::instrument(skip_all)]
async fn enqueue_delivery_tasks(
    transaction: &mut Transaction<'_, Postgres>,
    newsletter_issue_id: Uuid,
) -> Result<(), sqlx::Error> {
    let query = sqlx::query!(
        r#"
        INSERT INTO issue_delivery_queue (
        newsletter_issue_id,
        subscriber_email_address
        )
        SELECT $1, email
        FROM subscriptions
        WHERE status = 'confirmed'
        "#,
        newsletter_issue_id,
    );
    transaction.execute(query).await?;
    Ok(())
}

// Axum version
#[tracing::instrument(
    name = "Publish Newsletter",
    skip(form, state, user_id, session)
    fields(username=tracing::field::Empty, user_id=tracing::field::Empty)
)]
pub async fn publish_newsletter_axum(
    user_id: UserId,
    session: Session,
    State(state): State<AppState>,
    Form(form): Form<SendNewsletterFormData>,
) -> Result<impl IntoResponse, PublishErrorAxum> {
    let SendNewsletterFormData {
        title,
        text_content,
        html_content,
        idempotency_key,
    } = form;
    let idempotency_key: IdempotencyKey = idempotency_key.try_into()
        .map_err(|e| PublishErrorAxum::UnexpectedError(anyhow::anyhow!("Invalid idempotency key: {}", e)))?;
    let mut transaction =
        match try_processing_axum(&state.db, &idempotency_key, *user_id).await? {
            NextActionAxum::StartProcessing(t) => t,
            NextActionAxum::ReturnSavedResponse(saved_response) => {
                tracing::info!(
                    "Returning saved response due to idempotency: {:?}",
                    saved_response.status()
                );
                let flash_sender = FlashMessageSender::new(session.clone());
                if let Err(e) = flash_sender
                    .info("The newsletter issue has been accepted - emails will go out shortly.")
                    .await
                {
                    tracing::error!("Failed to set flash message: {:?}", e);
                }
                return Ok(saved_response);
            }
        };

    tracing::Span::current().record("user_id", tracing::field::display(&user_id));
    let subscribers = get_confirmed_subscribers(&state.db).await?;
    tracing::info!(
        "Publishing new newsletter to {} confirmed subscribers",
        subscribers.len()
    );
    let issue_id = insert_newsletter_issue(&mut transaction, &title, &text_content, &html_content)
        .await
        .context("Failed to store newsletter issue details")?;
    enqueue_delivery_tasks(&mut transaction, issue_id)
        .await
        .context("Failed to enqueue delivery tasks")?;

    let flash_sender = FlashMessageSender::new(session);
    if let Err(e) = flash_sender
        .info("The newsletter issue has been accepted - emails will go out shortly.")
        .await
    {
        tracing::error!("Failed to set flash message: {:?}", e);
    }
    let response = Redirect::to("/admin/newsletters").into_response();
    let response = save_response_axum(transaction, &idempotency_key, *user_id, response).await?;
    Ok(response)
}

#[derive(thiserror::Error)]
pub enum PublishErrorAxum {
    #[error("Authentication failed")]
    AuthError(#[source] anyhow::Error),
    #[error(transparent)]
    UnexpectedError(#[from] anyhow::Error),
}

impl std::fmt::Debug for PublishErrorAxum {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        error_chain_fmt(self, f)
    }
}

impl IntoResponse for PublishErrorAxum {
    fn into_response(self) -> Response {
        match self {
            PublishErrorAxum::UnexpectedError(_) => {
                AxumStatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
            PublishErrorAxum::AuthError(_) => {
                let mut headers = axum::http::HeaderMap::new();
                let header_value = AxumHeaderValue::from_str(r#"Basic realm="publish""#)
                    .unwrap();
                headers.insert(AxumHeader::WWW_AUTHENTICATE, header_value);
                (AxumStatusCode::UNAUTHORIZED, headers).into_response()
            }
        }
    }
}
