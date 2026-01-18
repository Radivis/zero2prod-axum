use crate::helpers::{
    ConfirmationLinks, TestApp, assert_is_redirect_to, mount_mock_email_server, spawn_app,
    spawn_app_container_with_user,
};
use fake::Fake;
use fake::faker::internet::en::SafeEmail;
use fake::faker::name::en::Name;
use std::time::Duration;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockBuilder, ResponseTemplate, Times};

// Shorthand for a common mocking setup
fn when_sending_an_email() -> MockBuilder {
    Mock::given(path("/email")).and(method("POST"))
}

const NEWSLETTER_CONFIRMATION_MESSAGE: &str = "<p><i>The newsletter issue has been accepted - \
emails will go out shortly.</i></p>";

#[tokio::test]
async fn newsletters_are_not_delivered_to_unconfirmed_subscribers() {
    // Arrange
    let container = spawn_app_container_with_user().await.login().await;
    create_unconfirmed_subscriber(&container.app).await;

    // No request is supposed to hit our email server mirroring no newsletter being sent!
    let times: Times = 0.into();
    let _ = mount_mock_email_server(&container.app.email_server, Some(times)).await;

    // Act
    // Use the fact that there are no confirmed subscribers at all at this stage!
    let response = container
        .app
        .post_newsletters(&serde_json::json!({
            "title": "Newsletter title",
            "text_content": "Newsletter body as plain text",
            "html_content": "<p>Newsletter body as HTML</p>",
            "idempotency_key": uuid::Uuid::new_v4().to_string()
        }))
        .await;

    // Assert
    assert_eq!(response.status().as_u16(), 303);

    // Act - Part 2 - Follow the redirect
    let html_page = container.app.get_newsletters().await.text().await.unwrap();
    assert!(html_page.contains(NEWSLETTER_CONFIRMATION_MESSAGE));

    container.app.dispatch_all_pending_emails().await;

    // Mock verifies on Drop that we haven't sent the newsletter email
}

#[tokio::test]
async fn newsletters_are_delivered_to_confirmed_subscribers() {
    // Arrange
    let container = spawn_app_container_with_user().await.login().await;
    create_confirmed_subscriber(&container.app).await;
    let times: Times = 1.into();
    let _ = mount_mock_email_server(&container.app.email_server, Some(times)).await;

    // Act
    let response = container
        .app
        .post_newsletters(&serde_json::json!({
            "title": "Newsletter title",
            "text_content": "Newsletter body as plain text",
            "html_content": "<p>Newsletter body as HTML</p>",
            "idempotency_key": uuid::Uuid::new_v4().to_string()
        }))
        .await;

    // Assert
    assert_eq!(response.status().as_u16(), 303);

    // Act - Part 2 - Follow the redirect
    let html_page = container.app.get_newsletters().await.text().await.unwrap();
    assert!(html_page.contains(NEWSLETTER_CONFIRMATION_MESSAGE));

    container.app.dispatch_all_pending_emails().await;
    // Mock verifies on Drop that we have sent the newsletter email
}

#[tokio::test]
async fn newsletters_returns_400_for_invalid_data() {
    // Arrange
    let container = spawn_app_container_with_user().await.login().await;
    let test_cases = vec![
        (
            serde_json::json!({
                "text_content": "Newsletter body as plain text" ,
                "html_content": "<p>Newsletter body as HTML</p>",
            }),
            "missing title",
        ),
        (
            serde_json::json!({"title": "Newsletter!"}),
            "missing content",
        ),
    ];

    // Act
    for (invalid_body, error_message) in test_cases {
        let response = container.app.post_newsletters(&invalid_body).await;

        // Assert
        assert_eq!(
            422,
            response.status().as_u16(),
            "The API did not fail with 422 Unprocessable Entity when the payload was {}.",
            error_message
        );
    }
}

#[tokio::test]
async fn you_must_be_logged_in_to_send_newsletters_form() {
    // Arrange
    let app = spawn_app().await;

    // Act
    let response = app.get_newsletters().await;
    // Assert
    assert_is_redirect_to(&response, "/login");
}

#[tokio::test]
async fn you_must_be_logged_in_to_send_newsletters() {
    // Arrange
    let container = spawn_app_container_with_user().await;

    // Act
    let response = container
        .app
        .post_newsletters(&serde_json::json!({
            "title": "Test-Title",
            "html_content": "<i>This is content!</i>",
            "text_content": "This is content!",
            "idempotency_key": uuid::Uuid::new_v4().to_string()
        }))
        .await;
    // Assert
    assert_is_redirect_to(&response, "/login");
}

#[tokio::test]
async fn newsletter_creation_is_idempotent() {
    // Arrange
    let container = spawn_app_container_with_user().await.login().await;
    create_confirmed_subscriber(&container.app).await;

    let times: Times = 1.into();
    let _ = mount_mock_email_server(&container.app.email_server, Some(times)).await;

    // Act - Part 1 - Submit newsletter form
    let newsletter_request_body = serde_json::json!({
        "title": "Newsletter title",
        "text_content": "Newsletter body as plain text",
        "html_content": "<p>Newsletter body as HTML</p>",
        // We expect the idempotency key as part of the
        // form data, not as an header
        "idempotency_key": uuid::Uuid::new_v4().to_string()
    });
    let response = container
        .app
        .post_newsletters(&newsletter_request_body)
        .await;
    assert_is_redirect_to(&response, "/admin/newsletters");

    // Act - Part 2 - Follow the redirect
    let html_page = container.app.get_newsletters().await.text().await.unwrap();
    assert!(html_page.contains(NEWSLETTER_CONFIRMATION_MESSAGE));

    // Act - Part 3 - Submit newsletter form **again**
    let response = container
        .app
        .post_newsletters(&newsletter_request_body)
        .await;
    assert_is_redirect_to(&response, "/admin/newsletters");

    // Act - Part 4 - Follow the redirect
    let html_page = container.app.get_newsletters().await.text().await.unwrap();
    assert!(html_page.contains(NEWSLETTER_CONFIRMATION_MESSAGE));

    container.app.dispatch_all_pending_emails().await;
    // Mock verifies on Drop that we have sent the newsletter email **once**
}

#[tokio::test]
async fn concurrent_form_submission_is_handled_gracefully() {
    // Arrange
    let container = spawn_app_container_with_user().await.login().await;
    create_confirmed_subscriber(&container.app).await;

    when_sending_an_email()
        // Setting a long delay to ensure that the second request
        // arrives before the first one completes
        .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_secs(2)))
        .expect(1)
        .mount(&container.app.email_server)
        .await;

    // Act - Submit two newsletter forms concurrently
    let newsletter_request_body = serde_json::json!({
        "title": "Newsletter title",
        "text_content": "Newsletter body as plain text",
        "html_content": "<p>Newsletter body as HTML</p>",
        "idempotency_key": uuid::Uuid::new_v4().to_string()
    });
    let response1 = container.app.post_newsletters(&newsletter_request_body);
    let response2 = container.app.post_newsletters(&newsletter_request_body);
    let (response1, response2) = tokio::join!(response1, response2);
    assert_eq!(response1.status(), response2.status());
    assert_eq!(
        response1.text().await.unwrap(),
        response2.text().await.unwrap()
    );

    container.app.dispatch_all_pending_emails().await;
    // Mock verifies on Drop that we have sent the newsletter email **once**
}

#[tokio::test]
async fn newsletter_are_sent_again_after_idempotency_key_expiry() {
    // Arrange
    let container = spawn_app_container_with_user().await.login().await;
    create_confirmed_subscriber(&container.app).await;

    let times: Times = 2.into();
    let _ = mount_mock_email_server(&container.app.email_server, Some(times)).await;

    // Act - Submit two newsletter forms with a time difference > 24 h
    let idempotency_key = uuid::Uuid::new_v4().to_string();
    let newsletter_request_body = serde_json::json!({
        "title": "Newsletter title",
        "text_content": "Newsletter body as plain text",
        "html_content": "<p>Newsletter body as HTML</p>",
        "idempotency_key": idempotency_key
    });
    let response1 = container
        .app
        .post_newsletters(&newsletter_request_body)
        .await;
    let expired_timestamp = chrono::Utc::now() - chrono::Duration::hours(25);
    let user_id = container.test_user.user_id;
    let idempotency_key_ref: &str = idempotency_key.as_ref();

    tracing::debug!(
        "Updating idempotency key {} for user {} to timestamp {}",
        idempotency_key_ref,
        user_id,
        expired_timestamp
    );

    let keys = sqlx::query!(
        r#"
        SELECT user_id, idempotency_key, created_at
        FROM idempotency
        "#
    )
    .fetch_all(&container.app.db_connection_pool)
    .await
    .expect("Failed to fetch idempotency");

    for key in keys {
        tracing::debug!("Idempotency key record: {:?}", key);
    }

    let result = sqlx::query!(
        r#"
        UPDATE idempotency
        SET
            created_at = $1
        WHERE
            user_id = $2 AND
            idempotency_key = $3
        "#,
        expired_timestamp,
        user_id,
        idempotency_key_ref,
    )
    .execute(&container.app.db_connection_pool)
    .await
    .expect("Failed to update idempotency");

    if result.rows_affected() == 0 {
        panic!("Idempotency update failed!");
    }

    let response2 = container
        .app
        .post_newsletters(&newsletter_request_body)
        .await;

    assert_eq!(response1.status(), response2.status());
    assert_eq!(
        response1.text().await.unwrap(),
        response2.text().await.unwrap()
    );

    container.app.dispatch_all_pending_emails().await;
    // Mock verifies on Drop that we have sent the newsletter email **twice**
}

/// Use the public API of the application under test to create
/// an unconfirmed subscriber.
async fn create_unconfirmed_subscriber(app: &TestApp) -> ConfirmationLinks {
    let name: String = Name().fake();
    let email: String = SafeEmail().fake();
    let body = serde_urlencoded::to_string(serde_json::json!({
        "name": name,
        "email": email
    }))
    .unwrap();

    // One confirmation mail should be sent
    let _mock_guard = when_sending_an_email()
        .respond_with(ResponseTemplate::new(200))
        .named("Create unconfirmed subscriber")
        .expect(1)
        .mount_as_scoped(&app.email_server)
        .await;
    app.post_subscriptions(body)
        .await
        .error_for_status()
        .unwrap();

    // We now inspect the requests received by the mock Postmark server
    // to retrieve the confirmation link and return it
    let confirmation_email_request = &app
        .email_server
        .received_requests()
        .await
        .unwrap()
        .pop()
        .unwrap();
    app.get_confirmation_links(confirmation_email_request)
}

async fn create_confirmed_subscriber(app: &TestApp) {
    // We can then reuse the same helper and just add
    // an extra step to actually call the confirmation link!
    let confirmation_link = create_unconfirmed_subscriber(app).await;
    reqwest::get(confirmation_link.html)
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
}
