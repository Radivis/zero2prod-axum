use crate::helpers::{assert_is_redirect_to, spawn_app, spawn_app_container_with_user};

#[tokio::test]
async fn you_must_be_logged_in_to_access_the_admin_dashboard() {
    // Arrange
    let app = spawn_app().await;
    // Act
    let response = app.get_admin_dashboard().await;
    // Assert
    assert_is_redirect_to(&response, "/login");
}

#[tokio::test]
async fn logout_clears_session_state() {
    // Arrange
    let container = spawn_app_container_with_user().await.login().await;

    // Act - Part 2 - Follow the redirect
    let html_page = container.app.get_admin_dashboard_html().await;
    assert!(html_page.contains(&format!("Welcome {}", container.test_user.username)));

    // Act - Part 3 - Logout
    let response = container.app.post_logout().await;
    assert_is_redirect_to(&response, "/login");

    // Act - Part 4 - Follow the redirect
    let html_page = container.app.get_login_html().await;
    assert!(html_page.contains(r#"<p><i>You have successfully logged out.</i></p>"#));

    // Act - Part 5 - Attempt to load admin panel
    let response = container.app.get_admin_dashboard().await;
    assert_is_redirect_to(&response, "/login");
}
