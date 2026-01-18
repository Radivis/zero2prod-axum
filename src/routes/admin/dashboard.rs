use crate::authentication::UserId;
use crate::startup::AppState;
use anyhow::Context;
use axum::extract::State;
use axum::response::Html;
use uuid::Uuid;

#[tracing::instrument(name = "Get username", skip(pool))]
pub async fn get_username(user_id: Uuid, pool: &sqlx::PgPool) -> Result<String, anyhow::Error> {
    let row = sqlx::query!(
        r#"
        SELECT username
        FROM users
        WHERE user_id = $1
        "#,
        user_id,
    )
    .fetch_one(pool)
    .await
    .context("Failed to perform a query to retrieve a username.")?;
    Ok(row.username)
}

pub async fn admin_dashboard(
    State(state): State<AppState>,
    user_id: UserId,
) -> Result<Html<String>, axum::http::StatusCode> {
    let username = get_username(*user_id, &state.db)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Html(format!(
        r#"<!DOCTYPE html>
<html lang="en">
    <head>
        <meta http-equiv="content-type" content="text/html; charset=utf-8">
        <title>Admin dashboard</title>
    </head>
    <body>
        <p>Welcome {username}!</p>
        <p>Available actions:</p>
        <ol>
            <li><a href="/admin/password">Change password</a></li>
            <li><a href="/admin/newsletters">Send a newsletter</a></li>
            <li>
                <form name="logoutForm" action="/admin/logout" method="post">
                    <input type="submit" value="Logout">
                </form>
            </li>
        </ol>
    </body>
</html>"#
    )))
}
