use crate::startup::AppState;
use axum::extract::State;
use axum::response::{Html, IntoResponse, Redirect};

pub async fn initial_password_form(
    State(state): State<AppState>,
) -> impl axum::response::IntoResponse {
    // Check if users already exist - if they do, redirect to login
    match crate::authentication::check_users_exist(&state.db).await {
        Ok(true) => {
            // Users already exist, redirect to login
            return Redirect::to("/login").into_response();
        }
        Ok(false) => {
            // No users exist, show form
        }
        Err(e) => {
            tracing::error!("Failed to check if users exist: {:?}", e);
            // On error, redirect to login (fail closed)
            return Redirect::to("/login").into_response();
        }
    }

    Html(format!(
        r#"<!DOCTYPE html>
<html lang="en">
    <head>
        <meta http-equiv="content-type" content="text/html; charset=utf-8">
        <title>Set Initial Admin Password</title>
    </head>
    <body>
        <div style="max-width: 600px; margin: 50px auto; padding: 20px; border: 2px solid #ff6b6b; background-color: #fff5f5; border-radius: 8px;">
            <h2 style="color: #c92a2a; margin-top: 0;">⚠️ WARNING</h2>
            <p style="font-weight: bold; color: #c92a2a; font-size: 16px;">
                Store this password immediately! There is no easy way to reset it if lost!
            </p>
        </div>
        <div style="max-width: 600px; margin: 20px auto; padding: 20px;">
            <h1>Set Initial Admin Password</h1>
            <form id="initialPasswordForm">
                <p>
                    <label>Password
                        <input
                            type="password"
                            placeholder="Enter Password"
                            name="password"
                            required
                        >
                    </label>
                </p>
                <p>
                    <label>Confirm Password
                        <input
                            type="password"
                            placeholder="Confirm Password"
                            name="password_confirmation"
                            required
                        >
                    </label>
                </p>
                <button type="submit">Create Admin User</button>
            </form>
        </div>
        <script>
            document.getElementById('initialPasswordForm').addEventListener('submit', async (e) => {{
                e.preventDefault();
                const formData = new FormData(e.target);
                const password = formData.get('password');
                const password_confirmation = formData.get('password_confirmation');
                
                try {{
                    const response = await fetch('/initial_password', {{
                        method: 'POST',
                        headers: {{
                            'Content-Type': 'application/json',
                        }},
                        credentials: 'include',
                        body: JSON.stringify({{
                            password: password,
                            password_confirmation: password_confirmation
                        }})
                    }});
                    
                    if (response.ok || response.redirected) {{
                        window.location.href = '/login';
                    }} else {{
                        const error = await response.json().catch(() => ({{ error: 'Failed to create admin user' }}));
                        alert(error.error || 'Failed to create admin user');
                    }}
                }} catch (err) {{
                    alert('An error occurred: ' + err.message);
                }}
            }});
        </script>
    </body>
</html>"#,
    ))
    .into_response()
}
