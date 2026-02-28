const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'

function authMiddleware(req, res, next) {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'No token provided' })
    try {
        const decoded = jwt.verify(header.slice(7), JWT_SECRET)
        req.userId = decoded.id
        next()
    } catch {
        res.status(401).json({ message: 'Invalid or expired token' })
    }
}

// Looser check for ESP32 device key (sent as X-Device-Key header)
function deviceAuth(req, res, next) {
    const key = req.headers['x-device-key']
    const allowed = (process.env.ALLOWED_DEVICES || 'esp32-001').split(',')
    const deviceId = req.params.deviceId || req.body?.deviceId
    if (allowed.includes(deviceId) && key) return next()
    // Also allow JWT auth for dashboard requests
    authMiddleware(req, res, next)
}

module.exports = { authMiddleware, deviceAuth }
