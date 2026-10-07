'use client'

import { useState } from 'react'
import { Github, Globe, MessageCircle, PenLine, Send, Twitter } from 'lucide-react'
import AddressAvatar from '@/components/AddressAvatar'
import { TokenMark } from '@/components/explorer/ui'
import { profileImage, useProfile } from '@/lib/profiles/client'
import { socialLinks, type ProfileFields, type PublicProfile } from '@/lib/profiles/claim'
import { cn } from '@/lib/utils'

/** An account's image when its owner published one, else its identicon. */
export function ProfileAvatar({
  address,
  profile,
  size = 24,
  fallbackImage,
  className,
}: {
  address: string
  profile: PublicProfile | null | undefined
  size?: number
  /** A curated image (known addresses) used before the identicon. */
  fallbackImage?: string
  className?: string
}) {
  const src = profileImage(profile)
  const [broken, setBroken] = useState<string | null>(null)
  if (src && broken !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setBroken(src)}
        className={cn('shrink-0 rounded-lg bg-muted object-cover', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return <AddressAvatar address={address} size={size} imageUrl={fallbackImage} className={className} />
}

/** A token's image when its creator published one, else its lettered mark. */
export function TokenImage({ symbol, profile, size = 36, className }: { symbol: string; profile: PublicProfile | null | undefined; size?: number; className?: string }) {
  const src = profileImage(profile)
  const [broken, setBroken] = useState<string | null>(null)
  if (src && broken !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(src)}
        className={cn('shrink-0 rounded-full bg-muted object-cover', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return <TokenMark symbol={symbol} size={size} className={className} />
}

/** Marks text an owner published about themselves: signed by them, checked by no one. */
export function ClaimedPill({ kind, className }: { kind: 'account' | 'token'; className?: string }) {
  return (
    <span
      title={
        kind === 'account'
          ? 'The owner of this address published this profile, signed with its key. Names are not unique or checked.'
          : 'The token’s creator published this, signed with their key. It is not checked by QRDX.'
      }
      className={cn('inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary', className)}
    >
      <PenLine className="h-3 w-3" />
      {kind === 'account' ? 'Claimed by owner' : 'Set by creator'}
    </span>
  )
}

const ICONS = { website: Globe, x: Twitter, telegram: Send, github: Github, discord: MessageCircle }

export function ProfileLinks({ profile, className }: { profile: ProfileFields; className?: string }) {
  const links = socialLinks(profile)
  if (!links.length) return null
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {links.map((l) => {
        const Icon = ICONS[l.kind]
        return (
          <a
            key={l.kind}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Icon className="h-3.5 w-3.5" />
            {l.label}
          </a>
        )
      })}
    </div>
  )
}

/** TokenImage that looks up the token's profile itself, for lists. */
export function TokenAvatar({ address, symbol, size = 32, className }: { address: string | null; symbol: string; size?: number; className?: string }) {
  const profile = useProfile('token', address && /^0x[0-9a-fA-F]{40}$/.test(address) ? address : null)
  return <TokenImage symbol={symbol} profile={profile} size={size} className={className} />
}
