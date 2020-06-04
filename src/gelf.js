/* gelf-pro prototype-based modification https://github.com/kkamkou/node-gelf-pro */

import os from 'os';
import _ from 'lodash';
import TcpAdapter from './tcpAdapter';

let levels = {
    emergency: 0,
    alert: 1,
    critical: 2,
    error: 3,
    warning: 4,
    notice: 5,
    info: 6,
    debug: 7,
    /* aliases */
    log: 7,
    warn: 4
}

var defaultConfig = {
    fields: {},
    filter: [],
    broadcast: [],
    transform: [],
    adapterOptions: {
        host: '127.0.0.1',
        port: 12201
    }
}

function Gelf(config) {
    this.config = config
        ? _.merge({}, defaultConfig, config)
        : defaultConfig;
}

Gelf.prototype.setConfig = function(conf) {
    this.config = _.merge({}, defaultConfig, conf);
    return this;
};

Gelf.prototype.getConfig = function() {
    return this.config;
};

Gelf.prototype.getAdapter = function() {
    return new TcpAdapter(this.config.adapterOptions);
};

Gelf.prototype.getStringFromObject = function(obj) {
    var result = {
        version: '1.1',
        short_message: 'No message', // eslint-disable-line
        timestamp: Date.now() / 1000,
        host: os.hostname()
    };

    /* it is not possible to send the id field */
    if (!_.isUndefined(obj.id)) {
        delete obj.id;
    }

    /* some fields should be copied without change */
    ['full_message', 'short_message', 'level', 'host', 'timestamp'].forEach(function(key) {
        if (!_.isUndefined(obj[key])) {
            result[key] = obj[key];
            delete obj[key];
        }
    });

    // recursion function for key-value aggregation
    // 32766 bytes is the maximum length for a field
    var recursion = function(input, prefix) {
        _.forOwn(input, function(value, key) {
            /* Switched off - TODO: suppress in production! */
            // if ((/[^\w-]/).test(key)) {
            //     console.warn(key + ': the key format is not valid');
            // }
            if (_.isPlainObject(value)) {
                return recursion(
                    value, prefix
                    ? [prefix, key].join('_')
                    : key);
            }
            result[(
                    prefix
                    ? [null, prefix, key]
                    : [null, key]).join('_')] = _.isFinite(value)
                ? value
                : _.truncate(_.toString(value), {length: 32765}); // 32765 + 1
        });
    };

    recursion(obj);

    return JSON.stringify(result);
};

Gelf.prototype.send = function(message, cb) {
    this.getAdapter().send(message, cb);
    return this;
};

Gelf.prototype.message = function(message, lvl, extra, cb) {
    // it is possible to skip the extra variable
    if (_.isFunction(extra) && !cb) {
        cb = extra;
        extra = {};
    }

    cb = cb || _.noop;

    /* empty call, usually triggered by a thoughtless programmer */
    if (_.isNil(message)) {
        return cb(null, 0);
    }

    /* cleaning up a bogus call */
    if (!_.isUndefined(extra) && !_.isObjectLike(extra)) {
        /* Switched off - TODO: suppress in production! */
        // console.warn('[gelf-pro]', 'extra should be object-like or undefined');
        extra = {};
    }

    /* trying to convert an error to readable message */
    if (_.isError(message)) {
        if (_.isEmpty(extra) && message.stack) {
            extra = {
                full_message: message.stack
            };
        }
        message = message.message.toString() || 'Error';
    }
    if (_.isError(extra)) {
        extra = {
            error: {
                message: extra.message,
                stack: extra.stack
            }
        };
    }

    extra = _.merge({
        short_message: message,
        level: lvl
    }, this.config.fields, extra || {});

    /* filtering */
    if (this.config.filter.length && !_.overEvery(this.config.filter)(_.cloneDeep(extra))) {
        return cb(null, 0);
    }

    /* transforming */
    if (this.config.transform.length) {
        _.invokeMap(this.config.transform, _.call, null, extra);
    }

    extra = this.getStringFromObject(extra);

    var self = this;
    process.nextTick(function() {
        self.send(extra, cb);
    });
};

_.forEach(levels, function(idx, lvl) {
    Gelf.prototype[lvl] = function(message, extra, cb) {
        this.message(message, idx, extra, cb);
    }
});

export default Gelf;
