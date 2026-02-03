use crate::macros::function_name_macro::function_name;
use crate::test_app::spawn_app;

#[tokio::test]
async fn health_check_works() {
    let test_app = spawn_app(function_name!()).await;
    // We need to bring in `reqwest`
    // to perform HTTP requests against our application.
    let client = reqwest::Client::new();
    // Act
    let response = client
        .get(format!("{}/health_check", test_app.address))
        .send()
        .await
        .expect("Failed to execute request.");
    // Assert
    assert!(response.status().is_success());
    assert_eq!(Some(0), response.content_length());
}
