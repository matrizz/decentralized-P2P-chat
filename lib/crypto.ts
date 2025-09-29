import nacl from "tweetnacl"
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from "tweetnacl-util"

export class CryptoManager {
  private static instance: CryptoManager
  private isReady = false

  private constructor() {}

  static getInstance(): CryptoManager {
    if (!CryptoManager.instance) {
      CryptoManager.instance = new CryptoManager()
    }
    return CryptoManager.instance
  }

  async initialize(): Promise<void> {
    if (!this.isReady) {
      // tweetnacl doesn't require async initialization
      this.isReady = true
    }
  }

  generateKeyPair(): { publicKey: string; privateKey: string } {
    const keyPair = nacl.box.keyPair()
    return {
      publicKey: encodeBase64(keyPair.publicKey),
      privateKey: encodeBase64(keyPair.secretKey),
    }
  }

  generateSigningKeyPair(): { publicKey: string; privateKey: string } {
    const keyPair = nacl.sign.keyPair()
    return {
      publicKey: encodeBase64(keyPair.publicKey),
      privateKey: encodeBase64(keyPair.secretKey),
    }
  }

  generateUserId(publicKey: string): string {
    const hash = nacl.hash(decodeBase64(publicKey))
    return encodeBase64(hash)
  }

  encryptDirectMessage(message: string, recipientPublicKey: string, senderPrivateKey: string): string {
    const messageBytes = encodeUTF8(message)
    const nonce = nacl.randomBytes(nacl.box.nonceLength)
    const recipientPubKey = decodeBase64(recipientPublicKey)
    const senderPrivKey = decodeBase64(senderPrivateKey)

    const encrypted = nacl.box(messageBytes, nonce, recipientPubKey, senderPrivKey)

    // Combine nonce and encrypted data
    const combined = new Uint8Array(nonce.length + encrypted.length)
    combined.set(nonce)
    combined.set(encrypted, nonce.length)

    return encodeBase64(combined)
  }

  decryptDirectMessage(encryptedMessage: string, senderPublicKey: string, recipientPrivateKey: string): string {
    const combined = decodeBase64(encryptedMessage)
    const nonce = combined.slice(0, nacl.box.nonceLength)
    const encrypted = combined.slice(nacl.box.nonceLength)
    const senderPubKey = decodeBase64(senderPublicKey)
    const recipientPrivKey = decodeBase64(recipientPrivateKey)

    const decrypted = nacl.box.open(encrypted, nonce, senderPubKey, recipientPrivKey)
    if (!decrypted) {
      throw new Error("Decryption failed")
    }
    return decodeUTF8(decrypted)
  }

  generateSymmetricKey(): string {
    const key = nacl.randomBytes(nacl.secretbox.keyLength)
    return encodeBase64(key)
  }

  encryptGroupMessage(message: string, symmetricKey: string): string {
    const messageBytes = encodeUTF8(message)
    const key = decodeBase64(symmetricKey)
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)

    const encrypted = nacl.secretbox(messageBytes, nonce, key)

    // Combine nonce and encrypted data
    const combined = new Uint8Array(nonce.length + encrypted.length)
    combined.set(nonce)
    combined.set(encrypted, nonce.length)

    return encodeBase64(combined)
  }

  decryptGroupMessage(encryptedMessage: string, symmetricKey: string): string {
    const combined = decodeBase64(encryptedMessage)
    const nonce = combined.slice(0, nacl.secretbox.nonceLength)
    const encrypted = combined.slice(nacl.secretbox.nonceLength)
    const key = decodeBase64(symmetricKey)

    const decrypted = nacl.secretbox.open(encrypted, nonce, key)
    if (!decrypted) {
      throw new Error("Decryption failed")
    }
    return decodeUTF8(decrypted)
  }

  signMessage(message: string, privateKey: string): string {
    const messageBytes = encodeUTF8(message)
    const privKey = decodeBase64(privateKey)
    const signature = nacl.sign.detached(messageBytes, privKey)
    return encodeBase64(signature)
  }

  verifySignature(message: string, signature: string, publicKey: string): boolean {
    try {
      const messageBytes = encodeUTF8(message)
      const sig = decodeBase64(signature)
      const pubKey = decodeBase64(publicKey)
      return nacl.sign.detached.verify(messageBytes, sig, pubKey)
    } catch {
      return false
    }
  }

  deriveKeyFromPassword(password: string, salt: string): string {
    // Note: tweetnacl doesn't have built-in scrypt, using hash as fallback
    // For production, consider using @noble/hashes or similar
    const combined = encodeUTF8(password + salt)
    const hash = nacl.hash(combined)
    return encodeBase64(hash.slice(0, nacl.secretbox.keyLength))
  }

  generateSalt(): string {
    const salt = nacl.randomBytes(16)
    return encodeBase64(salt)
  }

  encryptPrivateKey(privateKey: string, password: string): { encryptedKey: string; salt: string } {
    const salt = this.generateSalt()
    const derivedKey = this.deriveKeyFromPassword(password, salt)
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)

    const privateKeyBytes = decodeBase64(privateKey)
    const keyBytes = decodeBase64(derivedKey)

    const encrypted = nacl.secretbox(privateKeyBytes, nonce, keyBytes)

    // Combine nonce and encrypted data
    const combined = new Uint8Array(nonce.length + encrypted.length)
    combined.set(nonce)
    combined.set(encrypted, nonce.length)

    return {
      encryptedKey: encodeBase64(combined),
      salt,
    }
  }

  decryptPrivateKey(encryptedKey: string, password: string, salt: string): string {
    const derivedKey = this.deriveKeyFromPassword(password, salt)
    const combined = decodeBase64(encryptedKey)
    const nonce = combined.slice(0, nacl.secretbox.nonceLength)
    const encrypted = combined.slice(nacl.secretbox.nonceLength)
    const keyBytes = decodeBase64(derivedKey)

    const decrypted = nacl.secretbox.open(encrypted, nonce, keyBytes)
    if (!decrypted) {
      throw new Error("Decryption failed")
    }
    return encodeBase64(decrypted)
  }

  generateSecureId(): string {
    const randomBytes = nacl.randomBytes(16)
    return encodeBase64(randomBytes)
  }

  generateMessageHash(content: string, timestamp: number, senderId: string): string {
    const data = `${content}${timestamp}${senderId}`
    const hash = nacl.hash(encodeUTF8(data))
    return encodeBase64(hash)
  }

  encryptEphemeralMessage(
    message: string,
    recipientPublicKey: string,
    senderPrivateKey: string,
    expirationTime: number,
  ): string {
    const messageWithExpiry = JSON.stringify({
      content: message,
      expiresAt: expirationTime,
    })
    return this.encryptDirectMessage(messageWithExpiry, recipientPublicKey, senderPrivateKey)
  }

  decryptEphemeralMessage(
    encryptedMessage: string,
    senderPublicKey: string,
    recipientPrivateKey: string,
  ): { content: string; isExpired: boolean } | null {
    try {
      const decryptedData = this.decryptDirectMessage(encryptedMessage, senderPublicKey, recipientPrivateKey)
      const messageData = JSON.parse(decryptedData)

      const isExpired = Date.now() > messageData.expiresAt

      return {
        content: messageData.content,
        isExpired,
      }
    } catch {
      return null
    }
  }

  encryptBackupData(data: any, password: string): { encryptedData: string; salt: string } {
    const salt = this.generateSalt()
    const derivedKey = this.deriveKeyFromPassword(password, salt)
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)

    const dataBytes = encodeUTF8(JSON.stringify(data))
    const keyBytes = decodeBase64(derivedKey)

    const encrypted = nacl.secretbox(dataBytes, nonce, keyBytes)

    // Combine nonce and encrypted data
    const combined = new Uint8Array(nonce.length + encrypted.length)
    combined.set(nonce)
    combined.set(encrypted, nonce.length)

    return {
      encryptedData: encodeBase64(combined),
      salt,
    }
  }

  decryptBackupData(encryptedData: string, password: string, salt: string): any {
    const derivedKey = this.deriveKeyFromPassword(password, salt)
    const combined = decodeBase64(encryptedData)
    const nonce = combined.slice(0, nacl.secretbox.nonceLength)
    const encrypted = combined.slice(nacl.secretbox.nonceLength)
    const keyBytes = decodeBase64(derivedKey)

    const decrypted = nacl.secretbox.open(encrypted, nonce, keyBytes)
    if (!decrypted) {
      throw new Error("Decryption failed")
    }
    return JSON.parse(decodeUTF8(decrypted))
  }

  secureWipe(data: string): void {
    // In a real implementation, you would securely overwrite memory
    // This is a placeholder for the concept
    if (typeof data === "string") {
      // Clear the string reference (limited effectiveness in JS)
      data = ""
    }
  }
}
