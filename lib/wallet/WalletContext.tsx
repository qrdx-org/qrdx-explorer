'use client'

/**
 * The QRDX Wallet, linked the same way as on trade.qrdx.org: the browser
 * extension (EIP-6963, rdns org.qrdx.wallet), or the app on a phone through a QR
 * code and QRDX Connect, over trade's relay. The explorer only reads accounts and
 * asks for message signatures (claiming a profile, docs/PROFILES.md); it never
 * sends a transaction.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { DiscoveredProvider, QrdxAccount, QrdxChainInfo, discoverQrdxWallet, providerErrorMessage } from './provider'
import { RemoteProvider, RemoteState } from './remote'

export type WalletStatus = 'detecting' | 'missing' | 'disconnected' | 'connecting' | 'connected'
export type Connection = 'extension' | 'remote'

export interface SignedMessage {
  signature: string
  /** ML-DSA-65 public key, for 0xPQ signers. */
  publicKey?: string
}

interface WalletState {
  status: WalletStatus
  extension: DiscoveredProvider | null
  connection: Connection | null
  /** While pairing a phone: the link the QR code shows. */
  pairing: string | null
  phone: RemoteState | null
  accounts: QrdxAccount[]
  account: QrdxAccount | null
  chain: QrdxChainInfo | null
  error: string | null
  connect: () => Promise<void>
  connectPhone: () => Promise<void>
  cancelPairing: () => void
  disconnect: () => Promise<void>
  /** Whether `address` (0xPQ… or 0x…) is one of the connected accounts. */
  owns: (address: string | null | undefined) => boolean
  /**
   * Sign `message` as `address`: ML-DSA-65 (qrdx_signPQMessage) for a 0xPQ address,
   * EIP-191 (personal_sign) for a 0x address. The person approves it in the wallet.
   */
  signMessage: (address: string, message: string) => Promise<SignedMessage>
}

const WalletCtx = createContext<WalletState | null>(null)
const REMEMBER = 'qrdx-explorer:connected'
const PHONE = { uuid: 'qrdx-connect', name: 'QRDX Wallet (phone)', icon: '', rdns: 'org.qrdx.connect' }

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>('detecting')
  const [extension, setExtension] = useState<DiscoveredProvider | null>(null)
  const [wallet, setWallet] = useState<DiscoveredProvider | null>(null)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [pairing, setPairing] = useState<string | null>(null)
  const [phone, setPhone] = useState<RemoteState | null>(null)
  const [accounts, setAccounts] = useState<QrdxAccount[]>([])
  const [chain, setChain] = useState<QrdxChainInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const walletRef = useRef<DiscoveredProvider | null>(null)
  const extensionRef = useRef<DiscoveredProvider | null>(null)
  const pairingRef = useRef<RemoteProvider | null>(null)

  const use = useCallback((w: DiscoveredProvider | null, kind: Connection | null) => {
    walletRef.current = w
    setWallet(w)
    setConnection(kind)
  }, [])

  const readState = useCallback(async (w: DiscoveredProvider, request: boolean) => {
    // A phone may be asleep: plain reads give up quickly; asking to connect waits for its owner.
    const remote = (w.provider as RemoteProvider).isRemote === true
    const ask = <T,>(method: string, long = false) =>
      remote ? (w.provider as RemoteProvider).request<T>({ method }, long ? undefined : 10_000) : w.provider.request<T>({ method })
    const accs = await ask<QrdxAccount[]>(request ? 'qrdx_requestAccounts' : 'qrdx_accounts', request)
    const info = await ask<QrdxChainInfo>('qrdx_chainInfo').catch(() => null)
    setAccounts(accs ?? [])
    if (info) setChain(info)
    setStatus(accs?.length ? 'connected' : 'disconnected')
    if (remote) RemoteProvider.remember({ accounts: accs, ...(info ? { chain: info } : {}) })
    else if (accs?.length) localStorage.setItem(REMEMBER, 'extension')
  }, [])

  // Find the extension, then restore what this browser was linked to.
  useEffect(() => {
    let cancelled = false
    discoverQrdxWallet().then(async (ext) => {
      if (cancelled) return
      extensionRef.current = ext
      setExtension(ext)
      const remembered = localStorage.getItem(REMEMBER)
      const remote = remembered === 'remote' ? RemoteProvider.restore((st) => setPhone(st)) : null
      if (remote) {
        const w = { info: PHONE, provider: remote }
        use(w, 'remote')
        const cached = RemoteProvider.cached()
        if (Array.isArray(cached.accounts) && cached.accounts.length) {
          setAccounts(cached.accounts as QrdxAccount[])
          if (cached.chain) setChain(cached.chain as QrdxChainInfo)
          setStatus('connected')
        } else setStatus('connecting')
        await remote.start().catch(() => undefined)
        readState(w, false).catch(() => undefined)
        return
      }
      use(ext, ext ? 'extension' : null)
      if (!ext) return setStatus('missing')
      setStatus('disconnected')
      if (remembered) await readState(ext, false).catch(() => setStatus('disconnected'))
    })
    return () => {
      cancelled = true
    }
  }, [readState, use])

  // Follow the wallet: account switches, network switches, disconnects.
  useEffect(() => {
    const p = wallet?.provider
    if (!p?.on) return
    const refresh = () => {
      if (walletRef.current) readState(walletRef.current, false).catch(() => undefined)
    }
    const onDisconnect = () => {
      setAccounts([])
      if ((p as RemoteProvider).isRemote) {
        localStorage.removeItem(REMEMBER)
        setPhone(null)
        use(extensionRef.current, extensionRef.current ? 'extension' : null)
        setStatus(extensionRef.current ? 'disconnected' : 'missing')
      } else setStatus('disconnected')
    }
    p.on('accountsChanged', refresh)
    p.on('chainChanged', refresh)
    p.on('disconnect', onDisconnect)
    return () => {
      p.removeListener?.('accountsChanged', refresh)
      p.removeListener?.('chainChanged', refresh)
      p.removeListener?.('disconnect', onDisconnect)
    }
  }, [wallet, readState, use])

  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === 'visible') (walletRef.current?.provider as RemoteProvider | undefined)?.wake?.()
    }
    document.addEventListener('visibilitychange', wake)
    return () => document.removeEventListener('visibilitychange', wake)
  }, [])

  const connect = useCallback(async () => {
    const w = extensionRef.current
    if (!w) return
    setError(null)
    setStatus('connecting')
    use(w, 'extension')
    try {
      await readState(w, true)
    } catch (e) {
      setError(providerErrorMessage(e))
      setStatus('disconnected')
    }
  }, [readState, use])

  const connectPhone = useCallback(async () => {
    setError(null)
    pairingRef.current?.disconnect().catch(() => undefined)
    const remote = RemoteProvider.create((st) => setPhone(st))
    pairingRef.current = remote
    try {
      await remote.start()
      setPairing(remote.pairingLink())
      setStatus('connecting')
      const w = { info: PHONE, provider: remote }
      await readState(w, true)
      if (pairingRef.current !== remote) return
      localStorage.setItem(REMEMBER, 'remote')
      use(w, 'remote')
    } catch (e) {
      if (pairingRef.current !== remote) return
      setError(providerErrorMessage(e))
      await remote.disconnect().catch(() => undefined)
      setPhone(null)
      setStatus(extensionRef.current ? 'disconnected' : 'missing')
    } finally {
      if (pairingRef.current === remote) {
        pairingRef.current = null
        setPairing(null)
      }
    }
  }, [readState, use])

  const cancelPairing = useCallback(() => {
    const remote = pairingRef.current
    pairingRef.current = null
    setPairing(null)
    setPhone(null)
    remote?.disconnect().catch(() => undefined)
    setStatus(walletRef.current && accounts.length ? 'connected' : extensionRef.current ? 'disconnected' : 'missing')
  }, [accounts.length])

  const disconnect = useCallback(async () => {
    const w = walletRef.current
    localStorage.removeItem(REMEMBER)
    setAccounts([])
    if ((w?.provider as RemoteProvider | undefined)?.isRemote) {
      await (w!.provider as RemoteProvider).disconnect().catch(() => undefined)
      setPhone(null)
      use(extensionRef.current, extensionRef.current ? 'extension' : null)
      setStatus(extensionRef.current ? 'disconnected' : 'missing')
      return
    }
    setStatus(w ? 'disconnected' : 'missing')
    await w?.provider.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }).catch(() => undefined)
  }, [use])

  const owns = useCallback(
    (address: string | null | undefined) => {
      if (!address) return false
      const a = address.toLowerCase()
      return accounts.some((x) => x.address.toLowerCase() === a || x.pqAddress.toLowerCase() === a)
    },
    [accounts]
  )

  const signMessage = useCallback(
    async (address: string, message: string): Promise<SignedMessage> => {
      const w = walletRef.current
      if (!w || !accounts.length) throw new Error('Link the QRDX Wallet first.')
      try {
        if (/^0xPQ/i.test(address)) {
          const res = await w.provider.request<{ signature: string; publicKey: string; address: string }>({
            method: 'qrdx_signPQMessage',
            params: [message, address],
          })
          return { signature: res.signature, publicKey: res.publicKey }
        }
        const signature = await w.provider.request<string>({ method: 'personal_sign', params: [message, address] })
        return { signature }
      } catch (e) {
        throw new Error(providerErrorMessage(e))
      }
    },
    [accounts.length]
  )

  const account = accounts[0] ?? null
  const value = useMemo<WalletState>(
    () => ({ status, extension, connection, pairing, phone, accounts, account, chain, error, connect, connectPhone, cancelPairing, disconnect, owns, signMessage }),
    [status, extension, connection, pairing, phone, accounts, account, chain, error, connect, connectPhone, cancelPairing, disconnect, owns, signMessage]
  )
  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>
}

export function useWallet(): WalletState {
  const v = useContext(WalletCtx)
  if (!v) throw new Error('useWallet outside WalletProvider')
  return v
}
