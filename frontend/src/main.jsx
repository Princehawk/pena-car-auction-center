import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import './index.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import { AuthProvider } from './context/AuthContext.jsx'
import Home from './Home.jsx'
import CarDetails from './CarDetails.jsx'
import Admin from './Admin.jsx'
import SignIn from './SignIn.jsx'
import Login from './Login.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Dashboard from './admin/Dashboard.jsx'
import Vehicles from './admin/Vehicles.jsx'
import NewCar from './admin/NewCar.jsx'
import Bids from './admin/Bids.jsx'
import Users from './admin/Users.jsx'
import TermsAndConditions from './TermsAndConditions.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path='/' element={<Home />} />
          <Route path='/login' element={<Login />} />
          <Route path='/sign-in' element={<SignIn />} />
          <Route
            path='/terms-and-conditions'
            element={<TermsAndConditions />}
          />
          <Route path='/cars/:id' element={<CarDetails />} />
          <Route
            path='/admin/*'
            element={
              <ProtectedRoute redirectTo='/'>
                <Admin />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path='vehicles' element={<Vehicles />} />
            <Route path='new' element={<NewCar />} />
            <Route path='bids' element={<Bids />} />
            <Route path='users' element={<Users />} />
          </Route>
        </Routes>
        <ToastContainer
          position='top-right'
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          pauseOnHover
          draggable
          pauseOnFocusLoss
        />
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>
)
