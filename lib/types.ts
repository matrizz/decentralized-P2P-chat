export interface User {
  id: string // Public key derived ID
  publicKey: string
  signingPublicKey?: string // For message authentication
  username: string
  isOnline: boolean
  lastSeen: Date
}

export interface Contact extends User {
  isBlocked: boolean
  addedAt: Date
  isVerified?: boolean // Identity verification status
  verificationCode?: string // QR code for verification
}

export interface Message {
  id: string
  senderId: string
  recipientId?: string // For direct messages
  groupId?: string // For group messages
  content: string
  timestamp: Date
  isEncrypted: boolean
  messageType: "text" | "file" | "voice"
  isEphemeral?: boolean
  expiresAt?: Date
  signature?: string // Message signature for authenticity
  hash?: string // Message integrity hash
}

export interface Group {
  id: string
  name: string
  description?: string
  publicKey: string // Group's public identifier
  symmetricKey: string // Encrypted symmetric key for group messages
  members: string[] // Array of user IDs
  createdBy: string
  createdAt: Date
  isPrivate: boolean
  requiresInvite?: boolean
}

export interface KeyPair {
  publicKey: string
  privateKey: string
  signingPublicKey?: string
  signingPrivateKey?: string
  salt?: string // For password-based encryption
}

export interface ChatState {
  currentUser: User | null
  contacts: Contact[]
  groups: Group[]
  messages: Message[]
  activeChat: string | null // Contact ID or Group ID
  isConnected: boolean
}

export interface EncryptedBackup {
  version: string
  timestamp: number
  encryptedData: string
  salt: string
  checksum: string
}

export interface MessageVerification {
  isValid: boolean
  isExpired: boolean
  signature?: string
  hash?: string
}

export interface SecurityAlert {
  id: string
  type: "key_compromise" | "message_tampering" | "identity_verification" | "backup_restore"
  message: string
  timestamp: Date
  severity: "low" | "medium" | "high" | "critical"
}
