const mongoose = require('mongoose')

const LogSchema = new mongoose.Schema({
    deviceId: { type: String, required: true, index: true },
    type: {
        type: String,
        enum: ['motion_detected', 'light_on', 'light_off', 'auto_off', 'device_online', 'agent', 'config_change'],
        required: true,
    },
    message: { type: String, default: '' },
    agentAction: { type: Object, default: null }, // For AI agent events
    timestamp: { type: Date, default: Date.now, index: true },
})

LogSchema.index({ deviceId: 1, timestamp: -1 })

module.exports = mongoose.model('Log', LogSchema)
