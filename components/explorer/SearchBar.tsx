'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { resolveSearch } from '@/lib/qrdx'

export default function SearchBar({
  placeholder = 'Search by address / tx hash / block number / block hash',
  size = 'lg',
}: {
  placeholder?: string
  size?: 'md' | 'lg'
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      const target = await resolveSearch(query)
      if (target.type === 'none') {
        setMessage('Enter a block number, 64-character hash, or a QRDX address (0x…, 0xPQ…, Q…/R…).')
      } else {
        router.push(target.path)
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5" />
        <Input
          type="text"
          placeholder={placeholder}
          className={`w-full pl-12 pr-28 rounded-xl border-2 ${size === 'lg' ? 'py-6 text-lg' : 'py-5'}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
        <Button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2" size={size === 'lg' ? 'lg' : 'default'} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
        </Button>
      </div>
      {message && <p className="text-sm text-muted-foreground mt-2 text-left">{message}</p>}
    </form>
  )
}
