use crate::flash_messages::FlashMessageSender;
use crate::session_state::TypedSession;
use axum::response::Redirect;
use tower_sessions::Session;

pub async fn log_out(session: Session) -> Redirect {
    let typed_session = TypedSession(session.clone());
    match typed_session.get_user_id().await {
        Ok(None) => Redirect::to("/login"),
        Ok(Some(_)) => {
            // Logout first (removes user_id, cycles session ID)
            typed_session.log_out().await;
            // Now set flash message in the new session
            let flash_sender = FlashMessageSender::new(session);
            if let Err(e) = flash_sender.info("You have successfully logged out.").await {
                tracing::error!("Failed to set flash message: {:?}", e);
            }
            Redirect::to("/login")
        }
        Err(_) => Redirect::to("/login"),
    }
}
