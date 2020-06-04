/* gelf-pro tcp adapter prototype-based modification https://github.com/kkamkou/node-gelf-pro */

import _ from 'lodash';
import net from 'net';
import zlib from 'zlib';

function TcpAdapter(options) {
    if (!options || !options.host || !options.port) {
        throw new Error('Host and port should be defined in tcpAdapter options.')
    }
    this.options = options;
    this.client = net.connect(options);
};

TcpAdapter.prototype.deflate = function(message, cb) {
    zlib.deflate(message, cb);
    return this;
};

TcpAdapter.prototype.send = function(message, callback) {
    let cb = _.once(callback),
        timeout = this.options.timeout || 10000,
        client = this.client;

    client.setTimeout(timeout, function() {
        client.emit('error', new Error('Timeout (' + timeout + ' ms)'));
    });

    client.once('error', function(err) {
        client.end();
        client.destroy();
        cb(err);
    }).once('connect', function() {
        let msg = Buffer.from(message.replace(/\x00/g, '')), // @todo! 1h add deflation with GELF 2.0
            packet = Buffer.from(Array.prototype.slice.call(msg, 0, msg.length).concat(0x00));
        client.end(packet, function() {
            cb(null, packet.length);
        });
    });

    return this;
};

export default TcpAdapter;
