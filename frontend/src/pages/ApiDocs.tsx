import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import { Box, Typography, Paper, useTheme } from '@mui/material';

export function ApiDocs() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box sx={{ p: 3 }}>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          API Documentation
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Interactive documentation for the Zero2Prod API. Try out the endpoints directly from this page.
        </Typography>
      </Paper>
      
      <Paper 
        sx={{ 
          p: 2,
          // Override Swagger UI styles for dark mode
          '& .swagger-ui': {
            color: isDark ? theme.palette.text.primary : undefined,
            '& .info': {
              '& .title': {
                color: isDark ? theme.palette.text.primary : undefined,
              },
              '& p, & li': {
                color: isDark ? theme.palette.text.secondary : undefined,
              },
            },
            '& .opblock-tag': {
              color: isDark ? theme.palette.text.primary : undefined,
              borderBottom: isDark ? `1px solid ${theme.palette.divider}` : undefined,
            },
            '& .opblock': {
              backgroundColor: isDark ? theme.palette.background.default : undefined,
              borderColor: isDark ? theme.palette.divider : undefined,
              '& .opblock-summary': {
                borderColor: isDark ? theme.palette.divider : undefined,
              },
              '& .opblock-summary-method': {
                // Don't override in dark mode - let Swagger's method colors show through
                color: '#fff !important',
              },
              '& .opblock-summary-path, & .opblock-summary-description': {
                color: isDark ? theme.palette.text.primary : undefined,
              },
            },
            // HTTP method-specific colors for dark mode
            '& .opblock-get': {
              backgroundColor: isDark ? 'rgba(97, 175, 254, 0.1)' : undefined,
              borderColor: isDark ? 'rgba(97, 175, 254, 0.3)' : undefined,
              '& .opblock-summary-method': {
                backgroundColor: isDark ? '#61affe' : undefined,
              },
            },
            '& .opblock-post': {
              backgroundColor: isDark ? 'rgba(73, 204, 144, 0.1)' : undefined,
              borderColor: isDark ? 'rgba(73, 204, 144, 0.3)' : undefined,
              '& .opblock-summary-method': {
                backgroundColor: isDark ? '#49cc90' : undefined,
              },
            },
            '& .opblock-put': {
              backgroundColor: isDark ? 'rgba(252, 161, 48, 0.1)' : undefined,
              borderColor: isDark ? 'rgba(252, 161, 48, 0.3)' : undefined,
              '& .opblock-summary-method': {
                backgroundColor: isDark ? '#fca130' : undefined,
              },
            },
            '& .opblock-delete': {
              backgroundColor: isDark ? 'rgba(249, 62, 62, 0.1)' : undefined,
              borderColor: isDark ? 'rgba(249, 62, 62, 0.3)' : undefined,
              '& .opblock-summary-method': {
                backgroundColor: isDark ? '#f93e3e' : undefined,
              },
            },
            '& .opblock-description-wrapper, & .opblock-body': {
              backgroundColor: isDark ? theme.palette.background.paper : undefined,
              color: isDark ? theme.palette.text.primary : undefined,
            },
            '& .parameters, & .responses-inner': {
              backgroundColor: isDark ? theme.palette.background.default : undefined,
              '& td, & th': {
                color: isDark ? theme.palette.text.primary : undefined,
                borderColor: isDark ? theme.palette.divider : undefined,
              },
            },
            // Schemas section
            '& .model-box, & .model': {
              backgroundColor: isDark ? theme.palette.background.default : undefined,
              color: isDark ? theme.palette.text.primary : undefined,
            },
            '& .model-title': {
              color: isDark ? theme.palette.text.primary : undefined,
            },
            '& .model-box-control, & .model-toggle': {
              backgroundColor: isDark ? theme.palette.background.paper : undefined,
              borderColor: isDark ? theme.palette.divider : undefined,
              '&:after': {
                backgroundColor: isDark ? theme.palette.text.secondary : undefined,
              },
            },
            '& .models': {
              backgroundColor: isDark ? theme.palette.background.default : undefined,
              borderColor: isDark ? theme.palette.divider : undefined,
              '& .model-container': {
                backgroundColor: isDark ? theme.palette.background.paper : undefined,
                borderColor: isDark ? theme.palette.divider : undefined,
              },
              '& .model-box': {
                backgroundColor: isDark ? theme.palette.background.paper : undefined,
              },
            },
            '& .model-toggle': {
              '&:after': {
                borderColor: isDark ? `${theme.palette.text.secondary} transparent transparent` : undefined,
              },
            },
            // Schema property names and types
            '& .property-row': {
              borderColor: isDark ? theme.palette.divider : undefined,
              '& .prop-name': {
                color: isDark ? theme.palette.primary.light : undefined,
              },
              '& .prop-type': {
                color: isDark ? theme.palette.success.light : undefined,
              },
              '& .prop-format': {
                color: isDark ? theme.palette.text.secondary : undefined,
              },
            },
            '& .response, & .response-col_status': {
              color: isDark ? theme.palette.text.primary : undefined,
            },
            '& textarea, & input, & select': {
              backgroundColor: isDark ? theme.palette.background.default : undefined,
              color: isDark ? theme.palette.text.primary : undefined,
              borderColor: isDark ? theme.palette.divider : undefined,
            },
            '& .btn': {
              backgroundColor: isDark ? theme.palette.primary.main : undefined,
              color: isDark ? theme.palette.primary.contrastText : undefined,
              '&:hover': {
                backgroundColor: isDark ? theme.palette.primary.dark : undefined,
              },
            },
            '& .response-col_links': {
              color: isDark ? theme.palette.primary.light : undefined,
            },
            '& .parameter__name, & .parameter__type': {
              color: isDark ? theme.palette.text.primary : undefined,
            },
            '& .prop-type': {
              color: isDark ? theme.palette.primary.light : undefined,
            },
            '& .tab': {
              color: isDark ? theme.palette.text.secondary : undefined,
              '&.active': {
                color: isDark ? theme.palette.primary.main : undefined,
              },
            },
            // Code blocks and syntax highlighting
            '& .highlight-code, & .microlight': {
              backgroundColor: isDark ? theme.palette.grey[900] : undefined,
              color: isDark ? theme.palette.text.primary : undefined,
            },
            '& .renderedMarkdown p, & .renderedMarkdown code': {
              color: isDark ? theme.palette.text.primary : undefined,
            },
          }
        }}
      >
        <SwaggerUI 
          url="/api/openapi.json"
          docExpansion="list"
          defaultModelsExpandDepth={1}
          displayRequestDuration={true}
        />
      </Paper>
    </Box>
  );
}
