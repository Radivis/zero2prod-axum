import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import { Box, Typography, Paper } from '@mui/material';

export function ApiDocs() {
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
      
      <Paper sx={{ p: 2 }}>
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
