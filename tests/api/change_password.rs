use crate::helpers::{assert_is_redirect_to, spawn_app, spawn_app_container_with_user};
use uuid::Uuid;
#[tokio::test]
async fn you_must_be_logged_in_to_see_the_change_password_form() {
    // Arrange
    let app = spawn_app().await;
    // Act
    let response = app.get_change_password().await;
    // Assert
    assert_is_redirect_to(&response, "/login");
}

#[tokio::test]
async fn you_must_be_logged_in_to_change_your_password() {
    // Arrange
    let container = spawn_app_container_with_user().await;
    let new_password = Uuid::new_v4().to_string();
    // Act
    let response = container
        .app
        .post_change_password(&serde_json::json!({
            "current_password": Uuid::new_v4().to_string(),
            "new_password": &new_password,
            "new_password_check": &new_password,
        }))
        .await;

    // Assert
    assert_is_redirect_to(&response, "/login");
}

#[tokio::test]
async fn new_password_fields_must_match() {
    // Arrange
    let container = spawn_app_container_with_user().await.login().await;
    let new_password = Uuid::new_v4().to_string();
    let another_new_password = Uuid::new_v4().to_string();

    // Act - Part 1 - Try to change password
    let response = container
        .app
        .post_change_password(&serde_json::json!({
            "current_password": &container.test_user.password,
            "new_password": &new_password,
            "new_password_check": &another_new_password,
        }))
        .await;
    assert_is_redirect_to(&response, "/admin/password");

    // Act - Part 2 - Follow the redirect
    let html_page = container.app.get_change_password_html().await;
    assert!(html_page.contains(
        "<p><i>You entered two different new passwords - \
        the field values must match.</i></p>"
    ));
}

#[tokio::test]
async fn current_password_must_be_valid() {
    // Arrange
    let container = spawn_app_container_with_user().await.login().await;
    let new_password = Uuid::new_v4().to_string();
    let wrong_password = Uuid::new_v4().to_string();

    // Act - Part 1 - Try to change password
    let response = container
        .app
        .post_change_password(&serde_json::json!({
            "current_password": &wrong_password,
            "new_password": &new_password,
            "new_password_check": &new_password,
        }))
        .await;
    // Assert
    assert_is_redirect_to(&response, "/admin/password");

    // Act - Part 2 - Follow the redirect
    let html_page = container.app.get_change_password_html().await;
    assert!(html_page.contains("<p><i>The current password is incorrect.</i></p>"));
}

#[tokio::test]
async fn new_password_must_have_at_least_12_characters() {
    // Arrange
    let container = spawn_app_container_with_user().await.login().await;
    let new_password = "0123456789 a";

    // Act - Part 1 - Try to change password
    let response = container
        .app
        .post_change_password(&serde_json::json!({
            "current_password": &container.test_user.password,
            "new_password": &new_password,
            "new_password_check": &new_password,
        }))
        .await;
    // Assert
    assert_is_redirect_to(&response, "/admin/password");

    // Act - Part 2 - Follow the redirect
    let html_page = container.app.get_change_password_html().await;
    assert!(html_page.contains(
        "<p><i>The new password must have at least 12 characters besides spaces.</i></p>"
    ));
}

#[tokio::test]
async fn new_password_must_not_have_more_than_128_characters() {
    // Arrange
    let container = spawn_app_container_with_user().await.login().await;
    let new_password = "12345678".repeat(16) + ".";

    // Act - Part 1 - Try to change password
    let response = container
        .app
        .post_change_password(&serde_json::json!({
            "current_password": &container.test_user.password,
            "new_password": &new_password,
            "new_password_check": &new_password,
        }))
        .await;
    // Assert
    assert_is_redirect_to(&response, "/admin/password");

    // Act - Part 2 - Follow the redirect
    let html_page = container.app.get_change_password_html().await;
    assert!(
        html_page
            .contains("<p><i>The new password must not have more than 128 characters.</i></p>")
    );
}

#[tokio::test]
async fn changing_password_works() {
    // Arrange
    let container = spawn_app_container_with_user().await.login().await;
    let new_password = Uuid::new_v4().to_string();

    // Act - Part 1 - Change password
    let response = container
        .app
        .post_change_password(&serde_json::json!({
            "current_password": &container.test_user.password,
            "new_password": &new_password,
            "new_password_check": &new_password,
        }))
        .await;
    assert_is_redirect_to(&response, "/admin/password");

    // Act - Part 2 - Follow the redirect
    let html_page = container.app.get_change_password_html().await;
    assert!(html_page.contains("<p><i>Your password has been changed.</i></p>"));

    // Act - Part 3 - Logout
    let response = container.app.post_logout().await;
    assert_is_redirect_to(&response, "/login");

    // Act - Part 4 - Follow the redirect
    let html_page = container.app.get_login_html().await;
    assert!(html_page.contains("<p><i>You have successfully logged out.</i></p>"));

    // Act - Part 5 - Login using the new password
    let login_body = serde_json::json!({
        "username": &container.test_user.username,
        "password": &new_password
    });

    let response = container.app.post_login(&login_body).await;
    assert_is_redirect_to(&response, "/admin/dashboard");
}
