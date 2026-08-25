import db from '../config/db.js'

// Verifies the Supabase access token by calling the Supabase /auth/v1/user endpoint.
// This avoids needing the service role secret and keeps verification simple.
export const verifySupabaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) return res.status(401).json({ message: 'Unauthorized' })

  try {
    const SUPABASE_URL =
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    if (!SUPABASE_URL)
      return res.status(500).json({ message: 'Supabase URL not configured' })

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`
      }
    })
    if (!userRes.ok) {
      const errorBody = await userRes.text()

      console.error('Supabase user verification failed:', {
        status: userRes.status,
        body: errorBody
      })

      return res.status(401).json({
        message: 'Unauthorized',
        supabaseStatus: userRes.status,
        supabaseError: errorBody
      })
    }

    const userData = await userRes.json()
    // attach minimal user info
    req.user = {
      id: userData.id,
      email: userData.email,
      user_metadata: userData.user_metadata
    }
    next()
  } catch (error) {
    console.error('verifySupabaseToken error:', error.message)
    return res.status(401).json({ message: 'Unauthorized' })
  }
}

export const requireAdmin = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.sub || null
    if (!userId) return res.status(401).json({ message: 'Unauthorized' })

    const connection = await db.getConnection()
    try {
      const [rows] = await connection.execute(
        'SELECT role FROM users WHERE supabase_id = ? OR email = ? LIMIT 1',
        [userId, req.user?.email || '']
      )
      const role = rows[0]?.role || 'client'
      if (role !== 'admin')
        return res.status(403).json({ message: 'Forbidden' })
      next()
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('requireAdmin error:', error.message)
    return res.status(500).json({ message: 'Server error' })
  }
}
