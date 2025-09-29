"use client"

import { useEffect, useState } from "react"
import { StorageManager } from "@/lib/storage"
import { CryptoManager } from "@/lib/crypto"
import type { User } from "@/lib/types"
import AuthScreen from "@/components/auth-screen"
import ChatApp from "@/components/chat-app"
import { Loader2 } from "lucide-react"

export default function Home() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (!isClient) return

    const initializeApp = async () => {
      try {
        // Initialize crypto library
        const crypto = CryptoManager.getInstance()
        await crypto.initialize()

        // Check for existing user
        const storage = StorageManager.getInstance()
        const user = await storage.getCurrentUser()

        if (user) {
          setCurrentUser(user)
        }

        setIsInitialized(true)
      } catch (error) {
        console.error("Failed to initialize app:", error)
      } finally {
        setIsLoading(false)
      }
    }

    initializeApp()
  }, [isClient])

  if (!isClient || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Initializing SecureChat...</p>
        </div>
      </div>
    )
  }

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-2">Initialization Failed</h1>
          <p className="text-muted-foreground">Please refresh the page to try again.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {currentUser ? (
        <ChatApp user={currentUser} onLogout={() => setCurrentUser(null)} />
      ) : (
        <AuthScreen onUserAuthenticated={setCurrentUser} />
      )}
    </div>
  )
}
