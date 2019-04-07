// Include the cluster module
var cluster = require('cluster');
const assert = require('assert');

function callbackHandler(res, successCode, err, data) {
    if (process.env.TEST) {
        console.log(err);
        console.log(data);
    }
    if (!err) {
        res.status(successCode).end();
        return;
    }
    const returnStatus = (err.code === 'ConditionalCheckFailedException') ? 409 : 500;
    res.status(returnStatus);
    if (data) {
        res.send(data);
        console.log('data:');
        console.log(data);
    }
    else {
        res.end();
    }
    console.log('DDB Error: ' + err);
    console.log('stack' + err.stack);
}

// Code to run if we're in the master process
if (cluster.isMaster) {

    // Count the machine's CPUs
    var cpuCount = require('os').cpus().length;

    // Create a worker for each CPU
    for (var i = 0; i < cpuCount; i += 1) {
        cluster.fork();
    }

    // Listen for terminating workers
    cluster.on('exit', function (worker) {

        // Replace the terminated workers
        console.log('Worker ' + worker.id + ' died :(');
        cluster.fork();

    });

// Code to run if we're in a worker process
} else {
    var AWS = require('aws-sdk');
    var express = require('express');
    var bodyParser = require('body-parser');
    var path = require('path');

    const PLAYER_TABLE = "Players";

    AWS.config.region = process.env.REGION || 'eu-west-2';

    console.log(AWS.config.region);
    var ddbTable =  process.env.STARTUP_SIGNUP_TABLE;
    var app = express();

    let ddb;
    if (process.env.TEST) {
        ddb = new AWS.DynamoDB({ endpoint: new AWS.Endpoint('http://localhost:8000') });
        ddb.listTables(function (err, data) { console.log('listTables',err,data); });
        // note the shallow equality check
        assert.equal(ddb.endpoint.hostname, 'localhost');
        assert.equal(ddb.endpoint.port, 8000);
        app.use('/static', express.static(path.join(__dirname, 'static')));
        app.use('/views', express.static(path.join(__dirname, 'views')));
    }
    else {
        ddb = new AWS.DynamoDB();
    }

    app.set('view engine', 'ejs');
    if (! process.env.TEST) {
        app.set('views', __dirname + '/views');
    }
    app.use(bodyParser.urlencoded({extended:false}));

    app.get('/', function(req, res) {
        res.render('index', {
            static_path: 'static',
            theme: process.env.THEME || 'flatly',
            flask_debug: process.env.FLASK_DEBUG || 'false'
        });
    });

    app.post('/newgame', function(req, res) {
        if (process.env.TEST) {
            console.log('/newgame request body:');
            console.log(req.body);
            console.log('/newgame request data:');
            console.log(req.data);
        }
        const player = req.body.player;
        if (!player) {
            res.status(400)
            res.send({Error : "Player name was not provided!"})
            return;
        }
        const item  = {
            'player' : { 'S': player }
        }
        ddb.putItem({
            'TableName': PLAYER_TABLE,
            'Item': item//,
            //'Expected': { "player": { Exists: false } }
        } , callbackHandler.bind(null, res, 201));
    });

    app.get('/games', function(req, res) {
        if (process.env.TEST) console.log('/games');
        var params = {
            ProjectionExpression: "player",
            TableName: PLAYER_TABLE
           };
        ddb.scan(params, function(err, data) {
            if (process.env.TEST) {
                console.log(err);
                console.log(data);
            }
            if (err) {
                res.status(400).end();
                return;
            }
            res.send(data.Items);
        });
    });

    app.post('/signup', function(req, res) {
        var item = {
            'email': {'S': req.body.email},
            'name': {'S': req.body.name},
            'preview': {'S': req.body.previewAccess},
            'theme': {'S': req.body.theme}
        };
        ddb.putItem({
            'TableName': ddbTable,
            'Item': item,
            'Expected': { email: { Exists: false } }
        }, callbackHandler.bind(null, res, 201));
    });

    var port = process.env.PORT || 3000;

    var server = app.listen(port, function () {
        console.log('Server running at http://127.0.0.1:' + port + '/');
    });
}