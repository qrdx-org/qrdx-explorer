'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Shield, Check, X } from 'lucide-react'

interface SignMessageButtonProps {
  address: string
  onVerify?: (signature: string) => void
}

export default function SignMessageButton({ address, onVerify }: SignMessageButtonProps) {
  const [status, setStatus] = useState<'idle' | 'signing' | 'verified' | 'failed'>('idle')

  const handleSign = async () => {
    setStatus('signing')

    try {
      // Simulate wallet signature request
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Simulate successful signature (in real app, would use window.ethereum)
      const mockSignature = `0x${Math.random().toString(16).slice(2)}...`
      onVerify?.(mockSignature)
      setStatus('verified')

      // Reset after 3 seconds
      setTimeout(() => setStatus('idle'), 3000)
    } catch (error) {
      setStatus('failed')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  return (
    <Button
      variant={status === 'verified' ? 'default' : 'outline'}
      size="sm"
      onClick={handleSign}
      disabled={status !== 'idle'}
      className="relative"
    >
      {status === 'idle' && (
        <>
          <Shield className="h-4 w-4" />
          Sign Message
        </>
      )}
      {status === 'signing' && (
        <>
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Signing...
        </>
      )}
      {status === 'verified' && (
        <>
          <Check className="h-4 w-4" />
          Verified
        </>
      )}
      {status === 'failed' && (
        <>
          <X className="h-4 w-4" />
          Failed
        </>
      )}
    </Button>
  )
}
