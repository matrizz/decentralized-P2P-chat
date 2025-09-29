import type { User } from "./types"

export interface NetworkMessage {
  type: "direct_message" | "group_message" | "user_status" | "peer_discovery"
  senderId: string
  recipientId?: string
  groupId?: string
  content: string
  timestamp: number
  signature?: string
  targetRecipient?: string
}

export interface PeerConnection {
  id: string
  connection: RTCPeerConnection
  dataChannel?: RTCDataChannel
  isConnected: boolean
}

export class P2PNetworkManager {
  private static instance: P2PNetworkManager
  private currentUser: User | null = null
  private peers: Map<string, PeerConnection> = new Map()
  private messageHandlers: ((message: NetworkMessage) => void)[] = []
  private peerStatusHandlers: ((peerId: string, isOnline: boolean) => void)[] = []
  private isInitialized = false
  private signalingServer: WebSocket | null = null
  private isNetworkOnline = true
  private broadcastChannel: BroadcastChannel | null = null
  private storageEventListener: ((event: StorageEvent) => void) | null = null

  private readonly SIGNALING_SERVER = "wss://socketio-chat-h9jt.herokuapp.com/socket.io/?EIO=4&transport=websocket"
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private pendingOffers: Map<string, RTCSessionDescriptionInit> = new Map()
  private pendingAnswers: Map<string, RTCSessionDescriptionInit> = new Map()
  private pendingCandidates: Map<string, RTCIceCandidate[]> = new Map()

  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun.stunprotocol.org:3478" },
    ],
    iceCandidatePoolSize: 10,
  }

  private constructor() {
    if (typeof window !== "undefined") {
      this.isNetworkOnline = navigator.onLine
      window.addEventListener("online", () => {
        this.isNetworkOnline = true
        console.log("[v0] Network connection restored")
        this.connectToSignalingServer()
      })
      window.addEventListener("offline", () => {
        this.isNetworkOnline = false
        console.log("[v0] Network connection lost")
      })
    }
  }

  static getInstance(): P2PNetworkManager {
    if (!P2PNetworkManager.instance) {
      P2PNetworkManager.instance = new P2PNetworkManager()
    }
    return P2PNetworkManager.instance
  }

  async initialize(user: User): Promise<void> {
    if (this.isInitialized || typeof window === "undefined") return

    this.currentUser = user
    console.log(`[v0] Initializing real WebRTC P2P network for user: ${user.username}`)

    try {
      await this.connectToSignalingServer()
      this.setupCrossTabCommunication()
      this.isInitialized = true
      console.log("[v0] WebRTC P2P network initialized successfully")

      await this.announcePresence()
      const status = this.getConnectionStatus()
      console.log("[v0] Network status after initialization:", status)
    } catch (error) {
      console.error("Failed to initialize WebRTC P2P network:", error)
      this.setupFallbackCommunication()
      this.isInitialized = true
    }
  }

  private async connectToSignalingServer(): Promise<void> {
    if (!this.isNetworkOnline || typeof window === "undefined") return

    try {
      console.log(`[v0] Connecting to WebRTC signaling server...`)
      this.signalingServer = new WebSocket(this.SIGNALING_SERVER)

      await new Promise((resolve, reject) => {
        if (!this.signalingServer) return reject(new Error("WebSocket not created"))

        const timeout = setTimeout(() => reject(new Error("Connection timeout")), 10000)

        this.signalingServer.onopen = () => {
          clearTimeout(timeout)
          console.log(`[v0] Connected to WebRTC signaling server`)
          this.reconnectAttempts = 0
          this.setupSignalingHandlers()
          resolve(void 0)
        }

        this.signalingServer.onerror = (error) => {
          clearTimeout(timeout)
          console.error("[v0] WebSocket connection error:", error)
          reject(new Error("WebSocket connection failed"))
        }
      })

      if (this.currentUser) {
        await this.announcePresence()
      }
    } catch (error) {
      console.error(`[v0] Failed to connect to signaling server:`, error)
      this.signalingServer = null
      this.scheduleReconnect()
      throw error
    }
  }

  private setupSignalingHandlers(): void {
    if (!this.signalingServer) return

    this.signalingServer.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log("[v0] Received signaling message:", data.type, data)
        await this.handleSignalingMessage(data)
      } catch (error) {
        console.error("[v0] Error parsing signaling message:", error)
      }
    }

    this.signalingServer.onclose = () => {
      console.log("[v0] Signaling server connection closed")
      this.signalingServer = null
      this.scheduleReconnect()
    }

    this.signalingServer.onerror = (error) => {
      console.error("[v0] Signaling server error:", error)
    }
  }

  private async handleSignalingMessage(data: any): Promise<void> {
    if (!this.currentUser) return

    switch (data.type) {
      case "user_joined":
        if (data.userId !== this.currentUser.id) {
          console.log("[v0] User joined:", data.userId, data.userData?.username)
          await this.createPeerConnection(data.userId, data.userData, true)
        }
        break

      case "user_list":
        console.log("[v0] Received user list:", data.users)
        for (const user of data.users || []) {
          if (user.userId !== this.currentUser.id) {
            await this.createPeerConnection(user.userId, user.userData, false)
          }
        }
        break

      case "webrtc_offer":
        if (data.targetId === this.currentUser.id && data.fromId !== this.currentUser.id) {
          console.log("[v0] Received WebRTC offer from:", data.fromId)
          await this.handleOffer(data.fromId, data.offer)
        }
        break

      case "webrtc_answer":
        if (data.targetId === this.currentUser.id && data.fromId !== this.currentUser.id) {
          console.log("[v0] Received WebRTC answer from:", data.fromId)
          await this.handleAnswer(data.fromId, data.answer)
        }
        break

      case "webrtc_ice_candidate":
        if (data.targetId === this.currentUser.id && data.fromId !== this.currentUser.id) {
          console.log("[v0] Received ICE candidate from:", data.fromId)
          await this.handleIceCandidate(data.fromId, data.candidate)
        }
        break

      case "direct_message":
        if (data.recipientId === this.currentUser.id && data.senderId !== this.currentUser.id) {
          console.log("[v0] Received direct message via signaling:", data)
          this.handleIncomingMessage(data)
        }
        break
    }
  }

  private async createPeerConnection(peerId: string, userData: any, shouldCreateOffer: boolean): Promise<void> {
    if (this.peers.has(peerId)) return

    try {
      console.log("[v0] Creating WebRTC connection to:", peerId, userData?.username)

      const peerConnection = new RTCPeerConnection(this.rtcConfig)
      const dataChannel = shouldCreateOffer ? peerConnection.createDataChannel("messages") : null

      const peer: PeerConnection = {
        id: peerId,
        connection: peerConnection,
        dataChannel: dataChannel || undefined,
        isConnected: false,
      }

      this.peers.set(peerId, peer)

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.signalingServer?.readyState === WebSocket.OPEN) {
          console.log("[v0] Sending ICE candidate to:", peerId)
          this.signalingServer.send(
            JSON.stringify({
              type: "webrtc_ice_candidate",
              fromId: this.currentUser?.id,
              targetId: peerId,
              candidate: event.candidate,
            }),
          )
        }
      }

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log("[v0] Connection state changed:", peerId, peerConnection.connectionState)
        const isConnected = peerConnection.connectionState === "connected"
        peer.isConnected = isConnected
        this.notifyPeerStatus(peerId, isConnected)

        if (isConnected) {
          console.log("[v0] WebRTC connection established with:", peerId)
        }
      }

      // Handle incoming data channel
      peerConnection.ondatachannel = (event) => {
        console.log("[v0] Received data channel from:", peerId)
        const channel = event.channel
        peer.dataChannel = channel
        this.setupDataChannel(channel, peerId)
      }

      // Setup data channel if we created it
      if (dataChannel) {
        this.setupDataChannel(dataChannel, peerId)
      }

      // Create offer if we should initiate
      if (shouldCreateOffer) {
        const offer = await peerConnection.createOffer()
        await peerConnection.setLocalDescription(offer)

        if (this.signalingServer?.readyState === WebSocket.OPEN) {
          console.log("[v0] Sending WebRTC offer to:", peerId)
          this.signalingServer.send(
            JSON.stringify({
              type: "webrtc_offer",
              fromId: this.currentUser?.id,
              targetId: peerId,
              offer: offer,
            }),
          )
        }
      }
    } catch (error) {
      console.error("[v0] Error creating peer connection:", error)
      this.peers.delete(peerId)
    }
  }

  private setupDataChannel(channel: RTCDataChannel, peerId: string): void {
    channel.onopen = () => {
      console.log("[v0] Data channel opened with:", peerId)
      const peer = this.peers.get(peerId)
      if (peer) {
        peer.isConnected = true
        this.notifyPeerStatus(peerId, true)
      }
    }

    channel.onclose = () => {
      console.log("[v0] Data channel closed with:", peerId)
      const peer = this.peers.get(peerId)
      if (peer) {
        peer.isConnected = false
        this.notifyPeerStatus(peerId, false)
      }
    }

    channel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        console.log("[v0] Received P2P message from:", peerId, message)
        this.handleIncomingMessage(message)
      } catch (error) {
        console.error("[v0] Error parsing P2P message:", error)
      }
    }

    channel.onerror = (error) => {
      console.error("[v0] Data channel error with:", peerId, error)
    }
  }

  private async handleOffer(fromId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    try {
      let peer = this.peers.get(fromId)
      if (!peer) {
        await this.createPeerConnection(fromId, null, false)
        peer = this.peers.get(fromId)
      }

      if (!peer) return

      await peer.connection.setRemoteDescription(offer)
      const answer = await peer.connection.createAnswer()
      await peer.connection.setLocalDescription(answer)

      if (this.signalingServer?.readyState === WebSocket.OPEN) {
        console.log("[v0] Sending WebRTC answer to:", fromId)
        this.signalingServer.send(
          JSON.stringify({
            type: "webrtc_answer",
            fromId: this.currentUser?.id,
            targetId: fromId,
            answer: answer,
          }),
        )
      }

      // Process any pending ICE candidates
      const candidates = this.pendingCandidates.get(fromId) || []
      for (const candidate of candidates) {
        await peer.connection.addIceCandidate(candidate)
      }
      this.pendingCandidates.delete(fromId)
    } catch (error) {
      console.error("[v0] Error handling offer:", error)
    }
  }

  private async handleAnswer(fromId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    try {
      const peer = this.peers.get(fromId)
      if (!peer) return

      await peer.connection.setRemoteDescription(answer)

      // Process any pending ICE candidates
      const candidates = this.pendingCandidates.get(fromId) || []
      for (const candidate of candidates) {
        await peer.connection.addIceCandidate(candidate)
      }
      this.pendingCandidates.delete(fromId)
    } catch (error) {
      console.error("[v0] Error handling answer:", error)
    }
  }

  private async handleIceCandidate(fromId: string, candidate: RTCIceCandidate): Promise<void> {
    try {
      const peer = this.peers.get(fromId)
      if (!peer) {
        // Store candidate for later
        if (!this.pendingCandidates.has(fromId)) {
          this.pendingCandidates.set(fromId, [])
        }
        this.pendingCandidates.get(fromId)!.push(candidate)
        return
      }

      if (peer.connection.remoteDescription) {
        await peer.connection.addIceCandidate(candidate)
      } else {
        // Store candidate for later
        if (!this.pendingCandidates.has(fromId)) {
          this.pendingCandidates.set(fromId, [])
        }
        this.pendingCandidates.get(fromId)!.push(candidate)
      }
    } catch (error) {
      console.error("[v0] Error handling ICE candidate:", error)
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("[v0] Max reconnection attempts reached, using fallback only")
      this.setupFallbackCommunication()
      return
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
    this.reconnectAttempts++

    console.log(`[v0] Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`)
    setTimeout(() => {
      if (this.isNetworkOnline && this.isInitialized) {
        this.connectToSignalingServer().catch(() => {
          this.scheduleReconnect()
        })
      }
    }, delay)
  }

  private setupFallbackCommunication(): void {
    console.log("[v0] Setting up fallback communication (same-browser only)")
    this.setupCrossTabCommunication()
  }

  private setupCrossTabCommunication(): void {
    if (typeof window === "undefined") return

    if (typeof BroadcastChannel !== "undefined") {
      this.broadcastChannel = new BroadcastChannel("p2p-chat-webrtc")
      this.broadcastChannel.onmessage = (event) => {
        this.handleCrossTabMessage(event.data)
      }
    } else {
      this.storageEventListener = (event) => {
        if (event.key === "p2p-chat-webrtc-messages" && event.newValue) {
          try {
            const message = JSON.parse(event.newValue)
            this.handleCrossTabMessage(message)
          } catch (error) {
            console.error("Error parsing cross-tab message:", error)
          }
        }
      }
      window.addEventListener("storage", this.storageEventListener)
    }
  }

  private handleCrossTabMessage(data: any): void {
    if (data.type === "network_message" && data.message) {
      if (data.message.recipientId && data.message.recipientId !== this.currentUser?.id) {
        return
      }

      if (data.message.senderId === this.currentUser?.id) {
        return
      }

      console.log("[v0] Received cross-tab message:", data.message)
      this.handleIncomingMessage(data.message)
    }
  }

  private async handleIncomingMessage(message: NetworkMessage): Promise<void> {
    try {
      if (message.senderId === this.currentUser?.id) return

      console.log("[v0] Processing incoming message:", message.type, "from:", message.senderId)
      this.messageHandlers.forEach((handler) => handler(message))
    } catch (error) {
      console.error("Error handling incoming message:", error)
    }
  }

  private notifyPeerStatus(peerId: string, isOnline: boolean): void {
    this.peerStatusHandlers.forEach((handler) => handler(peerId, isOnline))
  }

  async sendDirectMessage(recipientId: string, content: string, signature?: string): Promise<void> {
    if (!this.currentUser) {
      throw new Error("Network not initialized")
    }

    const message: NetworkMessage = {
      type: "direct_message",
      senderId: this.currentUser.id,
      recipientId,
      content,
      timestamp: Date.now(),
      signature,
    }

    console.log("[v0] Sending direct message to:", recipientId, "content:", content)

    // Try to send via WebRTC data channel first
    const peer = this.peers.get(recipientId)
    if (peer?.dataChannel && peer.dataChannel.readyState === "open") {
      try {
        peer.dataChannel.send(JSON.stringify(message))
        console.log("[v0] Message sent via WebRTC data channel")
        return
      } catch (error) {
        console.error("[v0] Failed to send via data channel:", error)
      }
    }

    // Fallback to signaling server
    if (this.signalingServer && this.signalingServer.readyState === WebSocket.OPEN) {
      try {
        this.signalingServer.send(JSON.stringify(message))
        console.log("[v0] Message sent via signaling server")
        return
      } catch (error) {
        console.error("[v0] Failed to send via signaling server:", error)
      }
    }

    // Final fallback to cross-tab communication (same browser only)
    this.broadcastCrossTabMessage({
      type: "network_message",
      message,
      targetRecipient: recipientId,
    })

    console.log("[v0] Message sent via fallback method")
  }

  async sendGroupMessage(groupId: string, content: string, signature?: string): Promise<void> {
    if (!this.currentUser) {
      throw new Error("Network not initialized")
    }

    const message: NetworkMessage = {
      type: "group_message",
      senderId: this.currentUser.id,
      groupId,
      content,
      timestamp: Date.now(),
      signature,
    }

    console.log("[v0] Sending group message:", message)

    // Broadcast to all connected peers via data channels
    let sentViaDataChannel = false
    this.peers.forEach((peer) => {
      if (peer.dataChannel && peer.dataChannel.readyState === "open") {
        try {
          peer.dataChannel.send(JSON.stringify(message))
          sentViaDataChannel = true
        } catch (error) {
          console.error("[v0] Failed to send group message via data channel:", error)
        }
      }
    })

    if (sentViaDataChannel) {
      console.log("[v0] Group message sent via WebRTC data channels")
      return
    }

    // Fallback to signaling server
    if (this.signalingServer && this.signalingServer.readyState === WebSocket.OPEN) {
      try {
        this.signalingServer.send(JSON.stringify(message))
        console.log("[v0] Group message sent via signaling server")
      } catch (error) {
        console.error("[v0] Failed to send group message via signaling server:", error)
      }
    }

    this.broadcastCrossTabMessage({
      type: "network_message",
      message,
    })
  }

  async joinGroup(groupId: string): Promise<void> {
    console.log(`Joined group: ${groupId}`)
  }

  async leaveGroup(groupId: string): Promise<void> {
    console.log(`Left group: ${groupId}`)
  }

  private async announcePresence(): Promise<void> {
    if (!this.currentUser) return

    const userData = {
      username: this.currentUser.username,
      publicKey: this.currentUser.publicKey,
      isOnline: true,
      timestamp: Date.now(),
    }

    const announcement = {
      type: "user_join",
      userId: this.currentUser.id,
      userData,
    }

    if (this.signalingServer && this.signalingServer.readyState === WebSocket.OPEN) {
      try {
        this.signalingServer.send(JSON.stringify(announcement))
        console.log("[v0] Announced presence to signaling server")
      } catch (error) {
        console.error("[v0] Failed to announce presence:", error)
      }
    }

    this.broadcastCrossTabMessage(announcement)

    console.log("[v0] Announced presence for:", this.currentUser.username, "WebRTC Peers:", this.peers.size)
  }

  async updateStatus(isOnline: boolean): Promise<void> {
    if (!this.currentUser) return

    this.currentUser.isOnline = isOnline
    this.currentUser.lastSeen = new Date()

    if (isOnline) {
      await this.announcePresence()
    }
  }

  onMessage(handler: (message: NetworkMessage) => void): void {
    this.messageHandlers.push(handler)
  }

  onPeerStatus(handler: (peerId: string, isOnline: boolean) => void): void {
    this.peerStatusHandlers.push(handler)
  }

  removeMessageHandler(handler: (message: NetworkMessage) => void): void {
    const index = this.messageHandlers.indexOf(handler)
    if (index > -1) {
      this.messageHandlers.splice(index, 1)
    }
  }

  removePeerStatusHandler(handler: (peerId: string, isOnline: boolean) => void): void {
    const index = this.peerStatusHandlers.indexOf(handler)
    if (index > -1) {
      this.peerStatusHandlers.splice(index, 1)
    }
  }

  getConnectedPeers(): string[] {
    return Array.from(this.peers.keys()).filter((peerId) => this.peers.get(peerId)?.isConnected)
  }

  getConnectionStatus(): { isConnected: boolean; peerCount: number } {
    const connectedPeers = this.getConnectedPeers()
    const isSignalingConnected = this.signalingServer?.readyState === WebSocket.OPEN

    return {
      isConnected: this.isInitialized && this.isNetworkOnline && (isSignalingConnected || connectedPeers.length > 0),
      peerCount: connectedPeers.length,
    }
  }

  async shutdown(): Promise<void> {
    if (this.broadcastChannel) {
      this.broadcastChannel.close()
      this.broadcastChannel = null
    }

    if (this.storageEventListener) {
      window.removeEventListener("storage", this.storageEventListener)
      this.storageEventListener = null
    }

    this.peers.forEach((peer) => {
      if (peer.dataChannel) {
        peer.dataChannel.close()
      }
      peer.connection.close()
    })
    this.peers.clear()

    if (this.signalingServer) {
      this.signalingServer.close()
      this.signalingServer = null
    }

    this.pendingOffers.clear()
    this.pendingAnswers.clear()
    this.pendingCandidates.clear()

    this.isInitialized = false
  }

  private broadcastCrossTabMessage(data: any): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(data)
    } else {
      localStorage.setItem("p2p-chat-webrtc-messages", JSON.stringify(data))
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "p2p-chat-webrtc-messages",
          newValue: JSON.stringify(data),
          url: window.location.href,
        }),
      )
      setTimeout(() => {
        localStorage.removeItem("p2p-chat-webrtc-messages")
      }, 100)
    }
  }
}
