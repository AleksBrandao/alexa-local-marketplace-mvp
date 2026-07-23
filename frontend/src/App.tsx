import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import type { FormEvent } from 'react'

import {
  api,
  blacklistRefreshToken,
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  saveAuthTokens,
} from './api'

import type {
  AuthTokens,
  CurrentUser,
  MerchantLead,
  Order,
  Restaurant,
} from './api'

const STATUS_LABELS: Record<string, string> = {
  new: 'Novo',
  accepted: 'Aceito',
  preparing: 'Em preparo',
  ready: 'Pronto',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}

const NEXT_STATUS:
  Record<string, string | undefined> = {
    new: 'accepted',
    accepted: 'preparing',
    preparing: 'ready',
    ready: 'completed',
  }

type AuthState =
  | 'checking'
  | 'authenticated'
  | 'anonymous'

function App() {
  const [authState, setAuthState] =
    useState<AuthState>('checking')

  const [currentUser, setCurrentUser] =
    useState<CurrentUser | null>(null)

  const [username, setUsername] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [loginLoading, setLoginLoading] =
    useState(false)

  const [loginError, setLoginError] =
    useState('')

  const [restaurants, setRestaurants] =
    useState<Restaurant[]>([])

  const [orders, setOrders] =
    useState<Order[]>([])

  const [leads, setLeads] =
    useState<MerchantLead[]>([])

  const [
    selectedRestaurant,
    setSelectedRestaurant,
  ] = useState<number | null>(null)

  const [error, setError] = useState('')

  const clearPortalState = useCallback(() => {
    setCurrentUser(null)
    setRestaurants([])
    setOrders([])
    setLeads([])
    setSelectedRestaurant(null)
    setAuthState('anonymous')
  }, [])

  const loadProfile = useCallback(async () => {
    const response = await api.get<CurrentUser>(
      '/auth/me/',
    )

    const profile = response.data

    setCurrentUser(profile)
    setAuthState('authenticated')

    setSelectedRestaurant(
      (currentRestaurant) => {
        const currentStillExists =
          profile.restaurants.some(
            (restaurant) =>
              restaurant.id
              === currentRestaurant,
          )

        if (currentStillExists) {
          return currentRestaurant
        }

        return (
          profile.restaurants[0]?.id
          ?? null
        )
      },
    )

    return profile
  }, [])

  useEffect(() => {
    const hasStoredSession =
      Boolean(getAccessToken())
      || Boolean(getRefreshToken())

    if (!hasStoredSession) {
      setAuthState('anonymous')
      return
    }

    void loadProfile().catch(() => {
      clearAuthTokens()
      clearPortalState()
    })
  }, [clearPortalState, loadProfile])

  useEffect(() => {
    function handleForcedLogout() {
      clearPortalState()
    }

    window.addEventListener(
      'auth:logout',
      handleForcedLogout,
    )

    return () => {
      window.removeEventListener(
        'auth:logout',
        handleForcedLogout,
      )
    }
  }, [clearPortalState])

  const loadData = useCallback(async () => {
    if (
      authState !== 'authenticated'
      || !currentUser
      || selectedRestaurant === null
    ) {
      return
    }

    try {
      const leadRequest = currentUser.is_staff
        ? api.get<MerchantLead[]>(
            '/merchant-leads/',
          )
        : Promise.resolve({
            data: [] as MerchantLead[],
          })

      const [
        restaurantResponse,
        orderResponse,
        leadResponse,
      ] = await Promise.all([
        api.get<Restaurant[]>(
          '/restaurants/',
        ),
        api.get<Order[]>(
          '/orders/',
          {
            params: {
              restaurant:
                selectedRestaurant,
            },
          },
        ),
        leadRequest,
      ])

      setRestaurants(
        restaurantResponse.data,
      )

      setOrders(
        orderResponse.data,
      )

      setLeads(
        leadResponse.data,
      )

      setError('')
    } catch (requestError) {
      setError(
        'Não foi possível carregar os dados '
        + 'do portal.',
      )

      console.error(requestError)
    }
  }, [
    authState,
    currentUser,
    selectedRestaurant,
  ])

  useEffect(() => {
    if (
      authState !== 'authenticated'
      || selectedRestaurant === null
    ) {
      return
    }

    void loadData()

    const intervalId = window.setInterval(
      () => {
        void loadData()
      },
      5000,
    )

    return () => {
      window.clearInterval(intervalId)
    }
  }, [
    authState,
    loadData,
    selectedRestaurant,
  ])

  const selected = useMemo(
    () =>
      restaurants.find(
        (restaurant) =>
          restaurant.id
          === selectedRestaurant,
      ),
    [
      restaurants,
      selectedRestaurant,
    ],
  )

  async function handleLogin(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    setLoginLoading(true)
    setLoginError('')

    try {
      const response =
        await api.post<AuthTokens>(
          '/auth/login/',
          {
            username,
            password,
          },
        )

      saveAuthTokens(response.data)

      await loadProfile()

      setPassword('')
    } catch {
      clearAuthTokens()

      setLoginError(
        'Usuário ou senha inválidos.',
      )

      setAuthState('anonymous')
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleLogout() {
    try {
      await blacklistRefreshToken()
    } catch (logoutError) {
      console.error(
        'Não foi possível invalidar '
        + 'o token no servidor.',
        logoutError,
      )
    } finally {
      clearAuthTokens()
      clearPortalState()
    }
  }

  async function advanceStatus(order: Order) {
    const next = NEXT_STATUS[order.status]

    if (!next) {
      return
    }

    try {
      await api.patch(
        `/orders/${order.id}/`,
        {
          status: next,
        },
      )

      await loadData()
    } catch (requestError) {
      setError(
        'Não foi possível alterar '
        + 'o status do pedido.',
      )

      console.error(requestError)
    }
  }

  if (authState === 'checking') {
    return (
      <main className="auth-shell">
        <section className="card auth-card">
          <span className="eyebrow">
            AQUI PERTO
          </span>

          <h1>Verificando sessão</h1>

          <p>
            Validando o acesso ao portal
            do comerciante.
          </p>
        </section>
      </main>
    )
  }

  if (
    authState !== 'authenticated'
    || !currentUser
  ) {
    return (
      <main className="auth-shell">
        <section className="card auth-card">
          <div className="auth-brand">
            <span className="eyebrow">
              AQUI PERTO
            </span>

            <h1>Portal do comerciante</h1>

            <p>
              Entre para acompanhar pedidos
              e administrar seu estabelecimento.
            </p>
          </div>

          <form
            className="auth-form"
            onSubmit={handleLogin}
          >
            <label>
              Usuário

              <input
                type="text"
                value={username}
                onChange={(event) => {
                  setUsername(
                    event.target.value,
                  )
                }}
                autoComplete="username"
                required
                autoFocus
              />
            </label>

            <label>
              Senha

              <input
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(
                    event.target.value,
                  )
                }}
                autoComplete="current-password"
                required
              />
            </label>

            {loginError && (
              <div className="error">
                {loginError}
              </div>
            )}

            <button
              className="primary auth-submit"
              type="submit"
              disabled={loginLoading}
            >
              {loginLoading
                ? 'Entrando...'
                : 'Entrar'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <span className="eyebrow">
            MVP LOCAL · ALEXA + DJANGO + REACT
          </span>

          <h1>Portal do comerciante</h1>

          <p>
            Pedidos feitos pela Skill aparecem
            aqui. A tela atualiza automaticamente
            a cada cinco segundos.
          </p>
        </div>

        <div className="session-area">
          <div className="session-user">
            <strong>
              {currentUser.username}
            </strong>

            <span>
              {currentUser.email
                || 'Usuário autenticado'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              void handleLogout()
            }}
          >
            Sair
          </button>

          <div className="live">
            ● AO VIVO
          </div>
        </div>
      </header>

      {error && (
        <div className="error">
          {error}
        </div>
      )}

      <section className="toolbar card">
        <label>
          Estabelecimento visualizado

          <select
            value={selectedRestaurant ?? ''}
            disabled={restaurants.length === 0}
            onChange={(event) => {
              setSelectedRestaurant(
                Number(event.target.value),
              )
            }}
          >
            {restaurants.map(
              (restaurant) => (
                <option
                  key={restaurant.id}
                  value={restaurant.id}
                >
                  {restaurant.name}
                </option>
              ),
            )}
          </select>
        </label>

        <div>
          <strong>
            {selected?.name
              ?? 'Nenhum estabelecimento'}
          </strong>

          <span>
            {selected?.address
              ?? 'Sem estabelecimento vinculado'}
          </span>
        </div>
      </section>

      <section className="stats">
        <article className="card stat">
          <span>Pedidos recebidos</span>
          <strong>{orders.length}</strong>
        </article>

        <article className="card stat">
          <span>Novos</span>

          <strong>
            {
              orders.filter(
                (order) =>
                  order.status === 'new',
              ).length
            }
          </strong>
        </article>

        <article className="card stat">
          <span>
            {currentUser.is_staff
              ? 'Leads de cadastro'
              : 'Estabelecimentos'}
          </span>

          <strong>
            {currentUser.is_staff
              ? leads.reduce(
                  (sum, lead) =>
                    sum
                    + lead.recommendation_count,
                  0,
                )
              : restaurants.length}
          </strong>
        </article>
      </section>

      <section
        className={
          currentUser.is_staff
            ? 'content-grid'
            : 'content-grid single-column'
        }
      >
        <div>
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                OPERAÇÃO
              </span>

              <h2>Pedidos</h2>
            </div>

            <button
              type="button"
              onClick={() => {
                void loadData()
              }}
            >
              Atualizar
            </button>
          </div>

          <div className="order-list">
            {orders.length === 0 && (
              <div className="card empty">
                Nenhum pedido recebido ainda.
                Faça o teste pela Alexa ou
                pelo endpoint da API.
              </div>
            )}

            {orders.map((order) => (
              <article
                className="card order"
                key={order.id}
              >
                <div className="order-top">
                  <div>
                    <span className="reference">
                      {order.reference}
                    </span>

                    <h3>
                      {order.customer_name}
                    </h3>
                  </div>

                  <span
                    className={
                      `badge badge-${order.status}`
                    }
                  >
                    {
                      STATUS_LABELS[
                        order.status
                      ] ?? order.status
                    }
                  </span>
                </div>

                <div className="meta">
                  <span>
                    {order.source.toUpperCase()}
                  </span>

                  <span>
                    {
                      new Date(
                        order.created_at,
                      ).toLocaleString(
                        'pt-BR',
                      )
                    }
                  </span>
                </div>

                <ul>
                  {order.items.map((item) => (
                    <li key={item.id}>
                      <span>
                        {item.quantity}×{' '}
                        {item.item_name}
                      </span>

                      <strong>
                        R$ {item.subtotal}
                      </strong>
                    </li>
                  ))}
                </ul>

                <div className="order-bottom">
                  <div>
                    <span>Total</span>

                    <strong>
                      R$ {order.total}
                    </strong>
                  </div>

                  {NEXT_STATUS[
                    order.status
                  ] && (
                    <button
                      className="primary"
                      type="button"
                      onClick={() => {
                        void advanceStatus(
                          order,
                        )
                      }}
                    >
                      Marcar como{' '}
                      {
                        STATUS_LABELS[
                          NEXT_STATUS[
                            order.status
                          ]!
                        ]
                      }
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>

        {currentUser.is_staff && (
          <aside>
            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  AQUISIÇÃO
                </span>

                <h2>
                  Comerciantes sugeridos
                </h2>
              </div>
            </div>

            <div className="lead-list">
              {leads.length === 0 && (
                <div className="card empty">
                  Nenhum comerciante sugerido.
                </div>
              )}

              {leads.map((lead) => (
                <article
                  className="card lead"
                  key={lead.id}
                >
                  <span className="badge">
                    {lead.status}
                  </span>

                  <h3>
                    {lead.restaurant_name}
                  </h3>

                  <strong>
                    {lead.recommendation_count}
                    {' '}indicação(ões)
                  </strong>

                  <small>
                    Última ocorrência:{' '}
                    {
                      new Date(
                        lead.last_seen_at,
                      ).toLocaleString(
                        'pt-BR',
                      )
                    }
                  </small>
                </article>
              ))}
            </div>
          </aside>
        )}
      </section>
    </main>
  )
}

export default App