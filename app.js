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
    if (err.code === 'ConditionalCheckFailedException') {
        res.status(409);
        res.send({"Error": "Player is already registered"});
        return;
    }
    res.status(500);
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

function transformState(gameState, index, xturn) {
    const toInsert = xturn ? 'X' : 'O';
    const prefix = gameState.substr(0, index) + toInsert;
    const complete = prefix + gameState.substr(index + toInsert.length);
    return complete;
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

    const GAMES = "Games";

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

    app.post('/game', function(req, res) {
        if (process.env.TEST) {
            console.log('/newgame request body:');
            console.log(req.body);
        }
        const player = req.body.player;
        if (!player) {
            res.status(400);
            res.send({Error : "Player name was not provided!"});
            return;
        }
        const item  = {
            'player'   : { 'S': player },
            'started'  : { 'BOOL' : false },
            'gameState': { 'S':'---------'},
            'xturn'    : { 'BOOL' : true}
        }
        ddb.putItem({
            'TableName': GAMES,
            'Item': item,
            'Expected': { "player": { Exists: false } }
        } , callbackHandler.bind(null, res, 201));
    });

    app.delete('/game', function(req, res) {
        if (process.env.TEST) {
            console.log('/deletegame request body:')
            console.log(req.body);
        }
        const params = {
            TableName: GAMES,
            Key: {'player': { 'S' : req.body.player } },
            ReturnValues: 'ALL_OLD'
        };
        ddb.deleteItem(params, function(err, data) {
            if (process.env.TEST) {
                console.log(err);
                console.log(data);
            }
            if (err) {
                res.status(400).end();
                return;
            }
            res.status(200);
            const payload = data.Attributes ? {Deleted : data.Attributes.player.S} : {};
            res.send(payload);
        });
    });

    app.get('/games', function(req, res) {
        if (process.env.TEST) console.log('/games');
        var params = {
            ProjectionExpression: "player, started, gameState, xturn",
            TableName: GAMES
        };
        if (!req.query.all) {
            params.FilterExpression = "started = :strt";
            params.ExpressionAttributeValues = {":strt": {"BOOL": false } };
        }
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

    app.get('/gamestate', function(req, res) {
        if (process.env.TEST) {
            console.log('/gamesstate');
            console.log(req.query);
        }
        var params = {
            TableName: GAMES,
            Key: {"player" : {"S": req.query.player} },
            ProjectionExpression: "gameState"
        };
        ddb.getItem(params, function(err, data) {
            if (process.env.TEST) {
                console.log(err);
                console.log(data);
            }
            if (err) {
                res.status(400).end();
                return;
            }
            if (data.Item) {
                res.status(200);
                res.send(data.Item.gameState.S);
            }
            else {
                res.status(204).end();
            }
        });
    });

    app.post('/move', function(req, res) {
        if (process.env.TEST) {
            console.log('/move');
            console.log(req.body);
        }
        if (req.body.player === undefined || req.body.xturn === undefined || req.body.coord === undefined) {
            res.status(400);
            res.send({"Error": "player, coord and xturn need to be specified"});
            return;
        }
        if (!(req.body.xturn === 'true' || req.body.xturn === 'false')) {
            res.status(400);
            res.send({"Error": `xturn can either be string "true" value or "false" value but is ${req.body.xturn}`});
            return;
        }
        const xturnBool = req.body.xturn === 'true';
        const params = {
            TableName: GAMES,
            Key: {"player" : {"S": req.body.player} },
        };
        ddb.getItem(params, function(err, data) {
            if (process.env.TEST) {
                console.log(err);
                console.log(data);
            }
            if (err) {
                res.status(400).end();
                return;
            }
            if (data.Item) {
                if (data.Item.xturn.BOOL == xturnBool) {
                    const updatedState = transformState(data.Item.gameState.S, parseInt(req.body.coord), xturnBool);
                    data.Item.gameState.S = updatedState;
                    data.Item.xturn.BOOL = !data.Item.xturn.BOOL;
                    const params2 = {
                        TableName: GAMES,
                        Item : data.Item
                    };
                    if (process.env.TEST) {
                        console.log(params2);
                    }
                    ddb.putItem(params2, function(err, data) {
                        if (err) {
                            console.log(err);
                            res.status(500).end();
                            return;
                        }
                        res.status(200);
                        if (process.env.TEST) {
                            console.log(data);
                        }
                        res.send(data);
                    });
                }
                else {
                    res.status(400);
                    res.send({"Error": "Wrong turn"});
                    return;
                }
            }
            else {
                res.status(204).end();
            }
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