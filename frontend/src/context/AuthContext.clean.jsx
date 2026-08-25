import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider ({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let isActive = true

    const initializeSession = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (!isActive) return

      if (error) {
        setAuthError(error.message)
      }

      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    }

    initializeSession()

    const { data: authData } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!isActive) return
        setSession(nextSession)
        setUser(nextSession?.user ?? null)
        setLoading(false)
        if (_event === 'SIGNED_OUT') {
          setAuthError('')
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
    return data
  }

  const signInWithGoogle = async redirectTo => {
    setAuthError('')
    const defaultRedirect = `${window.location.origin}/`

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo || defaultRedirect
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
  }

  const value = useMemo(
    () => ({
      session,
      user,
      loading,
      authError,
      isAuthenticated: Boolean(session),
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      signOut
    }),
    [authError, loading, session, user]
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
