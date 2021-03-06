(function() {
  var Buffer, Connection, Pool, Protobuf, events, fs, net, path, sys;

  sys = require('sys');

  net = require('net');

  fs = require('fs');

  events = require('events');

  path = require('path');

  Buffer = require('buffer').Buffer;

  Pool = (function() {

    function Pool(options) {
      var _base, _base2, _base3;
      this.options = options || {};
      (_base = this.options).port || (_base.port = 8087);
      (_base2 = this.options).host || (_base2.host = '127.0.0.1');
      (_base3 = this.options).max || (_base3.max = 10);
      this.running = 0;
      this.pool = [];
      this.events = new events.EventEmitter();
    }

    Pool.prototype.start = function(callback) {
      if (!(this.running != null)) return false;
      this.next(function(conn) {
        if (conn.writable) {
          if (callback) return callback(conn);
        } else {
          return conn.on('connect', function() {
            if (callback) return callback(conn);
          });
        }
      });
      return true;
    };

    Pool.prototype.send = function(name, data, callback) {
      return this.start(function(conn) {
        return conn.send(name, data, function(resp) {
          try {
            return callback(resp);
          } finally {
            conn.finish();
          }
        });
      });
    };

    Pool.prototype.finish = function(conn) {
      if (this.running != null) {
        this.running -= 1;
        this.events.emit('finish');
        if (this.pool.length < this.options.max) return this.pool.push(conn);
      } else {
        return conn.end();
      }
    };

    Pool.prototype.end = function() {
      this.running = null;
      return this.pool.forEach(function(conn) {
        return conn.end();
      });
    };

    Pool.prototype.next = function(callback) {
      var cb;
      var _this = this;
      if (this.running >= this.options.max) {
        return this.events.on('finish', (cb = function() {
          if (_this.running < _this.options.max) {
            callback(_this.getConnection());
            return _this.events.removeListener('finish', cb);
          }
        }));
      } else {
        return callback(this.getConnection());
      }
    };

    Pool.prototype.getConnection = function() {
      this.running += 1;
      return this.pool.pop() || new Connection(this);
    };

    return Pool;

  })();

  Connection = (function() {
    var PB_HEADER_LENGTH;

    PB_HEADER_LENGTH = 5;

    function Connection(pool) {
      var _this = this;
      this.conn = net.createConnection(pool.options.port, pool.options.host);
      this.pool = pool;
      this.conn.on('data', function(chunk) {
        return _this.receive(chunk);
      });
      this.reset();
    }

    Connection.prototype.send = function(name, data, callback) {
      this.callback = callback;
      return this.conn.write(this.prepare(name, data));
    };

    Connection.prototype.finish = function() {
      return this.pool.finish(this);
    };

    Connection.prototype.end = function() {
      return this.conn.end();
    };

    Connection.prototype.on = function(event, listener) {
      this.conn.on(event, listener);
      return this;
    };

    Connection.prototype.prepare = function(name, data) {
      var buf, len, msg, type;
      type = Protobuf[name];
      if (data) {
        buf = type.serialize(data);
        len = buf.length + 1;
      } else {
        len = 1;
      }
      msg = new Buffer(len + 4);
      msg[0] = len >>> 24;
      msg[1] = len >>> 16;
      msg[2] = len >>> 8;
      msg[3] = len & 255;
      msg[4] = type.riak_code;
      if (buf) buf.copy(msg, 5, 0);
      return msg;
    };

    Connection.prototype.chunk_append = function(buf) {
      this.new_buf = new Buffer(this.chunk.length + buf.length);
      this.chunk.copy(this.new_buf, 0, 0);
      buf.copy(this.new_buf, this.chunk.length, 0);
      return this.chunk = this.new_buf;
    };

    Connection.prototype.receive = function(chunk) {
      this.chunk_append(chunk);
      if (this.attempt_parse()) {
        if (this.pool.running != null) {
          return this.reset();
        } else {
          return this.end();
        }
      }
    };

    Connection.prototype.attempt_parse = function() {
      var code, data;
      if (data = this.parse()) {
        if ((data.errmsg != null) && (data.errcode != null)) {
          code = data.errcode;
          data = new Error(data.errmsg);
          data.errcode = code;
        }
        if (this.callback) this.callback(data);
        if (this.chunk_pos < this.chunk.length) {
          this.resp = null;
          return this.attempt_parse();
        } else {
          return true;
        }
      }
    };

    Connection.prototype.parse = function() {
      var bytes_read, ending, remaining, resp;
      if (this.receiving) {
        ending = this.resp_len + this.chunk_pos;
        if (ending > this.chunk.length) ending = this.chunk.length;
        bytes_read = ending - this.chunk_pos;
        this.chunk.copy(this.resp, this.resp_pos, this.chunk_pos, ending);
        this.resp_pos += bytes_read;
        this.chunk_pos += bytes_read;
        if (this.resp_pos >= this.resp_len) {
          resp = this.type.parse(this.resp);
          remaining = this.chunk.slice(this.resp_len + PB_HEADER_LENGTH, this.chunk.length);
          this.reset();
          this.chunk = remaining;
          return resp;
        }
      } else {
        if (this.chunk.length < PB_HEADER_LENGTH) return;
        this.resp_len = (this.chunk[this.chunk_pos + 0] << 24) + (this.chunk[this.chunk_pos + 1] << 16) + (this.chunk[this.chunk_pos + 2] << 8) + this.chunk[this.chunk_pos + 3] - 1;
        this.type = Protobuf.type(this.chunk[this.chunk_pos + 4]);
        this.resp = new Buffer(this.resp_len);
        this.resp_pos = 0;
        this.chunk_pos += 5;
        return this.parse();
      }
    };

    Connection.prototype.reset = function() {
      this.type = null;
      this.resp = null;
      this.chunk = new Buffer(0);
      this.chunk_pos = 0;
      this.resp_pos = 0;
      return this.resp_len = 0;
    };

    return Connection;

  })();

  Connection.prototype.__defineGetter__('receiving', function() {
    return this.resp;
  });

  Connection.prototype.__defineGetter__('writable', function() {
    return this.conn.writable;
  });

  Pool.Connection = Connection;

  Protobuf = {
    types: ["ErrorResp", "PingReq", "PingResp", "GetClientIdReq", "GetClientIdResp", "SetClientIdReq", "SetClientIdResp", "GetServerInfoReq", "GetServerInfoResp", "GetReq", "GetResp", "PutReq", "PutResp", "DelReq", "DelResp", "ListBucketsReq", "ListBucketsResp", "ListKeysReq", "ListKeysResp", "GetBucketReq", "GetBucketResp", "SetBucketReq", "SetBucketResp", "MapRedReq", "MapRedResp"],
    type: function(num) {
      return this[this.types[num]];
    },
    schemaFile: path.join(path.dirname(module.filename), 'riak.desc')
  };

  Protobuf.__defineGetter__('schema', function() {
    return this._schema || (this._schema = new (require('protobuf_for_node').Schema)(fs.readFileSync(Protobuf.schemaFile)));
  });

  Protobuf.types.forEach(function(name) {
    var cached_name;
    cached_name = "_" + name;
    return Protobuf.__defineGetter__(name, function() {
      var code, sch;
      if (this[cached_name]) {
        return this[cached_name];
      } else {
        code = Protobuf.types.indexOf(name);
        if (sch = Protobuf.schema["Rpb" + name]) {
          sch.riak_code = code;
          return this[cached_name] = sch;
        } else {
          return this[cached_name] = {
            riak_code: code,
            parse: function() {
              return true;
            }
          };
        }
      }
    });
  });

  module.exports = Pool;

}).call(this);
