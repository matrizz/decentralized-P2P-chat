import type { User } from "./types"

export interface NetworkMessage {
  type: "direct_message" | "group_message" | "user_status" | "peer_discovery"
  senderId: string
  recipientId?: string
  groupId?: string
  content: string
  timestamp: number
  signature?: string
  targetRecipient?: string // Added for better targeting
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
  private readonly GLOBAL_PEERS_KEY = "p2p-global-peers"
  private readonly GLOBAL_MESSAGES_KEY = "p2p-global-messages"

  private constructor() {
    if (typeof window !== "undefined") {
      this.isNetworkOnline = navigator.onLine
      window.addEventListener("online", () => {
        this.isNetworkOnline = true
        console.log("[v0] Network connection restored")
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
    console.log(`[v0] Initializing P2P network for user: ${user.username}`)

    try {
      this.setupCrossTabCommunication()
      this.setupGlobalPeerDiscovery()
      this.setupPeerDiscovery()

      this.isInitialized = true
      console.log("[v0] P2P network initialized successfully")

      await this.announcePresence()

      const status = this.getConnectionStatus()
      console.log("[v0] Network status after initialization:", status)
    } catch (error) {
      console.error("Failed to initialize P2P network:", error)
      throw error
    }
  }

  private setupGlobalPeerDiscovery(): void {
    if (typeof window === "undefined") return

    const checkGlobalPeers = () => {
      try {
        const globalPeers = JSON.parse(localStorage.getItem(this.GLOBAL_PEERS_KEY) || "{}")
        const now = Date.now()
        const maxAge = 15000 // 15 seconds

        Object.entries(globalPeers).forEach(([peerId, peerData]: [string, any]) => {
          if (peerId !== this.currentUser?.id && now - peerData.lastSeen < maxAge && !this.peers.has(peerId)) {
            console.log("[v0] Discovered global peer:", peerId, peerData.username)
            this.handlePeerDiscovery(peerId, peerData)
          }
        })

        const globalMessages = JSON.parse(localStorage.getItem(this.GLOBAL_MESSAGES_KEY) || "[]")
        globalMessages.forEach((messageData: any) => {
          if (
            messageData.recipientId === this.currentUser?.id &&
            messageData.senderId !== this.currentUser?.id &&
            now - messageData.timestamp < 30000 // 30 seconds
          ) {
            console.log("[v0] Found global message for current user:", messageData)
            this.handleIncomingMessage(messageData.message)

            const updatedMessages = globalMessages.filter((m: any) => m.id !== messageData.id)
            localStorage.setItem(this.GLOBAL_MESSAGES_KEY, JSON.stringify(updatedMessages))
          }
        })
      } catch (error) {
        console.error("[v0] Error checking global peers:", error)
      }
    }

    checkGlobalPeers()
    setInterval(checkGlobalPeers, 2000) // Check every 2 seconds

    const globalStorageListener = (event: StorageEvent) => {
      if (event.key === this.GLOBAL_PEERS_KEY || event.key === this.GLOBAL_MESSAGES_KEY) {
        checkGlobalPeers()
      }
    }

    window.addEventListener("storage", globalStorageListener)
  }

  private setupCrossTabCommunication(): void {
    if (typeof window === "undefined") return

    if (typeof BroadcastChannel !== "undefined") {
      this.broadcastChannel = new BroadcastChannel("p2p-chat-demo")
      this.broadcastChannel.onmessage = (event) => {
        this.handleCrossTabMessage(event.data)
      }
    } else {
      this.storageEventListener = (event) => {
        if (event.key === "p2p-chat-messages" && event.newValue) {
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
        return // Message not for this user
      }

      if (data.message.senderId === this.currentUser?.id) {
        return // Don't process own messages
      }

      console.log("[v0] Received cross-tab message:", data.message)
      this.handleIncomingMessage(data.message)
    } else if (data.type === "peer_announcement") {
      if (data.userId !== this.currentUser?.id) {
        console.log("[v0] Discovered peer:", data.userId)
        this.handlePeerDiscovery(data.userId, data.userData)
      }
    }
  }

  private handlePeerDiscovery(peerId: string, userData: any): void {
    if (!this.peers.has(peerId)) {
      const mockPeer: PeerConnection = {
        id: peerId,
        connection: new RTCPeerConnection(), // Mock connection
        isConnected: true,
      }

      this.peers.set(peerId, mockPeer)
      this.notifyPeerStatus(peerId, true)
      console.log("[v0] Added peer:", peerId, "Total peers:", this.peers.size)

      this.storePeerInfo(peerId, userData)
    }
  }

  private storePeerInfo(peerId: string, userData: any): void {
    if (typeof window === "undefined") return

    try {
      const existingPeers = JSON.parse(localStorage.getItem("p2p-discovered-peers") || "{}")
      existingPeers[peerId] = {
        ...userData,
        lastSeen: Date.now(),
      }
      localStorage.setItem("p2p-discovered-peers", JSON.stringify(existingPeers))
    } catch (error) {
      console.error("Error storing peer info:", error)
    }
  }

  private loadStoredPeers(): void {
    if (typeof window === "undefined") return

    try {
      const storedPeers = JSON.parse(localStorage.getItem("p2p-discovered-peers") || "{}")
      const now = Date.now()
      const maxAge = 30000 // 30 seconds

      Object.entries(storedPeers).forEach(([peerId, peerData]: [string, any]) => {
        if (now - peerData.lastSeen < maxAge && peerId !== this.currentUser?.id) {
          this.handlePeerDiscovery(peerId, peerData)
        }
      })
    } catch (error) {
      console.error("Error loading stored peers:", error)
    }
  }

  private setupPeerDiscovery(): void {
    this.loadStoredPeers()

    this.announcePresence()

    setInterval(() => {
      if (this.isInitialized && this.currentUser) {
        this.announcePresence()
      }
    }, 5000) // Announce every 5 seconds

    setInterval(() => {
      this.cleanupOldPeers()
    }, 10000) // Clean up every 10 seconds
  }

  private cleanupOldPeers(): void {
    if (typeof window === "undefined") return

    try {
      const storedPeers = JSON.parse(localStorage.getItem("p2p-discovered-peers") || "{}")
      const now = Date.now()
      const maxAge = 30000 // 30 seconds

      let hasChanges = false
      Object.entries(storedPeers).forEach(([peerId, peerData]: [string, any]) => {
        if (now - peerData.lastSeen > maxAge) {
          delete storedPeers[peerId]
          this.peers.delete(peerId)
          this.notifyPeerStatus(peerId, false)
          hasChanges = true
          console.log("[v0] Removed old peer:", peerId)
        }
      })

      if (hasChanges) {
        localStorage.setItem("p2p-discovered-peers", JSON.stringify(storedPeers))
      }
    } catch (error) {
      console.error("Error cleaning up old peers:", error)
    }
  }

  private async createPeerConnection(peerId: string): Promise<RTCPeerConnection> {
    const configuration: RTCConfiguration = {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
    }

    const peerConnection = new RTCPeerConnection(configuration)

    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state for ${peerId}:`, peerConnection.iceConnectionState)

      if (peerConnection.iceConnectionState === "connected" || peerConnection.iceConnectionState === "completed") {
        this.notifyPeerStatus(peerId, true)
      } else if (
        peerConnection.iceConnectionState === "disconnected" ||
        peerConnection.iceConnectionState === "failed"
      ) {
        this.notifyPeerStatus(peerId, false)
        this.peers.delete(peerId)
      }
    }

    return peerConnection
  }

  private async handleIncomingMessage(message: NetworkMessage): Promise<void> {
    try {
      if (message.senderId === this.currentUser?.id) return

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

    console.log("[v0] Sending direct message:", message)

    this.storeGlobalMessage(message)

    this.broadcastCrossTabMessage({
      type: "network_message",
      message,
      targetRecipient: recipientId,
    })
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

    this.broadcastCrossTabMessage({
      type: "network_message",
      message,
    })
  }

  private storeGlobalMessage(message: NetworkMessage): void {
    if (typeof window === "undefined") return

    try {
      const globalMessages = JSON.parse(localStorage.getItem(this.GLOBAL_MESSAGES_KEY) || "[]")

      const messageData = {
        id: `${message.senderId}-${message.timestamp}`,
        message,
        recipientId: message.recipientId,
        senderId: message.senderId,
        timestamp: message.timestamp,
        stored: Date.now(),
      }

      globalMessages.push(messageData)

      const fiveMinutesAgo = Date.now() - 300000
      const recentMessages = globalMessages.filter((m: any) => m.stored > fiveMinutesAgo)

      localStorage.setItem(this.GLOBAL_MESSAGES_KEY, JSON.stringify(recentMessages))
      console.log("[v0] Stored global message for delivery:", messageData.id)
    } catch (error) {
      console.error("[v0] Error storing global message:", error)
    }
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

    this.storeGlobalPresence(userData)

    this.broadcastCrossTabMessage({
      type: "peer_announcement",
      userId: this.currentUser.id,
      userData,
    })

    const message: NetworkMessage = {
      type: "user_status",
      senderId: this.currentUser.id,
      content: JSON.stringify(userData),
      timestamp: Date.now(),
    }

    console.log("[v0] Announced presence for:", this.currentUser.username, "Peers:", this.peers.size)
  }

  private storeGlobalPresence(userData: any): void {
    if (typeof window === "undefined" || !this.currentUser) return

    try {
      const globalPeers = JSON.parse(localStorage.getItem(this.GLOBAL_PEERS_KEY) || "{}")

      globalPeers[this.currentUser.id] = {
        ...userData,
        lastSeen: Date.now(),
      }

      const now = Date.now()
      const maxAge = 30000
      Object.keys(globalPeers).forEach((peerId) => {
        if (now - globalPeers[peerId].lastSeen > maxAge) {
          delete globalPeers[peerId]
        }
      })

      localStorage.setItem(this.GLOBAL_PEERS_KEY, JSON.stringify(globalPeers))
      console.log("[v0] Stored global presence for:", this.currentUser.username)
    } catch (error) {
      console.error("[v0] Error storing global presence:", error)
    }
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
    return {
      isConnected: this.isInitialized && this.isNetworkOnline,
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
      peer.connection.close()
    })
    this.peers.clear()

    if (this.signalingServer) {
      this.signalingServer.close()
      this.signalingServer = null
    }

    this.isInitialized = false
  }

  private broadcastCrossTabMessage(data: any): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(data)
    } else {
      localStorage.setItem("p2p-chat-messages", JSON.stringify(data))
      setTimeout(() => {
        localStorage.removeItem("p2p-chat-messages")
      }, 100)
    }
  }
}
