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
  private readonly SIGNALING_SERVERS = [
    "wss://ws.postman-echo.com/raw",
    "wss://echo.websocket.org",
    "wss://ws.ifelse.io",
  ]
  private currentServerIndex = 0
  private reconnectAttempts = 0
  private maxReconnectAttempts = 3
  private globalStorageKey = "p2p-global-network"
  private messageQueueKey = "p2p-message-queue"

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
    console.log(`[v0] Initializing P2P network for user: ${user.username}`)

    try {
      await this.connectToSignalingServer()
      this.setupCrossTabCommunication()
      this.setupPeerDiscovery()
      this.setupGlobalStorage()

      this.isInitialized = true
      console.log("[v0] P2P network initialized successfully")

      await this.announcePresence()
      this.processQueuedMessages()

      const status = this.getConnectionStatus()
      console.log("[v0] Network status after initialization:", status)
    } catch (error) {
      console.error("Failed to initialize P2P network:", error)
      this.setupFallbackCommunication()
      this.isInitialized = true
    }
  }

  private async connectToSignalingServer(): Promise<void> {
    if (!this.isNetworkOnline || typeof window === "undefined") return

    for (let i = 0; i < this.SIGNALING_SERVERS.length; i++) {
      const serverUrl = this.SIGNALING_SERVERS[this.currentServerIndex]

      try {
        console.log(`[v0] Connecting to signaling server: ${serverUrl}`)
        this.signalingServer = new WebSocket(serverUrl)

        await new Promise((resolve, reject) => {
          if (!this.signalingServer) return reject(new Error("WebSocket not created"))

          const timeout = setTimeout(() => reject(new Error("Connection timeout")), 3000)

          this.signalingServer.onopen = () => {
            clearTimeout(timeout)
            console.log(`[v0] Connected to signaling server: ${serverUrl}`)
            this.reconnectAttempts = 0
            this.setupSignalingHandlers()
            resolve(void 0)
          }

          this.signalingServer.onerror = () => {
            clearTimeout(timeout)
            reject(new Error("WebSocket connection failed"))
          }
        })

        if (this.currentUser) {
          await this.announcePresence()
        }
        return
      } catch (error) {
        console.error(`[v0] Failed to connect to ${serverUrl}:`, error)
        this.signalingServer = null

        this.currentServerIndex = (this.currentServerIndex + 1) % this.SIGNALING_SERVERS.length

        if (i === this.SIGNALING_SERVERS.length - 1) {
          throw new Error("All signaling servers failed")
        }
      }
    }
  }

  private setupSignalingHandlers(): void {
    if (!this.signalingServer) return

    this.signalingServer.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log("[v0] Received signaling message:", data)
        this.handleSignalingMessage(data)
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

  private handleSignalingMessage(data: any): void {
    if (!this.currentUser) return

    switch (data.type) {
      case "peer_announcement":
        if (data.userId !== this.currentUser.id) {
          console.log("[v0] Discovered peer via signaling:", data.userId, data.userData?.username)
          this.handlePeerDiscovery(data.userId, data.userData)
        }
        break

      case "direct_message":
        if (data.recipientId === this.currentUser.id && data.senderId !== this.currentUser.id) {
          console.log("[v0] Received direct message via signaling:", data)
          this.handleIncomingMessage(data)
        }
        break

      case "peer_list":
        console.log("[v0] Received peer list:", data.peers)
        data.peers?.forEach((peer: any) => {
          if (peer.userId !== this.currentUser?.id) {
            this.handlePeerDiscovery(peer.userId, peer.userData)
          }
        })
        break
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("[v0] Max reconnection attempts reached, using global storage only")
      this.setupFallbackCommunication()
      return
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000)
    this.reconnectAttempts++

    console.log(`[v0] Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`)
    setTimeout(() => {
      if (this.isNetworkOnline && this.isInitialized) {
        this.currentServerIndex = (this.currentServerIndex + 1) % this.SIGNALING_SERVERS.length
        this.connectToSignalingServer().catch(() => {
          this.scheduleReconnect()
        })
      }
    }, delay)
  }

  private setupGlobalStorage(): void {
    if (typeof window === "undefined") return

    this.storeGlobalPresence()

    setInterval(() => {
      this.checkGlobalMessages()
    }, 2000)

    setInterval(() => {
      this.cleanupGlobalStorage()
    }, 10000)
  }

  private storeGlobalPresence(): void {
    if (!this.currentUser || typeof window === "undefined") return

    try {
      const globalData = JSON.parse(localStorage.getItem(this.globalStorageKey) || "{}")
      const now = Date.now()

      globalData.users = globalData.users || {}
      globalData.users[this.currentUser.id] = {
        username: this.currentUser.username,
        publicKey: this.currentUser.publicKey,
        lastSeen: now,
        isOnline: true,
      }

      localStorage.setItem(this.globalStorageKey, JSON.stringify(globalData))
      console.log("[v0] Stored global presence for:", this.currentUser.username)
    } catch (error) {
      console.error("[v0] Error storing global presence:", error)
    }
  }

  private checkGlobalMessages(): void {
    if (!this.currentUser || typeof window === "undefined") return

    try {
      const messageQueue = JSON.parse(localStorage.getItem(this.messageQueueKey) || "[]")
      const myMessages = messageQueue.filter(
        (msg: any) =>
          msg.recipientId === this.currentUser?.id && msg.senderId !== this.currentUser?.id && !msg.processed,
      )

      myMessages.forEach((message: any) => {
        console.log("[v0] Processing queued message:", message)
        this.handleIncomingMessage(message)
        message.processed = true
      })

      if (myMessages.length > 0) {
        localStorage.setItem(this.messageQueueKey, JSON.stringify(messageQueue))
      }
    } catch (error) {
      console.error("[v0] Error checking global messages:", error)
    }
  }

  private cleanupGlobalStorage(): void {
    if (typeof window === "undefined") return

    try {
      const now = Date.now()
      const maxAge = 60000

      const globalData = JSON.parse(localStorage.getItem(this.globalStorageKey) || "{}")
      if (globalData.users) {
        Object.keys(globalData.users).forEach((userId) => {
          if (now - globalData.users[userId].lastSeen > maxAge) {
            delete globalData.users[userId]
            this.peers.delete(userId)
            this.notifyPeerStatus(userId, false)
          }
        })
        localStorage.setItem(this.globalStorageKey, JSON.stringify(globalData))
      }

      const messageQueue = JSON.parse(localStorage.getItem(this.messageQueueKey) || "[]")
      const cleanQueue = messageQueue.filter((msg: any) => now - msg.timestamp < maxAge || !msg.processed)
      localStorage.setItem(this.messageQueueKey, JSON.stringify(cleanQueue))
    } catch (error) {
      console.error("[v0] Error cleaning up global storage:", error)
    }
  }

  private processQueuedMessages(): void {
    this.checkGlobalMessages()

    try {
      const globalData = JSON.parse(localStorage.getItem(this.globalStorageKey) || "{}")
      if (globalData.users) {
        Object.entries(globalData.users).forEach(([userId, userData]: [string, any]) => {
          if (userId !== this.currentUser?.id) {
            this.handlePeerDiscovery(userId, userData)
          }
        })
      }
    } catch (error) {
      console.error("[v0] Error processing queued messages:", error)
    }
  }

  private setupFallbackCommunication(): void {
    console.log("[v0] Setting up fallback global storage communication")
    this.setupCrossTabCommunication()
    this.setupGlobalStorage()
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
        return
      }

      if (data.message.senderId === this.currentUser?.id) {
        return
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
        connection: new RTCPeerConnection(),
        isConnected: true,
      }

      this.peers.set(peerId, mockPeer)
      this.notifyPeerStatus(peerId, true)
      console.log("[v0] Added peer:", peerId, userData?.username, "Total peers:", this.peers.size)

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

  private setupPeerDiscovery(): void {
    this.loadStoredPeers()

    setInterval(() => {
      if (this.isInitialized && this.currentUser) {
        this.announcePresence()
        this.storeGlobalPresence()
      }
    }, 5000)

    setInterval(() => {
      this.cleanupOldPeers()
    }, 10000)
  }

  private loadStoredPeers(): void {
    if (typeof window === "undefined") return

    try {
      const storedPeers = JSON.parse(localStorage.getItem("p2p-discovered-peers") || "{}")
      const now = Date.now()
      const maxAge = 30000

      Object.entries(storedPeers).forEach(([peerId, peerData]: [string, any]) => {
        if (now - peerData.lastSeen < maxAge && peerId !== this.currentUser?.id) {
          this.handlePeerDiscovery(peerId, peerData)
        }
      })
    } catch (error) {
      console.error("Error loading stored peers:", error)
    }
  }

  private cleanupOldPeers(): void {
    if (typeof window === "undefined") return

    try {
      const storedPeers = JSON.parse(localStorage.getItem("p2p-discovered-peers") || "{}")
      const now = Date.now()
      const maxAge = 30000

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

    console.log("[v0] Sending direct message:", message)

    if (this.signalingServer && this.signalingServer.readyState === WebSocket.OPEN) {
      try {
        this.signalingServer.send(JSON.stringify(message))
        console.log("[v0] Message sent via signaling server")
      } catch (error) {
        console.error("[v0] Failed to send via signaling server:", error)
      }
    }

    try {
      const messageQueue = JSON.parse(localStorage.getItem(this.messageQueueKey) || "[]")
      messageQueue.push({
        ...message,
        processed: false,
      })
      localStorage.setItem(this.messageQueueKey, JSON.stringify(messageQueue))
      console.log("[v0] Message queued in global storage")
    } catch (error) {
      console.error("[v0] Failed to queue message:", error)
    }

    this.broadcastCrossTabMessage({
      type: "network_message",
      message,
      targetRecipient: recipientId,
    })

    console.log("[v0] Message sent over network")
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

    if (this.signalingServer && this.signalingServer.readyState === WebSocket.OPEN) {
      try {
        this.signalingServer.send(JSON.stringify(message))
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
      type: "peer_announcement",
      userId: this.currentUser.id,
      userData,
    }

    if (this.signalingServer && this.signalingServer.readyState === WebSocket.OPEN) {
      try {
        this.signalingServer.send(JSON.stringify(announcement))
        console.log("[v0] Announced presence via signaling server")
      } catch (error) {
        console.error("[v0] Failed to announce presence via signaling server:", error)
      }
    }

    this.broadcastCrossTabMessage(announcement)

    console.log("[v0] Announced presence for:", this.currentUser.username, "Peers:", this.peers.size)
  }

  async updateStatus(isOnline: boolean): Promise<void> {
    if (!this.currentUser) return

    this.currentUser.isOnline = isOnline
    this.currentUser.lastSeen = new Date()

    if (isOnline) {
      await this.announcePresence()
      this.storeGlobalPresence()
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
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "p2p-chat-messages",
          newValue: JSON.stringify(data),
          url: window.location.href,
        }),
      )
      setTimeout(() => {
        localStorage.removeItem("p2p-chat-messages")
      }, 100)
    }
  }
}
