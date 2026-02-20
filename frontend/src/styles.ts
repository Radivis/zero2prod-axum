import type { SxProps, Theme } from '@mui/material';

/**
 * Centered flex layout - commonly used for page content alignment.
 */
export const centeredFlex: SxProps<Theme> = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '60vh',
};
