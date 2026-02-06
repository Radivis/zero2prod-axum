use crate::authentication::UserId;
use crate::domain::{NewBlogPost, UpdateBlogPost};
pub use crate::routes::blog::BlogPostResponse;
use crate::routes::blog::queries;
use crate::startup::AppState;
use axum::Extension;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde::Serialize;
use uuid::Uuid;

#[derive(Serialize)]
pub struct MessageResponse {
    pub message: String,
}

#[tracing::instrument(name = "Admin: Get all blog posts", skip(state))]
pub async fn admin_get_all_posts(
    State(state): State<AppState>,
    Extension(_user_id): Extension<UserId>,
) -> Result<Json<Vec<BlogPostResponse>>, StatusCode> {
    let posts = queries::get_all_posts(&state.db).await.map_err(|e| {
        tracing::error!("Failed to fetch all posts: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let response: Vec<BlogPostResponse> = posts.into_iter().map(Into::into).collect();
    Ok(Json(response))
}

#[tracing::instrument(name = "Admin: Get blog post by id", skip(state))]
pub async fn admin_get_post_by_id(
    State(state): State<AppState>,
    Path(post_id): Path<Uuid>,
    Extension(_user_id): Extension<UserId>,
) -> Result<Json<BlogPostResponse>, StatusCode> {
    let post = queries::get_post_by_id(&state.db, post_id, None)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch post {}: {:?}", post_id, e);
            StatusCode::NOT_FOUND
        })?;

    Ok(Json(post.into()))
}

#[tracing::instrument(name = "Admin: Create blog post", skip(state, new_post))]
pub async fn admin_create_post(
    State(state): State<AppState>,
    Extension(user_id): Extension<UserId>,
    Json(new_post): Json<NewBlogPost>,
) -> Result<impl IntoResponse, StatusCode> {
    let post = queries::insert_post(
        &state.db,
        &new_post.title,
        &new_post.content,
        &new_post.status,
        *user_id,
    )
    .await
    .map_err(|e| {
        tracing::error!("Failed to create post: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((StatusCode::CREATED, Json(BlogPostResponse::from(post))))
}

#[tracing::instrument(name = "Admin: Update blog post", skip(state, update_post))]
pub async fn admin_update_post(
    State(state): State<AppState>,
    Path(post_id): Path<Uuid>,
    Extension(_user_id): Extension<UserId>,
    Json(update_post): Json<UpdateBlogPost>,
) -> Result<Json<BlogPostResponse>, StatusCode> {
    let post = queries::update_post(
        &state.db,
        post_id,
        &update_post.title,
        &update_post.content,
        &update_post.status,
    )
    .await
    .map_err(|e| {
        tracing::error!("Failed to update post {}: {:?}", post_id, e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(post.into()))
}

#[tracing::instrument(name = "Admin: Delete blog post", skip(state))]
pub async fn admin_delete_post(
    State(state): State<AppState>,
    Path(post_id): Path<Uuid>,
    Extension(_user_id): Extension<UserId>,
) -> Result<Json<MessageResponse>, StatusCode> {
    queries::delete_post(&state.db, post_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to delete post {}: {:?}", post_id, e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(MessageResponse {
        message: "Post deleted successfully".to_string(),
    }))
}
