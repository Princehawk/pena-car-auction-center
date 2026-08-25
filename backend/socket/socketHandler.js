import { Server } from 'socket.io'

export let io = null

export const registerSocketHandlers = server => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    }
  })

  io.on('connection', socket => {
    console.log('Socket connected:', socket.id)

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
      io.to(String(payload.car_id)).emit('newBid', payload)
      io.emit('bidAccepted', payload)
    })

    socket.on('disconnect', reason => {
      console.log('Socket disconnected:', socket.id, reason)
    })
  })

  return io
}
