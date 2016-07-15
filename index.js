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
		joinRoom(data.roomID, data.password, data.character, socket);

		// Add socket id to list of clients
		sockets[socket.id] = roomNum;
		console.log(sockets);

		console.log("Someone joined room " + data.roomID.toString());
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
	var data = { password: null, players: [] };
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
		if (data.password == password) {
			data.players.push(playerData);
			writeFile(roomNum, data);

			// Broadcast to other players in the room the updated players list
			console.log("Players currently in room " + roomNum.toString() + ": ");
			data.players.forEach(function(player) {
				socket.broadcast.to(player.socketID).emit('joinedRoom', data.players);
				console.log(player.id);
			});

			// Update the current player because the original socket doesn't get called above
			socket.emit('joinedRoom', data.players);
		}
	});
}

function getRoomFileName(roomID){
	var roomName = "./rooms/" + roomID.toString() + ".json";
	return roomName;
}

function writeFile(roomID, data) {
	jsonfile.writeFile(getRoomFileName(roomID), data, function(err) {});
}
