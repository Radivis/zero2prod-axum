import { Typography, Box, Container } from '@mui/material'
import { useTheme } from '../contexts/ThemeContext'

function Home() {
  const { mode } = useTheme()
  
  const gradientBackground = mode === 'light'
    ? 'linear-gradient(90deg, hsl(255, 75%, 80%) 0%, hsl(255, 50%, 80%) 50%, hsl(255, 75%, 80%) 100%)'
    : 'linear-gradient(90deg, hsl(255, 75%, 20%) 0%, hsl(255, 50%, 20%) 50%, hsl(255, 75%, 20%) 100%)'

  return (
    <Box
      sx={{
        minHeight: '60vh',
        background: gradientBackground,
        display: 'flex',
        alignItems: 'center',
        borderRadius: 2,
        py: 6,
      }}
    >
      <Container maxWidth="md">
        <Typography
          variant="h2"
          component="h1"
          gutterBottom
          sx={{
            fontWeight: 600,
            textAlign: 'center',
            mb: 4,
          }}
        >
          zero2prod-axum
        </Typography>
        
        <Typography
          variant="body1"
          sx={{
            fontSize: '1.1rem',
            lineHeight: 1.8,
            textAlign: 'justify',
            mb: 2,
          }}
        >
          This project evolved from a personal learning project based on the book "From Zero to Production in Rust" by Luca Palmieri. Instead of statically rendered HTML pages, it features a Single Page Application powered by React.
        </Typography>
        
        <Typography
          variant="body1"
          sx={{
            fontSize: '1.1rem',
            lineHeight: 1.8,
            textAlign: 'justify',
            mb: 2,
          }}
        >
          In addition to acting as mailing list management app, it also features a simple blog.
        </Typography>
        
        <Typography
          variant="body1"
          sx={{
            fontSize: '1.1rem',
            lineHeight: 1.8,
            textAlign: 'justify',
          }}
        >
          This project is fully open source and can be used as template for other projects.
        </Typography>
      </Container>
    </Box>
  )
}

export default Home
