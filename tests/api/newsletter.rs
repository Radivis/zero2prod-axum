use std::time::Duration;
use wiremock::matchers::{method, path};
use wiremock::{Mock, ResponseTemplate, Times};

use crate::helpers::{
    ConfirmationLinks, TestApp, assert_is_redirect_to, mount_mock_email_server, spawn_app,
    spawn_app_container_with_user,
};

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
    assert!(html_page.contains("<p><i>The newsletter issue has been published!</i></p>"));

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
    // Mock verifies on Drop that we have sent the newsletter email

    // Act - Part 2 - Follow the redirect
    let html_page = container.app.get_newsletters().await.text().await.unwrap();
    assert!(html_page.contains("<p><i>The newsletter issue has been published!</i></p>"));
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
            400,
            response.status().as_u16(),
            "The API did not fail with 400 Bad Request when the payload was {}.",
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
    assert!(html_page.contains("<p><i>The newsletter issue has been published!</i></p>"));

    // Act - Part 3 - Submit newsletter form **again**
    let response = container
        .app
        .post_newsletters(&newsletter_request_body)
        .await;
    assert_is_redirect_to(&response, "/admin/newsletters");

    // Act - Part 4 - Follow the redirect
    let html_page = container.app.get_newsletters().await.text().await.unwrap();
    assert!(html_page.contains("<p><i>The newsletter issue has been published!</i></p>"));

    // Mock verifies on Drop that we have sent the newsletter email **once**
}

#[tokio::test]
async fn concurrent_form_submission_is_handled_gracefully() {
    // Arrange
    let container = spawn_app_container_with_user().await.login().await;
    create_confirmed_subscriber(&container.app).await;

    Mock::given(path("/email"))
        .and(method("POST"))
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
    // Mock verifies on Drop that we have sent the newsletter email **once**
}

/// Use the public API of the application under test to create
/// an unconfirmed subscriber.
async fn create_unconfirmed_subscriber(app: &TestApp) -> ConfirmationLinks {
    let body = "name=le%20guin&email=ursula_le_guin%40gmail.com";

    // One confirmation mail should be sent
    let _mock_guard = Mock::given(path("/email"))
        .and(method("POST"))
        .respond_with(ResponseTemplate::new(200))
        .named("Create unconfirmed subscriber")
        .expect(1)
        .mount_as_scoped(&app.email_server)
        .await;
    app.post_subscriptions(body.into())
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
