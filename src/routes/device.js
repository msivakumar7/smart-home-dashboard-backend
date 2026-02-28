const Device = require('../models/Device')
const SensorReading = require('../models/SensorReading')
const Log = require('../models/Log')

// Helper to find or create device
async function getOrCreateDevice(deviceId) {
    let device = await Device.findOne({ deviceId })
    if (!device) device = await Device.create({ deviceId })
    return device
}

function addLog(deviceId, type, message) {
    return Log.create({ deviceId, type, message }).catch(() => { })
}

// GET /api/status/:deviceId
async function getStatus(req, res) {
    try {
        const device = await getOrCreateDevice(req.params.deviceId)
        res.json({
            ...device.state.toObject(),
            config: device.config,
            deviceId: device.deviceId,
            name: device.name,
            timestamp: device.state.lastSeen,
        })
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
}

// POST /api/toggle/:deviceId  — from dashboard
async function toggleLight(req, res) {
    try {
        const device = await getOrCreateDevice(req.params.deviceId)
        const newState = !device.state.lightOn
        device.state.lightOn = newState
        device.state.lastSeen = new Date()
        await device.save()

        const eventType = newState ? 'light_on' : 'light_off'
        addLog(device.deviceId, eventType, `Light toggled ${newState ? 'ON' : 'OFF'} via dashboard`)

        // Broadcast over socket
        const io = req.app.get('io')
        io?.to(device.deviceId).emit('update', {
            deviceId: device.deviceId,
            lightOn: newState,
            event: eventType,
            message: `Light toggled ${newState ? 'ON' : 'OFF'}`,
            timestamp: new Date().toISOString(),
        })

        res.json({ ...device.state.toObject(), lightOn: newState, timestamp: new Date().toISOString() })
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
}

// POST /api/config/:deviceId  — from settings page
async function updateConfig(req, res) {
    try {
        const { darkThreshold, autoOffDelay } = req.body
        const device = await getOrCreateDevice(req.params.deviceId)
        if (darkThreshold !== undefined) device.config.darkThreshold = darkThreshold
        if (autoOffDelay !== undefined) device.config.autoOffDelay = autoOffDelay
        await device.save()
        addLog(device.deviceId, 'config_change', `Config updated: threshold=${darkThreshold}, delay=${autoOffDelay}`)
        res.json({ config: device.config, message: 'Config updated' })
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
}

// POST /api/sensor/:deviceId  — called by ESP32
async function postSensorData(req, res) {
    try {
        const { ldrValue, temperature, humidity, motionDetected, lightOn, uptime } = req.body
        const device = await getOrCreateDevice(req.params.deviceId)

        // Update device state
        if (ldrValue !== undefined) device.state.ldrValue = ldrValue
        if (temperature !== undefined) device.state.temperature = temperature
        if (humidity !== undefined) device.state.humidity = humidity
        if (motionDetected !== undefined) device.state.motionDetected = motionDetected
        if (lightOn !== undefined) device.state.lightOn = lightOn
        if (uptime !== undefined) device.state.uptime = uptime
        device.state.lastSeen = new Date()
        await device.save()

        // Persist reading
        await SensorReading.create({
            deviceId: device.deviceId,
            ldrValue: device.state.ldrValue,
            temperature: device.state.temperature,
            humidity: device.state.humidity,
            motionDetected: device.state.motionDetected,
            lightOn: device.state.lightOn,
        })

        // Auto-light logic
        const { darkThreshold } = device.config
        const shouldBeOn = ldrValue !== undefined
            ? (motionDetected && ldrValue < darkThreshold)
            : device.state.lightOn

        let event = null
        if (shouldBeOn !== device.state.lightOn) {
            device.state.lightOn = shouldBeOn
            await device.save()
            event = shouldBeOn ? 'light_on' : 'auto_off'
            addLog(device.deviceId, event, `Auto-${shouldBeOn ? 'ON' : 'OFF'}: LDR=${ldrValue}, motion=${motionDetected}`)
        }

        if (motionDetected) addLog(device.deviceId, 'motion_detected', `Motion at LDR=${ldrValue}`)

        // Broadcast to dashboard
        const io = req.app.get('io')
        const payload = {
            deviceId: device.deviceId,
            ...device.state.toObject(),
            timestamp: new Date().toISOString(),
            ...(event ? { event, message: `Auto ${event}` } : {}),
        }
        io?.to(device.deviceId).emit('update', payload)

        // Send back current config so ESP32 can adjust
        res.json({ status: 'ok', lightOn: device.state.lightOn, config: device.config })
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
}

// GET /api/logs/:deviceId
async function getLogs(req, res) {
    try {
        const limit = parseInt(req.query.limit) || 50
        const logs = await Log.find({ deviceId: req.params.deviceId })
            .sort({ timestamp: -1 })
            .limit(limit)
        res.json({ logs })
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
}

// GET /api/history/:deviceId
async function getHistory(req, res) {
    try {
        const hours = parseInt(req.query.hours) || 24
        const since = new Date(Date.now() - hours * 3600 * 1000)
        const readings = await SensorReading.find({
            deviceId: req.params.deviceId,
            timestamp: { $gte: since },
        }).sort({ timestamp: 1 })
        res.json({ readings })
    } catch (err) {
        res.status(500).json({ message: err.message })
    }
}

module.exports = { getStatus, toggleLight, updateConfig, postSensorData, getLogs, getHistory }
