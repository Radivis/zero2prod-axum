//! src/issue_delivery_worker.rs
use crate::email_client::{EmailClient, EmailData};
use sqlx::{Executor, PgPool, Postgres, Row, Transaction};
use std::time::Duration;
use tracing::{Span, field::display};
use uuid::Uuid;

use crate::domain::SubscriberEmailAddress;
use crate::{configuration::Settings, startup::get_connection_pool};

struct NewsletterIssue {
    title: String,
    text_content: String,
    html_content: String,
}

struct IssueDeliveryQueueItem {
    newsletter_issue_id: Uuid,
    subscriber_email_address: String,
}

pub enum ExecutionOutcome {
    TaskCompleted,
    EmptyQueue,
}

pub async fn run_worker_until_stopped(configuration: Settings) -> Result<(), anyhow::Error> {
    let connection_pool = get_connection_pool(&configuration.database);
    let email_client = configuration.email_client.client();
    worker_loop(connection_pool, email_client).await
}

async fn worker_loop(pool: PgPool, email_client: EmailClient) -> Result<(), anyhow::Error> {
    // TODO: Handle fatal failures like invalid subscriber email addresses
    loop {
        match try_execute_task(&pool, &email_client).await {
            Ok(ExecutionOutcome::EmptyQueue) => {
                tokio::time::sleep(Duration::from_secs(10)).await;
            }
            Err(_) => {
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
            Ok(ExecutionOutcome::TaskCompleted) => {}
        }
    }
}

#[tracing::instrument(
    skip_all,
    fields(
        newsletter_issue_id=tracing::field::Empty,
        subscriber_email=tracing::field::Empty
    ),
    err
)]
pub async fn try_execute_task(
    pool: &PgPool,
    email_client: &EmailClient,
) -> Result<ExecutionOutcome, anyhow::Error> {
    let task = dequeue_task(pool).await?;
    let Some((transaction, issue_id, email)) = task else {
        return Ok(ExecutionOutcome::EmptyQueue);
    };
    Span::current()
        .record("newsletter_issue_id", display(issue_id))
        .record("subscriber_email_address", display(&email));

    match SubscriberEmailAddress::parse(email.clone()) {
        Ok(email) => {
            let issue = get_issue(pool, issue_id).await?;
            if let Err(e) = email_client
                .send_email(EmailData {
                    recipient: &email,
                    subject: &issue.title,
                    html_content: &issue.html_content,
                    text_content: &issue.text_content,
                })
                .await
            {
                tracing::error!(
                    error.cause_chain = ?e,
                    error.message = %e,
                    "Failed to deliver issue to a confirmed subscriber. \
                    Skipping.",
                );
            }
        }
        Err(e) => {
            tracing::error!(
                error.cause_chain = ?e,
                error.message = %e,
                "Skipping a confirmed subscriber. \
                Their stored contact details are invalid",
            );
        }
    }

    delete_task(transaction, issue_id, &email).await?;

    Ok(ExecutionOutcome::TaskCompleted)
}

type PgTransaction = Transaction<'static, Postgres>;

#[tracing::instrument(skip_all)]
async fn dequeue_task(
    pool: &PgPool,
) -> Result<Option<(PgTransaction, Uuid, String)>, anyhow::Error> {
    let mut transaction = pool.begin().await?;
    let query = sqlx::query!(
        r#"
        SELECT newsletter_issue_id, subscriber_email_address
        FROM issue_delivery_queue
        FOR UPDATE
        SKIP LOCKED
        LIMIT 1
        "#,
    );
    let result = transaction.fetch_optional(query).await?;
    if let Some(r) = result {
        let item = IssueDeliveryQueueItem {
            newsletter_issue_id: r.get(0),
            subscriber_email_address: r.get(1),
        };
        Ok(Some((
            transaction,
            item.newsletter_issue_id,
            item.subscriber_email_address,
        )))
    } else {
        Ok(None)
    }
}

#[tracing::instrument(skip_all)]
async fn delete_task(
    mut transaction: PgTransaction,
    issue_id: Uuid,
    email: &str,
) -> Result<(), anyhow::Error> {
    let query = sqlx::query!(
        r#"
        DELETE FROM issue_delivery_queue
        WHERE
        newsletter_issue_id = $1 AND
        subscriber_email_address = $2
        "#,
        issue_id,
        email
    );
    transaction.execute(query).await?;
    transaction.commit().await?;
    Ok(())
}

#[tracing::instrument(skip_all)]
async fn get_issue(pool: &PgPool, issue_id: Uuid) -> Result<NewsletterIssue, anyhow::Error> {
    let issue = sqlx::query_as!(
        NewsletterIssue,
        r#"
        SELECT title, text_content, html_content
        FROM newsletter_issues
        WHERE
        newsletter_issue_id = $1
        "#,
        issue_id
    )
    .fetch_one(pool)
    .await?;
    Ok(issue)
}
