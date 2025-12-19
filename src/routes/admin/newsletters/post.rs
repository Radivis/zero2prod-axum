use actix_web::http::header::HeaderValue;
use actix_web::http::{StatusCode, header};
use actix_web::{HttpResponse, ResponseError, web};
use actix_web_flash_messages::FlashMessage;
use anyhow::Context;

use sqlx::PgPool;

use crate::authentication::UserId;
use crate::domain::SubscriberEmailAddress;
use crate::email_client::{EmailClient, EmailData};
use crate::idempotency::{IdempotencyKey, NextAction, save_response, try_processing};
use crate::telemetry::error_chain_fmt;
use crate::utils::see_other;

#[derive(Debug, serde::Deserialize)]
pub struct SendNewsletterFormData {
    title: String,
    html_content: String,
    text_content: String,
    idempotency_key: String,
}

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
    FlashMessage::info("The newsletter issue has been published!")
}

#[tracing::instrument(
    name = "Publish Newsletter",
    skip(form, db_connection_pool, user_id)
    fields(username=tracing::field::Empty, user_id=tracing::field::Empty)
)]
pub async fn publish_newsletter(
    form: web::Form<SendNewsletterFormData>,
    db_connection_pool: web::Data<PgPool>,
    email_client: web::Data<EmailClient>,
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
    let transaction = match try_processing(&db_connection_pool, &idempotency_key, *user_id).await? {
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
    let subject = &title;
    let html_content = &html_content;
    let text_content = &text_content;
    for subscriber in subscribers {
        match subscriber {
            Ok(subscriber) => {
                let recipient = &subscriber.email;
                email_client
                    .send_email(EmailData {
                        recipient,
                        subject,
                        html_content,
                        text_content,
                    })
                    .await
                    .with_context(|| format!("Failed to send newsletter issue to {}", recipient))?;
            }
            Err(error) => {
                tracing::warn!(
                    // We record the error chain as a structured field
                    // on the log record.
                    error.cause_chain = ?error,
                    // Using `\` to split a long string literal over
                    // two lines, without creating a `\n` character.
                    "Skipping a confirmed subscriber. \
                    Their stored contact details are invalid",
                );
            }
        }
    }
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
