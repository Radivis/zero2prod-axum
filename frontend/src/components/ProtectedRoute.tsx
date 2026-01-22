import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Box, CircularProgress, Alert } from '@mui/material'

interface AuthCheckResponse {
  authenticated: boolean
  username: string | null
}

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Check if we have cached auth data (e.g., from login)
  const cachedAuthData = queryClient.getQueryData<AuthCheckResponse>(['auth-check'])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['auth-check'],
    queryFn: async () => {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      })

      // 401 is expected when not authenticated - handle gracefully
      if (response.status === 401) {
        return { authenticated: false, username: null }
      }

      if (!response.ok) {
        throw new Error('Failed to check authentication')
      }

      const data: AuthCheckResponse = await response.json()
      return data
    },
    retry: false,
    // Use cached data as initial data if available
    initialData: cachedAuthData,
    // Don't refetch immediately on mount if we have cached data
    refetchOnMount: cachedAuthData ? false : true,
    // Disable caching for session checks - always fetch fresh data
    gcTime: 0, // Previously cacheTime - don't keep in cache
    staleTime: 0, // Always consider data stale, fetch immediately
  })

  useEffect(() => {
    if (!isLoading && !isError && data && !data.authenticated) {
      navigate('/login')
    }
  }, [data, isLoading, isError, navigate])

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Alert severity="error">Failed to verify authentication</Alert>
      </Box>
    )
  }

  if (!data?.authenticated) {
    return null // Will redirect via useEffect
  }

  return <>{children}</>
}
