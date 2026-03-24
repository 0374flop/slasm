const dgram = require('dgram');

const sockets = new Map();
let nextId = 1;

module.exports = {
    open: {
        args: 0, returns: 1,
        fn: () => {
            const id = String(nextId++);
            const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
            const messages = [];
            let ready = false;

            sock.on('message', (msg, rinfo) => {
                messages.push({
                    data: msg.toString(),
                    from: rinfo.address,
                    port: String(rinfo.port)
                });
            });

            sock.on('listening', () => {
                ready = true;
            });

            sock.on('error', (err) => {
                console.error('UDP ERROR:', err);
            });

            sockets.set(id, { sock, messages, ready });
            return [id];
        }
    },

    bind: {
        args: 2, returns: 0,
        fn: ([id, port]) => {
            const s = sockets.get(id);
            if (!s) throw new Error(`udp: no socket ${id}`);

            s.sock.bind({
                port: Number(port),
                address: '0.0.0.0',
                exclusive: false
            });
        }
    },

    send: {
        args: 4, returns: 0,
        fn: ([id, msg, host, port]) => {
            const s = sockets.get(id);
            if (!s) throw new Error(`udp: no socket ${id}`);

            if (!s.ready) return;

            const buf = Buffer.from(msg);
            s.sock.send(buf, 0, buf.length, Number(port), host);
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
        }
    },
};