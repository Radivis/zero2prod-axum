use crate::flash_messages::IncomingFlashMessages;
use axum::response::Html;
use std::fmt::Write;

pub async fn publish_newsletter_form(flash_messages: IncomingFlashMessages) -> Html<String> {
    let mut msg_html = String::new();
    for m in flash_messages.0.iter() {
        writeln!(msg_html, "<p><i>{}</i></p>", m.content).unwrap();
    }
    let idempotency_key = uuid::Uuid::new_v4();

    Html(format!(
        r#"<!DOCTYPE html>
<html lang="en">
    <head>
        <meta http-equiv="content-type" content="text/html; charset=utf-8">
        <title>Send a newsletter</title>
    </head>
    <body>
        {msg_html}
        <form action="/admin/newsletters" method="post">
            <label>Title
                <input
                    type="text"
                    placeholder="Enter a title"
                    name="title"
                >
            </label>
            <br>
            <label>HTML Content
                <textarea
                    placeholder="Enter the content of the regular (HTML) newsletter"
                    name="html_content"
                    rows="20"
                    cols=100"
                ></textarea>
            </label>
            <br>
            <label>Plain text Content
                <textarea
                    placeholder="Enter the content of the plain text newsletter"
                    name="text_content"
                    rows="20"
                    cols=100"
                ></textarea>
            </label>
            <br>
            <input hidden type="text" name="idempotency_key" value="{idempotency_key}">
            <button type="submit">Send newsletter</button>
        </form>
    <p><a href="/admin/dashboard">&lt;- Back</a></p>
    </body>
</html>"#,
    ))
}
