import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Container } from '@mui/material'
import Home from './pages/Home'
import Login from './pages/Login'
import InitialPassword from './pages/InitialPassword'
import AdminDashboard from './pages/AdminDashboard'
import AdminNewsletter from './pages/AdminNewsletter'
import AdminPassword from './pages/AdminPassword'
import Layout from './components/Layout'

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/initial_password" element={<InitialPassword />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/newsletters" element={<AdminNewsletter />} />
            <Route path="/admin/password" element={<AdminPassword />} />
          </Routes>
        </Container>
      </Layout>
    </BrowserRouter>
  )
}

export default App
