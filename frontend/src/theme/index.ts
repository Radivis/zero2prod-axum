import { createTheme, Theme } from '@mui/material/styles'

// Shared accent - orange used in both themes
const ACCENT_ORANGE = '#FF6B35'

// Light theme - indigo and orange for consistency with dark theme
const LIGHT_INDIGO_BG = '#e8eaf6' // Light indigo (Material indigo 50)
const LIGHT_INDIGO_TEXT = '#3949ab' // Dark indigo for contrast on light bg

export const lightTheme: Theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: ACCENT_ORANGE,
    },
    secondary: {
      main: '#5c6bc0', // Indigo accent
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: LIGHT_INDIGO_BG,
          color: LIGHT_INDIGO_TEXT,
        },
      },
    },
  },
})

// Dark theme - indigo and orange for consistency with light theme
const DARK_PRIMARY = ACCENT_ORANGE
const DARK_SECONDARY = '#444d59' // Greyish indigo
const DARK_BG_DEFAULT = '#343d49' // Greyish indigo background
const DARK_BG_PAPER = '#424b58' // Slightly lighter for paper
const DARK_TEXT_PRIMARY = '#FFFFFF'
const DARK_TEXT_SECONDARY = '#E5E7EB'

// Exported for editor consistency - editor uses same palette as main theme
export const DARK_THEME_EDITOR = {
  bg: DARK_BG_DEFAULT,
  paper: DARK_BG_PAPER,
  toolbar: DARK_BG_PAPER,
  border: 'rgba(255, 255, 255, 0.12)',
  text: '#e5e7eb',
  buttonHover: '#565f6b',
  buttonActive: '#5c6571',
  link: '#90caf9',
  blockquoteBorder: DARK_PRIMARY,
} as const

export const darkTheme: Theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: DARK_PRIMARY,
    },
    secondary: {
      main: DARK_SECONDARY,
    },
    background: {
      default: DARK_BG_DEFAULT,
      paper: DARK_BG_PAPER,
    },
    text: {
      primary: DARK_TEXT_PRIMARY,
      secondary: DARK_TEXT_SECONDARY,
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: DARK_BG_DEFAULT,
          color: DARK_TEXT_PRIMARY,
        },
      },
    },
  },
})

export function getTheme(mode: 'light' | 'dark'): Theme {
  return mode === 'dark' ? darkTheme : lightTheme
}
