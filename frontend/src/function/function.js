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

export async function updateSecret(secretId, payload) {
  const res = await fetch(`${API_BASE_URL}/update/${secretId}`, {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.message || "Update failed")
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

// ########## Replace password  #############

export async function fetchCryptoMaterial() {
  const res = await fetch(`${API_AUTH_URL}/crypto`, {
    method: "GET",
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`Crypto fetch failed (${res.status})`);
  }

  const data = await res.json();

  if (
    !data?.encrypted_master_key ||
    !data?.encrypted_private_key ||
    !data?.kdf_salt
  ) {
    throw new Error("Invalid crypto payload from backend");
  }

  return data;
}

export async function rotatePassword(payload) {
  const res = await fetch(`${API_AUTH_URL}/crypto/rotate-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || "Password rotation failed");
  }

  return await res.json().catch(() => ({}));
}

// ######### Organization related ############

export async function createOrganization(name, encOsk) {
  const res = await fetch(`${API_BASE_URL}/org/create`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      encOsk,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || "Failed to create organization");
  }

  return data;
}

export async function createOrganizationSecret(
  orgId,
  name,
  type,
  ciphertext,
  encryptedCipherKey
) {
  const res = await fetch(`${API_BASE_URL}/org/${orgId}/secrets`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      organizationId: orgId,
      name,
      type,
      ciphertext,
      encryptedCipherKey
    })
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message || "Failed to create secret")
  }

  return await res.json().catch(() => ({}))
}

// ######## Secret related functions ##########

export async function createSecret(name, type, ciphertext) {
  const res = await fetch(`${API_BASE_URL}/create`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name,
      type,
      ciphertext
    })
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message || "Failed to create secret")
  }

  return await res.json().catch(() => ({}))
}

// ######## Organization confirmations ########

export async function fetchOrganizationDetails(orgId) {
  const res = await fetch(`${API_BASE_URL}/org/${orgId}`, {
    credentials: "include"
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.message || "Failed to fetch organization details")
  }

  return data.organization || null
}


export async function fetchPendingConfirmations(orgId) {
  const res = await fetch(
    `${API_BASE_URL}/org/${orgId}/invitations/pending-confirm`,
    {
      credentials: "include"
    }
  )

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.message || "Failed to fetch pending confirmations")
  }

  return data
}


export async function confirmOrganizationUser(orgId, invitationId, protectedOsk) {
  const res = await fetch(
    `${API_BASE_URL}/org/${orgId}/invitations/${invitationId}/confirm`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        protected_osk: protectedOsk
      })
    }
  )

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.message || "Failed to confirm user")
  }

  return data
}

// ######## Authentication ########

export async function loginUser(email, password) {
  const res = await fetch(`${API_AUTH_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      email,
      password
    })
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.message || "Login failed")
  }

  return data
}

// ######## Invitation related functions ########

export async function fetchPendingInvitations() {
  const res = await fetch(`${API_BASE_URL}/org/invitations/pending`, {
    credentials: "include"
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.message || "Failed to load invitations")
  }

  return data.invitations || []
}


export async function acceptInvitation(token) {
  const res = await fetch(`${API_BASE_URL}/invite/${token}/accept`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    }
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.message || "Failed to accept invitation")
  }

  return data
}

// ######## Organization secrets related functions ########

export async function fetchOrganizationSecrets(orgId) {
  const res = await fetch(`${API_BASE_URL}/org/${orgId}/secrets`, {
    method: "GET",
    credentials: "include"
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.message || "Failed to load organization secrets")
  }

  return data
}


export async function deleteOrganizationSecret(secretId, orgId) {
  const res = await fetch(`${API_BASE_URL}/org/secret/${secretId}`, {
    method: "DELETE",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      orgId
    })
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.message || "Failed to delete secret")
  }

  return data
}

// ######## Authentication related functions ########

export async function registerUser(payload) {
  const res = await fetch(`${API_AUTH_URL}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify(payload)
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.message || "Registration failed")
  }

  return data
}

// ######## Organization secret update functions ########

export async function fetchOrganizationSecret(orgId, secretId) {
  const res = await fetch(
    `${API_BASE_URL}/org/${orgId}/secret/${secretId}`,
    {
      credentials: "include"
    }
  )

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.message || "Failed to load secret")
  }

  return data
}


export async function updateOrganizationSecret(
  orgId,
  secretId,
  payload
) {
  const res = await fetch(
    `${API_BASE_URL}/org/${orgId}/secret/${secretId}`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  )

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.message || "Update failed")
  }

  return data
}