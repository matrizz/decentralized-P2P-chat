"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { User, Contact, Group, Message } from "@/lib/types"
import { useP2PNetwork } from "@/hooks/use-p2p-network"
import { Send, Shield, Clock, CheckCheck, AlertTriangle, Wifi, WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChatInterfaceProps {
  user: User
  activeChat: Contact | Group | null
  chatType: "contact" | "group"
  onBack: () => void
}

export default function ChatInterface({ user, activeChat, chatType, onBack }: ChatInterfaceProps) {
  const [message, setMessage] = useState("")
  const [chatMessages, setChatMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { networkStatus, sendDirectMessage, sendGroupMessage, getMessagesForChat } = useP2PNetwork(user)

  // Load messages for the active chat
  useEffect(() => {
    if (!activeChat) return

    const loadMessages = async () => {
      const messages = await getMessagesForChat(activeChat.id)
      setChatMessages(messages)
    }

    loadMessages()
  }, [activeChat, getMessagesForChat])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  const handleSendMessage = async () => {
    if (!message.trim() || !activeChat) return

    setIsTyping(true)

    try {
      if (chatType === "contact") {
        await sendDirectMessage(activeChat.id, message.trim())
      } else {
        await sendGroupMessage(activeChat.id, message.trim())
      }

      setMessage("")
    } catch (error) {
      console.error("Failed to send message:", error)
    } finally {
      setIsTyping(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const formatMessageTime = (timestamp: Date) => {
    const now = new Date()
    const messageDate = new Date(timestamp)

    if (now.toDateString() === messageDate.toDateString()) {
      return messageDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    } else {
      return messageDate.toLocaleDateString([], { month: "short", day: "numeric" })
    }
  }

  const getMessageStatus = (message: Message) => {
    if (message.senderId === user.id) {
      // Sent by current user
      if (message.isEncrypted) {
        return <CheckCheck className="h-3 w-3 text-primary" />
      }
      return <Clock className="h-3 w-3 text-muted-foreground" />
    }
    return null
  }

  const getNetworkStatusDisplay = () => {
    if (!networkStatus.isConnected) {
      return {
        variant: "destructive" as const,
        text: "Offline",
        icon: <WifiOff className="h-3 w-3" />,
      }
    } else if (networkStatus.peerCount === 0) {
      return {
        variant: "secondary" as const,
        text: "Online (No peers)",
        icon: <Wifi className="h-3 w-3" />,
      }
    } else {
      return {
        variant: "default" as const,
        text: `${networkStatus.peerCount} peers`,
        icon: <Wifi className="h-3 w-3" />,
      }
    }
  }

  if (!activeChat) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="p-4 bg-muted/20 rounded-full w-fit mx-auto mb-4">
            <Shield className="h-12 w-12 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No Chat Selected</h2>
          <p className="text-muted-foreground">Select a contact or group to start messaging</p>
        </div>
      </div>
    )
  }

  const networkDisplay = getNetworkStatusDisplay()

  return (
    <div className="flex-1 flex flex-col">
      {/* Chat Header */}
      <header className="border-b border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="md:hidden">
              ←
            </Button>
            <Avatar>
              <AvatarFallback className="bg-primary/10 text-primary">
                {chatType === "contact" ? (activeChat as Contact).username[0].toUpperCase() : "#"}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="font-semibold">
                {chatType === "contact" ? (activeChat as Contact).username : (activeChat as Group).name}
              </h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {chatType === "contact" ? (
                  <>
                    <Badge variant={activeChat.isOnline ? "default" : "secondary"} className="text-xs px-1 py-0">
                      {activeChat.isOnline ? "Online" : "Offline"}
                    </Badge>
                    <span>•</span>
                    <span>{activeChat.id.slice(0, 8)}...</span>
                  </>
                ) : (
                  <>
                    <span>{(activeChat as Group).members.length} members</span>
                    <span>•</span>
                    <span>{(activeChat as Group).id.slice(0, 8)}...</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={networkDisplay.variant} className="text-xs flex items-center gap-1">
              {networkDisplay.icon}
              {networkDisplay.text}
            </Badge>
            <Shield className="h-4 w-4 text-primary" title="End-to-end encrypted" />
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {chatMessages.length === 0 ? (
            <div className="text-center py-8">
              <div className="p-3 bg-muted/20 rounded-full w-fit mx-auto mb-3">
                <Shield className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">No messages yet</p>
              <p className="text-sm text-muted-foreground mt-1">Start a secure conversation</p>
            </div>
          ) : (
            chatMessages.map((msg, index) => {
              const isOwnMessage = msg.senderId === user.id
              const showAvatar = !isOwnMessage && (index === 0 || chatMessages[index - 1].senderId !== msg.senderId)

              return (
                <div
                  key={msg.id}
                  className={cn("flex gap-3", isOwnMessage ? "justify-end" : "justify-start", {
                    "ml-12": !isOwnMessage && !showAvatar,
                  })}
                >
                  {!isOwnMessage && showAvatar && (
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                        {msg.senderId.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div className={cn("max-w-[70%] space-y-1", isOwnMessage ? "items-end" : "items-start")}>
                    {!isOwnMessage && showAvatar && (
                      <p className="text-xs text-muted-foreground px-3">{msg.senderId.slice(0, 8)}...</p>
                    )}

                    <Card
                      className={cn(
                        "relative",
                        isOwnMessage ? "bg-primary text-primary-foreground ml-auto" : "bg-muted text-muted-foreground",
                        msg.isEphemeral && "border-dashed border-destructive/50",
                      )}
                    >
                      <CardContent className="p-3">
                        <div className="space-y-2">
                          <p className="text-sm leading-relaxed break-words">{msg.content}</p>

                          <div className="flex items-center justify-between gap-2 text-xs opacity-70">
                            <div className="flex items-center gap-1">
                              <span>{formatMessageTime(msg.timestamp)}</span>
                              {msg.isEphemeral && <Clock className="h-3 w-3" title="Ephemeral message" />}
                              {msg.isEncrypted && <Shield className="h-3 w-3" title="Encrypted" />}
                            </div>
                            {getMessageStatus(msg)}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Message Input */}
      <div className="border-t border-border bg-card p-4">
        {!networkStatus.isConnected && (
          <div className="mb-3 p-2 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm text-destructive">
              {networkStatus.error || "Not connected to network. Messages will be queued."}
            </span>
          </div>
        )}

        {networkStatus.isConnected && networkStatus.peerCount === 0 && (
          <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md flex items-center gap-2">
            <Wifi className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              Network ready. Waiting for peers to connect for message delivery.
            </span>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder={`Message ${chatType === "contact" ? (activeChat as Contact).username : (activeChat as Group).name}...`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isTyping}
            className="flex-1"
          />
          <Button onClick={handleSendMessage} disabled={!message.trim() || isTyping} size="sm">
            <Send className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Shield className="h-3 w-3" />
            <span>End-to-end encrypted</span>
          </div>
          {isTyping && <span>Sending...</span>}
        </div>
      </div>
    </div>
  )
}
