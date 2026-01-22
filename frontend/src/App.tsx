import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Container } from '@mui/material'
import Home from './pages/Home'
import Login from './pages/Login'
import InitialPassword from './pages/InitialPassword'
import AdminDashboard from './pages/AdminDashboard'
import AdminNewsletter from './pages/AdminNewsletter'
import AdminPassword from './pages/AdminPassword'
import NotFound from './pages/NotFound'
import Layout from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'

function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Layout>
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/initial_password" element={<InitialPassword />} />
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/newsletters"
              element={
                <ProtectedRoute>
                  <AdminNewsletter />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/password"
              element={
                <ProtectedRoute>
                  <AdminPassword />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Container>
      </Layout>
    </BrowserRouter>
  )
}

export default App
