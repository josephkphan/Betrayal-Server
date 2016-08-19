var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);

var port = process.env.PORT || 8080;

var maxRooms = 10;
var roomLength = 0;
var rooms = {};
var dungeonTimeouts = {};

// Initialize rooms
for (var i = 0; i < maxRooms; i++) {
    rooms[i] = false;
}
roomLength = maxRooms;

setInterval(function () {
    console.log(rooms);
}, 1000);

// Scan for dead connections every hour (3600000 milliseconds)
setInterval(function () {
    var j = 0;
    for (j = 0; j < rooms.length - 1; j++) {
        if (rooms[j]) {
            checkRoom(j);
        }
    }
}, 10000);

function checkRoom(roomID) {
    if (rooms[roomID].players.length > 0) {
        rooms[roomID].players.forEach(function (player) {
            if (io.sockets.sockets[player.socketID] == null) {
                // Remove player from room
                rooms[roomID].players.splice(rooms[roomID].players.indexOf(player), 1);

                // If no players left in room, mark room as free
                if (rooms[roomID].players.length == 0) {
                    rooms[roomID] = false;
                }
            }
        })
    }
}

// Server start
server.listen(port, function () {
    console.log("Server is now running on port " + port);
});

// Individual player connection
io.on('connection', function (socket) {
    var roomID = -1;

    // Indicates Player connected to server
    console.log("Player Connected!");

    // Create a room
    socket.on('createRoom', function (data) {
        var roomNum;
        do {
            if (areAllRoomsOccupied()) {
                for (var i = length; i < length + maxRooms; i++) {
                    rooms[i] = false;
                }
            }

            // Create random room number
            roomNum = getRandomIntExclusive(0, roomLength - 1) + 1;
            console.log(roomNum);
        } while (rooms[roomNum]);

        // Add socket id to player and then create room
        data.character.socketID = socket.id;

        // Persist player in room's json file
        rooms[roomNum] = {
            password: data.password,
            players: [data.character],
            ready: 0,
            inDungeon: false,
            enteringDungeon: false
        };

        // Emit room id
        socket.emit('roomCreated', {roomID: roomNum});

        // Set socket instance variables
        roomID = roomNum;

        console.log("Someone created and joined room " + roomID);
    });

    // Join room
    socket.on('joinRoom', function (data) {
        // Add socket id to player
        data.character.socketID = socket.id;

        if (rooms[data.roomID]) {
            // Add player to room (event "joinedRoom" is emitted in joinRoom() call)
            // If players in room are over max or in dungeon
            if (rooms[data.roomID].players.length >= 4 || rooms[data.roomID].inDungeon) {
                socket.emit('failedJoinRoom');
            } else if (rooms[data.roomID].password == data.password) {
                // Check password
                rooms[data.roomID].players.push(data.character);

                // Broadcast to other players in the room the updated players list
                rooms[data.roomID].players.forEach(function (player) {
                    socket.broadcast.to(player.socketID).emit('joinedRoom', {
                        players: rooms[data.roomID].players,
                        roomID: data.roomID
                    });
                });

                // Update the current player because the original socket doesn't get called above
                socket.emit('joinedRoom', {
                    players: rooms[data.roomID].players,
                    roomID: data.roomID
                });

                // Set client instance variables
                roomID = data.roomID;
            } else {
                // Wrong password
                socket.emit('failedJoinRoom');
            }
        } else {
            socket.emit("roomNull");
        }
    });

    // Other player joined room
    socket.on('joinedRoom', function () {
        // Basically just update client instance variables
        players = rooms[roomID].players;
    });

    // Ready event
    socket.on('clientReady', function (playerData, ack) {
        ack(true);
        // Go to room and change ready
        if (rooms[roomID].players != null) {
            rooms[roomID].players.forEach(function (player) {
                // If this is the player that readied, change the data
                if (player.id == playerData.playerID) {
                    player.isReady = playerData.ready;
                }
                // Broadcast to room that someone readied
                socket.broadcast.to(player.socketID).emit('readyChanged', playerData);
            });

            var readies = 0;
            rooms[roomID].players.forEach(function (player) {
                if (player.isReady) {
                    readies++;
                }
            });
            rooms[roomID].ready = readies;

            // After player readies have all been set, check to see if enough
            //  players are ready. If so, emit sendToDungeon to all players
            if (rooms[roomID].ready == rooms[roomID].players.length && rooms[roomID].players.length > 1) {
                console.log("*** JOINING DUNGEON ***");
                rooms[roomID].enteringDungeon = true;

                /*******************************************************************************/
                /******************************Creating Random MID******************************/
                var tier = 0;
                var monsterID = 0;
                rooms[roomID].players.forEach(function (player) {
                    if (player.stats.floor > tier)
                        tier = player.stats.floor;
                });
                tier = Math.ceil(tier / 5);

                // choose random tier
                if (tier != 5 && tier != 0 && tier != 1) {
                    var chance = getRandomInt(1, 100);
                    if (chance <= 25) {
                        tier--;
                    }
                }
                if (tier > 5)
                    tier = 5;

                switch (tier) {
                    case 0:
                        monsterID = 0;
                        break;
                    case 1:
                        monsterID = getRandomInt(0, 9);
                        break;
                    case 2:
                        monsterID = getRandomInt(0, 9);
                        break;
                    case 3:
                        //monsterID = 8;
                        monsterID = getRandomInt(0, 9);
                        break;
                    case 4:
                        monsterID = getRandomInt(0, 7);
                        break;
                    case 5:
                        monsterID = getRandomInt(0, 5);
                        break;
                    default:
                        monsterID = getRandomInt(0, 5);
                        break;
                }


                /*******************************************************************************/

                rooms[roomID].players.forEach(function (player) {
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
            } else if (rooms[roomID].enteringDungeon) {
                cancelDungeonCountdown(roomID, false);
                rooms[roomID].players.forEach(function (player) {
                    socket.broadcast.to(player.socketID).emit("stopDungeonCountdown");
                });
                socket.emit("stopDungeonCountdown");
                rooms[roomID].enteringDungeon = false;
            }
        }
    });

    var dungeonCountdownTimeoutCall = function () {
        rooms[roomID].inDungeon = true;
        rooms[roomID].players.forEach(function (player) {
            socket.broadcast.to(player.socketID).emit("enterDungeon");
            player.isReady = false;
        });
        rooms[roomID].ready = 0;
        socket.emit("enterDungeon");
    };

    socket.on('characterChanged', function (data) {
        var charChanged;
        // Loop through characters and if id's match, update character
        for (var i = 0; i < rooms[roomID].players.length; i++) {
            if (rooms[roomID].players[i].id == data.character.id) {
                // Add socket id to character
                data.character.socketID = socket.id;
                rooms[roomID].players[i] = charChanged = data.character;
                break;
            }
        }

        // Emit to all players in room that character updated
        rooms[roomID].players.forEach(function (player) {
            socket.broadcast.to(player.socketID).emit('updateCharacter', {character: charChanged});
        });
    });

    // New Event
    socket.on('newEvent', function (data) {
        // Loop through everyone and emit event
        rooms[roomID].players.forEach(function (player) {
            socket.broadcast.to(player.socketID).emit('newEvent', data);
        });
    });

    socket.on('dungeonEnded', function () {
        rooms[roomID].inDungeon = false;
    });

    socket.on('flee', function () {
        var tmpRoomID = roomID;
        roomID = -1;
        var counter = 0;
        var charRemoved;
        rooms[tmpRoomID].players.forEach(function (player) {
            if (player.socketID == socket.id) {
                charRemoved = player;
                rooms[tmpRoomID].players.splice(counter, 1);
            } else {
                counter++;
            }
        });
        // If no players left in room, set room from occupied to free
        if (rooms[tmpRoomID].players.length == 0) {
            rooms[tmpRoomID] = false;
        }
        rooms[tmpRoomID].players.forEach(function (player) {
            socket.broadcast.to(player.socketID).emit("removeCharacter", {player: charRemoved});
        });
        console.log(rooms[tmpRoomID]);
    });

    // Player disconnect event
    socket.on('disconnect', function () {
        if (roomID != -1) {
            var counter = 0;
            var charThatLeft;

            // Remove player first, store removed player in charThatLeft
            rooms[roomID].players.forEach(function (player) {
                if (player.socketID == socket.id) {
                    charThatLeft = player;
                    rooms[roomID].players.splice(counter, 1);
                } else {
                    counter++;
                }
            });

            // If no players left in room, set room from occupied to free
            if (rooms[roomID].players.length == 0) {
                rooms[roomID] = false;
            } else {
                // Emit to all players in the room that someone left
                if (!rooms[roomID].inDungeon) {
                    cancelDungeonCountdown(roomID, true);
                    rooms[roomID].players.forEach(function (player) {
                        socket.broadcast.to(player.socketID).emit("playerLeftRoomInLobby", {character: charThatLeft});
                    });
                } else { // If disconnected in dungeon
                    rooms[roomID].players.forEach(function (player) {
                        socket.broadcast.to(player.socketID).emit("disconnectInDungeon", {player: charThatLeft});
                    });
                }
            }
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

function areAllRoomsOccupied() {
    for (var key in rooms) {
        if (rooms.hasOwnProperty(key)) {
            if (!rooms[i]) {
                return false;
            }
        }
    }
    return true;
}

function cancelDungeonCountdown(roomID, unreadyAll) {
    if (dungeonTimeouts[roomID] != null && !dungeonTimeouts[roomID]._called) {
        clearTimeout(dungeonTimeouts[roomID]);
        // unready everyone
        if (unreadyAll) {
            rooms[roomID].players.forEach(function (player) {
                player.isReady = false;
            });
            rooms[roomID].ready = 0;
        }
    }
}

// Method for debugging
function print(title, text) {
    console.log("--------------" + title + "--------------");
    console.log(text);
}
