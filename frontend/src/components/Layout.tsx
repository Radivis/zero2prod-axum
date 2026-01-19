import { ReactNode } from 'react'
import { Box } from '@mui/material'

interface LayoutProps {
  children: ReactNode
}

function Layout({ children }: LayoutProps) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundColor: 'background.default',
      }}
    >
      {children}
    </Box>
  )
}

export default Layout
