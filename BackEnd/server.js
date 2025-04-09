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
        origin: ["http://localhost:5173", "https://manitv.vercel.app", "https://manitv.live", "https://nittv.vercel.app", "https://nittv.live",  "https://nittvtest.vercel.app" ],
        methods: ["GET", "POST"],
    },
});

let availableUsers = [];

// Store active rooms (key: roomId, value: array of user socket IDs)
const rooms = new Map();

let activeUsers=0;

io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);
    activeUsers++;
    socket.on("start", () => {
        availableUsers.push(socket.id);
        matchUsers(socket);
    });

    setInterval(() => {
        const numberOfUsers = availableUsers.length + 2*rooms.size;
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
        availableUsers = availableUsers.filter((id) => id !== socket.id);
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

    socket.on("user-typing", ({roomId, otherUserID}) => {
        io.to(otherUserID).emit("user-typing");
        console.log("use is typingr");
    })
    socket.on("stop-typing", ({roomId, otherUserID}) => {
        io.to(otherUserID).emit("stop-typing");
        console.log("use is stopping typing");
    })


    socket.on("audio-muted", ({roomId, otherUserID})=>{
        io.to(otherUserID).emit("audio-muted");
    })

    socket.on("video-muted", ({roomId, otherUserID})=>{
        io.to(otherUserID).emit("video-muted");
    })


    socket.on("disconnect", () => {
        availableUsers = availableUsers.filter((id) => id !== socket.id);
        for (const [roomId, users] of rooms.entries()) {
            if (users.includes(socket.id)) {
                leaveRoom(socket, roomId);
                break;
            }
        }
        console.log(`User disconnected: ${socket.id}`);
    });
});

function matchUsers(socket) {

    // remove the current user from the available pool
    availableUsers = availableUsers.filter((id) => id !== socket.id);

    // finding another user
    if (availableUsers.length > 0) {
        const otherUserId = availableUsers.shift();
        const roomId = `${socket.id}-${otherUserId}`;

        rooms.set(roomId, [socket.id, otherUserId]);
        socket.join(roomId);
        io.to(otherUserId).emit("join-room", { roomId, from: socket.id, me: otherUserId });
        socket.emit("join-room", { roomId, from: otherUserId, me: socket.id });
        console.log(`Matched ${socket.id} with ${otherUserId} in room ${roomId}`);
    } 
    else {
        availableUsers.push(socket.id);
        socket.emit("waiting", "Waiting for another user...");
    }
}

function leaveRoom(socket, roomId) {
    if (roomId && rooms.has(roomId)) {
        const users = rooms.get(roomId);
        const otherUserId = users.find((id) => id !== socket.id);
        if (otherUserId) {
            io.to(otherUserId).emit("user-left", { roomId });
        }
        socket.leave(roomId);
        rooms.delete(roomId);
        console.log(`User ${socket.id} left room ${roomId}`);
    }
}