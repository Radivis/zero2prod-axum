use crate::flash_messages::IncomingFlashMessages;
use crate::startup::AppState;
use axum::extract::State;
use axum::response::{Html, IntoResponse, Redirect};
use std::fmt::Write;

pub async fn login_form(
    flash_messages: IncomingFlashMessages,
    State(state): State<AppState>,
) -> impl axum::response::IntoResponse {
    // Check if any users exist
    match crate::authentication::check_users_exist(&state.db).await {
        Ok(false) => {
            // No users exist, redirect to initial password setup
            return Redirect::to("/initial_password").into_response();
        }
        Ok(true) => {
            // Users exist, show login form
        }
        Err(e) => {
            tracing::error!("Failed to check if users exist: {:?}", e);
            // On error, show login form anyway (fail open)
        }
    }
    let mut error_html = String::new();
    for m in flash_messages.0.iter() {
        writeln!(error_html, "<p><i>{}</i></p>", m.content).unwrap();
    }
    Html(format!(
        r#"<!DOCTYPE html>
<html lang="en">
    <head>
        <meta http-equiv="content-type" content="text/html; charset=utf-8">
        <title>Login</title>
    </head>
    <body>
        {error_html}
        <form action="/login" method="post">
            <p>
                <label>Username
                    <input
                        type="text"
                        placeholder="Enter Username"
                        name="username"
                    >
                </label>
            </p>
            <p>
                <label>Password
                    <input
                        type="password"
                        placeholder="Enter Password"
                        name="password"
                    >
                </label>
            </p>
            <button type="submit">Login</button>
        </form>
    </body>
</html>"#,
    ))
    .into_response()
}
