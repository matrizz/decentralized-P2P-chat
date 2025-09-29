import { CryptoManager } from "./crypto"

export interface SecuritySettings {
  enableEphemeralMessages: boolean
  defaultMessageTTL: number // Time to live in milliseconds
  requireMessageSigning: boolean
  enableForwardSecrecy: boolean
  maxMessageAge: number // Maximum age for accepting messages
}

export class SecurityManager {
  private static instance: SecurityManager
  private crypto: CryptoManager
  private settings: SecuritySettings

  private constructor() {
    this.crypto = CryptoManager.getInstance()
    this.settings = {
      enableEphemeralMessages: false,
      defaultMessageTTL: 24 * 60 * 60 * 1000, // 24 hours
      requireMessageSigning: true,
      enableForwardSecrecy: false,
      maxMessageAge: 5 * 60 * 1000, // 5 minutes
    }
  }

  static getInstance(): SecurityManager {
    if (!SecurityManager.instance) {
      SecurityManager.instance = new SecurityManager()
    }
    return SecurityManager.instance
  }

  updateSettings(newSettings: Partial<SecuritySettings>): void {
    this.settings = { ...this.settings, ...newSettings }
  }

  getSettings(): SecuritySettings {
    return { ...this.settings }
  }

  // Validate message timestamp to prevent replay attacks
  isMessageTimestampValid(timestamp: number): boolean {
    const now = Date.now()
    const messageAge = now - timestamp

    // Reject messages that are too old or from the future
    return messageAge >= 0 && messageAge <= this.settings.maxMessageAge
  }

  // Generate secure message ID
  generateMessageId(senderId: string, timestamp: number, content: string): string {
    return this.crypto.generateMessageHash(content, timestamp, senderId)
  }

  // Check if message should be ephemeral
  shouldMessageBeEphemeral(messageType: string): boolean {
    return this.settings.enableEphemeralMessages && messageType === "text"
  }

  // Calculate expiration time for ephemeral messages
  getMessageExpirationTime(): number {
    return Date.now() + this.settings.defaultMessageTTL
  }

  // Validate message signature if required
  validateMessageSignature(message: string, signature: string, senderPublicKey: string): boolean {
    if (!this.settings.requireMessageSigning) {
      return true
    }

    return this.crypto.verifySignature(message, signature, senderPublicKey)
  }

  // Generate QR code data for identity verification
  generateIdentityVerificationCode(publicKey: string, username: string): string {
    const verificationData = {
      publicKey,
      username,
      timestamp: Date.now(),
      version: "1.0",
    }

    return JSON.stringify(verificationData)
  }

  // Verify identity from QR code data
  verifyIdentityCode(codeData: string): { isValid: boolean; publicKey?: string; username?: string } {
    try {
      const data = JSON.parse(codeData)

      // Basic validation
      if (!data.publicKey || !data.username || !data.timestamp) {
        return { isValid: false }
      }

      // Check if code is not too old (24 hours)
      const codeAge = Date.now() - data.timestamp
      if (codeAge > 24 * 60 * 60 * 1000) {
        return { isValid: false }
      }

      return {
        isValid: true,
        publicKey: data.publicKey,
        username: data.username,
      }
    } catch {
      return { isValid: false }
    }
  }

  // Generate secure session token for temporary operations
  generateSessionToken(): string {
    return this.crypto.generateSecureId()
  }

  // Validate password strength
  validatePasswordStrength(password: string): { isStrong: boolean; issues: string[] } {
    const issues: string[] = []

    if (password.length < 12) {
      issues.push("Password must be at least 12 characters long")
    }

    if (!/[A-Z]/.test(password)) {
      issues.push("Password must contain at least one uppercase letter")
    }

    if (!/[a-z]/.test(password)) {
      issues.push("Password must contain at least one lowercase letter")
    }

    if (!/\d/.test(password)) {
      issues.push("Password must contain at least one number")
    }

    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      issues.push("Password must contain at least one special character")
    }

    return {
      isStrong: issues.length === 0,
      issues,
    }
  }

  // Generate secure backup with encryption
  async generateSecureBackup(data: any, password: string): Promise<{ backup: string; checksum: string }> {
    const { encryptedData, salt } = this.crypto.encryptBackupData(data, password)

    const backupData = {
      version: "1.0",
      timestamp: Date.now(),
      encryptedData,
      salt,
    }

    const backup = JSON.stringify(backupData)
    const checksum = this.crypto.generateMessageHash(backup, Date.now(), "backup")

    return { backup, checksum }
  }

  // Restore from secure backup
  async restoreFromSecureBackup(backup: string, password: string, expectedChecksum: string): Promise<any> {
    // Verify checksum
    const actualChecksum = this.crypto.generateMessageHash(backup, Date.now(), "backup")
    if (actualChecksum !== expectedChecksum) {
      throw new Error("Backup integrity check failed")
    }

    const backupData = JSON.parse(backup)

    if (backupData.version !== "1.0") {
      throw new Error("Unsupported backup version")
    }

    return this.crypto.decryptBackupData(backupData.encryptedData, password, backupData.salt)
  }

  // Clean up expired ephemeral messages
  cleanupExpiredMessages(messages: any[]): any[] {
    const now = Date.now()
    return messages.filter((message) => {
      if (message.isEphemeral && message.expiresAt) {
        return now < message.expiresAt
      }
      return true
    })
  }
}
