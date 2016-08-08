var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var jsonfile = require('jsonfile');
var rooms = [];

// Initialize rooms
for (var i = 0; i < 10; i++) {
    rooms.push(false);
}

// Server start
server.listen(8080, function () {
    console.log("Server is now running...");
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
            roomNum = getRandomInt(0, rooms.length - 1) + 1;
        } while (rooms[roomNum]);

        // Add socket id to player and then create room
        data.character.socketID = socket.id;

        // Persist player in room's json file
        writeFile(roomNum, { password: data.password, players: [data.character], ready: 0 });

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
                // If players in room are over max
                if (roomData.players.length >= 4) {
                    socket.emit('failedJoinRoom');
                    print("joinRoom", "length >= 4");
                } else if (roomData.password == data.password) {
                    print("PASSWORD CHECK", "roomData.password = " + roomData.password + ", data.password = " + data.password);
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
                    print("joinRoom", "wrong password");
                }
            });
        } else {
            socket.emit("roomNull");
        }
    });

    // Ready event
    socket.on('clientReady', function (playerData, ack) {
        ack(true);
        // Go to room and change ready
        jsonfile.readFile(getRoomFileName(playerData.room), function (err, data) {
            console.log("----------------------------------");
            data.players.forEach(function (player) {
                // If this is the player that readied, change the data
                if (player.id == playerData.playerID) {
                    player.isReady = playerData.ready;
                    if (player.isReady) {
                        data.ready = data.ready + 1;
                    } else {
                        data.ready = data.ready - 1;
                    }
                }
                // Broadcast to room that someone readied
                socket.broadcast.to(player.socketID).emit('readyChanged', playerData);
            });

            // After player readies have all been set, check to see if enough
            //  players are ready. If so, emit sendToDungeon to all players
            if (data.ready == data.players.length) {
                console.log("*** JOINING DUNGEON ***");
                data.players.forEach(function (player) {
                    if (playerData.playerID == player.id) {
                        socket.emit('startDungeonCountdown');
                    } else {
                        socket.broadcast.to(player.socketID).emit('startDungeonCountdown');
                    }
                });
                setTimeout(function () {
                    data.players.forEach(function (player) {
                        if (playerData.playerID == player.id) {
                            socket.emit('enterDungeon');
                        } else {
                            socket.broadcast.to(player.socketID).emit('enterDungeon');
                        }
                    });
                }, 5000);
            }
            writeFile(roomID, data);
        });
    });

    // New Event
    socket.on('newEvent', function (data) {
        console.log("--------------------");
        console.log("newEvent: ");
        console.log(data);
        jsonfile.readFile(getRoomFileName(roomID), function (err, roomData) {
            // Loop through everyone and emit event
            roomData.players.forEach(function (player) {
                socket.broadcast.to(player.socketID).emit('newEvent', data);
            });
        });
    });

    // Player disconnect event
    socket.on('disconnect', function () {
        if (roomID != -1) {
            jsonfile.readFile(getRoomFileName(roomID), function (err, data) {
                var counter = 0;

                data.players.forEach(function (player) {
                    if (player.socketID == socket.id) {
                        data.players.splice(counter, 1);
                    } else {
                        counter++;
                    }
                });
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

function print(title, text) {
    console.log("--------------" + title + "--------------");
    console.log(text);
}