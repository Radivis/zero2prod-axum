import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
} from '@mui/material'
import { Save, Cancel } from '@mui/icons-material'
import SimpleMDE from 'react-simplemde-editor'
import 'easymde/dist/easymde.min.css'
import { fetchAdminPost, createPost, updatePost, NewBlogPost, UpdateBlogPost } from '../api/blog'

function AdminBlogEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEditMode = id !== undefined && id !== 'new'

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<'draft' | 'published'>('draft')

  const { data: post, isLoading, error } = useQuery({
    queryKey: ['admin-blog-post', id],
    queryFn: () => fetchAdminPost(id!),
    enabled: isEditMode,
  })

  useEffect(() => {
    if (post) {
      setTitle(post.title)
      setContent(post.content)
      setStatus(post.status)
    }
  }, [post])

  const createMutation = useMutation({
    mutationFn: createPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-blog-posts'] })
      navigate('/admin/blog')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBlogPost }) => updatePost(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-blog-posts'] })
      queryClient.invalidateQueries({ queryKey: ['admin-blog-post', id] })
      navigate('/admin/blog')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const postData = {
      title,
      content,
      status,
    }

    if (isEditMode) {
      updateMutation.mutate({ id: id!, data: postData })
    } else {
      createMutation.mutate(postData as NewBlogPost)
    }
  }

  const handleCancel = () => {
    navigate('/admin/blog')
  }

  const editorOptions = useMemo(
    () => ({
      spellChecker: false,
      placeholder: 'Write your blog post content in Markdown...',
      status: false,
      toolbar: [
        'bold',
        'italic',
        'heading',
        '|',
        'quote',
        'unordered-list',
        'ordered-list',
        '|',
        'link',
        'image',
        '|',
        'preview',
        'side-by-side',
        'fullscreen',
        '|',
        'guide',
      ] as any,
    }),
    []
  )

  if (isEditMode && isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isEditMode && error) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Alert severity="error">
          {error instanceof Error ? error.message : 'Failed to load blog post'}
        </Alert>
      </Box>
    )
  }

  const mutation = isEditMode ? updateMutation : createMutation
  const isSubmitting = mutation.isPending

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        {isEditMode ? 'Edit Blog Post' : 'Create New Blog Post'}
      </Typography>

      {mutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {mutation.error instanceof Error ? mutation.error.message : 'Failed to save blog post'}
        </Alert>
      )}

      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          <TextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            required
            margin="normal"
            disabled={isSubmitting}
          />

          <FormControl fullWidth margin="normal" required>
            <InputLabel>Status</InputLabel>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
              label="Status"
              disabled={isSubmitting}
            >
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="published">Published</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ mt: 2, mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Content (Markdown)
            </Typography>
            <SimpleMDE
              value={content}
              onChange={setContent}
              options={editorOptions}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
            <Button
              type="submit"
              variant="contained"
              startIcon={isSubmitting ? <CircularProgress size={20} /> : <Save />}
              disabled={isSubmitting || !title.trim() || !content.trim()}
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </Button>
            <Button
              variant="outlined"
              startIcon={<Cancel />}
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </Box>
        </form>
      </Paper>
    </Box>
  )
}

export default AdminBlogEdit
