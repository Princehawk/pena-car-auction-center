import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import http from 'http'
import carRoutes from './routes/carRoutes.js'
import bidRoutes from './routes/bidRoutes.js'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { registerSocketHandlers } from './socket/socketHandler.js'

const app = express()
app.set('trust proxy', 1)
const server = http.createServer(app)
dotenv.config()
// Basic security headers
app.use(helmet())

// Configure CORS: allow a comma-separated list in ALLOWED_ORIGINS env
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
if (allowedOrigins.length) {
  app.use(cors({ origin: allowedOrigins }))
} else {
  // default to permissive in development
  app.use(cors())
}

// Basic rate limiting for all requests
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 }) // 120 requests per minute
app.use(apiLimiter)
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

app.get('/health', (_req, res) => res.json({ status: 'ok' }))
app.use(carRoutes)
app.use(bidRoutes)

registerSocketHandlers(server)

const PORT = process.env.PORT

const startServer = () => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`)
  })
}

export { app, server, startServer }
