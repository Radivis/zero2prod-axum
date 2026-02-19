import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Typography,
  Paper,
  Box,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material'

interface UnsubscribeInfo {
  email: string
}

function UnsubscribeConfirm() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('subscription_token')

  // Fetch subscriber email using the token
  const { data, isLoading, error } = useQuery<UnsubscribeInfo>({
    queryKey: ['unsubscribe-info', token],
    queryFn: async () => {
      if (!token) {
        throw new Error('No subscription token provided')
      }

      const response = await fetch(
        `/api/subscriptions/unsubscribe?subscription_token=${token}`
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid or expired subscription token')
        }
        throw new Error('Failed to verify subscription token')
      }

      return response.json()
    },
    retry: false,
  })

  // Mutation to confirm unsubscribe
  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error('No subscription token provided')
      }

      const response = await fetch(
        `/api/subscriptions/unsubscribe?subscription_token=${token}`,
        {
          method: 'POST',
        }
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid or expired subscription token')
        }
        throw new Error('Failed to unsubscribe. Please try again.')
      }

      return response
    },
  })

  const handleConfirmUnsubscribe = () => {
    unsubscribeMutation.mutate()
  }

  const handleCancel = () => {
    navigate('/')
  }

  const errorMessage = (error as Error | null)?.message || (unsubscribeMutation.error as Error | null)?.message

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
      }}
    >
      <Paper sx={{ p: 4, maxWidth: 600, width: '100%' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Unsubscribe from Newsletter
        </Typography>

        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {errorMessage && !isLoading && !unsubscribeMutation.isSuccess && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {errorMessage}
          </Alert>
        )}

        {unsubscribeMutation.isSuccess && (
          <>
            <Alert severity="success" sx={{ mt: 2 }}>
              You have been successfully unsubscribed from our newsletter.
            </Alert>
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
              <Button variant="contained" onClick={() => navigate('/')}>
                Return to Home
              </Button>
            </Box>
          </>
        )}

        {!isLoading && !error && !unsubscribeMutation.isSuccess && data?.email && (
          <>
            <Typography variant="body1" sx={{ mt: 2, mb: 3 }}>
              Are you sure you want to unsubscribe <strong>{data.email}</strong> from
              our newsletter?
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button
                variant="outlined"
                onClick={handleCancel}
                disabled={unsubscribeMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={handleConfirmUnsubscribe}
                disabled={unsubscribeMutation.isPending}
              >
                {unsubscribeMutation.isPending ? 'Unsubscribing...' : 'Confirm Unsubscribe'}
              </Button>
            </Box>
          </>
        )}
      </Paper>
    </Box>
  )
}

export default UnsubscribeConfirm
