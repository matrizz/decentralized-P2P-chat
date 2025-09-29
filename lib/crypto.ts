import sodium from "libsodium-wrappers"

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
      await sodium.ready
      this.isReady = true
    }
  }

  // Generate asymmetric key pair for user identity
  generateKeyPair(): { publicKey: string; privateKey: string } {
    const keyPair = sodium.crypto_box_keypair()
    return {
      publicKey: sodium.to_hex(keyPair.publicKey),
      privateKey: sodium.to_hex(keyPair.privateKey),
    }
  }

  // Generate signing key pair for message authentication
  generateSigningKeyPair(): { publicKey: string; privateKey: string } {
    const keyPair = sodium.crypto_sign_keypair()
    return {
      publicKey: sodium.to_hex(keyPair.publicKey),
      privateKey: sodium.to_hex(keyPair.privateKey),
    }
  }

  // Generate user ID from public key using secure hash
  generateUserId(publicKey: string): string {
    const hash = sodium.crypto_generichash(32, sodium.from_hex(publicKey))
    return sodium.to_hex(hash)
  }

  encryptDirectMessage(message: string, recipientPublicKey: string, senderPrivateKey: string): string {
    const messageBytes = sodium.from_string(message)
    const recipientPubKey = sodium.from_hex(recipientPublicKey)
    const senderPrivKey = sodium.from_hex(senderPrivateKey)
    const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES)

    const encrypted = sodium.crypto_box_easy(messageBytes, nonce, recipientPubKey, senderPrivKey)

    // Combine nonce and encrypted data
    const combined = new Uint8Array(nonce.length + encrypted.length)
    combined.set(nonce)
    combined.set(encrypted, nonce.length)

    return sodium.to_hex(combined)
  }

  decryptDirectMessage(encryptedMessage: string, senderPublicKey: string, recipientPrivateKey: string): string {
    const combined = sodium.from_hex(encryptedMessage)
    const nonce = combined.slice(0, sodium.crypto_box_NONCEBYTES)
    const encrypted = combined.slice(sodium.crypto_box_NONCEBYTES)
    const senderPubKey = sodium.from_hex(senderPublicKey)
    const recipientPrivKey = sodium.from_hex(recipientPrivateKey)

    const decrypted = sodium.crypto_box_open_easy(encrypted, nonce, senderPubKey, recipientPrivKey)
    return sodium.to_string(decrypted)
  }

  // Generate symmetric key for group chat
  generateSymmetricKey(): string {
    const key = sodium.crypto_secretbox_keygen()
    return sodium.to_hex(key)
  }

  encryptGroupMessage(message: string, symmetricKey: string): string {
    const messageBytes = sodium.from_string(message)
    const key = sodium.from_hex(symmetricKey)
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)

    const encrypted = sodium.crypto_secretbox_easy(messageBytes, nonce, key)

    // Combine nonce and encrypted data
    const combined = new Uint8Array(nonce.length + encrypted.length)
    combined.set(nonce)
    combined.set(encrypted, nonce.length)

    return sodium.to_hex(combined)
  }

  decryptGroupMessage(encryptedMessage: string, symmetricKey: string): string {
    const combined = sodium.from_hex(encryptedMessage)
    const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES)
    const encrypted = combined.slice(sodium.crypto_secretbox_NONCEBYTES)
    const key = sodium.from_hex(symmetricKey)

    const decrypted = sodium.crypto_secretbox_open_easy(encrypted, nonce, key)
    return sodium.to_string(decrypted)
  }

  // Sign message for authenticity
  signMessage(message: string, privateKey: string): string {
    const messageBytes = sodium.from_string(message)
    const privKey = sodium.from_hex(privateKey)
    const signature = sodium.crypto_sign_detached(messageBytes, privKey)
    return sodium.to_hex(signature)
  }

  // Verify message signature
  verifySignature(message: string, signature: string, publicKey: string): boolean {
    try {
      const messageBytes = sodium.from_string(message)
      const sig = sodium.from_hex(signature)
      const pubKey = sodium.from_hex(publicKey)
      return sodium.crypto_sign_verify_detached(sig, messageBytes, pubKey)
    } catch {
      return false
    }
  }

  deriveKeyFromPassword(password: string, salt: string): string {
    const saltBytes = sodium.from_hex(salt)
    const key = sodium.crypto_pwhash(
      32, // key length
      sodium.from_string(password),
      saltBytes,
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_ALG_ARGON2ID,
    )
    return sodium.to_hex(key)
  }

  generateSalt(): string {
    const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES)
    return sodium.to_hex(salt)
  }

  encryptPrivateKey(privateKey: string, password: string): { encryptedKey: string; salt: string } {
    const salt = this.generateSalt()
    const derivedKey = this.deriveKeyFromPassword(password, salt)
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)

    const privateKeyBytes = sodium.from_hex(privateKey)
    const keyBytes = sodium.from_hex(derivedKey)

    const encrypted = sodium.crypto_secretbox_easy(privateKeyBytes, nonce, keyBytes)

    // Combine nonce and encrypted data
    const combined = new Uint8Array(nonce.length + encrypted.length)
    combined.set(nonce)
    combined.set(encrypted, nonce.length)

    return {
      encryptedKey: sodium.to_hex(combined),
      salt,
    }
  }

  decryptPrivateKey(encryptedKey: string, password: string, salt: string): string {
    const derivedKey = this.deriveKeyFromPassword(password, salt)
    const combined = sodium.from_hex(encryptedKey)
    const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES)
    const encrypted = combined.slice(sodium.crypto_secretbox_NONCEBYTES)
    const keyBytes = sodium.from_hex(derivedKey)

    const decrypted = sodium.crypto_secretbox_open_easy(encrypted, nonce, keyBytes)
    return sodium.to_hex(decrypted)
  }

  generateSecureId(): string {
    const randomBytes = sodium.randombytes_buf(16)
    return sodium.to_hex(randomBytes)
  }

  generateMessageHash(content: string, timestamp: number, senderId: string): string {
    const data = `${content}${timestamp}${senderId}`
    const hash = sodium.crypto_generichash(32, sodium.from_string(data))
    return sodium.to_hex(hash)
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
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)

    const dataBytes = sodium.from_string(JSON.stringify(data))
    const keyBytes = sodium.from_hex(derivedKey)

    const encrypted = sodium.crypto_secretbox_easy(dataBytes, nonce, keyBytes)

    // Combine nonce and encrypted data
    const combined = new Uint8Array(nonce.length + encrypted.length)
    combined.set(nonce)
    combined.set(encrypted, nonce.length)

    return {
      encryptedData: sodium.to_hex(combined),
      salt,
    }
  }

  decryptBackupData(encryptedData: string, password: string, salt: string): any {
    const derivedKey = this.deriveKeyFromPassword(password, salt)
    const combined = sodium.from_hex(encryptedData)
    const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES)
    const encrypted = combined.slice(sodium.crypto_secretbox_NONCEBYTES)
    const keyBytes = sodium.from_hex(derivedKey)

    const decrypted = sodium.crypto_secretbox_open_easy(encrypted, nonce, keyBytes)
    return JSON.parse(sodium.to_string(decrypted))
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
