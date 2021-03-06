'use strict';
var util = require('util');
var EventEmitter = require('events').EventEmitter;

function Router() {
	EventEmitter.call(this);
}

util.inherits(Router, EventEmitter);

Router.prototype.init = function(server) {
	this.scanner = require('./scanner/scanner');
	this.server = server;
	return this;
};

Router.prototype.startScan = function(config) {
	if(this.scanner) {
		this.extension = require('../../modules/' + config.module);
		this.scanner.startScan(this, this.extension, config);
	}
};

Router.prototype.stopScan = function() {
	if(this.scanner) {
		this.scanner.stopScan();
	}
};

Router.prototype.connect = function(connector, config) {
	var self = this;
	var control = config.hardware.control;
	var duration = config.hardware.duration;
	var extension = this.extension;
	var server = this.server;
    var type = config.hardware.type;
    var h_type = type;
    var m_drain_check = true;
    var s_drain_check = true;

	self.connector = connector;
    if(self.connector['executeFlash']) {
        self.emit('state', 'flash');
    } else if(extension && server) {
		var handler = require('./datahandler/handler.js').create(config);
		if(extension.init) {
			extension.init(handler, config);
		}
		server.removeAllListeners();
		server.on('data', function(data, type) {
			handler.decode(data, type);
			if(extension.handleRemoteData) {
				extension.handleRemoteData(handler);
			}
		});
		server.on('close', function() {
			if(extension.reset) {
				extension.reset();
			}
		});
        connector.connect(extension, function(state, data) {
			if(state) {
				self.emit('state', state);
			} else if(m_drain_check) {
				if(extension.handleLocalData) {
					extension.handleLocalData(data);
				}
				if(extension.requestRemoteData) {
					extension.requestRemoteData(handler);
					var data = handler.encode();
					if(data) {
						server.send(data);
					}
				}
				if(control === 'master') {
					if(extension.requestLocalData) {
						var data = extension.requestLocalData();
						if(data) {
							m_drain_check = false;
							connector.send(data, function () {
								m_drain_check = true;
							});
						}
					}
				}
			}
		});

        if(duration && control !== 'master') {
            self.timer = setInterval(function() {
                if(extension.requestLocalData && s_drain_check) {
                    var data = extension.requestLocalData();
                    if(data) {
                    	s_drain_check = false;
                        connector.send(data, function () {
                        	s_drain_check = true;
                        });
                    }
                }
            }, duration);
        }
	}
};

Router.prototype.close = function() {
	if(this.server) {
		this.server.removeAllListeners();
	}
	if(this.scanner) {
		this.scanner.stopScan();
	}
	if(this.connector) {
		if(this.extension.disconnect) {
			this.extension.disconnect(this.connector);
		} else {
			this.connector.close();
		}
	}
	if(this.timer) {
		clearInterval(this.timer);
		this.timer = undefined;
	}
};

module.exports = new Router();
