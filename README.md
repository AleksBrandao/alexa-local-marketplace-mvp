# MVP — Plataforma local por voz

Protótipo integrado com:

- **Alexa Custom Skill** em `pt-BR`;
- **Django + Django REST Framework**;
- **React + TypeScript + Vite**;
- fluxo de comerciante cadastrado e estabelecimento ainda não cadastrado;
- pedido de teste chegando ao painel do comerciante.

## Fluxo demonstrado

### Estabelecimento cadastrado

1. Usuário: “Alexa, abra Perto de Mim”.
2. Usuário: “Encontre pizzarias próximas”.
3. Usuário escolhe **Bella Pizza**.
4. Alexa lê três itens do cardápio.
5. Usuário pede uma pizza.
6. Alexa confirma o pedido.
7. A API cria o pedido.
8. O pedido aparece no painel React.
9. O comerciante avança o status: Novo → Aceito → Em preparo → Pronto → Concluído.

### Estabelecimento não cadastrado

1. Usuário escolhe **Forno da Vila**.
2. A Skill informa que ela ainda não recebe pedidos pela plataforma.
3. A API cria ou incrementa um `MerchantLead`.
4. O painel mostra quantas vezes o estabelecimento foi indicado.

Neste estágio não existem pagamento, entrega, localização real, Google Places, WhatsApp ou envio de e-mail. Esses componentes foram intencionalmente substituídos por dados mockados.

## Iniciar sem Docker

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py loaddata demo
python manage.py runserver
```

API: `http://127.0.0.1:8000/api/`

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Portal: `http://localhost:5173`

## Iniciar com Docker

```bash
docker compose up
```

## Teste do pedido sem Alexa

```bash
curl -X POST http://127.0.0.1:8000/api/orders/ \
  -H "Content-Type: application/json" \
  -d '{
    "restaurant_id": 1,
    "customer_name": "Cliente de teste",
    "customer_phone": "(11) 99999-0000",
    "delivery_address": "Combinar diretamente",
    "source": "api-test",
    "items": [{"menu_item_id": 1, "quantity": 1}]
  }'
```

## Teste do lead sem Alexa

```bash
curl -X POST http://127.0.0.1:8000/api/restaurants/2/recommend/ \
  -H "Content-Type: application/json" \
  -d '{"source":"api-test"}'
```

## Publicação para o teste real na Alexa

A Lambda não consegue acessar `localhost`. Publique o Django em HTTPS e defina na Lambda:

```text
API_URL=https://seu-backend.example.com/api
```

Depois siga `alexa-skill/README.md`.

## Próximas evoluções

1. Autenticação do comerciante e isolamento dos pedidos por conta.
2. WebSocket ou Server-Sent Events em vez de polling.
3. Google Places para descoberta real.
4. Account Linking para identificar o consumidor.
5. Endereços e localização autorizada.
6. Notificação por e-mail ao comerciante não cadastrado.
7. Catálogos e fluxos específicos para outras categorias.
8. Registro de aceite do lead para futura monetização.

## Decisão arquitetural importante

A Skill é somente um canal. O Django mantém a lógica e os dados da plataforma; isso permite acrescentar posteriormente site, WhatsApp, aplicativo móvel e outros assistentes sem reescrever o núcleo do negócio.
