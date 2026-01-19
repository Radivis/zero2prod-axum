import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Paper,
  Typography,
  Button,
  List,
  ListItem,
  ListItemButton,
  Box,
  CircularProgress,
  Alert,
} from '@mui/material'
import { apiRequest } from '../api/client'

function AdminDashboard() {
  const [username, setUsername] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        // For now, we'll need to parse the HTML response or create a JSON endpoint
        // Since the backend still returns HTML, we'll handle 401 redirects
        const response = await fetch('/admin/dashboard', {
          credentials: 'include',
        })
        
        if (response.status === 401 || response.status === 403) {
          navigate('/login')
          return
        }

        if (!response.ok) {
          throw new Error('Failed to load dashboard')
        }

        // Parse HTML to extract username (temporary until backend returns JSON)
        const html = await response.text()
        const match = html.match(/Welcome\s+([^!]+)!/)
        if (match) {
          setUsername(match[1].trim())
        } else {
          setUsername('Admin')
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('401')) {
          navigate('/login')
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard')
        }
      } finally {
        setLoading(false)
      }
    }

    fetchDashboard()
  }, [navigate])

  const handleLogout = async () => {
    try {
      await apiRequest('/admin/logout', {
        method: 'POST',
      })
      navigate('/login')
    } catch (err) {
      // Even if logout fails, redirect to login
      navigate('/login')
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Paper sx={{ p: 4, maxWidth: 600, width: '100%' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Welcome {username}!
        </Typography>
        <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
          Available actions:
        </Typography>
        <List>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/admin/password">
              Change password
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/admin/newsletters">
              Send a newsletter
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <Button
              variant="contained"
              color="primary"
              onClick={handleLogout}
              sx={{ mt: 2 }}
            >
              Logout
            </Button>
          </ListItem>
        </List>
      </Paper>
    </Box>
  )
}

export default AdminDashboard
