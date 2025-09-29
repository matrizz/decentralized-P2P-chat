"use client"

import { useState, useEffect } from "react"
import type { User, Contact, Group, Message } from "@/lib/types"
import { StorageManager } from "@/lib/storage"
import { useP2PNetwork } from "@/hooks/use-p2p-network"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import ChatInterface from "./chat-interface"
import ContactManager from "./contact-manager"
import {
  MessageCircle,
  Users,
  Settings,
  LogOut,
  Plus,
  Search,
  Shield,
  Wifi,
  WifiOff,
  Copy,
  Check,
  UserPlus,
} from "lucide-react"

interface ChatAppProps {
  user: User
  onLogout: () => void
}

export default function ChatApp({ user, onLogout }: ChatAppProps) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [activeView, setActiveView] = useState<"contacts" | "groups" | "settings">("contacts")
  const [activeChat, setActiveChat] = useState<Contact | Group | null>(null)
  const [chatType, setChatType] = useState<"contact" | "group">("contact")
  const [searchQuery, setSearchQuery] = useState("")
  const [showContactManager, setShowContactManager] = useState(false)
  const [copiedId, setCopiedId] = useState(false)

  const { networkStatus, messages: realtimeMessages } = useP2PNetwork(user)

  useEffect(() => {
    const loadData = async () => {
      const storage = StorageManager.getInstance()
      const [loadedContacts, loadedGroups, loadedMessages] = await Promise.all([
        storage.getAllContacts(),
        storage.getAllGroups(),
        storage.getAllMessages(),
      ])

      setContacts(loadedContacts)
      setGroups(loadedGroups)
      setMessages(loadedMessages)
    }

    loadData()
  }, [])

  // Update messages when new ones arrive
  useEffect(() => {
    setMessages((prev) => [...prev, ...realtimeMessages])
  }, [realtimeMessages])

  const handleLogout = async () => {
    const storage = StorageManager.getInstance()
    await storage.clearAllData()
    onLogout()
  }

  const handleContactClick = (contact: Contact) => {
    if (contact.isBlocked) return // Don't allow chatting with blocked contacts
    setActiveChat(contact)
    setChatType("contact")
  }

  const handleGroupClick = (group: Group) => {
    setActiveChat(group)
    setChatType("group")
  }

  const copyUserId = async () => {
    try {
      await navigator.clipboard.writeText(user.id)
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 2000)
    } catch (error) {
      console.error("Failed to copy user ID:", error)
    }
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
        text: "Online",
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

  // Filter out blocked contacts from main list
  const activeContacts = contacts.filter((contact) => !contact.isBlocked)
  const filteredContacts = activeContacts.filter((contact) =>
    contact.username.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const filteredGroups = groups.filter((group) => group.name.toLowerCase().includes(searchQuery.toLowerCase()))

  // Mobile view - show chat interface when chat is active
  if (activeChat) {
    return (
      <div className="min-h-screen bg-background flex">
        <ChatInterface user={user} activeChat={activeChat} chatType={chatType} onBack={() => setActiveChat(null)} />
      </div>
    )
  }

  const networkDisplay = getNetworkStatusDisplay()

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <MessageCircle className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">SecureChat P2P</h1>
              <p className="text-sm text-muted-foreground">Welcome, {user.username}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={networkDisplay.variant} className="flex items-center gap-1">
              {networkDisplay.icon}
              {networkDisplay.text}
            </Badge>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Sidebar */}
        <aside className="w-80 border-r border-border bg-card">
          <div className="p-4">
            {/* Navigation */}
            <nav className="flex gap-1 mb-4">
              <Button
                variant={activeView === "contacts" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveView("contacts")}
                className="flex-1"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                Contacts
              </Button>
              <Button
                variant={activeView === "groups" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveView("groups")}
                className="flex-1"
              >
                <Users className="h-4 w-4 mr-2" />
                Groups
              </Button>
              <Button
                variant={activeView === "settings" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveView("settings")}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </nav>

            {/* Search */}
            {(activeView === "contacts" || activeView === "groups") && (
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={`Search ${activeView}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            )}

            {/* Content based on active view */}
            {activeView === "contacts" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Contacts ({filteredContacts.length})</h3>
                  <Dialog open={showContactManager} onOpenChange={setShowContactManager}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline">
                        <UserPlus className="h-4 w-4 mr-1" />
                        Manage
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Contact Management</DialogTitle>
                      </DialogHeader>
                      <ContactManager user={user} contacts={contacts} onContactsUpdate={setContacts} />
                    </DialogContent>
                  </Dialog>
                </div>

                {filteredContacts.length === 0 ? (
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">No contacts yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Use the Manage button to add contacts</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {filteredContacts.map((contact) => (
                      <Card
                        key={contact.id}
                        className="cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() => handleContactClick(contact)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {contact.username[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium truncate">{contact.username}</p>
                                {contact.isVerified && <Shield className="h-3 w-3 text-primary" title="Verified" />}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{contact.id.slice(0, 16)}...</p>
                            </div>
                            <Badge variant={contact.isOnline ? "default" : "secondary"} className="text-xs">
                              {contact.isOnline ? "Online" : "Offline"}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeView === "groups" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Groups ({filteredGroups.length})</h3>
                  <Button size="sm" variant="outline">
                    <Plus className="h-4 w-4 mr-1" />
                    Join
                  </Button>
                </div>
                {filteredGroups.length === 0 ? (
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">No groups yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Join groups by their public ID</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {filteredGroups.map((group) => (
                      <Card
                        key={group.id}
                        className="cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() => handleGroupClick(group)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="bg-secondary text-secondary-foreground">#</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{group.name}</p>
                              <p className="text-xs text-muted-foreground">{group.members.length} members</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeView === "settings" && (
              <div className="space-y-3">
                <h3 className="font-medium">Settings</h3>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Your Identity
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Username</label>
                      <p className="text-sm font-medium">{user.username}</p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Public ID</label>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs font-mono break-all flex-1">{user.id}</p>
                        <Button size="sm" variant="ghost" onClick={copyUserId}>
                          {copiedId ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Public Key</label>
                      <p className="text-xs font-mono break-all">{user.publicKey.slice(0, 32)}...</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Network Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Connection</span>
                      <Badge variant={networkStatus.isConnected ? "default" : "destructive"}>
                        {networkStatus.isConnected ? "Connected" : "Disconnected"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Peers</span>
                      <span className="text-sm font-mono">{networkStatus.peerCount}</span>
                    </div>
                    {networkStatus.isInitializing && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Status</span>
                        <Badge variant="secondary">Initializing...</Badge>
                      </div>
                    )}
                    {networkStatus.error && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Error</span>
                        <span className="text-xs text-destructive">{networkStatus.error}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Contact Statistics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Total Contacts</span>
                      <span className="text-sm font-mono">{contacts.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Active Contacts</span>
                      <span className="text-sm font-mono">{activeContacts.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Blocked Contacts</span>
                      <span className="text-sm font-mono">{contacts.filter((c) => c.isBlocked).length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Verified Contacts</span>
                      <span className="text-sm font-mono">{contacts.filter((c) => c.isVerified).length}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </aside>

        {/* Main Chat Area */}
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="p-4 bg-muted/20 rounded-full w-fit mx-auto mb-4">
              <MessageCircle className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Welcome to SecureChat P2P</h2>
            <p className="text-muted-foreground max-w-md">
              Select a contact or group to start chatting. All messages are encrypted end-to-end and stored locally on
              your device.
            </p>
            <div className="flex items-center justify-center gap-2 mt-4 text-sm text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span>Zero-knowledge • Decentralized • Private</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
