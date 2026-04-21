import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from '../ui/layout/AdminLayout'
import { RequireAdmin } from '../auth/RequireAdmin'
import { AuthProvider } from '../auth/AuthProvider'
import { LoginPage } from '../pages/LoginPage'
import { UsersPage } from '../pages/UsersPage'
import { TrainersPage } from '../views/TrainersPage'
import { ReportsPage } from '../views/ReportsPage'
import { ProductsPage } from '../views/ProductsPage'
import { BannersPage } from '../views/BannersPage'
import { TermsPage } from '../views/TermsPage'

export function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<Navigate to="/users" replace />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/trainers" element={<TrainersPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/banners" element={<BannersPage />} />
            <Route path="/terms" element={<TermsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/users" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
