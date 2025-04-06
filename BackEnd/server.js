const express = require("express");
const { Server } = require("socket.io");

const app = express();

const server = app.listen(8000, () => {
    console.log(`Server running on port 8000`);
});

app.get("/", (req, response) => {
    response.send("api is working fine")
})

const io = new Server(server, {
    cors: {
        origin: ["http://localhost:5173", "https://manitv.vercel.app", "https://manitv.live", "https://nittv.vercel.app", "https://nittv.live", "https://nittvtest.vercel.app"],
        methods: ["GET", "POST"],
    },
});

let availableUsers = new Set();
const matchedUsers = new Set();


// Store active rooms (key: roomId, value: array of user socket IDs)
const rooms = new Map();

let activeUsers = 0;

io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);
    activeUsers++;
    socket.on("start", () => {
        availableUsers.add(socket.id);
        matchUsers(socket);
    });

    setInterval(() => {
        const numberOfUsers = availableUsers.size + 2 * rooms.size;
        console.log("Rooms :: " , rooms);
        console.log("Availabe users set :: ", availableUsers);
        io.emit("active-users", numberOfUsers);
    }, 10000);


    // when a user clicks "Next", find a new match
    socket.on("next", ({ roomId: currentRoomId, otherUserID }) => {
        leaveRoom(socket, currentRoomId);
        matchUsers(socket);
        io.to(otherUserID).emit("clear-Messages");

    });

    // When a user clicks "Stop", remove them from their room and the available pool
    socket.on("stop", ({ roomId, otherUserID }) => {
        leaveRoom(socket, roomId);
        availableUsers.delete(socket.id)
        io.to(otherUserID).emit("clear-Messages");
        console.log(`User ${socket.id} stopped the stream`);
    });

    socket.on("offer", (data) => {
        const { offer, roomId, to } = data;
        io.to(to).emit("offer", { offer, from: socket.id, roomId });
    });

    socket.on("answer", (data) => {
        const { answer, to } = data;
        io.to(to).emit("answer", { answer, from: socket.id });
    });

    socket.on("ice-candidate", (data) => {
        const { candidate, to } = data;
        io.to(to).emit("ice-candidate", { candidate, from: socket.id });
    });

    socket.on("chat-message", ({ roomId, message, mySocketID, otherUserID: otherUserId }) => {
        console.log(`Received message in server:`, message, "for room:", roomId, "users :: ", mySocketID, " !!", otherUserId);
        io.to(otherUserId).emit("chat-message", { roomId, message, mySocketID });
    });

    socket.on("user-typing", ({ roomId, otherUserID }) => {
        io.to(otherUserID).emit("user-typing");
        console.log("use is typingr");
    })
    socket.on("stop-typing", ({ roomId, otherUserID }) => {
        io.to(otherUserID).emit("stop-typing");
        console.log("use is stopping typing");
    })


    socket.on("audio-muted", ({ roomId, otherUserID }) => {
        io.to(otherUserID).emit("audio-muted");
    })

    socket.on("video-muted", ({ roomId, otherUserID }) => {
        io.to(otherUserID).emit("video-muted");
    })


    socket.on("disconnect", () => {
        availableUsers.delete(socket.id);
        matchedUsers.delete(socket.id);
        for (const [roomId, users] of rooms.entries()) {
            if (users.includes(socket.id)) {
                leaveRoom(socket, roomId);
                break;
            }
        }
        console.log(`User disconnected: ${socket.id}`);
    });
});

let isMatching = false;

function matchUsers(socket) {
    if (isMatching) {
        setTimeout(() => matchUsers(socket), 100);
        return;
    }

    isMatching = true;
    try {
        if (matchedUsers.has(socket.id)) {
            isMatching = false;
            return;
        }

        availableUsers.delete(socket.id);

        const iterator = availableUsers.values();
        const { value: otherUserId, done } = iterator.next();

        if (!done && !matchedUsers.has(otherUserId)) {
            availableUsers.delete(otherUserId);

            const roomId = `${socket.id}-${otherUserId}`;
            rooms.set(roomId, [socket.id, otherUserId]);
            matchedUsers.add(socket.id);
            matchedUsers.add(otherUserId);

            socket.join(roomId);
            io.to(otherUserId).emit("join-room", {
                roomId,
                from: socket.id,
                me: otherUserId,
            });
            socket.emit("join-room", {
                roomId,
                from: otherUserId,
                me: socket.id,
            });

            console.log(`Matched ${socket.id} with ${otherUserId} in room ${roomId}`);
        } else {
            availableUsers.add(socket.id);
            socket.emit("waiting", "Waiting for another user...");
        }
    } finally {
        isMatching = false;
    }
}


function matchUsers(socket) {
    // If already matching, delay this attempt
    if (isMatching) {
        setTimeout(() => matchUsers(socket), 100); // Retry after 100ms
        return;
    }

    isMatching = true;

    try {
        // Remove the current user from the available pool (if present)
        availableUsers.delete(socket.id);

        // Get the first available user from the Set
        const iterator = availableUsers.values();
        const { value: otherUserId, done } = iterator.next();

        if (!done) {
            // Remove the matched user from the pool
            availableUsers.delete(otherUserId);

            const roomId = `${socket.id}-${otherUserId}`;
            rooms.set(roomId, [socket.id, otherUserId]);

            // Join both users into the room and emit join-room
            socket.join(roomId);
            io.to(otherUserId).emit("join-room", {
                roomId,
                from: socket.id,
                me: otherUserId,
            });
            socket.emit("join-room", {
                roomId,
                from: otherUserId,
                me: socket.id,
            });

            console.log(`Matched ${socket.id} with ${otherUserId} in room ${roomId}`);
        } else {
            // No one available — add current user to the pool and notify
            availableUsers.add(socket.id);
            socket.emit("waiting", "Waiting for another user...");
        }
    } finally {
        isMatching = false;
    }
}

function leaveRoom(socket, roomId) {
    if (roomId && rooms.has(roomId)) {
        const users = rooms.get(roomId);
        const otherUserId = users.find((id) => id !== socket.id);
        if (otherUserId) {
            io.to(otherUserId).emit("user-left", { roomId });
            matchedUsers.delete(otherUserId);
        }
        matchedUsers.delete(socket.id);
        socket.leave(roomId);
        rooms.delete(roomId);
        console.log(`User ${socket.id} left room ${roomId}`);
    }
}
