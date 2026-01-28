'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { generateIdenticon } from '@/lib/identicon'

interface AddressAvatarProps {
  address: string
  size?: number
  imageUrl?: string
  className?: string
}

export default function AddressAvatar({ 
  address, 
  size = 64, 
  imageUrl,
  className = ''
}: AddressAvatarProps) {
  const [identiconUrl, setIdenticonUrl] = useState<string>('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && !imageUrl) {
      const url = generateIdenticon(address, size)
      if (url) {
        setIdenticonUrl(url)
      }
    }
  }, [address, size, imageUrl, mounted])

  // Show placeholder during SSR or while loading
  if (!mounted || (!imageUrl && !identiconUrl)) {
    return (
      <div
        className={`rounded-lg bg-muted ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  const src = imageUrl || identiconUrl

  return (
    <Image
      src={src}
      alt={`Avatar for ${address}`}
      width={size}
      height={size}
      className={`rounded-lg ${className}`}
      unoptimized={!imageUrl}
    />
  )
}
