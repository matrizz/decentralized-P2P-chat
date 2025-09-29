"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CryptoManager } from "@/lib/crypto"
import { StorageManager } from "@/lib/storage"
import type { User } from "@/lib/types"
import { Shield, Key, Download, Upload, Eye, EyeOff } from "lucide-react"

interface AuthScreenProps {
  onUserAuthenticated: (user: User) => void
}

export default function AuthScreen({ onUserAuthenticated }: AuthScreenProps) {
  const [username, setUsername] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [importData, setImportData] = useState("")
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [generatedKeys, setGeneratedKeys] = useState<{ publicKey: string; privateKey: string } | null>(null)

  const handleCreateNewUser = async () => {
    if (!username.trim()) {
      setError("Please enter a username")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const crypto = CryptoManager.getInstance()
      const storage = StorageManager.getInstance()

      // Generate new key pair
      const keyPair = crypto.generateKeyPair()
      const userId = crypto.generateUserId(keyPair.publicKey)

      // Create user object
      const user: User = {
        id: userId,
        publicKey: keyPair.publicKey,
        username: username.trim(),
        isOnline: true,
        lastSeen: new Date(),
      }

      // Save to local storage
      await storage.saveKeyPair(keyPair)
      await storage.saveCurrentUser(user)

      // Show generated keys for backup
      setGeneratedKeys(keyPair)
    } catch (err) {
      setError("Failed to create user. Please try again.")
      console.error("User creation error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleImportUser = async () => {
    if (!username.trim()) {
      setError("Please enter a username")
      return
    }

    if (!importData.trim()) {
      setError("Please enter your private key")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const crypto = CryptoManager.getInstance()
      const storage = StorageManager.getInstance()

      // Validate private key format
      if (importData.length !== 64) {
        throw new Error("Invalid private key format")
      }

      // Generate public key from private key
      const privateKeyBytes = crypto.from_hex ? crypto.from_hex(importData) : new Uint8Array()
      // Note: This is a simplified version - in real implementation, you'd derive public key from private key
      const keyPair = {
        privateKey: importData,
        publicKey: "", // Would be derived from private key
      }

      const userId = crypto.generateUserId(keyPair.publicKey)

      const user: User = {
        id: userId,
        publicKey: keyPair.publicKey,
        username: username.trim(),
        isOnline: true,
        lastSeen: new Date(),
      }

      await storage.saveKeyPair(keyPair)
      await storage.saveCurrentUser(user)

      onUserAuthenticated(user)
    } catch (err) {
      setError("Invalid private key or import failed. Please check your key and try again.")
      console.error("Import error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleContinueWithNewUser = async () => {
    if (!generatedKeys) return

    try {
      const storage = StorageManager.getInstance()
      const user = await storage.getCurrentUser()
      if (user) {
        onUserAuthenticated(user)
      }
    } catch (err) {
      setError("Failed to continue. Please try again.")
    }
  }

  const downloadBackup = () => {
    if (!generatedKeys) return

    const backupData = {
      privateKey: generatedKeys.privateKey,
      publicKey: generatedKeys.publicKey,
      username,
      timestamp: new Date().toISOString(),
    }

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `securechat-backup-${username}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (generatedKeys) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 bg-primary/10 rounded-full w-fit">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Backup Your Keys</CardTitle>
            <CardDescription>
              Your account has been created successfully. Please backup your private key - you'll need it to access your
              account on other devices.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <Key className="h-4 w-4" />
              <AlertDescription>
                <strong>Important:</strong> Your private key is the only way to access your account. Store it securely
                and never share it with anyone.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div>
                <Label htmlFor="publicKey">Public Key (Your ID)</Label>
                <Input id="publicKey" value={generatedKeys.publicKey} readOnly className="font-mono text-sm" />
              </div>

              <div>
                <Label htmlFor="privateKey">Private Key</Label>
                <div className="relative">
                  <Input
                    id="privateKey"
                    type={showPrivateKey ? "text" : "password"}
                    value={generatedKeys.privateKey}
                    readOnly
                    className="font-mono text-sm pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                  >
                    {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={downloadBackup} variant="outline" className="flex-1 bg-transparent">
                <Download className="h-4 w-4 mr-2" />
                Download Backup
              </Button>
              <Button onClick={handleContinueWithNewUser} className="flex-1">
                Continue to Chat
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 bg-primary/10 rounded-full w-fit">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">SecureChat P2P</CardTitle>
          <CardDescription>Decentralized messaging with end-to-end encryption</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="create" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create">Create Account</TabsTrigger>
              <TabsTrigger value="import">Import Account</TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button onClick={handleCreateNewUser} disabled={isLoading} className="w-full">
                {isLoading ? "Creating Account..." : "Create New Account"}
              </Button>

              <div className="text-sm text-muted-foreground space-y-2">
                <p>• Your keys are generated locally and never leave your device</p>
                <p>• No central server or registration required</p>
                <p>• Make sure to backup your private key</p>
              </div>
            </TabsContent>

            <TabsContent value="import" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="import-username">Username</Label>
                <Input
                  id="import-username"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="private-key">Private Key</Label>
                <Input
                  id="private-key"
                  type="password"
                  placeholder="Enter your private key"
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  disabled={isLoading}
                  className="font-mono"
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button onClick={handleImportUser} disabled={isLoading} className="w-full">
                <Upload className="h-4 w-4 mr-2" />
                {isLoading ? "Importing..." : "Import Account"}
              </Button>

              <div className="text-sm text-muted-foreground">
                <p>Import your account using your private key from a backup file or previous installation.</p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
