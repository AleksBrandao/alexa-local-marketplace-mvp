import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api',
  timeout: 8000,
})

export type Restaurant = {
  id: number
  name: string
  registered: boolean
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
