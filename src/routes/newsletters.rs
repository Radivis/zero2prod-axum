use crate::domain::SubscriberEmailAddress;
use crate::email_client::{EmailClient, EmailData};
use crate::telemetry::error_chain_fmt;
use actix_web::{HttpResponse, ResponseError, http::StatusCode, web};
use anyhow::Context;
use sqlx::PgPool;

#[derive(Debug, serde::Deserialize)]
pub struct BodyData {
    title: String,
    content: Content,
}

#[derive(Debug, serde::Deserialize)]
pub struct Content {
    html: String,
    text: String,
}

struct ConfirmedSubscriber {
    email: SubscriberEmailAddress,
}

#[derive(thiserror::Error)]
pub enum PublishError {
    #[error(transparent)]
    UnexpectedError(#[from] anyhow::Error),
}

impl std::fmt::Debug for PublishError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        error_chain_fmt(self, f)
    }
}

impl ResponseError for PublishError {
    fn status_code(&self) -> StatusCode {
        match self {
            PublishError::UnexpectedError(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

#[tracing::instrument(name = "Publish Newsletter", skip(db_connection_pool))]
pub async fn publish_newsletter(
    body: web::Json<BodyData>,
    db_connection_pool: web::Data<PgPool>,
    email_client: web::Data<EmailClient>,
) -> Result<HttpResponse, PublishError> {
    let subscribers = get_confirmed_subscribers(&db_connection_pool).await?;
    tracing::info!(
        "Publishing new newsletter to {} confirmed subscribers",
        subscribers.len()
    );
    let subject = &body.title;
    let html_content = &body.content.html;
    let text_content = &body.content.text;
    for subscriber in subscribers {
        let recipient = &subscriber.email;
        email_client
            .send_email(EmailData {
                // TODO: Cloning all data seems inefficient. Consider changing EmailData to use references.
                recipient: recipient.clone(),
                subject: subject.clone(),
                html_content: html_content.clone(),
                text_content: text_content.clone(),
            })
            .await
            .with_context(|| format!("Failed to send newsletter issue to {}", &subscriber.email))?;
    }
    Ok(HttpResponse::Ok().finish())
}

#[tracing::instrument(name = "Get confirmed subscribers", skip(db_connection_pool))]
async fn get_confirmed_subscribers(
    db_connection_pool: &PgPool,
) -> Result<Vec<ConfirmedSubscriber>, anyhow::Error> {
    struct Row {
        email: String,
    }
    let rows = sqlx::query_as!(
        Row,
        r#"
        SELECT email
        FROM subscriptions
        WHERE status = 'confirmed'
        "#,
    )
    .fetch_all(db_connection_pool)
    .await?;

    // Map into the domain type
    let confirmed_subscribers = rows
        .into_iter()
        .filter_map(|r| match SubscriberEmailAddress::parse(r.email) {
            Ok(email) => Some(ConfirmedSubscriber { email }),
            Err(error) => {
                tracing::warn!(
                    "A confirmed subscriber is using an invalid email address.\n{}.",
                    error
                );
                None
            }
        })
        .collect();

    Ok(confirmed_subscribers)
}
