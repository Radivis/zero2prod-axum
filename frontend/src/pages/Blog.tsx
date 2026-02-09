import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Divider,
  Paper,
} from '@mui/material'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchPublishedPosts } from '../api/blog'
import type { BlogPost } from '../api/blog'

const POSTS_PER_PAGE = 5

function Blog() {
  const { data: allPosts, isLoading, error } = useQuery({
    queryKey: ['blog-posts'],
    queryFn: fetchPublishedPosts,
  })

  const [displayedPosts, setDisplayedPosts] = useState<BlogPost[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const observerTarget = useRef<HTMLDivElement>(null)

  // Initialize displayed posts when data loads
  useEffect(() => {
    if (allPosts && allPosts.length > 0) {
      const initialPosts = allPosts.slice(0, POSTS_PER_PAGE)
      setDisplayedPosts(initialPosts)
      setHasMore(allPosts.length > POSTS_PER_PAGE)
    }
  }, [allPosts])

  // Load more posts
  const loadMore = useCallback(() => {
    if (!allPosts || !hasMore) return

    const nextPage = page + 1
    const startIndex = page * POSTS_PER_PAGE
    const endIndex = nextPage * POSTS_PER_PAGE
    const newPosts = allPosts.slice(startIndex, endIndex)

    if (newPosts.length > 0) {
      setDisplayedPosts((prev) => [...prev, ...newPosts])
      setPage(nextPage)
      setHasMore(endIndex < allPosts.length)
    }
  }, [allPosts, hasMore, page])

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [loadMore, hasMore, isLoading])

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

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

  if (allPosts && allPosts.length === 0) {
    return (
      <Box>
        <Typography variant="h3" component="h1" gutterBottom sx={{ mb: 4 }}>
          Blog
        </Typography>
        <Alert severity="info">No blog posts available yet.</Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: '800px', mx: 'auto' }}>
      <Typography variant="h3" component="h1" gutterBottom sx={{ mb: 4 }}>
        Blog
      </Typography>

      {displayedPosts.map((post, index) => (
        <Box key={post.id}>
          <Paper sx={{ p: 4, mb: 4 }}>
            <Typography variant="h4" component="h2" gutterBottom>
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

          {index < displayedPosts.length - 1 && <Divider sx={{ my: 4 }} />}
        </Box>
      ))}

      {/* Infinite scroll trigger */}
      <Box
        ref={observerTarget}
        sx={{
          height: '20px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          my: 4,
        }}
      >
        {hasMore && <CircularProgress size={30} />}
      </Box>
    </Box>
  )
}

export default Blog
