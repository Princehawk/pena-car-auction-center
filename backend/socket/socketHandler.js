import { Server } from 'socket.io'
import dotenv from 'dotenv'
dotenv.config()

export let io = null

const getSocketUser = async token => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  if (!token || !supabaseUrl) return null
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`
    }
  })
  return response.ok ? response.json() : null
}

export const registerSocketHandlers = server => {
  io = new Server(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS,
      methods: ['GET', 'POST'],
      credentials: true
    }
  })

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (!token) return next()
      const user = await getSocketUser(token)
      if (!user?.id) return next(new Error('Unauthorized'))
      socket.user = user
      next()
    } catch (error) {
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', socket => {
    console.log('Socket connected:', socket.id)
    if (socket.user?.id) socket.join(`user:${socket.user.id}`)

    socket.on('joinCar', carId => {
      socket.join(String(carId))
      console.log(`Socket ${socket.id} joined car room ${carId}`)
    })

    socket.on('leaveCar', carId => {
      socket.leave(String(carId))
      console.log(`Socket ${socket.id} left car room ${carId}`)
    })

    socket.on('placeBid', payload => {
      console.log('Socket placeBid received:', payload)
      io.emit('newBid', payload)
      io.emit('bidAccepted', payload)
    })

    socket.on('disconnect', reason => {
      console.log('Socket disconnected:', socket.id, reason)
    })
  })

  return io
}
