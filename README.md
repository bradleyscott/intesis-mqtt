# Introduction
Because I am not experienced with Python I was having difficulty getting the [pyIntesisHome](https://github.com/jnimmo/pyIntesisHome) Home Assistant component working. 

Instead of battling with that I decided to take another approach and re-implemented the Intesis integration in Node.js and utilised the existing [MQTT HVAC](https://www.home-assistant.io/components/climate.mqtt/) component of Home Assistant instead

# Overview of how it works
I set up a MQTT HVAC component in Home Assistant and configured a number of MQTT topics to read the current state of my heat pumps, and publish requested changes. An example configuration is [here](https://github.com/bradleyscott/home-automation/blob/master/homeassistant/climate/bedroom_ac.yaml) and shown below:
```
platform: mqtt
name: Bedroom heat pump
send_if_off: true
modes:
  - auto
  - cool
  - dry
  - fan
  - heat
  - 'off'
fan_modes:
  - auto
  - quiet
  - low
  - medium
  - high
mode_command_topic: 'climate/bedroom/mode/set'
mode_state_topic: 'climate/bedroom/mode/state'
temperature_command_topic: 'climate/bedroom/setpoint/set'
temperature_state_topic: 'climate/bedroom/setpoint/state'
fan_mode_command_topic: 'climate/bedroom/fan/set'
fan_mode_state_topic: 'climate/bedroom/fan/state'
current_temperature_topic: 'climate/bedroom/temperature/state'
```
This Node.js application establishes a TCP socket connection to Intesis APIs, receives state changes on the socket from the heatpump and publishes these changes to the MQTT state topics. 

It also listens for commands published to the MQTT command topics by Home Assistant and sends data via the socket to Intesis to control the heat pump.

# Configuration
The application requires a configuration file that contains:
* Username and password for authenticating to Intesis
* Host and authentication details for connecting to the MQTT broker
* Mappings of MQTT topics to Intesis device ids

An example is [here](https://github.com/bradleyscott/home-automation/blob/master/intesis_mqtt/config/default.json.example) and shown below:
```
{
    "intesis": {
        "username": "yourusername",
        "password": "yourpassword"
    },
    "mqtt": {
        "username": "mqttusername",
        "password": "mqttpassword",
        "host": "mqtts://hostname",
        "port": "29759",
        "devices": [
            { "topic": "living_room", "deviceId": 224571111111114 },
            { "topic": "bedroom", "deviceId": 22457111111119 }
        ]
    }
}
```
# Running the application
Once you have created a configuration file, the application can be run locally by running: ```npm install && npm start```
or alterantively it can be run as a Docker container by running:
```
docker build . -t intesis-mqtt
docker run -it intesis-mqtt
```
There is also another Node application which allows you to keep an eye on every MQTT message passing through your MQTT broker which you can start by running ```DEBUG=* node mqtt-listener.js```