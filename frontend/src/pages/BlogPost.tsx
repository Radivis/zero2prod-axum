import { useQuery } from '@tanstack/react-query'
import { useParams, Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Paper,
  Chip,
} from '@mui/material'
import { ArrowBack } from '@mui/icons-material'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchPost } from '../api/blog'

function BlogPost() {
  const { id } = useParams<{ id: string }>()

  const { data: post, isLoading, error } = useQuery({
    queryKey: ['blog-post', id],
    queryFn: () => fetchPost(id!),
    enabled: !!id,
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
          {error instanceof Error ? error.message : 'Failed to load blog post'}
        </Alert>
      </Box>
    )
  }

  if (!post) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Alert severity="error">Blog post not found</Alert>
      </Box>
    )
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
      <Button
        component={RouterLink}
        to="/blog"
        startIcon={<ArrowBack />}
        sx={{ mb: 3 }}
        aria-label="Back to blog list"
      >
        Back to Blog
      </Button>

      <Paper sx={{ p: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          {post.title}
        </Typography>

        <Box sx={{ mb: 3 }}>
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

        <Box
          sx={{
            '& p': { mb: 2 },
            '& h1': { mt: 3, mb: 2, fontSize: '2rem' },
            '& h2': { mt: 3, mb: 2, fontSize: '1.75rem' },
            '& h3': { mt: 2, mb: 1.5, fontSize: '1.5rem' },
            '& h4': { mt: 2, mb: 1.5, fontSize: '1.25rem' },
            '& ul, & ol': { mb: 2, pl: 3 },
            '& li': { mb: 0.5 },
            '& pre': {
              backgroundColor: 'action.hover',
              p: 2,
              borderRadius: 1,
              overflowX: 'auto',
            },
            '& code': {
              backgroundColor: 'action.hover',
              px: 0.5,
              py: 0.25,
              borderRadius: 0.5,
              fontFamily: 'monospace',
            },
            '& pre code': {
              backgroundColor: 'transparent',
              p: 0,
            },
            '& blockquote': {
              borderLeft: '4px solid',
              borderColor: 'primary.main',
              pl: 2,
              py: 0.5,
              my: 2,
              fontStyle: 'italic',
            },
            '& a': {
              color: 'primary.main',
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline',
              },
            },
            '& img': {
              maxWidth: '100%',
              height: 'auto',
              borderRadius: 1,
              my: 2,
            },
            '& table': {
              borderCollapse: 'collapse',
              width: '100%',
              my: 2,
            },
            '& th, & td': {
              border: '1px solid',
              borderColor: 'divider',
              p: 1,
              textAlign: 'left',
            },
            '& th': {
              backgroundColor: 'action.hover',
              fontWeight: 'bold',
            },
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {post.content}
          </ReactMarkdown>
        </Box>
      </Paper>
    </Box>
  )
}

export default BlogPost
