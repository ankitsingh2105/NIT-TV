const express = require("express");
const { Server } = require("socket.io");

const app = express();

const server = app.listen(8000, () => {
    console.log(`Server running on port 8000`);
});

app.get("/", (req, response) => {
    response.send("api is working fine");
});

const io = new Server(server, {
    cors: {
        origin: [
            "http://localhost:5173",
            "https://manitv.vercel.app",
            "https://manitv.live",
            "https://nittv.vercel.app",
            "https://nittv.live",
            "https://nittvtest.vercel.app",
        ],
        methods: ["GET", "POST"],
    },
});

let availableUsers = [];
const rooms = new Map();
const transitioningUsers = new Set(); // matching/leaving users here
let activeUsers = 0;

io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);
    activeUsers++;

    socket.on("start", () => {
        if (!transitioningUsers.has(socket.id)) {
            availableUsers.push(socket.id);
            matchUsers(socket);
        }
    });

    setInterval(() => {
        const numberOfUsers = availableUsers.length + 2 * rooms.size;
        io.emit("active-users", numberOfUsers);
    }, 10000);

    socket.on("next", ({ roomId: currentRoomId, otherUserID }) => {
        if (transitioningUsers.has(socket.id)) {
            return; // Prevent duplicate processing
        }
        transitioningUsers.add(socket.id); // locking the users here
        leaveRoom(socket, currentRoomId, otherUserID);
        matchUsers(socket);
        io.to(otherUserID).emit("clear-Messages");
    });

    socket.on("stop", ({ roomId, otherUserID }) => {
        if (transitioningUsers.has(socket.id)) {
            return;
        }
        transitioningUsers.add(socket.id);
        leaveRoom(socket, roomId, otherUserID);
        availableUsers = availableUsers.filter((id) => id !== socket.id);
        io.to(otherUserID).emit("clear-Messages");
        console.log(`User ${socket.id} stopped the stream`);
        transitioningUsers.delete(socket.id);
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

    socket.on("chat-message", ({ roomId, message, mySocketID, otherUserID }) => {
        console.log(`Received message in server:`, message, "for room:", roomId, "users :: ", mySocketID, " !!", otherUserID);
        io.to(otherUserID).emit("chat-message", { roomId, message, mySocketID });
    });

    socket.on("user-typing", ({ roomId, otherUserID }) => {
        io.to(otherUserID).emit("user-typing");
        console.log("user is typing");
    });

    socket.on("stop-typing", ({ roomId, otherUserID }) => {
        io.to(otherUserID).emit("stop-typing");
        console.log("user is stopping typing");
    });

    socket.on("audio-muted", ({ roomId, otherUserID }) => {
        io.to(otherUserID).emit("audio-muted");
    });

    socket.on("video-muted", ({ roomId, otherUserID }) => {
        io.to(otherUserID).emit("video-muted");
    });

    socket.on("disconnect", () => {
        availableUsers = availableUsers.filter((id) => id !== socket.id);
        transitioningUsers.delete(socket.id);
        for (const [roomId, users] of rooms.entries()) {
            if (users.includes(socket.id)) {
                leaveRoom(socket, roomId, users.find((id) => id !== socket.id));
                break;
            }
        }
        console.log(`User disconnected: ${socket.id}`);
        activeUsers--;
    });
});

function matchUsers(socket) {
    if (!transitioningUsers.has(socket.id)) {
        transitioningUsers.add(socket.id);
    }

    availableUsers = availableUsers.filter((id) => id !== socket.id);

    if (availableUsers.length > 0) {
        const otherUserId = availableUsers.find((id) => !transitioningUsers.has(id));
        if (otherUserId) {
            availableUsers = availableUsers.filter((id) => id !== otherUserId);
            const roomId = `${socket.id}-${otherUserId}`;

            rooms.set(roomId, [socket.id, otherUserId]);
            socket.join(roomId);
            io.to(otherUserId).emit("join-room", { roomId, from: socket.id, me: otherUserId });
            socket.emit("join-room", { roomId, from: otherUserId, me: socket.id });
            console.log(`Matched ${socket.id} with ${otherUserId} in room ${roomId}`);
            transitioningUsers.delete(socket.id);
            transitioningUsers.delete(otherUserId);
        } else {
            availableUsers.push(socket.id);
            socket.emit("waiting", "Waiting for another user...");
            transitioningUsers.delete(socket.id);
        }
    } else {
        availableUsers.push(socket.id);
        socket.emit("waiting", "Waiting for another user...");
        transitioningUsers.delete(socket.id);
    }
}

function leaveRoom(socket, roomId, otherUserID) {
    if (roomId && rooms.has(roomId)) {
        const users = rooms.get(roomId);
        if (otherUserID && users.includes(otherUserID)) {
            io.to(otherUserID).emit("user-left", { roomId });
        }
        socket.leave(roomId);
        rooms.delete(roomId);
        console.log(`User ${socket.id} left room ${roomId}`);
    }
    transitioningUsers.delete(socket.id);
}