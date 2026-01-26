// This binary is used by E2E tests to spawn a test backend server
// It uses the test helpers from the tests module
// Build with: cargo build --bin spawn_test_server --features e2e-tests --release

#[cfg(feature = "e2e-tests")]
mod helpers {
    // Include the test helpers directly using include! macro
    // The path is relative to the crate root (where Cargo.toml is)
    include!("../../tests/api/helpers.rs");
}

#[cfg(feature = "e2e-tests")]
use helpers::{spawn_app, spawn_app_container_with_user};
#[cfg(feature = "e2e-tests")]
use std::io::{self, Write};

#[cfg(feature = "e2e-tests")]
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Get test name from environment variable or use default
    let test_name =
        std::env::var("TEST_NAME").unwrap_or_else(|_| format!("e2e-{}", uuid::Uuid::new_v4()));

    // Check if we should create a user (default: true)
    let create_user = std::env::var("CREATE_USER")
        .unwrap_or_else(|_| "true".to_string())
        .parse::<bool>()
        .unwrap_or(true);

    // Spawn the test app with or without a user
    let (address, port, user_info) = if create_user {
        let container = spawn_app_container_with_user(&test_name).await;
        let address = container.app.address.clone();
        let port = container.app.port;

        // Wait for the server to be ready
        let client = reqwest::Client::new();
        let mut attempts = 0;
        let max_attempts = 30;
        while attempts < max_attempts {
            match client.get(format!("{}/health_check", address)).send().await {
                Ok(response) if response.status().is_success() => break,
                _ => {
                    attempts += 1;
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                }
            }
        }
        if attempts >= max_attempts {
            eprintln!(
                "Warning: Server may not be ready after {} attempts",
                max_attempts
            );
        }

        let user_info = Some(serde_json::json!({
            "username": container.test_user.username,
            "password": container.test_user.password,
            "user_id": container.test_user.user_id.to_string()
        }));
        (address, port, user_info)
    } else {
        let app = spawn_app(&test_name).await;
        let address = app.address.clone();
        let port = app.port;

        // Wait for the server to be ready
        let client = reqwest::Client::new();
        let mut attempts = 0;
        let max_attempts = 30;
        while attempts < max_attempts {
            match client.get(format!("{}/health_check", address)).send().await {
                Ok(response) if response.status().is_success() => break,
                _ => {
                    attempts += 1;
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                }
            }
        }
        if attempts >= max_attempts {
            eprintln!(
                "Warning: Server may not be ready after {} attempts",
                max_attempts
            );
        }

        (address, port, None)
    };

    let mut output = serde_json::json!({
        "port": port,
        "address": address,
        "test_name": test_name
    });

    if let Some(user) = user_info {
        output["username"] = user["username"].clone();
        output["password"] = user["password"].clone();
        output["user_id"] = user["user_id"].clone();
    }

    println!("{}", serde_json::to_string(&output)?);
    io::stdout().flush()?;

    // Keep the server running until we receive a signal or stdin closes
    // This allows Node.js to control the lifecycle
    tokio::signal::ctrl_c().await?;

    Ok(())
}

#[cfg(not(feature = "e2e-tests"))]
fn main() {
    eprintln!("This binary requires the 'e2e-tests' feature to be enabled.");
    eprintln!("Build with: cargo build --bin spawn_test_server --features e2e-tests --release");
    std::process::exit(1);
}
