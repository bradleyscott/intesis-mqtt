var debug = require('debug')('mqtt-listener');
var mqtt = require('mqtt');
var config = require('config').mqtt;

var options = {
    port: config.port,
    username: config.username,
    password: config.password
}

debug('Attempting to connect to server');
var client = mqtt.connect(config.host, options);

client.on('connect', () =>  {
    debug('Connected to MQTT server');
    client.subscribe('#');
});

client.on('message', (topic, message) => {
    debug('Received: %s on topic: %s', message, topic);
})
