import { createLibp2p, type Libp2p } from "libp2p"
import { webRTC } from "@libp2p/webrtc"
import { noise } from "@chainsafe/libp2p-noise"
import { mplex } from "@libp2p/mplex"
import { gossipsub } from "@chainsafe/libp2p-gossipsub"
import { bootstrap } from "@libp2p/bootstrap"
import type { User } from "./types"

export interface NetworkMessage {
  type: "direct_message" | "group_message" | "user_status" | "peer_discovery"
  senderId: string
  recipientId?: string
  groupId?: string
  content: string
  timestamp: number
  signature?: string
}

export interface PeerInfo {
  id: string
  username: string
  publicKey: string
  isOnline: boolean
  lastSeen: number
}

export class P2PNetworkManager {
  private static instance: P2PNetworkManager
  private currentUser: User | null = null
  private libp2pNode: Libp2p | null = null
  private messageHandlers: ((message: NetworkMessage) => void)[] = []
  private peerStatusHandlers: ((peerId: string, isOnline: boolean) => void)[] = []
  private isInitialized = false
  private discoveredPeers: Map<string, PeerInfo> = new Map()
  private readonly PROTOCOL_ID = "/securechat/1.0.0"
  private readonly PUBSUB_TOPIC_DISCOVERY = "securechat:discovery"
  private readonly PUBSUB_TOPIC_PREFIX = "securechat:group:"
  private heartbeatInterval: NodeJS.Timeout | null = null

  private constructor() {
    console.log("[v0] P2PNetworkManager constructed")
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
    console.log(`[v0] Initializing libp2p P2P network for user: ${user.username}`)

    try {
      this.libp2pNode = await createLibp2p({
        addresses: {
          listen: ["/webrtc"],
        },
        transports: [
          webRTC({
            rtcConfiguration: {
              iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
                { urls: "stun:stun2.l.google.com:19302" },
                { urls: "stun:stun.stunprotocol.org:3478" },
                { urls: "stun:stun.services.mozilla.com" },
              ],
            },
          }),
        ],
        connectionEncryption: [noise()],
        streamMuxers: [mplex()],
        peerDiscovery: [
          bootstrap({
            list: [
              // Public libp2p bootstrap nodes
              "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
              "/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa",
            ],
          }),
        ],
        services: {
          pubsub: gossipsub({
            allowPublishToZeroPeers: true,
            emitSelf: false,
          }),
        },
      })

      this.setupLibp2pHandlers()

      // Start the node
      await this.libp2pNode.start()
      console.log("[v0] libp2p node started with peer ID:", this.libp2pNode.peerId.toString())

      await this.libp2pNode.services.pubsub.subscribe(this.PUBSUB_TOPIC_DISCOVERY)

      // Announce presence
      await this.announcePresence()

      // Start heartbeat
      this.startHeartbeat()

      this.isInitialized = true
      console.log("[v0] libp2p P2P network initialized successfully")

      const status = this.getConnectionStatus()
      console.log("[v0] Network status after initialization:", status)
    } catch (error) {
      console.error("[v0] Failed to initialize libp2p P2P network:", error)
      throw error
    }
  }

  private setupLibp2pHandlers(): void {
    if (!this.libp2pNode) return

    this.libp2pNode.addEventListener("peer:connect", (event) => {
      const peerId = event.detail.toString()
      console.log("[v0] Peer connected:", peerId)
      this.notifyPeerStatus(peerId, true)
    })

    this.libp2pNode.addEventListener("peer:disconnect", (event) => {
      const peerId = event.detail.toString()
      console.log("[v0] Peer disconnected:", peerId)
      this.notifyPeerStatus(peerId, false)
      this.discoveredPeers.delete(peerId)
    })

    this.libp2pNode.services.pubsub.addEventListener("message", (event) => {
      this.handlePubSubMessage(event.detail)
    })

    this.libp2pNode.addEventListener("peer:discovery", (event) => {
      const peerId = event.detail.id.toString()
      console.log("[v0] Peer discovered:", peerId)
    })
  }

  private async handlePubSubMessage(event: any): Promise<void> {
    try {
      const topic = event.topic
      const data = new TextDecoder().decode(event.data)
      const message = JSON.parse(data)

      console.log("[v0] Received pubsub message on topic:", topic, message)

      // Ignore own messages
      if (message.senderId === this.currentUser?.id) {
        return
      }

      if (topic === this.PUBSUB_TOPIC_DISCOVERY) {
        if (message.type === "peer_announcement") {
          this.discoveredPeers.set(message.senderId, {
            id: message.senderId,
            username: message.username,
            publicKey: message.publicKey,
            isOnline: true,
            lastSeen: message.timestamp,
          })
          console.log("[v0] Discovered peer:", message.username, "Total peers:", this.discoveredPeers.size)
          this.notifyPeerStatus(message.senderId, true)
        }
      } else if (topic.startsWith(this.PUBSUB_TOPIC_PREFIX)) {
        if (message.type === "group_message") {
          this.handleIncomingMessage(message)
        }
      }
    } catch (error) {
      console.error("[v0] Error handling pubsub message:", error)
    }
  }

  private async handleIncomingMessage(message: NetworkMessage): Promise<void> {
    try {
      if (message.senderId === this.currentUser?.id) return

      console.log("[v0] Processing incoming message:", message.type, "from:", message.senderId)
      this.messageHandlers.forEach((handler) => handler(message))
    } catch (error) {
      console.error("[v0] Error handling incoming message:", error)
    }
  }

  private notifyPeerStatus(peerId: string, isOnline: boolean): void {
    this.peerStatusHandlers.forEach((handler) => handler(peerId, isOnline))
  }

  async sendDirectMessage(recipientId: string, content: string, signature?: string): Promise<void> {
    if (!this.currentUser || !this.libp2pNode) {
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

    console.log("[v0] Sending direct message to:", recipientId)

    const directTopic = `securechat:direct:${recipientId}`

    try {
      // Subscribe to the topic if not already subscribed
      const topics = this.libp2pNode.services.pubsub.getTopics()
      if (!topics.includes(directTopic)) {
        await this.libp2pNode.services.pubsub.subscribe(directTopic)
      }

      // Publish the message
      const messageData = new TextEncoder().encode(JSON.stringify(message))
      await this.libp2pNode.services.pubsub.publish(directTopic, messageData)

      console.log("[v0] Direct message sent successfully")
    } catch (error) {
      console.error("[v0] Failed to send direct message:", error)
      throw error
    }
  }

  async sendGroupMessage(groupId: string, content: string, signature?: string): Promise<void> {
    if (!this.currentUser || !this.libp2pNode) {
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

    console.log("[v0] Sending group message to group:", groupId)

    const groupTopic = `${this.PUBSUB_TOPIC_PREFIX}${groupId}`

    try {
      const messageData = new TextEncoder().encode(JSON.stringify(message))
      await this.libp2pNode.services.pubsub.publish(groupTopic, messageData)

      console.log("[v0] Group message sent successfully")
    } catch (error) {
      console.error("[v0] Failed to send group message:", error)
      throw error
    }
  }

  async joinGroup(groupId: string): Promise<void> {
    if (!this.libp2pNode) {
      throw new Error("Network not initialized")
    }

    const groupTopic = `${this.PUBSUB_TOPIC_PREFIX}${groupId}`

    try {
      await this.libp2pNode.services.pubsub.subscribe(groupTopic)
      console.log("[v0] Joined group:", groupId)
    } catch (error) {
      console.error("[v0] Failed to join group:", error)
      throw error
    }
  }

  async leaveGroup(groupId: string): Promise<void> {
    if (!this.libp2pNode) {
      throw new Error("Network not initialized")
    }

    const groupTopic = `${this.PUBSUB_TOPIC_PREFIX}${groupId}`

    try {
      this.libp2pNode.services.pubsub.unsubscribe(groupTopic)
      console.log("[v0] Left group:", groupId)
    } catch (error) {
      console.error("[v0] Failed to leave group:", error)
      throw error
    }
  }

  private async announcePresence(): Promise<void> {
    if (!this.currentUser || !this.libp2pNode) return

    const announcement = {
      type: "peer_announcement",
      senderId: this.currentUser.id,
      username: this.currentUser.username,
      publicKey: this.currentUser.publicKey,
      timestamp: Date.now(),
    }

    try {
      const messageData = new TextEncoder().encode(JSON.stringify(announcement))
      await this.libp2pNode.services.pubsub.publish(this.PUBSUB_TOPIC_DISCOVERY, messageData)

      console.log(
        "[v0] Announced presence for:",
        this.currentUser.username,
        "Peers:",
        this.libp2pNode.getPeers().length,
      )
    } catch (error) {
      console.error("[v0] Failed to announce presence:", error)
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.announcePresence()
    }, 30000)
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
    if (!this.libp2pNode) return []
    return this.libp2pNode.getPeers().map((peer) => peer.toString())
  }

  getDiscoveredPeers(): PeerInfo[] {
    return Array.from(this.discoveredPeers.values())
  }

  getConnectionStatus(): { isConnected: boolean; peerCount: number } {
    const connectedPeers = this.getConnectedPeers()

    return {
      isConnected: this.isInitialized && this.libp2pNode !== null,
      peerCount: connectedPeers.length,
    }
  }

  async shutdown(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }

    if (this.libp2pNode) {
      await this.libp2pNode.stop()
      this.libp2pNode = null
    }

    this.discoveredPeers.clear()
    this.isInitialized = false
    console.log("[v0] P2P network shut down")
  }
}
