var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var jsonfile = require('jsonfile');
var rooms = [0, 0, 0, 0, 0];

// Key: socket id's, Value: room #
var sockets = {}

// Server start
server.listen(8080, function() {
	console.log("Server is now running...");
});

// Individual player connection
io.on('connection', function(socket) {
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
		console.log(sockets);

		console.log("Room created: " + roomNum.toString());
	});

	// Join room
	socket.on('joinRoom', function(data) {
		// Add socket id to player
		data.character.socketID = socket.id;

		// Add player to room (event "joinedRoom" is emitted in joinRoom() call)
		if (joinRoom(data.roomID, data.password, data.character, socket)) {
			// Add socket id to list of clients
			sockets[socket.id] = roomNum;
			console.log(sockets);

			console.log("Someone joined room " + data.roomID.toString());
		}
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
			console.log("Players readied: " + data.ready);
			console.log("Checking to join dungeon...");
			console.log("Players ready * 2 = " + (data.ready * 2));
			console.log("Total players: " + data.players.length);
			if (data.ready * 2 >= data.players.length) {
				console.log("*** JOINING DUNGEON ***");
				data.players.forEach(function(player) {
					if (playerData.playerID == player.id) {
						console.log("Emitting to OP");
						socket.emit('sendToDungeon');
					} else {
						console.log("Emitting to room member");
						socket.broadcast.to(player.socketID).emit('sendToDungeon');
					}
				});
			}
			writeFile(roomNum, data);
			console.log("Data Ready : " + data.ready);
		});
	});

	// Leave room
	socket.on('leaveRoom', function(data) {
		console.log('Player ' + data.id.toString() + ' left room ' + data.roomID.toString());
		leaveRoom(data.id, data.roomID);
		delete sockets[socket.id];
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
		console.log("Players currently in room " + roomNum.toString() + ": ");
		console.log(playerData.id.toString());
	});
}

function joinRoom(roomNum, password, playerData, socket) {
	jsonfile.readFile(getRoomFileName(roomNum), function(err, data) {
		// If players in room are over max
		console.log(data.players.length + "players in room");
		if (data.players.length >= 4) {
			socket.emit('failedJoinRoom');
			return false;
		}

		// Check password
		else if (data.password == password) {
			data.players.push(playerData);
			writeFile(roomNum, data);

			// Broadcast to other players in the room the updated players list
			console.log("Players currently in room " + roomNum.toString() + ": ");
			data.players.forEach(function(player) {
				socket.broadcast.to(player.socketID).emit('joinedRoom', { players: data.players, roomID: roomNum });
				console.log(player.id);
			});

			// Update the current player because the original socket doesn't get called above
			socket.emit('joinedRoom', { players: data.players, roomID: roomNum });
			return true;
		}
		
		socket.emit('failedJoinRoom');
		return false;
	});
}

function getRoomFileName(roomID){
	var roomName = "./rooms/" + roomID.toString() + ".json";
	return roomName;
}

function writeFile(roomID, data) {
	jsonfile.writeFile(getRoomFileName(roomID), data, function(err) {});
}
