// Include the cluster module
var cluster = require('cluster');
const assert = require('assert');

function callbackHandler(res, err, data) {
    if (!err) {
        res.status(201).end();
        console.log('DDB written');
    }
    const returnStatus = (err.code === 'ConditionalCheckFailedException') ? 409 : 500;
    res.status(returnStatus).end();
    if (data) {
        res.send(data);
        console.log('data:');
        console.log(data);
    }
    console.log('DDB Error: ' + err);
    console.log('stach' + err.stack);
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

    AWS.config.region = process.env.REGION
    const PLAYER_TABLE = "PlayerTable";

    var ddbTable =  process.env.STARTUP_SIGNUP_TABLE;
    var app = express();

    let ddb;
    if (process.env.TEST) {
        const ep = new AWS.Endpoint('localhost');
        ep.port = 8000;
        ddb = new AWS.DynamoDB({endpoint: ep});
        // note the shallow equality check
        assert.equal(ddb.service.endpoint.hostname, 'awsproxy.example.com');
        assert.equal(ddb.service.endpoint.port, 8000);
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
        const item  = {
            'player' : { 'S': res.body.player }
        }
        ddb.putItem({'TableName': PLAYER_TABLE,
                     'Item': item,
                     'Expected': { player: { Exists: false } } }
                     , callbackHandler.bind(null, res));
    });

    app.get('/games', function(req, res) {
        var params = {
            ExpressionAttributeNames: {
             "PLAYER": "player"
            },
            ProjectionExpression: "#PLAYER", 
            TableName: PLAYER_TABLE
           };
        dynamodb.scan(params, callbackHandler.bind(null, res));
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
        }, callbackHandler.bind(null, res));            
    });

    var port = process.env.PORT || 3000;

    var server = app.listen(port, function () {
        console.log('Server running at http://127.0.0.1:' + port + '/');
    });
}