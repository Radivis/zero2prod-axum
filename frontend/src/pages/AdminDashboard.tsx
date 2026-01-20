import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
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
  const navigate = useNavigate()

  const dashboardQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      // For now, we'll need to parse the HTML response or create a JSON endpoint
      // Since the backend still returns HTML, we'll handle 401 redirects
      const response = await fetch('/admin/dashboard', {
        credentials: 'include',
      })

      if (response.status === 401 || response.status === 403) {
        navigate('/login')
        throw new Error('Unauthorized')
      }

      if (!response.ok) {
        throw new Error('Failed to load dashboard')
      }

      // Parse HTML to extract username (temporary until backend returns JSON)
      const html = await response.text()
      const match = html.match(/Welcome\s+([^!]+)!/)
      const username = match ? match[1].trim() : 'Admin'
      return { username }
    },
    retry: false,
  })

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/admin/logout', {
        method: 'POST',
      })
    },
    onSuccess: () => {
      navigate('/login')
    },
    onError: () => {
      // Even if logout fails, redirect to login
      navigate('/login')
    },
  })

  const handleLogout = () => {
    logoutMutation.mutate()
  }

  if (dashboardQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (dashboardQuery.isError) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Alert severity="error">
          {dashboardQuery.error instanceof Error
            ? dashboardQuery.error.message
            : 'Failed to load dashboard'}
        </Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Paper sx={{ p: 4, maxWidth: 600, width: '100%' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Welcome {dashboardQuery.data?.username}!
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
              disabled={logoutMutation.isPending}
              sx={{ mt: 2 }}
            >
              {logoutMutation.isPending ? <CircularProgress size={24} /> : 'Logout'}
            </Button>
          </ListItem>
        </List>
      </Paper>
    </Box>
  )
}

export default AdminDashboard
