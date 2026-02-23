import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTheme } from '../contexts/ThemeContext'

import { Box, Typography, TextField, Button, CircularProgress } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'

const SUBSCRIPTION_SUCCESS_MESSAGE = 'Please check your email to confirm your subscription.'

function SubscribeForm() {
    const { mode } = useTheme()
    const [email, setEmail] = useState('')
    const [name, setName] = useState('')

    const subscriptionBorderColor = mode === 'light' ? 'hsl(0, 0%, 0%)' : 'hsl(0, 0%, 100%)'

    const subscribeMutation = useMutation({
      mutationFn: async (data: { name: string; email: string }) => {
        const response = await fetch('/api/subscriptions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        })
  
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || 'Subscription failed')
        }
  
        return null
      },
    })
  
    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      subscribeMutation.mutate({ name, email })
    }
  
    const showSuccess = subscribeMutation.isSuccess
    const showError = subscribeMutation.isError
    const errorMessage = subscribeMutation.error instanceof Error
      ? subscribeMutation.error.message
      : 'Subscription failed'

  return (
    <Box
component="fieldset"
sx={{
  border: `2px solid ${subscriptionBorderColor}`,
  borderRadius: 2,
  px: 3,
  pb: 3,
  pt: 0,
  mt: 0,
  maxWidth: 400,
  mx: 'auto',
}}
>
<Typography
  component="legend"
  sx={{
    px: 1,
    fontSize: '0.95rem',
  }}
>
  Subscribe to the newsletter to receive updates on this project
</Typography>
<Box component="form" onSubmit={handleSubmit} noValidate>
  <TextField
    fullWidth
    label="Email"
    type="email"
    placeholder="Enter your email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    margin="normal"
    required
    autoComplete="email"
    inputProps={{ 'aria-label': 'Email' }}
  />
  <TextField
    fullWidth
    label="Name"
    placeholder="Enter your name"
    value={name}
    onChange={(e) => setName(e.target.value)}
    margin="normal"
    required
    autoComplete="name"
    inputProps={{ 'aria-label': 'Name' }}
  />
  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, mb: 2 }}>
    <Button
      type="submit"
      variant="contained"
      disabled={subscribeMutation.isPending}
      aria-label="Subscribe"
    >
      {subscribeMutation.isPending ? (
        <CircularProgress size={24} color="inherit" />
      ) : (
        'Subscribe'
      )}
    </Button>
  </Box>
  {showSuccess && (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        justifyContent: 'center',
        color: 'success.main',
      }}
    >
      <CheckCircleIcon fontSize="small" />
      <Typography variant="body2">{SUBSCRIPTION_SUCCESS_MESSAGE}</Typography>
    </Box>
  )}
  {showError && (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        justifyContent: 'center',
        color: 'error.main',
      }}
    >
      <ErrorIcon fontSize="small" />
      <Typography variant="body2">{errorMessage}</Typography>
    </Box>
  )}
</Box>
</Box>
)}

export default SubscribeForm;