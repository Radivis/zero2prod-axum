use actix_web::http::header::HeaderValue;
use actix_web::http::{StatusCode, header};
use actix_web::{HttpResponse, ResponseError, web};
use anyhow::Context;

use sqlx::PgPool;

use crate::authentication::UserId;
use crate::domain::SubscriberEmailAddress;
use crate::email_client::{EmailClient, EmailData};
use crate::telemetry::error_chain_fmt;

#[derive(Debug, serde::Deserialize)]
pub struct SendNewsletterFormData {
    title: String,
    html_content: String,
    text_content: String,
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
    let user_id = user_id.into_inner();
    tracing::Span::current().record("user_id", tracing::field::display(&user_id));
    let subscribers = get_confirmed_subscribers(&db_connection_pool).await?;
    tracing::info!(
        "Publishing new newsletter to {} confirmed subscribers",
        subscribers.len()
    );
    let subject = &form.title;
    let html_content = &form.html_content;
    let text_content = &form.text_content;
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
    Ok(HttpResponse::Ok().finish())
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
