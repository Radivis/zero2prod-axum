use actix_web::HttpResponse;
use axum::http::StatusCode;

pub async fn health_check() -> HttpResponse {
    HttpResponse::Ok().finish()
}

pub async fn health_check_axum() -> StatusCode {
    StatusCode::OK
}
