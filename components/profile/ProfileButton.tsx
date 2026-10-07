'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PenLine, UserRoundCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProfileEditor } from '@/components/profile/ProfileEditor'
import type { ProfileKind, PublicProfile } from '@/lib/profiles/claim'
import { profileNetwork } from '@/lib/profiles/client'
import { useWallet } from '@/lib/wallet/WalletContext'

/**
 * "Claim" / "Edit profile" for an account (its owner) or a token (its creator).
 * Opens itself on ?profile=edit, which the wallet menu links to.
 */
export function ProfileButton({
  kind,
  subject,
  signer,
  label,
  profile,
}: {
  kind: ProfileKind
  subject: string
  signer: string | null
  label: string
  profile: PublicProfile | null | undefined
}) {
  const w = useWallet()
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Wait for the profile, so the editor opens on what is published (or nothing).
  useEffect(() => {
    if (params.get('profile') === 'edit' && signer && profile !== undefined) {
      setOpen(true)
      router.replace(pathname, { scroll: false })
    }
  }, [params, signer, profile, router, pathname])

  if (!signer || profile === undefined || !profileNetwork()) return null
  const mine = w.owns(signer)
  // Strangers see nothing on a claimed profile; only the owner can change it.
  if (profile && !mine) return (open && <ProfileEditor open={open} onOpenChange={setOpen} kind={kind} subject={subject} signer={signer} label={label} current={profile} />) || null

  const text = mine ? (profile ? 'Edit profile' : kind === 'account' ? 'Claim address' : `Claim ${label}`) : kind === 'account' ? 'Is this you? Claim it' : `Created ${label}? Claim it`
  return (
    <>
      <Button size="sm" variant={mine && !profile ? 'default' : 'outline'} onClick={() => setOpen(true)} data-testid="profile-button">
        {profile ? <PenLine className="h-4 w-4" /> : <UserRoundCheck className="h-4 w-4" />}
        {text}
      </Button>
      <ProfileEditor open={open} onOpenChange={setOpen} kind={kind} subject={subject} signer={signer} label={label} current={profile} />
    </>
  )
}
