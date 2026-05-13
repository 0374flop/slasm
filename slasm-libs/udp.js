const dgram = require('dgram');

const sockets = new Map();
let nextId = 1;

module.exports = {
    open: {
        args: 0, returns: 1,
        fn: (_, runtime) => {
            const id = String(nextId++);
            const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
            const messages = [];

            sock.on('message', (msg, rinfo) => {
                const data = msg.toString();
                const from = rinfo.address;
                const port = String(rinfo.port);

                messages.push({ data, from, port });

                if (runtime) {
                    runtime.emitter.emit('event', `udp:message:${id}`, data, from, port);
                }
            });

            sock.on('error', (err) => {
                if (runtime) {
                    runtime.emitter.emit('event', `udp:error:${id}`, err.message);
                } else {
                    console.error('UDP ERROR:', err);
                }
            });

            sockets.set(id, { sock, messages });
            return [id];
        }
    },

    bind: {
        args: 2, returns: 0,
        fn: async ([id, port]) => {
            const s = sockets.get(id);
            if (!s) throw new Error(`udp: no socket ${id}`);
            await new Promise((resolve, reject) => {
                s.sock.bind({ port: Number(port), address: '0.0.0.0', exclusive: false }, (err) => {
                    if (err) reject(err);
                    else resolve(undefined);
                });
            });
            return [];
        }
    },

    send: {
        args: 4, returns: 0,
        fn: async ([id, msg, host, port]) => {
            const s = sockets.get(id);
            if (!s) throw new Error(`udp: no socket ${id}`);
            const buf = Buffer.from(msg);
            await new Promise((resolve, reject) => {
                s.sock.send(buf, 0, buf.length, Number(port), host, (err) => {
                    if (err) reject(err);
                    else resolve(undefined);
                });
            });
            return [];
        }
    },

    recv: {
        args: 1, returns: 3,
        fn: ([id]) => {
            const s = sockets.get(id);
            if (!s) throw new Error(`udp: no socket ${id}`);
            const m = s.messages.shift();
            if (!m) return ['', '', ''];
            return [m.data, m.from, m.port];
        }
    },

    pending: {
        args: 1, returns: 1,
        fn: ([id]) => {
            const s = sockets.get(id);
            if (!s) throw new Error(`udp: no socket ${id}`);
            return [String(s.messages.length)];
        }
    },

    close: {
        args: 1, returns: 0,
        fn: ([id]) => {
            const s = sockets.get(id);
            if (!s) throw new Error(`udp: no socket ${id}`);
            s.sock.close();
            sockets.delete(id);
            return [];
        }
    },
};
