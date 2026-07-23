import axios from 'axios'
import type {
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios'

const API_BASE_URL =
  import.meta.env.VITE_API_URL
  ?? 'http://127.0.0.1:8000/api'

const ACCESS_TOKEN_KEY = 'aqui-perto-access'
const REFRESH_TOKEN_KEY = 'aqui-perto-refresh'

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
})

const authApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
})

export type AuthTokens = {
  access: string
  refresh: string
}

export type CurrentUserRestaurant = {
  id: number
  name: string
  registered: boolean
  active: boolean
}

export type CurrentUser = {
  id: number
  username: string
  email: string
  is_staff: boolean
  is_superuser: boolean
  restaurants: CurrentUserRestaurant[]
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function saveAuthTokens(tokens: AuthTokens) {
  localStorage.setItem(
    ACCESS_TOKEN_KEY,
    tokens.access,
  )

  localStorage.setItem(
    REFRESH_TOKEN_KEY,
    tokens.refresh,
  )
}

export function clearAuthTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

export async function blacklistRefreshToken() {
  const refresh = getRefreshToken()

  if (!refresh) {
    return
  }

  await authApi.post('/auth/logout/', {
    refresh,
  })
}

type RetryableRequestConfig =
  InternalAxiosRequestConfig & {
    _retry?: boolean
  }

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refresh = getRefreshToken()

  if (!refresh) {
    return null
  }

  try {
    const response = await authApi.post<{
      access: string
      refresh?: string
    }>('/auth/refresh/', {
      refresh,
    })

    const access = response.data.access
    const rotatedRefresh =
      response.data.refresh ?? refresh

    saveAuthTokens({
      access,
      refresh: rotatedRefresh,
    })

    return access
  } catch {
    clearAuthTokens()

    window.dispatchEvent(
      new Event('auth:logout'),
    )

    return null
  }
}

api.interceptors.request.use((config) => {
  const access = getAccessToken()

  if (access) {
    config.headers.Authorization =
      `Bearer ${access}`
  }

  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest =
      error.config as
        | RetryableRequestConfig
        | undefined

    if (
      !originalRequest
      || error.response?.status !== 401
      || originalRequest._retry
    ) {
      return Promise.reject(error)
    }

    const requestUrl =
      originalRequest.url ?? ''

    if (
      requestUrl.includes('/auth/login/')
      || requestUrl.includes('/auth/refresh/')
    ) {
      return Promise.reject(error)
    }

    originalRequest._retry = true

    if (!refreshPromise) {
      refreshPromise = refreshAccessToken()
        .finally(() => {
          refreshPromise = null
        })
    }

    const newAccess = await refreshPromise

    if (!newAccess) {
      return Promise.reject(error)
    }

    originalRequest.headers.Authorization =
      `Bearer ${newAccess}`

    return api(originalRequest)
  },
)

export type Restaurant = {
  id: number
  name: string
  registered: boolean
  active?: boolean
  address: string
  recommendation_count: number
}

export type OrderItem = {
  id: number
  item_name: string
  quantity: number
  unit_price: string
  subtotal: string
}

export type Order = {
  id: number
  reference: string
  restaurant: number
  restaurant_name: string
  customer_name: string
  customer_phone: string
  delivery_address: string
  total: string
  status: string
  source: string
  created_at: string
  items: OrderItem[]
}

export type MerchantLead = {
  id: number
  restaurant: number
  restaurant_name: string
  recommendation_count: number
  status: string
  last_seen_at: string
}