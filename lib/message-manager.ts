import { P2PNetworkManager, type NetworkMessage } from "./p2p-network"
import { CryptoManager } from "./crypto"
import { StorageManager } from "./storage"
import type { Message, User } from "./types"

export class MessageManager {
  private static instance: MessageManager
  private network: P2PNetworkManager
  private crypto: CryptoManager
  private storage: StorageManager
  private currentUser: User | null = null
  private messageListeners: ((message: Message) => void)[] = []

  private constructor() {
    this.network = P2PNetworkManager.getInstance()
    this.crypto = CryptoManager.getInstance()
    this.storage = StorageManager.getInstance()
  }

  static getInstance(): MessageManager {
    if (!MessageManager.instance) {
      MessageManager.instance = new MessageManager()
    }
    return MessageManager.instance
  }

  async initialize(user: User): Promise<void> {
    this.currentUser = user

    // Initialize network
    await this.network.initialize(user)

    // Set up message handler
    this.network.onMessage(this.handleNetworkMessage.bind(this))
  }

  private async handleNetworkMessage(networkMessage: NetworkMessage): Promise<void> {
    try {
      console.log("[v0] Handling network message:", networkMessage)
      console.log("[v0] Current user ID:", this.currentUser?.id)
      console.log("[v0] Message recipient ID:", networkMessage.recipientId)

      let decryptedContent: string
      let message: Message

      if (networkMessage.type === "direct_message") {
        console.log("[v0] Processing direct message from:", networkMessage.senderId)

        if (networkMessage.recipientId !== this.currentUser?.id) {
          console.log("[v0] Message not for current user, ignoring")
          return
        }

        // Decrypt direct message
        const contact = await this.storage.getContact(networkMessage.senderId)
        if (!contact) {
          console.warn("[v0] Received message from unknown contact:", networkMessage.senderId)
          console.log("[v0] Available contacts:", await this.storage.getAllContacts())
          return
        }

        const keyPair = await this.storage.getKeyPair()
        if (!keyPair) {
          console.error("[v0] No key pair found for decryption")
          return
        }

        try {
          decryptedContent = this.crypto.decryptDirectMessage(
            networkMessage.content,
            contact.publicKey,
            keyPair.privateKey,
          )
          console.log("[v0] Successfully decrypted message:", decryptedContent)
        } catch (error) {
          console.error("[v0] Failed to decrypt direct message:", error)
          return
        }

        message = {
          id: `${networkMessage.senderId}-${networkMessage.timestamp}`,
          senderId: networkMessage.senderId,
          recipientId: this.currentUser?.id,
          content: decryptedContent,
          timestamp: new Date(networkMessage.timestamp),
          isEncrypted: true,
          messageType: "text",
        }
      } else if (networkMessage.type === "group_message") {
        console.log("[v0] Processing group message from:", networkMessage.senderId)

        // Decrypt group message
        const group = await this.storage.getGroup(networkMessage.groupId!)
        if (!group) {
          console.warn("[v0] Received message for unknown group:", networkMessage.groupId)
          return
        }

        try {
          decryptedContent = this.crypto.decryptGroupMessage(networkMessage.content, group.symmetricKey)
          console.log("[v0] Successfully decrypted group message:", decryptedContent)
        } catch (error) {
          console.error("[v0] Failed to decrypt group message:", error)
          return
        }

        message = {
          id: `${networkMessage.senderId}-${networkMessage.timestamp}`,
          senderId: networkMessage.senderId,
          groupId: networkMessage.groupId,
          content: decryptedContent,
          timestamp: new Date(networkMessage.timestamp),
          isEncrypted: true,
          messageType: "text",
        }
      } else if (networkMessage.type === "user_status") {
        console.log("[v0] Processing user status update from:", networkMessage.senderId)
        // Handle user status updates
        const statusData = JSON.parse(networkMessage.content)
        await this.handleUserStatusUpdate(networkMessage.senderId, statusData)
        return
      } else {
        console.log("[v0] Unknown message type:", networkMessage.type)
        return
      }

      // Save message to local storage
      await this.storage.saveMessage(message)
      console.log("[v0] Saved message to storage:", message.id)

      // Notify listeners
      console.log("[v0] Notifying", this.messageListeners.length, "message listeners")
      this.messageListeners.forEach((listener) => listener(message))
      console.log("[v0] Notified message listeners")
    } catch (error) {
      console.error("[v0] Error handling network message:", error)
    }
  }

  private async handleUserStatusUpdate(userId: string, statusData: any): Promise<void> {
    // Update contact status if they exist
    const contact = await this.storage.getContact(userId)
    if (contact) {
      contact.isOnline = statusData.isOnline
      contact.lastSeen = new Date()
      await this.storage.saveContact(contact)
    }
  }

  async sendDirectMessage(recipientId: string, content: string): Promise<Message> {
    if (!this.currentUser) {
      throw new Error("User not initialized")
    }

    console.log("[v0] Sending direct message to:", recipientId, "content:", content)
    console.log("[v0] Current user:", this.currentUser.id)

    // Get recipient's public key
    const contact = await this.storage.getContact(recipientId)
    if (!contact) {
      console.error("[v0] Contact not found:", recipientId)
      console.log("[v0] Available contacts:", await this.storage.getAllContacts())
      throw new Error("Contact not found")
    }

    // Get sender's private key
    const keyPair = await this.storage.getKeyPair()
    if (!keyPair) {
      console.error("[v0] Key pair not found")
      throw new Error("Key pair not found")
    }

    // Encrypt message
    const encryptedContent = this.crypto.encryptDirectMessage(content, contact.publicKey, keyPair.privateKey)
    console.log("[v0] Message encrypted successfully")

    // Create message object
    const message: Message = {
      id: `${this.currentUser.id}-${Date.now()}`,
      senderId: this.currentUser.id,
      recipientId,
      content,
      timestamp: new Date(),
      isEncrypted: true,
      messageType: "text",
    }

    // Save to local storage
    await this.storage.saveMessage(message)
    console.log("[v0] Message saved to local storage:", message.id)

    // Send over network
    await this.network.sendDirectMessage(recipientId, encryptedContent)
    console.log("[v0] Message sent over network")

    const networkStatus = this.network.getConnectionStatus()
    console.log("[v0] Network status after sending:", networkStatus)

    return message
  }

  async sendGroupMessage(groupId: string, content: string): Promise<Message> {
    if (!this.currentUser) {
      throw new Error("User not initialized")
    }

    // Get group
    const group = await this.storage.getGroup(groupId)
    if (!group) {
      throw new Error("Group not found")
    }

    // Encrypt message
    const encryptedContent = this.crypto.encryptGroupMessage(content, group.symmetricKey)

    // Create message object
    const message: Message = {
      id: `${this.currentUser.id}-${Date.now()}`,
      senderId: this.currentUser.id,
      groupId,
      content,
      timestamp: new Date(),
      isEncrypted: true,
      messageType: "text",
    }

    // Save to local storage
    await this.storage.saveMessage(message)

    // Send over network
    await this.network.sendGroupMessage(groupId, encryptedContent)

    return message
  }

  async getMessagesForChat(chatId: string): Promise<Message[]> {
    return await this.storage.getMessagesForChat(chatId)
  }

  onMessage(listener: (message: Message) => void): void {
    this.messageListeners.push(listener)
  }

  removeMessageListener(listener: (message: Message) => void): void {
    const index = this.messageListeners.indexOf(listener)
    if (index > -1) {
      this.messageListeners.splice(index, 1)
    }
  }

  getNetworkStatus(): { isConnected: boolean; peerCount: number } {
    return this.network.getConnectionStatus()
  }

  async shutdown(): Promise<void> {
    await this.network.shutdown()
  }
}
