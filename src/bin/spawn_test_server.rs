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
use helpers::spawn_app;
#[cfg(feature = "e2e-tests")]
use std::io::{self, Write};

#[cfg(feature = "e2e-tests")]
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Get test name from environment variable or use default
    let test_name =
        std::env::var("TEST_NAME").unwrap_or_else(|_| format!("e2e-{}", uuid::Uuid::new_v4()));

    // Spawn the test app
    let app = spawn_app(&test_name).await;

    // Output the port and address as JSON to stdout
    let output = serde_json::json!({
        "port": app.port,
        "address": app.address,
        "test_name": test_name
    });

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
