use axum::http::StatusCode;

// Return a 400 status code with error logging
pub fn e400<T>(e: T) -> StatusCode
where
    T: std::fmt::Debug + std::fmt::Display + 'static,
{
    tracing::error!("Bad request: {}", e);
    StatusCode::BAD_REQUEST
}

// Return an opaque 500 while preserving the error root's cause for logging.
pub fn e500<T>(e: T) -> StatusCode
where
    T: std::fmt::Debug + std::fmt::Display + 'static,
{
    tracing::error!("Internal server error: {}", e);
    StatusCode::INTERNAL_SERVER_ERROR
}
