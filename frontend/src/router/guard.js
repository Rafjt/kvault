import { useCryptoStore } from '../stores/crypto.store'
import { API_AUTH_URL } from '../components/constant.js'

export async function authGuard(to) {
  if (!to.meta.requiresAuth) return true

  const cryptoStore = useCryptoStore()

  // 1️⃣ MasterKey absente → login
  if (!cryptoStore.masterKey) {
    return { path: '/login' }
  }

  // 2️⃣ Vérifier session backend (cookie)
  try {
    const res = await fetch(`${API_AUTH_URL}/me`, {
      credentials: 'include'
    })

    if (!res.ok) {
      cryptoStore.clear()
      return { path: '/login' }
    }
  } catch {
    cryptoStore.clear()
    return { path: '/login' }
  }

  return true
}
