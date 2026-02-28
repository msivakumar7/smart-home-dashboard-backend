const jwt = require('jsonwebtoken')
const User = require('../models/User')

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

function signToken(userId) {
    return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

// POST /api/auth/login
async function login(req, res) {
    try {
        const { email, password } = req.body
        if (!email || !password) return res.status(400).json({ message: 'Email and password required' })

        let user = await User.findOne({ email })

        // Auto-create demo user if first run
        if (!user && email === 'demo@smarthome.io') {
            user = await User.create({ name: 'Demo User', email, password })
        }
        if (!user) return res.status(401).json({ message: 'Invalid credentials' })

        const valid = await user.comparePassword(password)
        if (!valid) return res.status(401).json({ message: 'Invalid credentials' })

        const token = signToken(user._id)
        res.json({ token, user: { id: user._id, name: user.name, email: user.email } })
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
}

// POST /api/auth/register
async function register(req, res) {
    try {
        const { name, email, password } = req.body
        if (!name || !email || !password) return res.status(400).json({ message: 'All fields required' })

        const exists = await User.findOne({ email })
        if (exists) return res.status(409).json({ message: 'Email already registered' })

        const user = await User.create({ name, email, password })
        const token = signToken(user._id)
        res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email } })
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
}

module.exports = { login, register }
