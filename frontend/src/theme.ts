import { createTheme } from '@mui/material/styles';

// Greyish indigo background and orange accent theme
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#FF6B35', // Orange accent
    },
    secondary: {
      main: '#4B5563', // Greyish indigo
    },
    background: {
      default: '#4B5563', // Greyish indigo background
      paper: '#5B6573', // Slightly lighter for paper components
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#E5E7EB',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
  },
});
