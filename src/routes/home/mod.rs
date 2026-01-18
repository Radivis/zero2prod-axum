use actix_web::HttpResponse;
use actix_web::http::header::ContentType;
use axum::response::Html;

pub async fn home() -> HttpResponse {
    HttpResponse::Ok()
        .content_type(ContentType::html())
        .body(include_str!("home.html"))
}

pub async fn home_axum() -> Html<&'static str> {
    Html(include_str!("home.html"))
}
