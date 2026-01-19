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

function AdminPassword() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordCheck, setNewPasswordCheck] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    // Client-side validation
    if (newPassword !== newPasswordCheck) {
      setError('You entered two different new passwords - the field values must match.')
      return
    }

    const passwordWithoutSpaces = newPassword.replace(/\s/g, '')
    if (passwordWithoutSpaces.length < 12) {
      setError('The new password must have at least 12 characters besides spaces.')
      return
    }

    if (newPassword.length > 128) {
      setError('The new password must not have more than 128 characters.')
      return
    }

    setLoading(true)

    try {
      await apiRequest('/admin/password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          new_password_check: newPasswordCheck,
        }),
      })
      setSuccess(true)
      // Reset form after successful submission
      setCurrentPassword('')
      setNewPassword('')
      setNewPasswordCheck('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Paper sx={{ p: 4, maxWidth: 500, width: '100%' }}>
        <Typography variant="h5" component="h1" gutterBottom>
          Change Password
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Your password has been changed.
          </Alert>
        )}
        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Current password"
            type="password"
            placeholder="Enter current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            margin="normal"
            required
            autoComplete="current-password"
          />
          <TextField
            fullWidth
            label="New password"
            type="password"
            placeholder="Enter new password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            margin="normal"
            required
            autoComplete="new-password"
          />
          <TextField
            fullWidth
            label="Confirm new password"
            type="password"
            placeholder="Type the new password again"
            value={newPasswordCheck}
            onChange={(e) => setNewPasswordCheck(e.target.value)}
            margin="normal"
            required
            autoComplete="new-password"
          />
          <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : 'Change password'}
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

export default AdminPassword
