// Socket.IO event handlers
function setupSocket(io) {
    io.on('connection', (socket) => {
        console.log(`[WS] Client connected: ${socket.id}`)

        // Dashboard subscribes to a device's room
        socket.on('subscribe', ({ deviceId }) => {
            if (deviceId) {
                socket.join(deviceId)
                console.log(`[WS] ${socket.id} subscribed to ${deviceId}`)
                socket.emit('subscribed', { deviceId, message: `Subscribed to ${deviceId}` })
            }
        })

        socket.on('disconnect', () => {
            console.log(`[WS] Client disconnected: ${socket.id}`)
        })
    })
}

module.exports = setupSocket
