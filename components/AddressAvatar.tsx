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

  useEffect(() => {
    if (!imageUrl && typeof window !== 'undefined') {
      const url = generateIdenticon(address, size)
      setIdenticonUrl(url)
    }
  }, [address, size, imageUrl])

  const src = imageUrl || identiconUrl

  if (!src) {
    return (
      <div
        className={`rounded-lg bg-muted ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

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
