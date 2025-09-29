"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Contact, User } from "@/lib/types"
import { StorageManager } from "@/lib/storage"
import { SecurityManager } from "@/lib/security-utils"
import { CryptoManager } from "@/lib/crypto"
import {
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldX,
  QrCode,
  Scan,
  MoreVertical,
  Blocks as Block,
  Trash2,
  AlertTriangle,
  CheckCircle,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ContactManagerProps {
  user: User
  contacts: Contact[]
  onContactsUpdate: (contacts: Contact[]) => void
}

export default function ContactManager({ user, contacts, onContactsUpdate }: ContactManagerProps) {
  const [newContactId, setNewContactId] = useState("")
  const [newContactUsername, setNewContactUsername] = useState("")
  const [isAddingContact, setIsAddingContact] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [qrCodeData, setQrCodeData] = useState("")
  const [scanResult, setScanResult] = useState("")

  const storage = StorageManager.getInstance()
  const security = SecurityManager.getInstance()
  const crypto = CryptoManager.getInstance()

  const handleAddContact = async () => {
    if (!newContactId.trim()) {
      setError("Please enter a contact ID")
      return
    }

    setIsAddingContact(true)
    setError("")

    try {
      // Check if contact already exists
      const existingContact = contacts.find((c) => c.id === newContactId.trim())
      if (existingContact) {
        setError("Contact already exists")
        return
      }

      // Validate contact ID format (should be a valid hex string)
      if (!/^[a-fA-F0-9]{64}$/.test(newContactId.trim())) {
        setError("Invalid contact ID format")
        return
      }

      const newContact: Contact = {
        id: newContactId.trim(),
        publicKey: newContactId.trim(), // In real implementation, derive from ID
        username: newContactUsername.trim() || `User ${newContactId.slice(0, 8)}`,
        isOnline: false,
        lastSeen: new Date(),
        isBlocked: false,
        addedAt: new Date(),
        isVerified: false,
      }

      await storage.saveContact(newContact)
      const updatedContacts = [...contacts, newContact]
      onContactsUpdate(updatedContacts)

      setNewContactId("")
      setNewContactUsername("")
      setSuccess("Contact added successfully")
      setTimeout(() => setSuccess(""), 3000)
    } catch (err) {
      setError("Failed to add contact. Please try again.")
      console.error("Add contact error:", err)
    } finally {
      setIsAddingContact(false)
    }
  }

  const handleBlockContact = async (contactId: string) => {
    try {
      const contact = contacts.find((c) => c.id === contactId)
      if (!contact) return

      contact.isBlocked = !contact.isBlocked
      await storage.saveContact(contact)

      const updatedContacts = contacts.map((c) => (c.id === contactId ? contact : c))
      onContactsUpdate(updatedContacts)

      setSuccess(`Contact ${contact.isBlocked ? "blocked" : "unblocked"} successfully`)
      setTimeout(() => setSuccess(""), 3000)
    } catch (err) {
      setError("Failed to update contact")
      console.error("Block contact error:", err)
    }
  }

  const handleRemoveContact = async (contactId: string) => {
    try {
      await storage.removeContact(contactId)
      const updatedContacts = contacts.filter((c) => c.id !== contactId)
      onContactsUpdate(updatedContacts)

      setSuccess("Contact removed successfully")
      setTimeout(() => setSuccess(""), 3000)
    } catch (err) {
      setError("Failed to remove contact")
      console.error("Remove contact error:", err)
    }
  }

  const handleVerifyContact = async (contactId: string) => {
    try {
      const contact = contacts.find((c) => c.id === contactId)
      if (!contact) return

      // Generate verification code for this contact
      const verificationCode = security.generateIdentityVerificationCode(contact.publicKey, contact.username)
      contact.verificationCode = verificationCode
      contact.isVerified = true

      await storage.saveContact(contact)
      const updatedContacts = contacts.map((c) => (c.id === contactId ? contact : c))
      onContactsUpdate(updatedContacts)

      setSuccess("Contact verified successfully")
      setTimeout(() => setSuccess(""), 3000)
    } catch (err) {
      setError("Failed to verify contact")
      console.error("Verify contact error:", err)
    }
  }

  const generateMyQRCode = () => {
    const qrData = security.generateIdentityVerificationCode(user.publicKey, user.username)
    setQrCodeData(qrData)
  }

  const handleScanQRCode = () => {
    if (!scanResult.trim()) {
      setError("Please enter QR code data")
      return
    }

    const verification = security.verifyIdentityCode(scanResult)
    if (!verification.isValid) {
      setError("Invalid QR code data")
      return
    }

    // Auto-fill the add contact form
    setNewContactId(verification.publicKey || "")
    setNewContactUsername(verification.username || "")
    setScanResult("")
    setSuccess("QR code scanned successfully. Review and add contact.")
    setTimeout(() => setSuccess(""), 3000)
  }

  const blockedContacts = contacts.filter((c) => c.isBlocked)
  const activeContacts = contacts.filter((c) => !c.isBlocked)

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="add" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="add">Add Contact</TabsTrigger>
          <TabsTrigger value="qr">QR Codes</TabsTrigger>
          <TabsTrigger value="blocked">Blocked ({blockedContacts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="add" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Add New Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contact-id">Contact Public ID *</Label>
                <Input
                  id="contact-id"
                  placeholder="Enter 64-character public ID..."
                  value={newContactId}
                  onChange={(e) => setNewContactId(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-username">Username (Optional)</Label>
                <Input
                  id="contact-username"
                  placeholder="Enter display name..."
                  value={newContactUsername}
                  onChange={(e) => setNewContactUsername(e.target.value)}
                />
              </div>

              <Button onClick={handleAddContact} disabled={isAddingContact || !newContactId.trim()} className="w-full">
                {isAddingContact ? "Adding Contact..." : "Add Contact"}
              </Button>

              <div className="text-sm text-muted-foreground space-y-1">
                <p>• Contact ID is their public key identifier</p>
                <p>• You can get this from their QR code or they can share it directly</p>
                <p>• Username is optional and can be changed later</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qr" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  Share Your ID
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button onClick={generateMyQRCode} variant="outline" className="w-full bg-transparent">
                  Generate My QR Code
                </Button>

                {qrCodeData && (
                  <div className="space-y-2">
                    <Label>Your QR Code Data:</Label>
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-xs font-mono break-all">{qrCodeData}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Share this data or generate a QR code for others to scan
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Scan className="h-5 w-5" />
                  Scan QR Code
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="qr-data">QR Code Data</Label>
                  <Input
                    id="qr-data"
                    placeholder="Paste QR code data here..."
                    value={scanResult}
                    onChange={(e) => setScanResult(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>

                <Button onClick={handleScanQRCode} disabled={!scanResult.trim()} className="w-full">
                  Process QR Code
                </Button>

                <p className="text-xs text-muted-foreground">
                  Paste the QR code data to automatically fill contact information
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="blocked" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Block className="h-5 w-5" />
                Blocked Contacts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {blockedContacts.length === 0 ? (
                <div className="text-center py-8">
                  <ShieldCheck className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No blocked contacts</p>
                  <p className="text-sm text-muted-foreground mt-1">Blocked contacts will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {blockedContacts.map((contact) => (
                    <div key={contact.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-destructive/10 text-destructive">
                            {contact.username[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{contact.username}</p>
                          <p className="text-xs text-muted-foreground">{contact.id.slice(0, 16)}...</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="text-xs">
                          Blocked
                        </Badge>
                        <Button size="sm" variant="outline" onClick={() => handleBlockContact(contact.id)}>
                          Unblock
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Active Contacts List with Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Active Contacts ({activeContacts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {activeContacts.length === 0 ? (
            <div className="text-center py-8">
              <UserPlus className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No contacts yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add your first contact to start messaging</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeContacts.map((contact) => (
                <div key={contact.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {contact.username[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{contact.username}</p>
                        {contact.isVerified ? (
                          <ShieldCheck className="h-4 w-4 text-primary" title="Verified" />
                        ) : (
                          <ShieldX className="h-4 w-4 text-muted-foreground" title="Not verified" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{contact.id.slice(0, 24)}...</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={contact.isOnline ? "default" : "secondary"} className="text-xs">
                      {contact.isOnline ? "Online" : "Offline"}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!contact.isVerified && (
                          <DropdownMenuItem onClick={() => handleVerifyContact(contact.id)}>
                            <Shield className="h-4 w-4 mr-2" />
                            Verify Identity
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleBlockContact(contact.id)}>
                          <Block className="h-4 w-4 mr-2" />
                          Block Contact
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleRemoveContact(contact.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remove Contact
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
