use crate::session_state::{TypedSession, TypedSessionAxum};
use crate::utils::{e500, see_other};
use actix_web::HttpResponse;
use actix_web_flash_messages::FlashMessage;
use axum::response::Redirect;
use crate::flash_messages::FlashMessageSender;
use tower_sessions::Session;

pub async fn log_out(session: TypedSession) -> Result<HttpResponse, actix_web::Error> {
    if session.get_user_id().map_err(e500)?.is_none() {
        Ok(see_other("/login"))
    } else {
        session.log_out();
        FlashMessage::info("You have successfully logged out.").send();
        Ok(see_other("/login"))
    }
}

// Axum version
pub async fn log_out_axum(session: Session) -> Redirect {
    let typed_session = TypedSessionAxum(session.clone());
    match typed_session.get_user_id().await {
        Ok(None) => Redirect::to("/login"),
        Ok(Some(_)) => {
            typed_session.log_out().await;
            let flash_sender = FlashMessageSender::new(session);
            if let Err(e) = flash_sender.info("You have successfully logged out.").await {
                tracing::error!("Failed to set flash message: {:?}", e);
            }
            Redirect::to("/login")
        }
        Err(_) => Redirect::to("/login"),
    }
}
