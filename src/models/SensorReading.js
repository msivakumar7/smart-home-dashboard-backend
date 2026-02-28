const mongoose = require('mongoose')

const SensorReadingSchema = new mongoose.Schema({
    deviceId: { type: String, required: true, index: true },
    ldrValue: { type: Number, default: 512 },
    temperature: { type: Number, default: 25.0 },
    humidity: { type: Number, default: 60.0 },
    motionDetected: { type: Boolean, default: false },
    lightOn: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now, index: true },
})

SensorReadingSchema.index({ deviceId: 1, timestamp: -1 })

module.exports = mongoose.model('SensorReading', SensorReadingSchema)
