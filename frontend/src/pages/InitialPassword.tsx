import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
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

function InitialPassword() {
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    // Client-side validation
    if (password !== passwordConfirmation) {
      setError('Passwords do not match')
      return
    }

    if (password.replace(/\s/g, '').length < 12) {
      setError('Password must have at least 12 characters (excluding spaces)')
      return
    }

    if (password.length > 128) {
      setError('Password must not exceed 128 characters')
      return
    }

    setLoading(true)

    try {
      await apiRequest('/initial_password', {
        method: 'POST',
        body: JSON.stringify({ password, password_confirmation: passwordConfirmation }),
      })
      navigate('/login')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create admin user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Paper sx={{ p: 4, maxWidth: 500, width: '100%' }}>
        <Alert severity="error" sx={{ mb: 3, fontWeight: 'bold' }}>
          ⚠️ WARNING: Store this password immediately! There is no easy way to reset it if lost!
        </Alert>
        <Typography variant="h5" component="h1" gutterBottom>
          Set Initial Admin Password
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Password"
            type="password"
            placeholder="Enter Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            margin="normal"
            required
            autoComplete="new-password"
          />
          <TextField
            fullWidth
            label="Confirm Password"
            type="password"
            placeholder="Confirm Password"
            value={passwordConfirmation}
            onChange={(e) => setPasswordConfirmation(e.target.value)}
            margin="normal"
            required
            autoComplete="new-password"
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Create Admin User'}
          </Button>
        </form>
      </Paper>
    </Box>
  )
}

export default InitialPassword
