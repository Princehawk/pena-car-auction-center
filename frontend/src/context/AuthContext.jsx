import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || window.location.origin
const AuthContext = createContext(null)

export function AuthProvider ({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [dbUser, setDbUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  const syncUserToDb = async (authSession, authUser, fullName = '') => {
    if (!authSession?.access_token || !authUser) return

    try {
      const response = await fetch(`${API_URL}/auth/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession.access_token}`
        },
        body: JSON.stringify({
          fullName:
            fullName ||
            authUser?.user_metadata?.full_name ||
            authUser?.full_name ||
            '',
          email: authUser.email || '',
          phone: authUser.phone || null
        })
      })
      const data = await response.json().catch(() => ({}))
      if (data?.user) {
        setDbUser(data.user)
      }
    } catch (error) {
      console.error('Failed to sync auth user:', error)
    }
  }

  const loadDbUser = async authSession => {
    if (!authSession?.access_token) return

    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${authSession.access_token}`
        }
      })
      const data = await response.json().catch(() => ({}))
      if (data?.user) {
        setDbUser(data.user)
      }
    } catch (error) {
      console.error('Failed to load db user:', error)
    }
  }

  useEffect(() => {
    let isActive = true

    const initializeSession = async () => {
      const {
        data: { session: initialSession },
        error
      } = await supabase.auth.getSession()

      if (!isActive) return

      if (error) {
        setAuthError(error.message)
      }

      setSession(initialSession)
      setUser(initialSession?.user ?? null)
      if (initialSession) {
        await loadDbUser(initialSession)
      }
      setLoading(false)
    }

    initializeSession()

    const { data: authData } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        if (!isActive) return
        setSession(nextSession)
        setUser(nextSession?.user ?? null)
        if (nextSession) {
          await loadDbUser(nextSession)
        } else {
          setDbUser(null)
        }
        setLoading(false)
        if (_event === 'SIGNED_OUT') {
          setAuthError('')
        }
        if (
          (nextSession?.user || nextSession?.access_token) &&
          _event !== 'SIGNED_OUT'
        ) {
          await syncUserToDb(nextSession, nextSession?.user)
        }
      }
    )

    return () => {
      isActive = false
      authData.subscription?.unsubscribe?.()
    }
  }, [])

  const signInWithPassword = async (email, password) => {
    setAuthError('')
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      setAuthError(error.message)
      throw error
    }

    setSession(data.session)
    setUser(data.user)
    await syncUserToDb(data.session, data.user)
    return data
  }

  const signUpWithPassword = async (email, password, fullName = '') => {
    setAuthError('')
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName
        }
      }
    })

    if (error) {
      setAuthError(error.message)
      throw error
    }

    setSession(data.session)
    setUser(data.user)
    await syncUserToDb(data.session, data.user, fullName)
    return data
  }

  const signInWithGoogle = async redirectTo => {
    setAuthError('')
    const defaultRedirect = `${window.location.origin}/`

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:5173'
      }
    })

    if (error) {
      setAuthError(error.message)
      throw error
    }
  }

  const signOut = async () => {
    setAuthError('')
    const { error } = await supabase.auth.signOut()

    if (error) {
      setAuthError(error.message)
      throw error
    }

    setSession(null)
    setUser(null)
    setDbUser(null)
    window.location.replace('/')
  }

  const value = useMemo(
    () => ({
      session,
      user,
      dbUser,
      loading,
      authError,
      isAuthenticated: Boolean(session),
      isAdmin: dbUser?.role === 'admin',
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      signOut
    }),
    [authError, loading, session, user, dbUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth () {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider')
  }

  return context
}
