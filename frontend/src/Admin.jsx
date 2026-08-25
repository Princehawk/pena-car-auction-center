import { Outlet } from 'react-router-dom'
import AdminGuard from './AdminGuard'
import AdminLayout from './AdminLayout'
import './App.css'

export default function Admin () {
  return (
    <AdminGuard>
      <AdminLayout>
        <Outlet />
      </AdminLayout>
    </AdminGuard>
  )
}
