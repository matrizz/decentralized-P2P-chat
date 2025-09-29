import localforage from "localforage"
import type { User, Contact, Group, Message, KeyPair } from "./types"
import type LocalForage from "localforage"

export interface StorageStats {
  totalMessages: number
  totalContacts: number
  totalGroups: number
  storageSize: number
  lastBackup?: Date
}

export interface BackupData {
  version: string
  timestamp: Date
  user: User | null
  contacts: Contact[]
  groups: Group[]
  messages: Message[]
  keyPair: KeyPair | null
}

export class StorageManager {
  private static instance: StorageManager
  private userStore: LocalForage
  private contactStore: LocalForage
  private groupStore: LocalForage
  private messageStore: LocalForage
  private keyStore: LocalForage
  private metaStore: LocalForage

  private constructor() {
    this.userStore = localforage.createInstance({ name: "SecureChat", storeName: "users" })
    this.contactStore = localforage.createInstance({ name: "SecureChat", storeName: "contacts" })
    this.groupStore = localforage.createInstance({ name: "SecureChat", storeName: "groups" })
    this.messageStore = localforage.createInstance({ name: "SecureChat", storeName: "messages" })
    this.keyStore = localforage.createInstance({ name: "SecureChat", storeName: "keys" })
    this.metaStore = localforage.createInstance({ name: "SecureChat", storeName: "metadata" })
  }

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager()
    }
    return StorageManager.instance
  }

  // User management
  async saveCurrentUser(user: User): Promise<void> {
    try {
      await this.userStore.setItem("currentUser", user)
      await this.updateLastActivity()
    } catch (error) {
      console.error("Failed to save user:", error)
      throw new Error("Failed to save user data")
    }
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      return await this.userStore.getItem("currentUser")
    } catch (error) {
      console.error("Failed to get user:", error)
      return null
    }
  }

  // Key management
  async saveKeyPair(keyPair: KeyPair): Promise<void> {
    try {
      await this.keyStore.setItem("userKeys", keyPair)
    } catch (error) {
      console.error("Failed to save key pair:", error)
      throw new Error("Failed to save encryption keys")
    }
  }

  async getKeyPair(): Promise<KeyPair | null> {
    try {
      return await this.keyStore.getItem("userKeys")
    } catch (error) {
      console.error("Failed to get key pair:", error)
      return null
    }
  }

  // Contact management
  async saveContact(contact: Contact): Promise<void> {
    try {
      await this.contactStore.setItem(contact.id, contact)
      await this.updateLastActivity()
    } catch (error) {
      console.error("Failed to save contact:", error)
      throw new Error("Failed to save contact")
    }
  }

  async getContact(contactId: string): Promise<Contact | null> {
    try {
      return await this.contactStore.getItem(contactId)
    } catch (error) {
      console.error("Failed to get contact:", error)
      return null
    }
  }

  async getAllContacts(): Promise<Contact[]> {
    try {
      const contacts: Contact[] = []
      await this.contactStore.iterate((contact: Contact) => {
        contacts.push(contact)
      })
      return contacts
    } catch (error) {
      console.error("Failed to get contacts:", error)
      return []
    }
  }

  async removeContact(contactId: string): Promise<void> {
    try {
      await this.contactStore.removeItem(contactId)
      await this.updateLastActivity()
    } catch (error) {
      console.error("Failed to remove contact:", error)
      throw new Error("Failed to remove contact")
    }
  }

  // Group management
  async saveGroup(group: Group): Promise<void> {
    try {
      await this.groupStore.setItem(group.id, group)
      await this.updateLastActivity()
    } catch (error) {
      console.error("Failed to save group:", error)
      throw new Error("Failed to save group")
    }
  }

  async getGroup(groupId: string): Promise<Group | null> {
    try {
      return await this.groupStore.getItem(groupId)
    } catch (error) {
      console.error("Failed to get group:", error)
      return null
    }
  }

  async getAllGroups(): Promise<Group[]> {
    try {
      const groups: Group[] = []
      await this.groupStore.iterate((group: Group) => {
        groups.push(group)
      })
      return groups
    } catch (error) {
      console.error("Failed to get groups:", error)
      return []
    }
  }

  async removeGroup(groupId: string): Promise<void> {
    try {
      await this.groupStore.removeItem(groupId)
      const messages = await this.getAllMessages()
      const groupMessages = messages.filter((m) => m.groupId === groupId)
      await Promise.all(groupMessages.map((m) => this.messageStore.removeItem(m.id)))
      await this.updateLastActivity()
    } catch (error) {
      console.error("Failed to remove group:", error)
      throw new Error("Failed to remove group")
    }
  }

  // Message management
  async saveMessage(message: Message): Promise<void> {
    try {
      await this.messageStore.setItem(message.id, message)
      await this.updateLastActivity()
    } catch (error) {
      console.error("Failed to save message:", error)
      throw new Error("Failed to save message")
    }
  }

  async getMessage(messageId: string): Promise<Message | null> {
    try {
      return await this.messageStore.getItem(messageId)
    } catch (error) {
      console.error("Failed to get message:", error)
      return null
    }
  }

  async getMessagesForChat(chatId: string): Promise<Message[]> {
    try {
      const messages: Message[] = []
      await this.messageStore.iterate((message: Message) => {
        if (message.recipientId === chatId || message.groupId === chatId || message.senderId === chatId) {
          messages.push(message)
        }
      })
      return messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    } catch (error) {
      console.error("Failed to get messages for chat:", error)
      return []
    }
  }

  async getAllMessages(): Promise<Message[]> {
    try {
      const messages: Message[] = []
      await this.messageStore.iterate((message: Message) => {
        messages.push(message)
      })
      return messages
    } catch (error) {
      console.error("Failed to get all messages:", error)
      return []
    }
  }

  async cleanupOldMessages(daysToKeep = 30): Promise<number> {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

      const messages = await this.getAllMessages()
      const oldMessages = messages.filter((m) => m.timestamp < cutoffDate)

      await Promise.all(oldMessages.map((m) => this.messageStore.removeItem(m.id)))

      return oldMessages.length
    } catch (error) {
      console.error("Failed to cleanup old messages:", error)
      return 0
    }
  }

  async getStorageStats(): Promise<StorageStats> {
    try {
      const [messages, contacts, groups] = await Promise.all([
        this.getAllMessages(),
        this.getAllContacts(),
        this.getAllGroups(),
      ])

      const lastBackup = await this.metaStore.getItem<Date>("lastBackup")

      return {
        totalMessages: messages.length,
        totalContacts: contacts.length,
        totalGroups: groups.length,
        storageSize: await this.calculateStorageSize(),
        lastBackup: lastBackup || undefined,
      }
    } catch (error) {
      console.error("Failed to get storage stats:", error)
      return {
        totalMessages: 0,
        totalContacts: 0,
        totalGroups: 0,
        storageSize: 0,
      }
    }
  }

  private async calculateStorageSize(): Promise<number> {
    try {
      let totalSize = 0
      const stores = [
        this.userStore,
        this.contactStore,
        this.groupStore,
        this.messageStore,
        this.keyStore,
        this.metaStore,
      ]

      for (const store of stores) {
        await store.iterate((value) => {
          totalSize += JSON.stringify(value).length
        })
      }

      return totalSize
    } catch (error) {
      console.error("Failed to calculate storage size:", error)
      return 0
    }
  }

  async exportData(): Promise<BackupData> {
    try {
      const [user, contacts, groups, messages, keyPair] = await Promise.all([
        this.getCurrentUser(),
        this.getAllContacts(),
        this.getAllGroups(),
        this.getAllMessages(),
        this.getKeyPair(),
      ])

      const backupData: BackupData = {
        version: "1.0.0",
        timestamp: new Date(),
        user,
        contacts,
        groups,
        messages,
        keyPair,
      }

      await this.metaStore.setItem("lastBackup", new Date())
      return backupData
    } catch (error) {
      console.error("Failed to export data:", error)
      throw new Error("Failed to export data")
    }
  }

  async importData(backupData: BackupData): Promise<void> {
    try {
      // Validate backup data
      if (!backupData.version || !backupData.timestamp) {
        throw new Error("Invalid backup data format")
      }

      // Clear existing data
      await this.clearAllData()

      // Import data
      if (backupData.user) {
        await this.saveCurrentUser(backupData.user)
      }

      if (backupData.keyPair) {
        await this.saveKeyPair(backupData.keyPair)
      }

      // Import contacts
      for (const contact of backupData.contacts) {
        await this.saveContact(contact)
      }

      // Import groups
      for (const group of backupData.groups) {
        await this.saveGroup(group)
      }

      // Import messages
      for (const message of backupData.messages) {
        await this.saveMessage(message)
      }

      await this.metaStore.setItem("lastRestore", new Date())
    } catch (error) {
      console.error("Failed to import data:", error)
      throw new Error("Failed to import data")
    }
  }

  private async updateLastActivity(): Promise<void> {
    try {
      await this.metaStore.setItem("lastActivity", new Date())
    } catch (error) {
      console.error("Failed to update last activity:", error)
    }
  }

  async saveSetting(key: string, value: any): Promise<void> {
    try {
      await this.metaStore.setItem(`setting_${key}`, value)
    } catch (error) {
      console.error("Failed to save setting:", error)
      throw new Error("Failed to save setting")
    }
  }

  async getSetting<T>(key: string, defaultValue?: T): Promise<T | null> {
    try {
      const value = await this.metaStore.getItem<T>(`setting_${key}`)
      return value !== null ? value : defaultValue || null
    } catch (error) {
      console.error("Failed to get setting:", error)
      return defaultValue || null
    }
  }

  // Clear all data (for logout)
  async clearAllData(): Promise<void> {
    try {
      await Promise.all([
        this.userStore.clear(),
        this.contactStore.clear(),
        this.groupStore.clear(),
        this.messageStore.clear(),
        this.keyStore.clear(),
        this.metaStore.clear(),
      ])
    } catch (error) {
      console.error("Failed to clear all data:", error)
      throw new Error("Failed to clear data")
    }
  }

  async checkDataIntegrity(): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = []

    try {
      // Check if user exists
      const user = await this.getCurrentUser()
      if (!user) {
        errors.push("No user data found")
      }

      // Check if key pair exists
      const keyPair = await this.getKeyPair()
      if (!keyPair) {
        errors.push("No encryption keys found")
      }

      // Check contacts
      const contacts = await this.getAllContacts()
      for (const contact of contacts) {
        if (!contact.id || !contact.publicKey) {
          errors.push(`Invalid contact data: ${contact.username || "Unknown"}`)
        }
      }

      // Check messages
      const messages = await this.getAllMessages()
      for (const message of messages) {
        if (!message.id || !message.senderId || !message.content) {
          errors.push(`Invalid message data: ${message.id || "Unknown"}`)
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
      }
    } catch (error) {
      console.error("Failed to check data integrity:", error)
      return {
        isValid: false,
        errors: ["Failed to perform integrity check"],
      }
    }
  }
}
