const mongoose = require('mongoose')

const DeviceSchema = new mongoose.Schema({
    deviceId: { type: String, required: true, unique: true },
    name: { type: String, default: 'SmartLight' },
    config: {
        darkThreshold: { type: Number, default: 400 },
        autoOffDelay: { type: Number, default: 60 },
    },
    state: {
        lightOn: { type: Boolean, default: false },
        motionDetected: { type: Boolean, default: false },
        ldrValue: { type: Number, default: 512 },
        temperature: { type: Number, default: 25.0 },
        humidity: { type: Number, default: 60.0 },
        uptime: { type: Number, default: 0 },
        lastSeen: { type: Date, default: Date.now },
    },
    createdAt: { type: Date, default: Date.now },
})

module.exports = mongoose.model('Device', DeviceSchema)
