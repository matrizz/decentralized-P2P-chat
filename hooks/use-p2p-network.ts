"use client"

import { useState, useEffect, useCallback } from "react"
import { MessageManager } from "@/lib/message-manager"
import type { User, Message } from "@/lib/types"

interface NetworkStatus {
  isConnected: boolean
  peerCount: number
  isInitializing: boolean
  error: string | null
}

export function useP2PNetwork(user: User | null) {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isConnected: false,
    peerCount: 0,
    isInitializing: false,
    error: null,
  })
  const [messages, setMessages] = useState<Message[]>([])

  const [messageManager, setMessageManager] = useState<MessageManager | null>(null)

  useEffect(() => {
    if (typeof window !== "undefined") {
      setMessageManager(MessageManager.getInstance())
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleOnline = () => {
      console.log("[v0] Browser is online")
      setNetworkStatus((prev) => ({ ...prev, error: null }))
    }

    const handleOffline = () => {
      console.log("[v0] Browser is offline")
      setNetworkStatus((prev) => ({
        ...prev,
        isConnected: false,
        error: "No internet connection",
      }))
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  // Initialize network when user is available
  useEffect(() => {
    if (!user || !messageManager) return

    const initializeNetwork = async () => {
      setNetworkStatus((prev) => ({ ...prev, isInitializing: true, error: null }))

      try {
        console.log("[v0] Initializing P2P network for user:", user.username)
        await messageManager.initialize(user)

        // Set up message listener
        const handleNewMessage = (message: Message) => {
          console.log("[v0] Received new message:", message)
          setMessages((prev) => [...prev, message])
        }

        messageManager.onMessage(handleNewMessage)

        // Update network status
        const status = messageManager.getNetworkStatus()
        console.log("[v0] Network status after initialization:", status)
        setNetworkStatus({
          isConnected: status.isConnected,
          peerCount: status.peerCount,
          isInitializing: false,
          error: null,
        })

        // Set up periodic status updates
        const statusInterval = setInterval(() => {
          const currentStatus = messageManager.getNetworkStatus()
          setNetworkStatus((prev) => ({
            ...prev,
            isConnected: currentStatus.isConnected,
            peerCount: currentStatus.peerCount,
          }))
        }, 5000)

        return () => {
          clearInterval(statusInterval)
          messageManager.removeMessageListener(handleNewMessage)
        }
      } catch (error) {
        console.error("Failed to initialize P2P network:", error)
        setNetworkStatus({
          isConnected: false,
          peerCount: 0,
          isInitializing: false,
          error: error instanceof Error ? error.message : "Network initialization failed",
        })
      }
    }

    initializeNetwork()
  }, [user, messageManager])

  const sendDirectMessage = useCallback(
    async (recipientId: string, content: string) => {
      if (!messageManager) throw new Error("Message manager not initialized")

      try {
        const message = await messageManager.sendDirectMessage(recipientId, content)
        setMessages((prev) => [...prev, message])
        return message
      } catch (error) {
        console.error("Failed to send direct message:", error)
        throw error
      }
    },
    [messageManager],
  )

  const sendGroupMessage = useCallback(
    async (groupId: string, content: string) => {
      if (!messageManager) throw new Error("Message manager not initialized")

      try {
        const message = await messageManager.sendGroupMessage(groupId, content)
        setMessages((prev) => [...prev, message])
        return message
      } catch (error) {
        console.error("Failed to send group message:", error)
        throw error
      }
    },
    [messageManager],
  )

  const getMessagesForChat = useCallback(
    async (chatId: string) => {
      if (!messageManager) return []

      try {
        return await messageManager.getMessagesForChat(chatId)
      } catch (error) {
        console.error("Failed to get messages for chat:", error)
        return []
      }
    },
    [messageManager],
  )

  return {
    networkStatus,
    messages,
    sendDirectMessage,
    sendGroupMessage,
    getMessagesForChat,
  }
}
