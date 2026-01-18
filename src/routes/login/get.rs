use crate::flash_messages::IncomingFlashMessages;
use axum::response::Html;
use std::fmt::Write;

pub async fn login_form(flash_messages: IncomingFlashMessages) -> Html<String> {
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
}
