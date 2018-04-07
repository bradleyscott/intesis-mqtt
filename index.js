var debug = require('debug')('mqtt');
var mqtt = require('mqtt');
var intesis = require('./intesis');
var config = require('config').mqtt;
var _ = require('underscore');

var options = {
    port: config.port,
    username: config.username,
    password: config.password
}

debug('Attempting to connect to server');
var client = mqtt.connect(config.host, options);

client.on('connect', () =>  {
    debug('Connected to MQTT server');

    _(config.devices).each((device => {
        client.subscribe('climate/' + device.topic + '/power/set');
        client.subscribe('climate/' + device.topic + '/mode/set');
        client.subscribe('climate/' + device.topic + '/setpoint/set');
        client.subscribe('climate/' + device.topic + '/fan/set');
        client.subscribe('climate/' + device.topic + '/swing/set');    
    }));
    debug('Subscribed to all set topics');

    intesis.setStateChangeHandler(onStateChange);
    debug('Set state change handler');
});

client.on('message', (topic, message) => {
    debug('Received: %s on topic: %s', message, topic);

    var startOfDevice = topic.indexOf('/')
    var endOfDevice = topic.indexOf('/', startOfDevice + 1)
    var deviceTopic = topic.substring(startOfDevice + 1, endOfDevice);
    
    var endOfOperation = topic.indexOf('/', endOfDevice + 1)
    var operation = topic.substring(endOfDevice + 1, endOfOperation)

    var deviceId = _(config.devices).findWhere({ topic: deviceTopic }).deviceId;
    debug('Device: %s Operation: %s Payload: %s', deviceId, operation, message)

    intesis.performUpdateOperation(deviceId, operation, message.toString());
})

function onStateChange(deviceId, newState) {
    debug('Publishing state changes to MQTT channels');
    var deviceTopic = _(config.devices).findWhere({ deviceId: deviceId }).topic;

    debug('Publishing power state and operation mode...');
    if(newState.power == 'off')
        client.publish('climate/' + deviceTopic + '/mode/state', newState.power);
    else client.publish('climate/' + deviceTopic + '/mode/state', newState.operationMode);

    debug('Publishing current temperature...');
    client.publish('climate/' + deviceTopic + '/temperature/state', newState.currentTemperature.toString());

    debug('Publishing target temperature...');
    client.publish('climate/' + deviceTopic + '/setpoint/state', newState.targetTemperature.toString());

    debug('Publishing fan mode...');
    client.publish('climate/' + deviceTopic + '/fan/state', newState.fanMode);
    
    debug('Publishing swing mode...');
    client.publish('climate/' + deviceTopic + '/swing/state', newState.swingMode);

    debug('Finished publishing state changes');
}