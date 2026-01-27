'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tag, Upload, Shield, Check } from 'lucide-react'

interface ClaimWalletDialogProps {
  address: string
  onClaim?: (metadata: { name: string; description: string; image: string }) => void
}

export default function ClaimWalletDialog({ address, onClaim }: ClaimWalletDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState('')
  const [step, setStep] = useState<'form' | 'signing' | 'success'>('form')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStep('signing')
    setIsSubmitting(true)

    // Simulate signature request
    await new Promise(resolve => setTimeout(resolve, 2000))

    setStep('success')
    await new Promise(resolve => setTimeout(resolve, 1000))

    const metadata = { name, description, image: image || '/logo.png' }
    onClaim?.(metadata)

    // Reset form
    setName('')
    setDescription('')
    setImage('')
    setStep('form')
    setIsSubmitting(false)
    setOpen(false)
  }

  const handleCancel = () => {
    if (step === 'signing') return // Prevent closing during signing
    setStep('form')
    setIsSubmitting(false)
  }

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen && step !== 'signing') {
        setOpen(false)
        setStep('form')
        setIsSubmitting(false)
      } else if (newOpen) {
        setOpen(true)
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Tag className="h-4 w-4" />
          Claim Address
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        {step === 'form' && (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Claim Address</DialogTitle>
              <DialogDescription>
                Add custom information to your address. You&apos;ll need to sign a message to verify ownership.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  placeholder="My QRDX Wallet"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="This is my main trading wallet for quantum-resistant assets..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="image">Image URL (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="image"
                    type="url"
                    placeholder="https://example.com/avatar.png"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                  />
                  <Button type="button" variant="outline" size="icon">
                    <Upload className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave empty to use default QRDX logo
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!name}>
                Continue to Sign
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === 'signing' && (
          <>
            <DialogHeader>
              <DialogTitle>Sign Message to Verify</DialogTitle>
              <DialogDescription>
                Please sign the message in your wallet to prove ownership of this address.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center py-8">
              <div className="p-4 rounded-full bg-primary/10 mb-4">
                <Shield className="h-12 w-12 text-primary animate-pulse" />
              </div>
              <p className="text-lg font-medium mb-2">Waiting for signature...</p>
              <p className="text-sm text-muted-foreground text-center">
                Check your wallet to sign the verification message
              </p>
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle>Address Claimed!</DialogTitle>
              <DialogDescription>
                Your address has been successfully claimed and verified.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center py-8">
              <div className="p-4 rounded-full bg-green-500/10 mb-4">
                <Check className="h-12 w-12 text-green-500" />
              </div>
              <p className="text-lg font-medium text-green-500">Success!</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
