class PeerService {
    constructor() {
        this.tracksAdded = false; // To ensure we don’t add tracks multiple times
        this.localStream = null;

        // * :: Creating the actual peer connection object with STUN servers for NAT traversal
        if (!this.webRTCPeer) {
            this.webRTCPeer = new RTCPeerConnection({
                iceServers: [
                    {
                        urls: [
                            "stun:stun.l.google.com:19302",
                            "stun:global.stun.twilio.com:3478",
                        ],
                    },
                ],
            });
        }
    }

    // * :: Adds local media tracks to the peer connection safely (only once)
    addLocalTracks(localStream) {
        if (!this.tracksAdded) {
            this.localStream = localStream;

            // Check if tracks are already added by comparing with existing senders
            const existingTracks = this.webRTCPeer.getSenders().map(sender => sender.track);
            this.localStream.getTracks().forEach((track) => {
                if (!existingTracks.includes(track)) {
                    this.webRTCPeer.addTrack(track, this.localStream);
                }
            });

            this.tracksAdded = true;
        }
    }

    async getOffer() {
        if (this.webRTCPeer) {
            const offer = await this.webRTCPeer.createOffer();
            // * :: local description refers to the connection information (including media codecs, network data, and other session-related parameters) that the local peer (your device or browser) is proposing to the remote peer (the other device or browser).
            await this.webRTCPeer.setLocalDescription(new RTCSessionDescription(offer));
            return offer;
        }
    }

    async getAnswer(offer) {
        // * :: The remote description in WebRTC refers to the session parameters (such as media streams, codecs, and network configurations) that are received from the remote peer (the other participant in the communication).
        if (this.webRTCPeer) {
            await this.webRTCPeer.setRemoteDescription(offer);
            const ans = await this.webRTCPeer.createAnswer();
            await this.webRTCPeer.setLocalDescription(new RTCSessionDescription(ans));
            return ans;
        }
    }

    async setLocalDescription(ans) {
        if (this.webRTCPeer) {
            await this.webRTCPeer.setLocalDescription(new RTCSessionDescription(ans));
        }
    }

    async setRemoteDescription(ans) {
        if (this.webRTCPeer) {
            await this.webRTCPeer.setRemoteDescription(new RTCSessionDescription(ans));
        }
    }
}

export default PeerService;
