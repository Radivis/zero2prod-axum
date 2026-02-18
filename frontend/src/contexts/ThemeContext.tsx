import { createContext, useContext, ReactNode } from 'react'
import { ThemeProvider as MuiThemeProvider, useColorScheme } from '@mui/material/styles'
import { CssBaseline } from '@mui/material'
import { theme } from '../theme'

type ThemeMode = 'light' | 'dark'

interface ThemeContextType {
  mode: ThemeMode
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const THEME_STORAGE_KEY = 'theme-mode'

interface ThemeContextBridgeProps {
  children: ReactNode
}

function ThemeContextBridge({ children }: ThemeContextBridgeProps) {
  const { mode, setMode, systemMode } = useColorScheme()

  // Resolve display mode: when mode is 'system', use system preference
  const resolvedMode: ThemeMode =
    mode === 'system' ? (systemMode ?? 'light') : (mode ?? 'light')

  const toggleTheme = () => {
    setMode(resolvedMode === 'light' ? 'dark' : 'light')
  }

  const contextValue: ThemeContextType = {
    mode: resolvedMode,
    toggleTheme,
  }

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  )
}

interface ThemeProviderProps {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <MuiThemeProvider
      theme={theme}
      modeStorageKey={THEME_STORAGE_KEY}
      defaultMode="system"
      noSsr
      disableTransitionOnChange
    >
      <ThemeContextBridge>
        <CssBaseline />
        {children}
      </ThemeContextBridge>
    </MuiThemeProvider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
