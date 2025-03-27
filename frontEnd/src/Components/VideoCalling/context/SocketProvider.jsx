import { createContext, useMemo, useContext, useEffect } from "react";
import React from "react";
import { io } from "socket.io-client";

const SocketContext = createContext(null);

export const useSocket = () => {
    const socket = useContext(SocketContext);
    return socket;
};

export default function SocketProvider(props) {
    // Socket for video chat signaling (port 8000)
    const socket = useMemo(
        () =>
            io("wss://10.64.53.109:8000", {
                transports: ["websocket", "polling"], // Allow fallback to polling if WebSocket fails
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
            }),
        []
    );

    useEffect(() => {
        // Log connection status
        socket.on("connect", () => {
            console.log("Socket connected:", socket.id);
        });
        socket.on("connect_error", (error) => {
            console.error("Socket connection error:", error);
        });
        socket.on("disconnect", (reason) => {
            console.log("Socket disconnected:", reason);
        });
        socket.on("reconnect", (attempt) => {
            console.log("Socket reconnected after attempt:", attempt);
        });
        socket.on("reconnect_failed", () => {
            console.error("Socket reconnection failed");
        });

        // Cleanup on unmount
        return () => {
            socket.disconnect();
        };
    }, [socket]);

    return (
        <SocketContext.Provider value={socket}>
            {props.children}
        </SocketContext.Provider>
    );
}