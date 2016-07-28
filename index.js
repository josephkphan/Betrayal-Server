var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var jsonfile = require('jsonfile');
var rooms = [0, 0, 0, 0, 0];

// Key: socket id's, Value: room #
var sockets = {};

// Server start
server.listen(8080, function() {
	console.log("Server is now running...");
});

// Individual player connection
io.on('connection', function(socket) {
	var roomID = -1;

	// Indicates Player connected to server
	console.log("Player Connected!");

	// Create a room
	socket.on('createRoom', function(data) {
		// Add player to room
		var roomNum = findAvailableRoom();

		// Add socket id to player and then create room
		data.character.socketID = socket.id;
		createRoom(roomNum, data.password, data.character);

		// Emit room id
		socket.emit('roomCreated', { roomID: roomNum });

		// Add socket id to list of clients
		sockets[socket.id] = roomNum;

		roomID = roomNum;
	});

	// Join room
	socket.on('joinRoom', function(data) {
		// Add socket id to player
		data.character.socketID = socket.id;

		// Add player to room (event "joinedRoom" is emitted in joinRoom() call)
		jsonfile.readFile(getRoomFileName(data.roomID), function(err, roomData) {
			// If players in room are over max
			if (roomData.players.length >= 4) {
				socket.emit('failedJoinRoom');
				return;
			}

			// Check password
			else if (roomData.password == data.password) {
				roomData.players.push(data.character);
				writeFile(data.roomID, roomData);

				// Broadcast to other players in the room the updated players list
				roomData.players.forEach(function(player) {
					socket.broadcast.to(player.socketID).emit('joinedRoom', { players: roomData.players, roomID: data.roomID });
				});

				// Update the current player because the original socket doesn't get called above
				socket.emit('joinedRoom', { players: roomData.players, roomID: data.roomID });
				sockets[socket.id] = data.roomID;
				roomID = data.roomID;
				return;
			}

			socket.emit('failedJoinRoom');
			console.log("PART 3");
		});
	});

	// Ready event
	socket.on('clientReady', function(playerData, ack) {
		ack(true);
		// Go to room and change ready
		jsonfile.readFile(getRoomFileName(playerData.room), function(err, data) {
			console.log("----------------------------------");
			data.players.forEach(function(player) {
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
			if (data.ready * 2 >= data.players.length) {
				console.log("*** JOINING DUNGEON ***");
				data.players.forEach(function(player) {
					if (playerData.playerID == player.id) {
						socket.emit('sendToDungeon');
					} else {
						socket.broadcast.to(player.socketID).emit('sendToDungeon');
					}
				});
			}
			writeFile(roomNum, data);
		});
	});

	// Leave room
	socket.on('leaveRoom', function(data) {
		console.log('Player ' + data.id.toString() + ' left room ' + data.roomID.toString());
		leaveRoom(data.id, data.roomID);
		delete sockets[socket.id];
	});

	// New Event
	socket.on('newEvent', function(data) {
		console.log("newEvent");
		console.log(data.eventType);
		jsonfile.readFile(getRoomFileName(roomID), function(err, roomData) {
			// Loop through everyone and emit event
			roomData.players.forEach(function(player) {
				socket.broadcast.to(player.socketID).emit('newEvent', data);
			});
		});
	});

	// Player disconnect event
	socket.on('disconnect', function() {
		leaveRoomBySocket(socket.id);
		console.log("Player Disconnected")
	});
});

function findAvailableRoom() {
	// var roomNum;
	// do {
	// 	// Create random room number
	// 	//roomNum = getRandomInt(0, rooms.length - 1);
	// 	roomNum = 0;
	// } while (rooms[roomNum] == 1)
	roomNum = 0;

	// Set room to 1
	//rooms[roomNum] = 1;

	// Initialize room
	var data = { password: "", ready: 0, players: [] };
	writeFile(roomNum, data);

	return roomNum;
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Leave room with socketID, sudden disconnect
function leaveRoomBySocket(socketID) {
	jsonfile.readFile(getRoomFileName(sockets[socketID]), function(err, data) {
		var counter = 0;

		data.players.forEach(function(player) {
			if (player.socketID == socketID) {
				data.players.splice(counter, 1);
			} else {
				counter++;
			}
		});
		writeFile(roomNum, data);
	});
}

// Leave room with playerID, formal leaving
function leaveRoom(playerID, roomNum) {
	jsonfile.readFile(getRoomFileName(roomNum), function(err, data) {
		var counter = 0;

		data.players.forEach(function(player) {
			console.log('player.id: ' + player.id + ", playerID: " + playerID);
			if (player.id == playerID) {
				data.players.splice(counter, 1);
			} else {
				counter++;
			}
		});
		writeFile(roomNum, data);
	});
}

function createRoom(roomNum, password, playerData, socket) {
	jsonfile.readFile(getRoomFileName(roomNum), function(err, data) {
		data.password = password;
		data.players.push(playerData);
		writeFile(roomNum, data);
	});
}

function joinRoom(roomNum, password, playerData, socket, roomID) {
	jsonfile.readFile(getRoomFileName(roomNum), function(err, data) {
		// If players in room are over max
		console.log(data.players.length + "players in room");
		if (data.players.length >= 4) {
			socket.emit('failedJoinRoom');
			console.log("PART 1");
			return;
		}

		// Check password
		else if (data.password == password) {
			data.players.push(playerData);
			writeFile(roomNum, data);

			// Broadcast to other players in the room the updated players list
			data.players.forEach(function(player) {
				socket.broadcast.to(player.socketID).emit('joinedRoom', { players: data.players, roomID: roomNum });
			});

			// Update the current player because the original socket doesn't get called above
			socket.emit('joinedRoom', { players: data.players, roomID: roomNum });
			console.log("PART 2");
			sockets[socket.id] = data.roomID;
			roomID[0] = data.roomID;
			return;
		}
		
		socket.emit('failedJoinRoom');
		console.log("PART 3");
		return;
	});
}

function getRoomFileName(roomID){
	return "./rooms/" + roomID.toString() + ".json";
}

function writeFile(roomID, data) {
	jsonfile.writeFile(getRoomFileName(roomID), data, function(err) {});
}
