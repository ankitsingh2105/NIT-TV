import React, { useState, useEffect, useRef, Fragment } from "react";
import { useSocket } from "../context/SocketProvider";
import PeerService from "../service/peer";
import { useNavigate } from "react-router-dom";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  CircleArrowRight,
  CirclePlay,
  CircleStop,
  Loader,
  SendHorizonal,
  Mic,
  MicOff,
  Video,
  VideoOff,
} from "lucide-react";
import { Toaster, toast } from "react-hot-toast";

const Room = () => {
  const socket = useSocket();
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [isStarted, setIsStarted] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const peerInstance = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [message, setMessage] = useState("");
  const [messageArray, setMessageArray] = useState([]);
  const [mySocketID, setMySocketId] = useState("");
  const [otherUserID, setOtherUserID] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const chatContainerRef = useRef(null);
  const [activeUser, setActiveUser] = useState(3);
  const [isTyping, setIsTyping] = useState(false);

  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const auth = getAuth();

  // useEffect(() => {
  //   const unsubscribe = onAuthStateChanged(auth, (loggedInUser) => {
  //     if (!loggedInUser) {
  //       navigate("/");
  //     } else {
  //       setUser(loggedInUser);
  //     }
  //   });

  //   return () => unsubscribe();
  // }, [auth, navigate]);

  // local media stream
  useEffect(() => {
    const initLocalStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        // console.log("Local stream initialized:", stream);
        setLocalStream(stream);
      } catch (error) {
        // console.error(
        //   "Error accessing media devices:",
        //   error.name,
        //   error.message
        // );
        if (error.name === "NotAllowedError") {
          toast.error("Camera/Mic Permission Denied.");
          // console.warn("Permissions denied for camera/microphone.");
        } else if (error.name === "NotFoundError") {
          toast.error("No Camera/Mic Found.");
          // console.warn("No camera/microphone found.");
        }
      }
    };
    initLocalStream();

    return () => {
      if (localStream) {
        // console.log("cleaning up local stream");
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // seting local video stream to video element
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      // console.log("Assigning local stream to video element");
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Add tracks to peer connection
  useEffect(() => {
    if (!localStream || !peerInstance.current) return;

    // console.log("Adding tracks to peer connection");
    localStream
      .getTracks()
      .forEach((track) =>
        peerInstance.current.webRTCPeer.addTrack(track, localStream)
      );
  }, [localStream]);

  // Set remote stream to video element
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      // console.log("Remote stream set on video element via useEffect");
    }
  }, [remoteStream]);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messageArray, isTyping]);

  // Handle socket events
  useEffect(() => {
    if (!socket || !isStarted) return;

    // When matched with another user
    socket.on("join-room", async ({ roomId, from, me }) => {
      setRoomId(roomId);
      setWaiting(false);
      setMySocketId(me);
      setOtherUserID(from);

      if (!peerInstance.current) {
        peerInstance.current = new PeerService();
      }

      const pc = peerInstance.current.webRTCPeer;

      // Prevent duplicate tracks being added
      if (pc.getSenders().length === 0) {
        localStream
          .getTracks()
          .forEach((track) => pc.addTrack(track, localStream));
      }

      // Setup handlers
      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };

      pc.onconnectionstatechange = () => {
        // Optional logging
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed") {
          toast.error("Connection Failed. Click Next!");
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", {
            candidate: event.candidate,
            to: from,
          });
        }
      };

      // You decide if you're the offerer
      if (socket.id < from) {
        const offer = await peerInstance.current.getOffer();
        socket.emit("offer", { offer, roomId, to: from });
      }
    });

    // Receive an offer
    socket.on("offer", async ({ offer, from, roomId }) => {
      // console.log(`Received offer from ${from} in room ${roomId}`);
      setRoomId(roomId);
      setWaiting(false);

      // If we already have a peer instance, don't create a new one
      if (!peerInstance.current) {
        peerInstance.current = new PeerService();

        // Add local stream to the peer connection
        localStream
          .getTracks()
          .forEach((track) =>
            peerInstance.current.webRTCPeer.addTrack(track, localStream)
          );

        // Listen for remote stream
        peerInstance.current.webRTCPeer.ontrack = (event) => {
          // console.log("Received remote stream:", event.streams[0]);
          setRemoteStream(event.streams[0]);
        };

        // Log connection state changes
        peerInstance.current.webRTCPeer.onconnectionstatechange = () => {
          // console.log(
          //   "Connection state:",
          //   peerInstance.current.webRTCPeer.connectionState
          // );
        };

        // Log ICE connection state changes
        peerInstance.current.webRTCPeer.oniceconnectionstatechange = () => {
          // console.log(
          //   "ICE connection state:",
          //   peerInstance.current.webRTCPeer.iceConnectionState
          // );

          if (peerInstance.current.webRTCPeer.iceConnectionState === "failed") {
            toast.error("Connection Failed. Click Next!");
          }
        };

        // Handle ICE candidates
        peerInstance.current.webRTCPeer.onicecandidate = (event) => {
          if (event.candidate) {
            // console.log("Sending ICE candidate");
            socket.emit("ice-candidate", {
              candidate: event.candidate,
              to: from,
            });
          }
        };
      }

      // Set the remote offer and create an answer
      try {
        await peerInstance.current.setRemoteDescription(offer);
        const answer = await peerInstance.current.getAnswer(offer);
        socket.emit("answer", { answer, to: from });
      } catch (error) {
        toast.error("Connection Failed. Click Next!");
      }
    });

    // Receive an answer
    socket.on("answer", async ({ answer }) => {
      const peer = peerInstance.current?.webRTCPeer;

      if (!peer) return;

      const state = peer.signalingState;

      if (state === "have-local-offer") {
        try {
          await peerInstance.current.setRemoteDescription(answer);
        } catch (error) {
          toast.error("Failed to set remote answer.");
          console.error("Error setting remote answer:", error);
        }
      } else if (state === "stable") {
        // Already set?
        console.warn(
          "Answer received but signalingState is already stable. Ignoring."
        );
      } else {
        console.error(
          `Cannot set remote answer: Unexpected signaling state '${state}'`
        );
      }
    });

    // Receive an ICE candidate
    socket.on("ice-candidate", async ({ candidate }) => {
      // console.log("Received ICE candidate");
      if (peerInstance.current) {
        try {
          await peerInstance.current.webRTCPeer.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        } catch (error) {
          // console.error("Error adding ICE candidate:", error);
        }
      }
    });

    // When the other user leaves
    socket.on("user-left", () => {
      // console.log("Other user left the room");
      toast.success("User Left. Click Next!");
      setRemoteStream(null);
      setRoomId(null);
      if (peerInstance.current) {
        peerInstance.current.webRTCPeer.close();
        peerInstance.current = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
    });

    // Waiting for another user
    socket.on("waiting", (message) => {
      setWaiting(true);
    });

    // Clear messages
    socket.on("clear-Messages", () => {
      setMessageArray([]);
      setWaiting(true);
      socket.emit("next", { roomId, otherUserID });
    });

    // Receive chat message
    socket.on("chat-message", ({ roomId, message, mySocketID: mySocketId }) => {
      setMessageArray((e) => [...e, { message, mySocketId }]);
    });

    // active users
    socket.on("active-users", (numberOfUsers) => {
      setActiveUser(numberOfUsers);
    });

    socket.on("user-typing", () => {
      setIsTyping(true);
    });
    socket.on("stop-typing", () => {
      setIsTyping(false);
    });

    socket.on("audio-muted", () => {
      toast.error("User Muted Audio.");
    });

    socket.on("video-muted", () => {
      toast.error("User Turned Off Video.");
    });

    // Cleanup socket listeners on unmount
    return () => {
      socket.off("join-room");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("user-left");
      socket.off("waiting");
      socket.off("chat-message");
    };
  }, [socket, isStarted, localStream]);

  // Handle "Start" button click
  const handleStart = () => {
    setIsStarted(true);
    socket.emit("start");
    toast.success("Searching NITians..");
  };

  // Handle "Next" button click
  const [isNextDisabled, setIsNextDisabled] = useState(false);

  const handleNext = () => {
    if (isNextDisabled) return;
    setIsNextDisabled(true);
    setTimeout(() => setIsNextDisabled(false), 1000); // debounce 1s

    // Clean up existing peer connection
    if (peerInstance.current) {
      const pc = peerInstance.current.webRTCPeer;
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
      peerInstance.current = null;
    }

    // Reset UI state
    setRemoteStream(null);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setMessageArray([]);
    setRoomId(null);

    // Tell server to find a new user
    socket.emit("next", { roomId, otherUserID });
    toast.success("Finding Next User!");
  };

  // Handle "Stop" button click
  const handleStop = () => {
    if (peerInstance.current) {
      peerInstance.current.webRTCPeer.close();
      peerInstance.current = null;
    }
    setRemoteStream(null);
    setRoomId(null);
    setIsStarted(false);
    setWaiting(false);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    socket.emit("stop", { roomId, otherUserID });
    toast.success("Stopped Successfully.");
  };

  const handleChatBlur = () => {
    console.log("bluring");
    socket.emit("stop-typing", { roomId, otherUserID });
  };

  const handleChatFocus = () => {
    console.log("focusing");
    socket.emit("user-typing", { roomId, otherUserID });
  };

  // Toggle audio
  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
        toast.success(
          audioTrack.enabled ? "Microphone Unmuted." : "Microphone Muted."
        );
        if (!audioTrack.enabled) {
          socket.emit("audio-muted", { roomId, otherUserID });
        }
      }
    }
  };

  // Toggle video
  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
        toast.success(videoTrack.enabled ? "Camera On." : "Camera Off.");
        if (!videoTrack.enabled) {
          socket.emit("video-muted", { roomId, otherUserID });
        }
      }
    }
  };

  // Send chat message
  const sendMessage = () => {
    if (!message.trim()) return;

    if (!roomId) {
      toast.error("Starts When User Joins!");
      return;
    }
    setMessageArray((e) => [...e, { message, mySocketId: mySocketID }]);
    socket.emit("chat-message", { roomId, message, mySocketID, otherUserID });
    setMessage("");
  };

  // Handle Enter key press in chat handleChatChange
  const handleKeyPress = (event) => {
    if (event.key === "Enter") {
      sendMessage();
    }
  };

  return (
    <section
      className="-z-20 min-h-dvh bg-gray-50"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' width='20' height='20' fill='none' stroke-width='2' stroke='%23E0E0E0'%3e%3cpath d='M0 .5H19.5V20'/%3e%3c/svg%3e")`,
      }}
    >
      <div className="fixed top-2 right-2 z-10 inline-flex w-fit items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-200 px-3 py-1.5">
        <div className="relative size-2.5 rounded-full bg-green-500">
          <span className="ping-large absolute inset-0 rounded-full bg-red-600" />
        </div>
        <p className="text-xs font-bold text-black">{activeUser} Online</p>
      </div>

      <Toaster
        position="top-center"
        reverseOrder={false}
        toastOptions={{ duration: 2000 }}
      />

      {/* Video Grid - Responsive for different screen sizes */}
      <div className="container mx-auto px-4 py-6 md:py-8">
        <div className="grid gap-4 md:gap-6 lg:grid-cols-2 xl:gap-8">
          {/* Local Video Window */}
          <div className="relative flex h-82 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-300 bg-gray-100 object-contain shadow-xl md:h-64 md:shadow-2xl lg:h-90 xl:h-96">
            {localStream ? (
              <Fragment>
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="h-full w-full rotate-y-180 object-cover"
                />

                {/* Media Controls */}
                <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3">
                  <button
                    onClick={toggleAudio}
                    className={`rounded-full p-2 ${
                      audioEnabled ? "bg-green-500" : "bg-red-500"
                    } cursor-pointer text-white`}
                  >
                    {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
                  </button>
                  <button
                    onClick={toggleVideo}
                    className={`rounded-full p-2 ${
                      videoEnabled ? "bg-green-500" : "bg-red-500"
                    } cursor-pointer text-white`}
                  >
                    {videoEnabled ? (
                      <Video size={20} />
                    ) : (
                      <VideoOff size={20} />
                    )}
                  </button>
                </div>
              </Fragment>
            ) : (
              <div className="flex flex-col items-center gap-4 p-5">
                <Loader className="size-12 animate-spin [animation-duration:2s] md:size-20" />
                <p className="text-center text-lg md:text-2xl">
                  Loading your video...
                </p>
              </div>
            )}
          </div>

          {/* Remote Video Window */}
          <div className="flex h-82 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-300 bg-gray-100 object-contain shadow-xl md:h-64 md:shadow-2xl lg:h-90 xl:h-96">
            {remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center p-4">
                {waiting ? (
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader className="size-12 animate-spin [animation-duration:2s] md:size-20" />
                    <p className="text-center text-lg md:text-2xl">
                      Waiting For NITians...
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center">
                    <img
                      src="/avatar.png"
                      alt="Avatar"
                      className="size-24 md:size-36"
                    />
                    <p className="mt-2 text-lg md:text-2xl">
                      Click Start/Next To Search...
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions and Chat Section */}
      <div className="container mx-auto px-4 pb-8">
        <div className="grid gap-4 md:gap-6 lg:grid-cols-2 xl:gap-8">
          <div className="flex flex-col justify-evenly">
            <div className="mb-4 flex justify-center gap-4">
              {!isStarted ? (
                <button
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-gradient-to-b from-emerald-500 via-emerald-600 to-emerald-700 px-3 py-1 text-lg font-medium text-white shadow-xl transition-all hover:shadow-2xl md:px-6 md:py-2.5"
                  onClick={handleStart}
                >
                  <CirclePlay strokeWidth={2.5} className="size-6" />
                  <p>Start</p>
                </button>
              ) : waiting && !remoteStream ? (
                <button
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-amber-200 bg-gradient-to-b from-orange-500 via-yellow-600 to-amber-700 px-3 py-1 text-lg font-medium text-white shadow-xl transition-all hover:shadow-2xl md:px-6 md:py-2.5"
                  onClick={handleStop}
                >
                  <CircleStop strokeWidth={2.5} className="size-6" />
                  <p>Stop</p>
                </button>
              ) : (
                <div className="grid w-full grid-cols-2 gap-4">
                  <button
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-blue-200 bg-gradient-to-b from-cyan-400 via-sky-500 to-blue-600 px-3 py-1 text-lg font-medium text-white shadow-xl transition-all hover:shadow-2xl md:px-6 md:py-2.5"
                    onClick={handleNext}
                  >
                    <p>Next</p>
                    <CircleArrowRight strokeWidth={2.5} className="size-6" />
                  </button>
                  <button
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-amber-200 bg-gradient-to-b from-yellow-400 via-yellow-500 to-amber-600 px-3 py-1 text-lg font-medium text-white shadow-xl transition-all hover:shadow-2xl md:px-6 md:py-2.5"
                    onClick={handleStop}
                  >
                    <CircleStop strokeWidth={2.5} className="size-6" />
                    <p>Stop</p>
                  </button>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <div className="mt-4 flex items-center gap-2 md:gap-4">
              <input
                onChange={(e) => {
                  setMessage(e.target.value);
                }}
                type="text"
                placeholder="Type Message..."
                onKeyDown={handleKeyPress}
                value={message}
                className="w-full rounded-full bg-white py-2 pl-4 ring-2 ring-emerald-500 transition-all focus:outline-emerald-600"
                onFocus={handleChatFocus}
                onBlur={handleChatBlur}
              />
              <button
                className="flex cursor-pointer items-center justify-center gap-2 rounded-full border border-blue-200 bg-emerald-600 p-2.5 text-white shadow-xl transition-all hover:bg-emerald-700 hover:shadow-2xl"
                onClick={sendMessage}
              >
                <SendHorizonal strokeWidth={2.5} className="size-5" />
              </button>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="relative h-44 max-h-44 rounded-lg border-2 border-gray-400 bg-gray-100 p-4 shadow-xl">
            {/* Scrollable Messages */}
            <div ref={chatContainerRef} className="h-full overflow-y-auto">
              <div className="flex flex-col gap-2">
                {messageArray.length === 0 && (
                  <p className="text-center font-extralight text-gray-500 italic">
                    No Messages Yet.
                  </p>
                )}

                {messageArray.map(({ message, mySocketId }, index) =>
                  mySocketID === mySocketId ? (
                    <div key={index} className="flex flex-col items-end">
                      <div className="max-w-3/4 rounded-2xl rounded-br-none bg-gradient-to-r from-teal-400 to-emerald-500 px-4 py-3 shadow-md">
                        <p className="text-sm text-white">{message}</p>
                      </div>
                      <span className="mt-1 pr-2 text-xs text-emerald-600">
                        You
                      </span>
                    </div>
                  ) : (
                    <div key={index} className="flex flex-col items-start">
                      <div className="max-w-3/4 rounded-2xl rounded-bl-none bg-gradient-to-r from-amber-300 to-orange-300 px-4 py-3 shadow-md">
                        <p className="text-sm text-gray-800">{message}</p>
                      </div>
                      <span className="mt-1 pl-2 text-xs text-amber-600">
                        Other
                      </span>
                    </div>
                  )
                )}

                {/* WhatsApp-style Typing Indicator */}
                {isTyping && (
                  <div className="flex flex-col items-start">
                    <div className="max-w-3/4 rounded-2xl rounded-bl-none bg-gray-200 px-4 py-2 shadow-md">
                      <div className="flex items-center py-1">
                        <div className="flex space-x-1">
                          <div
                            className="h-2 w-2 rounded-full bg-gray-500 animate-bounce"
                            style={{ animationDelay: "0ms" }}
                          ></div>
                          <div
                            className="h-2 w-2 rounded-full bg-gray-500 animate-bounce"
                            style={{ animationDelay: "150ms" }}
                          ></div>
                          <div
                            className="h-2 w-2 rounded-full bg-gray-500 animate-bounce"
                            style={{ animationDelay: "300ms" }}
                          ></div>
                        </div>
                      </div>
                    </div>
                    <span className="mt-1 pl-2 text-xs text-gray-500">
                      Typing...
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Room;
