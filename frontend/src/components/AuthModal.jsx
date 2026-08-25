import { useEffect } from 'react'
import AuthForm from './AuthForm.jsx'
import { useAuth } from '../context/AuthContext.jsx'

export default function AuthModal ({
  open,
  onClose,
  redirectTo = '/',
  onSuccess
}) {
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    if (!open) return
    if (isAuthenticated) {
      onClose?.()
    }
  }, [isAuthenticated, onClose, open])

  if (!open) return null

  return (
    <div className='modal-backdrop'>
      <div className='modal'>
        <div className='row'>
          <h3>Continue to Pena Car Auction Center</h3>
          <button
            type='button'
            className='button button-secondary'
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <AuthForm
          mode='login'
          redirectTo={redirectTo}
          compact
          onSuccess={() => {
            onSuccess?.()
            onClose?.()
          }}
        />
      </div>
    </div>
  )
}
