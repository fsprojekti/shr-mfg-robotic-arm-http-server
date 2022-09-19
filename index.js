import WebSocket from 'ws';
// define require because this app is now defined as a "module" type
import {createRequire} from "module";

const require = createRequire(import.meta.url);
const express = require('express');
const app = express();

// add timestamps in front of all log messages
require('console-stamp')(console, '[HH:MM:ss.l]');

// open file with configuration data
const fs = require('fs');
const config = require("./config.json");

// ########## global variables
let jetmaxState = {};
let image = []

// create a websocket connection to the jetmax socket server
const jetmaxWebSocketServer = 'ws:' + config.roboticArmIpAddress + ":9090";
console.log(jetmaxWebSocketServer);
const ws = new WebSocket(jetmaxWebSocketServer);

// print a message when a successful connection to the socket server is made
ws.on('open', function open() {

    console.log("Connection to server " + jetmaxWebSocketServer + " successful.");

    // SUBSCRIBE TO ALL RELEVANT TOPICS:
    //  /jetmax/status/
    let subData = subscribeData("subscribe:/jetmaxState", "/jetmax/status", "jetmax_control/JetMax", "none", 0, 0);
    console.log("subscribe data sent: " + JSON.stringify(subData));
    ws.send(JSON.stringify(subData));

    // /usb_cam/image_rect_color
    subData = subscribeData("subscribe:/image", "/usb_cam/image_rect_color", "sensor_msgs/Image", "none", 0, 0);
    console.log("subscribe data sent: " + JSON.stringify(subData));
    ws.send(JSON.stringify(subData));

    // ADVERTISE ALL RELEVANT TOPICS
    // advertise the /jetmax/speed_command
    let advData = advertiseData("advertise:/moveTo", "/jetmax/speed_command", "jetmax/SetJetMax", false, 100);
    console.log("advertise data sent: " + JSON.stringify(advData));
    ws.send(JSON.stringify(advData));

    // advertise the /jetmax/relative_command
    advData = advertiseData("advertise:/move", "/jetmax/relative_command", "jetmax/SetJetMax", false, 100);
    console.log("advertise data sent: " + JSON.stringify(advData));
    ws.send(JSON.stringify(advData));

    // advertise the /jetmax/end_effector/sucker/command
    advData = advertiseData("advertise:/suction", "/jetmax/end_effector/sucker/command", "std_msgs/Bool", false, 100);
    console.log("advertise data sent: " + JSON.stringify(advData));
    ws.send(JSON.stringify(advData));

})

// handle a message event
ws.on('message', function message(data) {

    let dataJson = JSON.parse(data);
    //console.log(dataJson);

    // for now only the /jetmax/status message is expected to arrive
    if (dataJson.topic === '/jetmax/status') {
        // update local variable for jetmax robot arm state - used by the /basic/state endpoint
        jetmaxState = dataJson.msg;
    }
    else if (dataJson.topic === '/usb_cam/image_rect_color') {
        // TODO: check and save the image received
        // this should return an image as a 2D array --> CHECK
        //console.log(dataJson.msg);
    }
})

// handle an error event
ws.on('error', function error(error) {
    console.log("Error communication with the websocket server, reason: " + error);
})

// handle a close event
ws.on('close', function close(code) {
    console.log("Websocket server connection closed, the code: " + code);
})

// handle an unexpected_response event
ws.on('unexpected_response', function error(req, res) {
    console.log("Unexpected response from the websocket server: " + res);
})


// #### API ENDPOINTS ####

// default API endpoint, returns a message that the server is up and running
app.get('/', function (req, res) {

    console.log("Received a request to the endpoint /");
    res.send("JetMax Node.js server is up and running.");

});

// API endpoint that returns current jetmax state
// jetmax state is retrieved from jetmax ros system via websocket
// data included: msg data from the /jetmax/status response, includes x, y and z coordinates of the robot arm, states of all 3 servos and joints, state of 2 PWMs and the sucker etc.
app.get('/basic/state', function (req, res) {

    console.log("received a request to the endpoint /basic/state");
    res.send(JSON.stringify(jetmaxState));

});

// API endpoint that moves jetmax to a specific location (absolute)
app.get('/basic/moveTo', function (req, res) {

    console.log("received a request to the endpoint /basic/moveTo");

    if (!req.query.msg) {
        console.log("Error, missing msg parameter.");
        res.send("Error, missing msg parameter.");
    } else {
        // extract data from the request = location to move the robot arm to {{"x":-14,"y":-117,"z":100"}
        let msg = JSON.parse(req.query.msg);
        // add the duration parameter
        // msg.duration = 100; // this is the default value for absolute movements

        //send the publish message
        let pubData = publishData("publish:/moveTo", "/jetmax/speed_command", msg, false);
        console.log("publish data sent: " + JSON.stringify(pubData));
        ws.send(JSON.stringify(pubData))

        res.send("/basic/moveTo endpoint completed successfully");
    }

});

// API endpoint that moves jetmax from current location (relative)
app.get('/basic/move', function (req, res) {

    console.log("received a request to the endpoint /basic/move");

    if (!req.query.msg) {
        console.log("Error, missing msg parameter.");
        res.send("Error, missing msg parameter.");
    } else {
        // extract data from the request = relative movement of the robot arm to {{"x":-14,"y":-117,"z":100"}
        let msg = JSON.parse(req.query.msg);
        // add the duration parameter
        // msg.duration = 0.5; // this is the default value for relative movements

        // send the publish message
        let pubData = publishData("publish:/moveTo", "/jetmax/relative_command", msg, false);
        console.log("publish data sent: " + JSON.stringify(pubData));
        ws.send(JSON.stringify(pubData))

        res.send("/basic/suction endpoint completed successfully");
    }

});

// API endpoint that turns jetmax end effector suction on or off
app.get('/basic/suction', function (req, res) {

    console.log("received a request to the endpoint /basic/suction");

    if (!req.query.msg) {
        console.log("Error, missing msg parameter.");
        res.send("Error, missing msg parameter.");
    } else {
        // extract data from the request = relative movement of the robot arm to {{"x":-14,"y":-117,"z":100"}
        let msg = JSON.parse(req.query.msg);

        // send the publish message
        let pubData = publishData("publish:/suction", "/jetmax/end_effector/sucker/command", msg, false);
        console.log("publish data sent: " + JSON.stringify(pubData));
        ws.send(JSON.stringify(pubData))

        res.send("/basic/move endpoint completed successfully");
    }
});

// // websocket server path that can be called
// app.ws('/', function (ws, req) {
//
//     ws.on('message', function (msg) {
//         console.log(msg);
//     });
// });

// start the server
app.listen(config.nodejsPort, function () {

    console.log('JetMax Node.js server listening on port ' + config.nodejsPort + '!');
});

// ######### HELPER FUNCTIONS to build subscribe, advertise and publish message for JetMax ROS server

/* BUILD SUBSCRIBE MESSAGE
op: name of the operation = subscribe
id: id of the message
topic: topic to which it is subscribing
type: type of the topic to which it is subscribing
compression: optional, default: "none"
throttle_rate: optional, default: 0
queue_length: optional, default: 0
 */
function subscribeData(id, topic, type, compression, throttle_rate, queue_length) {

    let data = {};
    data.op = "subscribe";
    data.id = id;
    data.topic = topic;
    data.type = type;
    data.compression = compression;
    data.throttle_rate = throttle_rate;
    data.queue_length = queue_length;

    //console.log(data);
    return data;

}

/* BUILD ADVERTISE MESSAGE DATA
op: name of the operation = advertise
id: id of the message
topic: topic that it is advertising
type: type of the topic that it is advertising
latch: optional, default: false
queue_size: optional, default: 100
 */
function advertiseData(id, topic, type, latch, queue_size) {

    let data = {};
    data.op = "advertise";
    data.id = id;
    data.topic = topic;
    data.type = type;
    data.latch = latch;
    data.queue_size = queue_size;

    //console.log(data);
    return data;

}

/* BUILD PUBLISH MESSAGE DATA
op: name of the operation = publish
id: id of the message
topic: topic to which it is publishing
msg: data in JSON format, dependent on the topic
latch: optional, default: false
 */
function publishData(id, topic, msg, latch) {

    let data = {};
    data.op = "publish";
    data.id = id;
    data.topic = topic;
    data.msg = msg;
    data.latch = latch;

    // console.log(data);
    return data;

}

/* BUILD CALL SERVICE MESSAGE DATA
op: name of the operation = call_service
id: id of the message
service: name of the service that is called
args: optional, default: {}
 */
function callServiceData(id, service, type, args) {

    let data = {};
    data.op = "call_service";
    data.id = id;
    data.service = service;
    data.type = type;
    data.args = args;

    //console.log(data);
    return data;

}
