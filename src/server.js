require('dotenv').config()
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const mongoose = require('mongoose')
const cors = require('cors')
const { login, register } = require('./routes/auth')
const { authMiddleware, deviceAuth } = require('./middleware/auth')
const {
    getStatus, toggleLight, updateConfig,
    postSensorData, getLogs, getHistory
} = require('./routes/device')
const setupSocket = require('./socket')

const app = express()
const server = http.createServer(app)

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',')
app.use(cors({
    origin: (origin, cb) => {
        if (!origin || allowedOrigins.some((o) => o.trim() === origin)) cb(null, true)
        else cb(new Error('CORS not allowed'))
    },
    credentials: true,
}))

// ── Socket.IO ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
    },
})
setupSocket(io)
app.set('io', io)

// ── Body parser ───────────────────────────────────────────────────────────────
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }))

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/api/auth/login', login)
app.post('/api/auth/register', register)

// ── Device / Dashboard routes (JWT protected) ─────────────────────────────────
app.get('/api/status/:deviceId', authMiddleware, getStatus)
app.post('/api/toggle/:deviceId', authMiddleware, toggleLight)
app.post('/api/config/:deviceId', authMiddleware, updateConfig)
app.get('/api/logs/:deviceId', authMiddleware, getLogs)
app.get('/api/history/:deviceId', authMiddleware, getHistory)

// ── ESP32 Sensor Push (device key auth) ───────────────────────────────────────
// ESP32 sends: POST /api/sensor/esp32-001
// Headers:     X-Device-Key: your-device-key
// Body:        { ldrValue, temperature, humidity, motionDetected, lightOn, uptime }
app.post('/api/sensor/:deviceId', deviceAuth, postSensorData)

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: 'Route not found' }))

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
    console.error(err)
    res.status(500).json({ message: err.message || 'Internal server error' })
})

// ── Database + Start ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smarthome'

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ MongoDB connected')
        server.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`)
            console.log(`📡 Socket.IO ready for connections`)
        })
    })
    .catch((err) => {
        console.error('❌ MongoDB connection failed:', err.message)
        console.log('⚠️  Starting without database (limited functionality)')
        server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT} (no DB)`))
    })

module.exports = { app, server }
