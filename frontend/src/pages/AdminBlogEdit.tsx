import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect, useMemo, useRef } from 'react'
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material'
import { Save, Cancel, LightMode, DarkMode } from '@mui/icons-material'
import SimpleMDE from 'react-simplemde-editor'
import 'easymde/dist/easymde.min.css'
import { fetchAdminPost, createPost, updatePost, NewBlogPost, UpdateBlogPost } from '../api/blog'
import { useTheme } from '../contexts/ThemeContext'
import type EasyMDE from 'easymde'

function AdminBlogEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { mode: currentTheme } = useTheme()
  const isEditMode = id !== undefined && id !== 'new'

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>(currentTheme)
  const [isPreviewActive, setIsPreviewActive] = useState(false)
  const editorRef = useRef<EasyMDE | null>(null)

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

  // Update preview theme when current theme changes
  useEffect(() => {
    setPreviewTheme(currentTheme)
  }, [currentTheme])

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

  // Monitor preview state changes
  useEffect(() => {
    const checkPreviewState = () => {
      if (editorRef.current) {
        const previewElement = editorRef.current.codemirror.getWrapperElement().parentElement?.querySelector('.editor-preview-active, .editor-preview-active-side')
        setIsPreviewActive(!!previewElement)
      }
    }

    // Check periodically (SimpleMDE doesn't have direct mode change events)
    const interval = setInterval(checkPreviewState, 200)
    
    return () => clearInterval(interval)
  }, [])

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

  const getMdeInstance = (instance: EasyMDE) => {
    editorRef.current = instance
  }

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

          <FormControl fullWidth margin="normal" required data-testid="blog-status-select">
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2">
                Content (Markdown)
              </Typography>
              {isPreviewActive && (
                <Tooltip title="Preview Theme (toggle to see how your post looks in light/dark mode)">
                  <ToggleButtonGroup
                    value={previewTheme}
                    exclusive
                    onChange={(_, newTheme) => {
                      if (newTheme !== null) {
                        setPreviewTheme(newTheme)
                      }
                    }}
                    size="small"
                    aria-label="preview theme"
                  >
                    <ToggleButton value="light" aria-label="light preview">
                      <LightMode fontSize="small" />
                    </ToggleButton>
                    <ToggleButton value="dark" aria-label="dark preview">
                      <DarkMode fontSize="small" />
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Tooltip>
              )}
            </Box>
            <Box
              className={`editor-wrapper ${currentTheme === 'dark' ? 'dark-editor' : ''} ${previewTheme === 'dark' ? 'dark-preview' : ''}`}
              sx={{
                '& .CodeMirror': {
                  backgroundColor: currentTheme === 'dark' ? '#1e1e1e' : '#fff',
                  color: currentTheme === 'dark' ? '#d4d4d4' : '#000',
                  border: '1px solid',
                  borderColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.23)',
                },
                '& .CodeMirror-cursor': {
                  borderColor: currentTheme === 'dark' ? '#d4d4d4' : '#000',
                },
                '& .editor-toolbar': {
                  backgroundColor: currentTheme === 'dark' ? '#2d2d2d' : '#f9f9f9',
                  borderColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : '#ddd',
                },
                '& .editor-toolbar button': {
                  color: currentTheme === 'dark' ? '#d4d4d4' : '#000',
                  '&:hover': {
                    backgroundColor: currentTheme === 'dark' ? '#3e3e3e' : '#e0e0e0',
                  },
                  '&.active': {
                    backgroundColor: currentTheme === 'dark' ? '#4e4e4e' : '#d0d0d0',
                  },
                },
                '& .editor-toolbar i.separator': {
                  borderColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : '#d9d9d9',
                },
                '& .editor-preview, & .editor-preview-side': {
                  backgroundColor: previewTheme === 'dark' ? '#121212' : '#fafafa',
                  color: previewTheme === 'dark' ? '#e0e0e0' : '#000',
                },
                '& .editor-preview pre, & .editor-preview-side pre': {
                  backgroundColor: previewTheme === 'dark' ? '#1e1e1e' : '#f5f5f5',
                  color: previewTheme === 'dark' ? '#d4d4d4' : '#000',
                },
                '& .editor-preview code, & .editor-preview-side code': {
                  backgroundColor: previewTheme === 'dark' ? '#1e1e1e' : '#f5f5f5',
                  color: previewTheme === 'dark' ? '#d4d4d4' : '#000',
                },
                '& .editor-preview blockquote, & .editor-preview-side blockquote': {
                  borderLeftColor: previewTheme === 'dark' ? '#90caf9' : '#1976d2',
                  color: previewTheme === 'dark' ? '#b0b0b0' : '#666',
                },
                '& .editor-preview table th, & .editor-preview-side table th': {
                  backgroundColor: previewTheme === 'dark' ? '#2d2d2d' : '#f0f0f0',
                },
                '& .editor-preview table td, & .editor-preview table th, & .editor-preview-side table td, & .editor-preview-side table th': {
                  borderColor: previewTheme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : '#ddd',
                },
                '& .editor-preview a, & .editor-preview-side a': {
                  color: previewTheme === 'dark' ? '#90caf9' : '#1976d2',
                },
              }}
            >
              <SimpleMDE
                value={content}
                onChange={setContent}
                options={editorOptions}
                getMdeInstance={getMdeInstance}
              />
            </Box>
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
