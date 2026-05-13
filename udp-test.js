const dgram = require('dgram');

const server = dgram.createSocket('udp4');
server.on('message', (msg, rinfo) => {
    console.log('received:', msg.toString(), 'from', rinfo.address, rinfo.port);
});
server.bind(9999, () => {
    console.log('server bound to 9999');
});

setTimeout(() => {
    const client = dgram.createSocket('udp4');
    const msg = Buffer.from('hello!');
    client.send(msg, 9999, '127.0.0.1', () => {
        console.log('sent!');
        client.close();
    });
}, 500);
