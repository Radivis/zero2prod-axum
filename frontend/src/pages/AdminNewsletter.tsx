import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
} from '@mui/material'
import { apiRequest } from '../api/client'

function AdminNewsletter() {
  const [title, setTitle] = useState('')
  const [htmlContent, setHtmlContent] = useState('')
  const [textContent, setTextContent] = useState('')
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setLoading(true)

    try {
      await apiRequest('/admin/newsletters', {
        method: 'POST',
        body: JSON.stringify({
          title,
          html_content: htmlContent,
          text_content: textContent,
          idempotency_key: idempotencyKey,
        }),
      })
      setSuccess(true)
      // Reset form after successful submission
      setTitle('')
      setHtmlContent('')
      setTextContent('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish newsletter')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', py: 4 }}>
      <Paper sx={{ p: 4, maxWidth: 800, width: '100%' }}>
        <Typography variant="h5" component="h1" gutterBottom>
          Send a newsletter
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            The newsletter issue has been accepted - emails will go out shortly.
          </Alert>
        )}
        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Title"
            placeholder="Enter a title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="HTML Content"
            placeholder="Enter the content of the regular (HTML) newsletter"
            value={htmlContent}
            onChange={(e) => setHtmlContent(e.target.value)}
            margin="normal"
            multiline
            rows={20}
            required
          />
          <TextField
            fullWidth
            label="Plain text Content"
            placeholder="Enter the content of the plain text newsletter"
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            margin="normal"
            multiline
            rows={20}
            required
          />
          <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : 'Send newsletter'}
            </Button>
            <Button
              component={Link}
              to="/admin/dashboard"
              variant="outlined"
            >
              ← Back
            </Button>
          </Box>
        </form>
      </Paper>
    </Box>
  )
}

export default AdminNewsletter
