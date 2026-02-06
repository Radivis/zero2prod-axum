import { useQuery } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Grid,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material'
import { fetchPublishedPosts } from '../api/blog'

function Blog() {
  const { data: posts, isLoading, error } = useQuery({
    queryKey: ['blog-posts'],
    queryFn: fetchPublishedPosts,
  })

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Alert severity="error">
          {error instanceof Error ? error.message : 'Failed to load blog posts'}
        </Alert>
      </Box>
    )
  }

  const getExcerpt = (content: string, maxLength: number = 200): string => {
    if (content.length <= maxLength) return content
    return content.substring(0, maxLength).trim() + '...'
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <Box>
      <Typography variant="h3" component="h1" gutterBottom sx={{ mb: 4 }}>
        Blog
      </Typography>

      {posts && posts.length === 0 && (
        <Alert severity="info">No blog posts available yet.</Alert>
      )}

      <Grid container spacing={3}>
        {posts?.map((post) => (
          <Grid item xs={12} md={6} lg={4} key={post.id}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flexGrow: 1 }}>
                <Typography variant="h5" component="h2" gutterBottom>
                  {post.title}
                </Typography>
                <Box sx={{ mb: 2 }}>
                  <Chip
                    label={`By ${post.author_username}`}
                    size="small"
                    sx={{ mr: 1 }}
                  />
                  <Chip
                    label={formatDate(post.created_at)}
                    size="small"
                    variant="outlined"
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {getExcerpt(post.content)}
                </Typography>
              </CardContent>
              <CardActions>
                <Button
                  size="small"
                  component={RouterLink}
                  to={`/blog/${post.id}`}
                  aria-label={`Read ${post.title}`}
                >
                  Read More
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}

export default Blog
