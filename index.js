var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var jsonfile = require('jsonfile');

var port = process.env.PORT || 8080;

var rooms = [];
var dungeonTimeouts = [];

// Initialize rooms
for (var i = 0; i < 10; i++) {
    rooms.push(false);
}

// Scan for dead connections every hour (3600000 milliseconds)
setInterval(function () {
    var j = 0;
    for (j = 0; j < rooms.length - 1; j++) {
        if (rooms[j]) {
            checkRoom(j)
        }
    }
}, 3600000);

function checkRoom(roomID) {
    jsonfile.readFile(getRoomFileName(roomID), function (err, data) {
        if (data.players.length > 0) {
            data.players.forEach(function (player) {
                if (io.sockets.sockets[player.socketID] == null) {
                    // Remove player from room
                    data.players.splice(data.players.indexOf(player), 1);
                    writeFile(roomID, data);

                    // If no players left in room, mark room as free
                    if (data.players.length == 0) {
                        rooms[roomID] = false;
                    }
                }
            })
        }
    });
}

// Server start
server.listen(port, function () {
    console.log("Server is now running on port " + port);
});

// Individual player connection
io.on('connection', function (socket) {
    var roomID = -1;
    var players = [];

    // Indicates Player connected to server
    console.log("Player Connected!");

    // Create a room
    socket.on('createRoom', function (data) {
        var roomNum;
        do {
            // If rooms all get occupied, generate 10 more rooms
            if (areAllRoomsOccupied()) {
                for (var i = 0; i < 10; i++) {
                    rooms.push(false);
                }
            }

            // Create random room number
            roomNum = getRandomIntExclusive(0, rooms.length - 1) + 1;
        } while (rooms[roomNum]);

        // Add socket id to player and then create room
        data.character.socketID = socket.id;

        // Persist player in room's json file
        writeFile(roomNum, {
            password: data.password,
            players: [data.character],
            ready: 0,
            inDungeon: false
        });

        // Mark room as occupied
        rooms[roomNum] = true;

        // Emit room id
        socket.emit('roomCreated', {roomID: roomNum});

        // Set socket instance variables
        roomID = roomNum;
        players.push(data.character);

        console.log("Someone created and joined room " + roomID);
    });

    // Join room
    socket.on('joinRoom', function (data) {
        // Add socket id to player
        data.character.socketID = socket.id;

        if (rooms[data.roomID]) {
            // Add player to room (event "joinedRoom" is emitted in joinRoom() call)
            jsonfile.readFile(getRoomFileName(data.roomID), function (err, roomData) {
                // If players in room are over max or in dungeon
                if (roomData.players.length >= 4 || roomData.inDungeon) {
                    socket.emit('failedJoinRoom');
                } else if (roomData.password == data.password) {
                    // Check password
                    roomData.players.push(data.character);
                    writeFile(data.roomID, roomData);

                    // Broadcast to other players in the room the updated players list
                    roomData.players.forEach(function (player) {
                        socket.broadcast.to(player.socketID).emit('joinedRoom', {
                            players: roomData.players,
                            roomID: data.roomID
                        });
                    });

                    // Update the current player because the original socket doesn't get called above
                    socket.emit('joinedRoom', {players: roomData.players, roomID: data.roomID});

                    // Set client instance variables
                    roomID = data.roomID;
                    players = roomData.players;
                } else {
                    // Wrong password
                    socket.emit('failedJoinRoom');
                }
            });
        } else {
            socket.emit("roomNull");
        }
    });

    // Other player joined room
    socket.on('joinedRoom', function () {
        // Basically just update client instance variables
        jsonfile.readFile(getRoomFileName(roomID), function (err, roomData) {
            players = roomData.players;
        });
    });

    // Ready event
    socket.on('clientReady', function (playerData, ack) {
        ack(true);
        // Go to room and change ready
        jsonfile.readFile(getRoomFileName(playerData.room), function (err, data) {
            if (data.players != null) {
                data.players.forEach(function (player) {
                    // If this is the player that readied, change the data
                    if (player.id == playerData.playerID) {
                        player.isReady = playerData.ready;
                    }
                    // Broadcast to room that someone readied
                    socket.broadcast.to(player.socketID).emit('readyChanged', playerData);
                });

                var readies = 0;
                data.players.forEach(function (player) {
                    if (player.isReady) {
                        readies++;
                    }
                });
                data.ready = readies;

                // After player readies have all been set, check to see if enough
                //  players are ready. If so, emit sendToDungeon to all players
                if (data.ready == data.players.length && data.players.length > 1) {
                    console.log("*** JOINING DUNGEON ***");

                    /*******************************************************************************/
                    /******************************Creating Random MID******************************/
                    var tier = 0;
                    var monsterID = 0;
                    data.players.forEach(function (player) {
                        if (player.stats.floor > tier)
                            tier = player.stats.floor;
                    });
                    tier = Math.ceil(tier / 5);

                    // choose random tier
                    if (tier != 5 && tier != 0)
                        tier = getRandomInt(1, tier);
                    if (tier > 5)
                        tier = 5;

                    switch (tier) {
                        case 0:
                            monsterID = 0;
                            break;
                        case 1:
                        case 2:
                        case 3:
                            monsterID = getRandomInt(0, 10);
                            break;
                        case 4:
                            monsterID = getRandomInt(0, 8);
                            break;
                        case 5:
                            monsterID = getRandomInt(0, 6);
                            break;
                        default:
                            monsterID = getRandomInt(0, 5);
                            break;
                    }


                    /*******************************************************************************/

                    data.players.forEach(function (player) {
                        if (playerData.playerID == player.id) {
                            socket.emit('startDungeonCountdown', {
                                monsterID: monsterID,
                                monsterTier: tier
                            });
                        } else {
                            socket.broadcast.to(player.socketID).emit('startDungeonCountdown', {
                                monsterID: monsterID,
                                monsterTier: tier
                            });
                        }
                    });
                    dungeonTimeouts[roomID] = setTimeout(dungeonCountdownTimeoutCall, 5000);
                }
                writeFile(roomID, data);
            }
        });
    });

    var dungeonCountdownTimeoutCall = function () {
        jsonfile.readFile(getRoomFileName(roomID), function (err, roomData) {
            roomData.inDungeon = true;
            roomData.players.forEach(function (player) {
                socket.broadcast.to(player.socketID).emit("enterDungeon");
                player.isReady = false;
            });
            roomData.ready = 0;
            socket.emit("enterDungeon");
            writeFile(roomID, roomData);
        });
    };

    socket.on('characterChanged', function (data) {
        jsonfile.readFile(getRoomFileName(roomID), function (err, roomData) {
            var charChanged;
            // Loop through characters and if id's match, update character
            for (var i = 0; i < roomData.players.length; i++) {
                if (roomData.players[i].id == data.character.id) {
                    // Add socket id to character
                    data.character.socketID = socket.id;
                    roomData.players[i] = charChanged = data.character;
                    break;
                }
            }
            writeFile(roomID, roomData);

            // Update client variables
            players = roomData.players;

            // Emit to all players in room that character updated
            players.forEach(function (player) {
                socket.broadcast.to(player.socketID).emit('updateCharacter', {character: charChanged});
            });
        });
    });

    socket.on('updateServerCharacters', function () {
        jsonfile.readFile(getRoomFileName(roomID), function (err, roomData) {
            players = roomData.players;
        });
    });

    // New Event
    socket.on('newEvent', function (data) {
        jsonfile.readFile(getRoomFileName(roomID), function (err, roomData) {
            // Loop through everyone and emit event
            players.forEach(function (player) {
                socket.broadcast.to(player.socketID).emit('newEvent', data);
            });
        });
    });

    socket.on('flee', function () {
        var tmpRoomID = roomID;
        roomID = -1;
        jsonfile.readFile(getRoomFileName(tmpRoomID), function (err, data) {
            var counter = 0;
            data.players.forEach(function (player) {
                if (player.socketID == socket.id) {
                    data.players.splice(counter, 1);
                } else {
                    counter++;
                }
            });
            data.players.forEach(function (player) {
                socket.broadcast.to(player.socketID).emit("syncServerCharacters");
            });
            // If no players left in room, set room from occupied to free
            if (data.players.length == 0) {
                rooms[tmpRoomID] = false;
            }
            console.log(data);
            writeFile(tmpRoomID, data);
        });
    });

    // Player disconnect event
    socket.on('disconnect', function () {
        if (roomID != -1) {
            jsonfile.readFile(getRoomFileName(roomID), function (err, data) {
                var counter = 0;
                var charThatLeft;

                data.players.forEach(function (player) {
                    if (player.socketID == socket.id) {
                        charThatLeft = player;
                        data.players.splice(counter, 1);
                    } else {
                        counter++;
                    }
                });

                // If no players left in room, set room from occupied to free
                if (data.players.length == 0) {
                    rooms[roomID] = false;
                }

                // Emit to all players in the room that someone left
                if (!data.inDungeon) {
                    if (dungeonTimeouts[roomID] != null && !dungeonTimeouts[roomID]._called) {
                        clearTimeout(dungeonTimeouts[roomID]);
                        // unready everyone
                        data.players.forEach(function (player) {
                            player.isReady = false;
                        });
                        data.ready = 0;
                    }
                    players.forEach(function (player) {
                        socket.broadcast.to(player.socketID).emit("playerLeftRoomInLobby", {character: charThatLeft});
                    });
                } else { // If disconnected in dungeon
                    var playa;
                    players.forEach(function (player) {
                        if (player.socketID == socket.id) {
                            playa = player;
                        }
                    });
                    players.forEach(function (player) {
                        socket.broadcast.to(player.socketID).emit("disconnectInDungeon", {player: playa});
                    });
                }
                writeFile(roomID, data);
            });
            console.log("Someone left room " + roomID);
            console.log("Player Disconnected");
        }
    });
});

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// [min, max)
function getRandomIntExclusive(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
}

function getRoomFileName(roomID) {
    return "./rooms/" + roomID.toString() + ".json";
}

function writeFile(roomID, data) {
    jsonfile.writeFile(getRoomFileName(roomID), data, function (err) {

    });
}

function areAllRoomsOccupied() {
    for (var i = 0; i < rooms.length; i++) {
        if (!rooms[i]) {
            return false;
        }
    }
    return true;
}

// Method for debugging
function print(title, text) {
    console.log("--------------" + title + "--------------");
    console.log(text);
}

function createRandomMonsterID(roomID) {
    var tier = 0;
    jsonfile.readFile(getRoomFileName(roomID), function (err, data) {
        data.players.forEach(function (player) {
            if (player.stats.floor > tier)
                tier = player.stats.foor;
        });
        switch (tier) {
            case 0:
                return 0;
                break;
            case 1:
                return getRandomInt(0, 10);
                break;
            case 2:
                return getRandomInt(0, 10);
                break;
            case 3:
                return getRandomInt(0, 10);
                break;
            case 4:
                return getRandomInt(0, 8);
                break;
            case 5:
                return getRandomInt(0, 6);
                break;
            default:
                return getRandomInt(0, 5);
                break;
        }
    });
}