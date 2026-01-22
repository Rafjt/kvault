import { API_BASE_URL, API_AUTH_URL } from "../components/constant"

export async function deleteSecret(secret_id) {

    const res = await fetch(`${API_BASE_URL}/delete/${secret_id}`, {
      method: "DELETE",
      credentials: "include",
      // headers: { "Content-Type": "application/json" }
    })
    
}