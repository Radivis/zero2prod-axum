pub mod queries;

use crate::domain::{BlogPost, BlogPostStatus};
use crate::startup::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::Json;
use serde::Serialize;
use uuid::Uuid;

#[derive(Serialize)]
pub struct BlogPostResponse {
    pub id: Uuid,
    pub title: String,
    pub content: String,
    pub status: String,
    pub author_username: String,
    pub created_at: String,
    pub updated_at: String,
}

impl From<BlogPost> for BlogPostResponse {
    fn from(post: BlogPost) -> Self {
        BlogPostResponse {
            id: post.id,
            title: post.title,
            content: post.content,
            status: post.status.as_str().to_string(),
            author_username: post
                .author_username
                .unwrap_or_else(|| "Unknown".to_string()),
            created_at: post.created_at.to_rfc3339(),
            updated_at: post.updated_at.to_rfc3339(),
        }
    }
}

#[tracing::instrument(name = "Get published blog posts", skip(state))]
pub async fn get_published_posts(
    State(state): State<AppState>,
) -> Result<Json<Vec<BlogPostResponse>>, StatusCode> {
    let posts = queries::get_published_posts(&state.db).await.map_err(|e| {
        tracing::error!("Failed to fetch published posts: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let response: Vec<BlogPostResponse> = posts.into_iter().map(Into::into).collect();
    Ok(Json(response))
}

#[tracing::instrument(name = "Get blog post by id", skip(state))]
pub async fn get_post_by_id(
    State(state): State<AppState>,
    Path(post_id): Path<Uuid>,
) -> Result<Json<BlogPostResponse>, StatusCode> {
    let post = queries::get_post_by_id(&state.db, post_id, Some(BlogPostStatus::Published))
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch post {}: {:?}", post_id, e);
            StatusCode::NOT_FOUND
        })?;

    Ok(Json(post.into()))
}
