import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, MerchantLead, Order, Restaurant } from './api'

const STATUS_LABELS: Record<string, string> = {
  new: 'Novo',
  accepted: 'Aceito',
  preparing: 'Em preparo',
  ready: 'Pronto',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}

const NEXT_STATUS: Record<string, string | undefined> = {
  new: 'accepted',
  accepted: 'preparing',
  preparing: 'ready',
  ready: 'completed',
}

function App() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [leads, setLeads] = useState<MerchantLead[]>([])
  const [selectedRestaurant, setSelectedRestaurant] = useState<number>(1)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [restaurantResponse, orderResponse, leadResponse] = await Promise.all([
        api.get<Restaurant[]>('/restaurants/'),
        api.get<Order[]>('/orders/', { params: { restaurant: selectedRestaurant } }),
        api.get<MerchantLead[]>('/merchant-leads/'),
      ])
      setRestaurants(restaurantResponse.data)
      setOrders(orderResponse.data)
      setLeads(leadResponse.data)
      setError('')
    } catch (requestError) {
      setError('Não foi possível conectar à API Django. Verifique se o backend está ativo.')
      console.error(requestError)
    }
  }, [selectedRestaurant])

  useEffect(() => {
    void loadData()
    const intervalId = window.setInterval(() => void loadData(), 5000)
    return () => window.clearInterval(intervalId)
  }, [loadData])

  const selected = useMemo(
    () => restaurants.find((restaurant) => restaurant.id === selectedRestaurant),
    [restaurants, selectedRestaurant],
  )

  async function advanceStatus(order: Order) {
    const next = NEXT_STATUS[order.status]
    if (!next) return
    await api.patch(`/orders/${order.id}/`, { status: next })
    await loadData()
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <span className="eyebrow">MVP LOCAL · ALEXA + DJANGO + REACT</span>
          <h1>Portal do comerciante</h1>
          <p>Pedidos feitos pela Skill aparecem aqui. A tela atualiza automaticamente a cada cinco segundos.</p>
        </div>
        <div className="live">● AO VIVO</div>
      </header>

      {error && <div className="error">{error}</div>}

      <section className="toolbar card">
        <label>
          Estabelecimento visualizado
          <select value={selectedRestaurant} onChange={(event) => setSelectedRestaurant(Number(event.target.value))}>
            {restaurants.filter((restaurant) => restaurant.registered).map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
            ))}
          </select>
        </label>
        <div>
          <strong>{selected?.name ?? 'Carregando...'}</strong>
          <span>{selected?.address}</span>
        </div>
      </section>

      <section className="stats">
        <article className="card stat"><span>Pedidos recebidos</span><strong>{orders.length}</strong></article>
        <article className="card stat"><span>Novos</span><strong>{orders.filter((order) => order.status === 'new').length}</strong></article>
        <article className="card stat"><span>Leads de cadastro</span><strong>{leads.reduce((sum, lead) => sum + lead.recommendation_count, 0)}</strong></article>
      </section>

      <section className="content-grid">
        <div>
          <div className="section-heading">
            <div><span className="eyebrow">OPERAÇÃO</span><h2>Pedidos</h2></div>
            <button onClick={() => void loadData()}>Atualizar</button>
          </div>

          <div className="order-list">
            {orders.length === 0 && <div className="card empty">Nenhum pedido recebido ainda. Faça o teste pela Alexa ou pelo endpoint da API.</div>}
            {orders.map((order) => (
              <article className="card order" key={order.id}>
                <div className="order-top">
                  <div><span className="reference">{order.reference}</span><h3>{order.customer_name}</h3></div>
                  <span className={`badge badge-${order.status}`}>{STATUS_LABELS[order.status] ?? order.status}</span>
                </div>
                <div className="meta"><span>{order.source.toUpperCase()}</span><span>{new Date(order.created_at).toLocaleString('pt-BR')}</span></div>
                <ul>
                  {order.items.map((item) => (
                    <li key={item.id}><span>{item.quantity}× {item.item_name}</span><strong>R$ {item.subtotal}</strong></li>
                  ))}
                </ul>
                <div className="order-bottom">
                  <div><span>Total</span><strong>R$ {order.total}</strong></div>
                  {NEXT_STATUS[order.status] && (
                    <button className="primary" onClick={() => void advanceStatus(order)}>
                      Marcar como {STATUS_LABELS[NEXT_STATUS[order.status]!]}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside>
          <div className="section-heading"><div><span className="eyebrow">AQUISIÇÃO</span><h2>Comerciantes sugeridos</h2></div></div>
          <div className="lead-list">
            {leads.length === 0 && <div className="card empty">Escolha “Forno da Vila” na Skill para criar o primeiro lead.</div>}
            {leads.map((lead) => (
              <article className="card lead" key={lead.id}>
                <span className="badge">{lead.status}</span>
                <h3>{lead.restaurant_name}</h3>
                <strong>{lead.recommendation_count} indicação(ões)</strong>
                <small>Última ocorrência: {new Date(lead.last_seen_at).toLocaleString('pt-BR')}</small>
              </article>
            ))}
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App
