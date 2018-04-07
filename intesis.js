var request = require('request');
var debug = require('debug')('intesis');
var _ = require('underscore');
var net = require('net');
var config = require('config').intesis;

var stateChangeHandler;
var devices = {};
var socket;
var token, ip, port;

var INTESIS_MAP = {
    1: {name: 'power', values: {0: 'off', 1: 'on'}},
    2: {name: 'mode', values: {0: 'auto', 1: 'heat', 2: 'dry', 3: 'fan', 4: 'cool'}},
    4: {name: 'fan_speed', values: {0: "auto", 1: "quiet", 2: "low", 3: "medium", 4: "high"}},
    5: {name: 'vvane',
        values: {0: "auto", 10: "swing", 1: "manual1", 2: "manual2", 3: "manual3", 4: "manual4", 5: "manual5"}},
    6: {name: 'hvane',
        values: {0: "auto", 10: "swing", 1: "manual1", 2: "manual2", 3: "manual3", 4: "manual4", 5: "manual5"}},
    9: {name: 'setpoint', null: 32768},
    10: {name: 'temperature'},
    13: {name: 'working_hours'},
    35: {name: 'setpoint_min'},
    36: {name: 'setpoint_max'},
    60002: {name: 'rssi'}
}

var COMMAND_MAP = {
    power: { uid: 1, values: { off: 0, on: 1 }},
    mode: { uid: 2, values: { auto: 0, heat: 1, dry: 2, fan: 3, cool: 4 }},
    fan: { uid: 4, values: {auto: 0, quiet: 1, low: 2, medium: 3, high: 4 }},
    swing: {uid: 5, values: {auto: 0, swing: 10 }},
    setpoint: {uid: 9}
}

var form = {
    username: config.username,
    password: config.password,
    cmd: '{"status":{"hash":"x"},"config":{"hash":"x"}}',
    version: "1.8.5"
};

request.post({
    url: 'https://user.intesishome.com/api.php/get/control',
    formData: form
}, (err, response, body) => {
    debug('Received response')
    body = JSON.parse(body);
    token = body.config.token;
    ip = body.config.serverIP;
    port = body.config.serverPort;

    debug('Setting up devices...')
    setupDevices(body.config.inst[0].devices);
    updateDeviceStatuses(body.status.status);
    createSocketConnection();
});

function createSocketConnection() {
    socket = net.createConnection(port, ip, () => {
        debug('Socket connection created');
        var authMessage = '{"command":"connect_req","data":{"token":%s}}'.replace('%s', token);
        socket.write(authMessage);
        debug('Auth message sent');
    });
    socket.on('data', dataReceived);
    socket.on('close', socketClosed);
}

function socketClosed() {
    debug('Socket closed. Reconnecting...');
    setTimeout(createSocketConnection, 15000);
}

function dataReceived(data) {
    debug('Data received: %s', data.toString());
    var stringArray = '[' + data.toString().replace(/}{/g, '},{') + ']';
    var commands = JSON.parse(stringArray);

    _(commands).each((command) => {
        if(command.command == 'status') 
            updateDeviceStatus(command.data.deviceId, command.data.uid, command.data.value);
        else if(command.command == 'rssi')
            updateLocalRSSI(command.data.deviceId, command.data.value);
        else if(command.command == 'connect_rsp') 
            debug('Connection status: %s', JSON.stringify(command.data));
        else debug('Unknown command received: %s', JSON.stringify(command));
    })
}

function setupDevices(devicesToSetup) {
    debug('Setting devices up')
    _(devicesToSetup).each((device) => {
        devices[device.id] = {
            name: device.name,
            widgets: device.widgets
        };
    });
    debug('Devices setup');
}

function updateDeviceStatuses(statuses) {
    debug('Updating device statuses')
    _(statuses).each((status) => updateDeviceStatus(status.deviceId, status.uid, status.value));
    debug('Device statuses updated')
}

function updateDeviceStatus(deviceId, uid, value) {
    debug('Received update request for device %s with uid %s and value %s', deviceId, uid, value);
    if(INTESIS_MAP[uid] == null) {
        debug('Unknown meaning of uid: %s', uid);
        return;
    }
    else if(INTESIS_MAP[uid].values != null) 
        value = INTESIS_MAP[uid].values[value];

    var oldValue = devices[deviceId][INTESIS_MAP[uid].name];
    if(oldValue == value) debug('Incoming value same as existing value');
    else {
        debug('Updating %s with value %s', INTESIS_MAP[uid].name, value);
        devices[deviceId][INTESIS_MAP[uid].name] = value;
        updateRemoteDeviceStatus(deviceId);
    }
}

function updateRemoteDeviceStatus(deviceId) {
    var power = devices[deviceId].power;
    var currentTemperature = devices[deviceId].temperature / 10;
    var targetTemperature = devices[deviceId].setpoint / 10;
    var fanMode = devices[deviceId].fan_speed;
    var operationMode = devices[deviceId].mode;
    var swingMode = devices[deviceId].vvane;

    if(!power || !currentTemperature || !targetTemperature || !fanMode || !operationMode || !swingMode) {
        debug('Not updating remote device status because some state values are missing');
        return;
    }

    debug('Updating remote device statuses');
    stateChangeHandler(deviceId, { power, currentTemperature, targetTemperature, fanMode, operationMode, swingMode });
}

function updateLocalRSSI(deviceId, value) {
    debug('Updating device %s with RSSI value %s', deviceId, value);
    devices[deviceId].rssi = value;
}

function sendUpdateToSocket(deviceId, uid, value) {
    debug('Attempting to write instructions on socket. Device: %s uid: %s value: %s', deviceId, uid, value)

    var command = {
        command: "set",
        data: {
            deviceId: deviceId,
            uid: uid,
            value: value,
            seqNo: 0
        }
    };
    command = JSON.stringify(command);

    debug('Sending: %s', command);
    socket.write(command);
}

function performUpdateOperation(deviceId, operation, payload) {
    debug('Attempting to interpret operation %s and payload %s for device %s', operation, payload, deviceId);
    
    // Transform some mode change operations because Intesis has separate power operations
    if(operation == 'mode' && payload == 'on') operation = 'power';
    else if(operation == 'mode' && payload == 'off') operation = 'power';
    else if(operation == 'mode' && devices[deviceId].power == 'off') {
        debug('Detected mode update when power is off. Also sending power on message')
        sendUpdateToSocket(deviceId, COMMAND_MAP['power'].uid, COMMAND_MAP['power'].values['on']);
    }

    if(!COMMAND_MAP[operation]) {
        debug('Not able to map operation %s to Intesis values', operation);
        return;
    }
    
    var uid = COMMAND_MAP[operation].uid;
    var value = COMMAND_MAP[operation].values ? COMMAND_MAP[operation].values[payload] : payload * 10; // Multiplied by 10 because of how Intesis understands temperature

    sendUpdateToSocket(deviceId, uid, value);
}

function setStateChangeHandler(handler) { stateChangeHandler = handler }

module.exports = { 
    performUpdateOperation,
    setStateChangeHandler
}