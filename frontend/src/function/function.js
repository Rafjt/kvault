import { API_BASE_URL, API_AUTH_URL } from "../components/constant"

export async function deleteSecret(secret_id) {

    const res = await fetch(`${API_BASE_URL}/delete/${secret_id}`, {
      method: "DELETE",
      credentials: "include",
      // headers: { "Content-Type": "application/json" }
    })
    
}


export async function fetchSecret(secret_id) {
  const res = await fetch(`${API_BASE_URL}/secrets/${secret_id}`, {
    method: "GET",
    credentials: "include",
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.message || "Failed to fetch secret")
  }

  return data
}

export async function fetchOrg(orgId) {
  const res = await fetch(`${API_BASE_URL}/org/${orgId}`, {
      method: "GET",
      credentials: "include",
    })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.message || "Failed to fetch secret")
  }

  return data
}