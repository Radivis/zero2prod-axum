use crate::helpers::{create_confirmed_subscriber_with_token, mount_mock_email_server};
use crate::macros::function_name_macro::function_name;
use crate::test_app::spawn_app;

#[tokio::test]
async fn unsubscribe_without_token_returns_400() {
    // Arrange
    let app = spawn_app(function_name!()).await;

    // Act - Test GET endpoint
    let get_response = reqwest::get(&format!("{}/api/subscriptions/unsubscribe", app.address))
        .await
        .unwrap();

    // Assert GET
    assert_eq!(get_response.status().as_u16(), 400);

    // Act - Test POST endpoint
    let post_response = app
        .api_client
        .post(format!("{}/api/subscriptions/unsubscribe", app.address))
        .send()
        .await
        .unwrap();

    // Assert POST
    assert_eq!(post_response.status().as_u16(), 400);
}

#[tokio::test]
async fn unsubscribe_with_malformed_token_returns_400() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    let malformed_token = "not-a-valid-uuid";

    // Act - Test GET endpoint
    let get_response = reqwest::get(&format!(
        "{}/api/subscriptions/unsubscribe?subscription_token={}",
        app.address, malformed_token
    ))
    .await
    .unwrap();

    // Assert GET
    assert_eq!(get_response.status().as_u16(), 400);

    // Act - Test POST endpoint
    let post_response = app
        .api_client
        .post(format!(
            "{}/api/subscriptions/unsubscribe?subscription_token={}",
            app.address, malformed_token
        ))
        .send()
        .await
        .unwrap();

    // Assert POST
    assert_eq!(post_response.status().as_u16(), 400);
}

#[tokio::test]
async fn unsubscribe_with_invalid_token_returns_400() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    let invalid_token = "invalid-token-12345";

    // Act - Test GET endpoint
    let get_response = reqwest::get(&format!(
        "{}/api/subscriptions/unsubscribe?subscription_token={}",
        app.address, invalid_token
    ))
    .await
    .unwrap();

    // Assert GET - Invalid token format should return 400
    assert_eq!(get_response.status().as_u16(), 400);

    // Act - Test POST endpoint
    let post_response = app
        .api_client
        .post(format!(
            "{}/api/subscriptions/unsubscribe?subscription_token={}",
            app.address, invalid_token
        ))
        .send()
        .await
        .unwrap();

    // Assert POST - Invalid token format should return 400
    assert_eq!(post_response.status().as_u16(), 400);
}

#[tokio::test]
async fn unsubscribe_with_nonexistent_token_returns_401() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    // Valid UUID format but doesn't exist in database
    let nonexistent_token = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

    // Act - Test GET endpoint
    let get_response = reqwest::get(&format!(
        "{}/api/subscriptions/unsubscribe?subscription_token={}",
        app.address, nonexistent_token
    ))
    .await
    .unwrap();

    // Assert GET - Valid format but nonexistent token should return 401
    assert_eq!(get_response.status().as_u16(), 401);

    // Act - Test POST endpoint
    let post_response = app
        .api_client
        .post(format!(
            "{}/api/subscriptions/unsubscribe?subscription_token={}",
            app.address, nonexistent_token
        ))
        .send()
        .await
        .unwrap();

    // Assert POST - Valid format but nonexistent token should return 401
    assert_eq!(post_response.status().as_u16(), 401);
}

#[tokio::test]
async fn unsubscribe_removes_subscriber_from_database() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    let token =
        create_confirmed_subscriber_with_token(&app, "le guin", "ursula_le_guin@gmail.com").await;

    // Verify subscriber exists
    let saved = sqlx::query!(
        "SELECT email, status FROM subscriptions WHERE email = 'ursula_le_guin@gmail.com'"
    )
    .fetch_one(&app.db_connection_pool)
    .await
    .expect("Failed to fetch subscriber");
    assert_eq!(saved.status, "confirmed");

    // Act - GET to verify email first
    let get_response = reqwest::get(&format!(
        "{}/api/subscriptions/unsubscribe?subscription_token={}",
        app.address, token
    ))
    .await
    .unwrap();

    // Assert GET returns email
    assert_eq!(get_response.status().as_u16(), 200);
    let json_body: serde_json::Value = get_response.json().await.unwrap();
    assert_eq!(json_body["email"], "ursula_le_guin@gmail.com");

    // Act - POST to confirm unsubscribe
    let post_response = app
        .api_client
        .post(format!(
            "{}/api/subscriptions/unsubscribe?subscription_token={}",
            app.address, token
        ))
        .send()
        .await
        .unwrap();

    // Assert POST succeeds
    assert_eq!(post_response.status().as_u16(), 200);

    // Verify subscriber was removed from database
    let result =
        sqlx::query!("SELECT email FROM subscriptions WHERE email = 'ursula_le_guin@gmail.com'")
            .fetch_optional(&app.db_connection_pool)
            .await
            .expect("Failed to query database");

    assert!(
        result.is_none(),
        "Subscriber should have been deleted from database"
    );
}

#[tokio::test]
async fn unsubscribe_removes_subscription_token() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    let token =
        create_confirmed_subscriber_with_token(&app, "le guin", "ursula_le_guin@gmail.com").await;

    // Verify token exists before unsubscribe
    let token_exists = sqlx::query!(
        "SELECT subscription_token FROM subscription_tokens WHERE subscription_token = $1",
        token
    )
    .fetch_optional(&app.db_connection_pool)
    .await
    .expect("Failed to query database");
    assert!(
        token_exists.is_some(),
        "Token should exist before unsubscribe"
    );

    // Act - GET first (doesn't delete)
    let get_response = reqwest::get(&format!(
        "{}/api/subscriptions/unsubscribe?subscription_token={}",
        app.address, token
    ))
    .await
    .unwrap();
    assert_eq!(get_response.status().as_u16(), 200);

    // Verify token still exists after GET
    let token_still_exists = sqlx::query!(
        "SELECT subscription_token FROM subscription_tokens WHERE subscription_token = $1",
        token
    )
    .fetch_optional(&app.db_connection_pool)
    .await
    .expect("Failed to query database");
    assert!(
        token_still_exists.is_some(),
        "Token should still exist after GET"
    );

    // Act - POST to confirm unsubscribe
    let post_response = app
        .api_client
        .post(format!(
            "{}/api/subscriptions/unsubscribe?subscription_token={}",
            app.address, token
        ))
        .send()
        .await
        .unwrap();

    // Assert
    assert_eq!(post_response.status().as_u16(), 200);

    // Verify token was removed (via CASCADE)
    let token_result = sqlx::query!(
        "SELECT subscription_token FROM subscription_tokens WHERE subscription_token = $1",
        token
    )
    .fetch_optional(&app.db_connection_pool)
    .await
    .expect("Failed to query database");

    assert!(
        token_result.is_none(),
        "Token should have been deleted via CASCADE"
    );
}

#[tokio::test]
async fn unsubscribe_is_idempotent() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    let token =
        create_confirmed_subscriber_with_token(&app, "le guin", "ursula_le_guin@gmail.com").await;

    // Act - First GET should succeed
    let get_response1 = reqwest::get(&format!(
        "{}/api/subscriptions/unsubscribe?subscription_token={}",
        app.address, token
    ))
    .await
    .unwrap();
    assert_eq!(get_response1.status().as_u16(), 200);

    // Act - First POST should succeed
    let post_response1 = app
        .api_client
        .post(format!(
            "{}/api/subscriptions/unsubscribe?subscription_token={}",
            app.address, token
        ))
        .send()
        .await
        .unwrap();
    assert_eq!(post_response1.status().as_u16(), 200);

    // Act - Second GET should fail (token deleted after POST)
    let get_response2 = reqwest::get(&format!(
        "{}/api/subscriptions/unsubscribe?subscription_token={}",
        app.address, token
    ))
    .await
    .unwrap();
    assert_eq!(get_response2.status().as_u16(), 401);

    // Act - Second POST should fail (token no longer exists)
    let post_response2 = app
        .api_client
        .post(format!(
            "{}/api/subscriptions/unsubscribe?subscription_token={}",
            app.address, token
        ))
        .send()
        .await
        .unwrap();
    assert_eq!(post_response2.status().as_u16(), 401);
}

#[tokio::test]
async fn confirm_fails_after_unsubscribe() {
    // Arrange
    let app = spawn_app(function_name!()).await;
    let body = serde_json::json!({
        "name": "le guin",
        "email": "ursula_le_guin@gmail.com"
    });
    let _ = mount_mock_email_server(&app.email_server, None).await;
    app.post_subscriptions(&body).await;

    let email_request = &app.email_server.received_requests().await.unwrap()[0];
    let confirmation_links = app.get_confirmation_links(email_request);

    // Extract token from confirmation link
    let token = confirmation_links
        .html
        .query_pairs()
        .find(|(key, _)| key == "subscription_token")
        .map(|(_, value)| value.to_string())
        .unwrap();

    // Act - POST unsubscribe first (don't confirm subscription)
    let unsubscribe_response = app
        .api_client
        .post(format!(
            "{}/api/subscriptions/unsubscribe?subscription_token={}",
            app.address, token
        ))
        .send()
        .await
        .unwrap();
    assert_eq!(unsubscribe_response.status().as_u16(), 200);

    // Act - Try to confirm after unsubscribing
    let confirm_response = reqwest::get(&format!(
        "{}/api/subscriptions/confirm?subscription_token={}",
        app.address, token
    ))
    .await
    .unwrap();

    // Assert - Confirm should fail with 401 (token no longer exists)
    assert_eq!(confirm_response.status().as_u16(), 401);
    let error_text = confirm_response.text().await.unwrap();
    assert!(error_text.contains("Invalid or expired subscription token"));
}
