'use client'

import { ErrorRecovery } from '@/components/ErrorRecovery'

/** A page crashed: the navigation and status bar stay, the page shows how to recover. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorRecovery error={error} reset={reset} />
}
