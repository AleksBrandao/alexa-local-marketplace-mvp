const Alexa = require('ask-sdk-core');
const https = require('https');

const API_BASE_URL =
  process.env.API_BASE_URL ||
  'https://b4b0-177-196-114-213.ngrok-free.app';

function requestJson(method, url, payload = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const requestBody =
      payload === null ? null : JSON.stringify(payload);

    const headers = {
      Accept: 'application/json',
      'User-Agent': 'AquiPertoAlexaSkill/1.0',
      'ngrok-skip-browser-warning': 'true'
    };

    if (requestBody !== null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] =
        Buffer.byteLength(requestBody);
    }

    const request = https.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method,
        headers
      },
      (response) => {
        let body = '';

        response.setEncoding('utf8');

        response.on('data', (chunk) => {
          body += chunk;
        });

        response.on('end', () => {
          const statusCode = response.statusCode || 0;

          if (statusCode < 200 || statusCode >= 300) {
            reject(
              new Error(
                `API respondeu com status ${statusCode}. Corpo: ${body}`
              )
            );
            return;
          }

          if (!body.trim()) {
            resolve(null);
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(
              new Error(
                `API não retornou JSON válido: ${error.message}`
              )
            );
          }
        });
      }
    );

    request.setTimeout(8000, () => {
      request.destroy(
        new Error(
          'Tempo limite excedido ao consultar o servidor Django.'
        )
      );
    });

    request.on('error', reject);

    if (requestBody !== null) {
      request.write(requestBody);
    }

    request.end();
  });
}

function getJson(url) {
  return requestJson('GET', url);
}

function postJson(url, payload) {
  return requestJson('POST', url, payload);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getResolvedSlot(requestEnvelope, slotName) {
  const slot =
    requestEnvelope?.request?.intent?.slots?.[slotName];

  if (!slot) {
    return {
      name: '',
      id: null,
      raw: ''
    };
  }

  const rawValue =
    slot.value ||
    slot.slotValue?.value ||
    '';

  const authorities =
    slot.slotValue?.resolutions?.resolutionsPerAuthority ||
    slot.resolutions?.resolutionsPerAuthority ||
    [];

  for (const authority of authorities) {
    if (
      authority?.status?.code === 'ER_SUCCESS_MATCH' &&
      authority?.values?.length > 0
    ) {
      const resolved = authority.values[0]?.value;

      return {
        name: resolved?.name || rawValue,
        id: resolved?.id || null,
        raw: rawValue
      };
    }
  }

  return {
    name: rawValue,
    id: null,
    raw: rawValue
  };
}

function formatDistance(value) {
  const distance = Number(value);

  if (!Number.isFinite(distance)) {
    return null;
  }

  return String(distance).replace('.', ',');
}

function formatPriceForSpeech(value) {
  const price = Number(value);

  if (!Number.isFinite(price)) {
    return '';
  }

  const reais = Math.floor(price);
  const centavos = Math.round((price - reais) * 100);

  const reaisText =
    reais === 1 ? '1 real' : `${reais} reais`;

  if (centavos === 0) {
    return reaisText;
  }

  const centavosText =
    centavos === 1
      ? '1 centavo'
      : `${centavos} centavos`;

  return `${reaisText} e ${centavosText}`;
}

function formatQuantityForSpeech(quantity) {
  return quantity === 1
    ? 'uma unidade'
    : `${quantity} unidades`;
}

function parseQuantity(value) {
  const normalized = normalizeText(value);

  const words = {
    um: 1,
    uma: 1,
    dois: 2,
    duas: 2,
    tres: 3,
    quatro: 4,
    cinco: 5,
    seis: 6,
    sete: 7,
    oito: 8,
    nove: 9,
    dez: 10
  };

  if (words[normalized]) {
    return words[normalized];
  }

  const quantity = Number.parseInt(normalized, 10);

  if (!Number.isInteger(quantity)) {
    return null;
  }

  return quantity;
}

async function loadPizzerias() {
  const url =
    `${API_BASE_URL.replace(/\/+$/, '')}/api/restaurants/`;

  const restaurants = await getJson(url);

  if (!Array.isArray(restaurants)) {
    throw new Error(
      'O endpoint de restaurantes não retornou uma lista.'
    );
  }

  return restaurants
    .filter((restaurant) => {
      const category = normalizeText(restaurant.category);

      return (
        restaurant.active === true &&
        category.includes('pizzaria')
      );
    })
    .sort((first, second) => {
      const firstDistance = Number(first.distance_km);
      const secondDistance = Number(second.distance_km);

      const safeFirst = Number.isFinite(firstDistance)
        ? firstDistance
        : Number.MAX_SAFE_INTEGER;

      const safeSecond = Number.isFinite(secondDistance)
        ? secondDistance
        : Number.MAX_SAFE_INTEGER;

      return safeFirst - safeSecond;
    });
}

async function loadMenuItems(restaurantId) {
  const url =
    `${API_BASE_URL.replace(/\/+$/, '')}/api/menu-items/`;

  const menuItems = await getJson(url);

  if (!Array.isArray(menuItems)) {
    throw new Error(
      'O endpoint de cardápio não retornou uma lista.'
    );
  }

  return menuItems.filter(
    (item) =>
      Number(item.restaurant) === Number(restaurantId) &&
      item.active === true
  );
}

async function createOrder({
  restaurantId,
  menuItemId,
  quantity
}) {
  const url =
    `${API_BASE_URL.replace(/\/+$/, '')}/api/orders/`;

  const payload = {
    restaurant_id: Number(restaurantId),
    customer_name: 'Cliente Alexa',
    customer_phone: '',
    delivery_address: '',
    source: 'alexa',
    items: [
      {
        menu_item_id: Number(menuItemId),
        quantity: Number(quantity)
      }
    ]
  };

  console.log(
    'Criando pedido:',
    JSON.stringify(payload)
  );

  return postJson(url, payload);
}

function findRestaurant(restaurants, requestedName) {
  const requested = normalizeText(requestedName);

  if (!requested) {
    return null;
  }

  return (
    restaurants.find((restaurant) => {
      const name = normalizeText(restaurant.name);

      return (
        name === requested ||
        name.includes(requested) ||
        requested.includes(name)
      );
    }) || null
  );
}

function findMenuItem(menuItems, requestedName) {
  const requested = normalizeText(requestedName);

  if (!requested) {
    return null;
  }

  return (
    menuItems.find((item) => {
      const name = normalizeText(item.name);

      return (
        name === requested ||
        name.includes(requested) ||
        requested.includes(name)
      );
    }) || null
  );
}

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
      'LaunchRequest'
    );
  },

  handle(handlerInput) {
    const attributes =
      handlerInput.attributesManager.getSessionAttributes();

    attributes.conversationState = 'awaiting_search';

    handlerInput.attributesManager.setSessionAttributes(
      attributes
    );

    return handlerInput.responseBuilder
      .speak(
        'Bem-vindo ao Aqui Perto. Você pode pedir para buscar pizzarias. O que deseja procurar?'
      )
      .reprompt('Você pode dizer: buscar pizzarias.')
      .getResponse();
  }
};

const BuscarPizzariasIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        'BuscarPizzariasIntent'
    );
  },

  async handle(handlerInput) {
    try {
      const pizzerias = await loadPizzerias();

      if (pizzerias.length === 0) {
        return handlerInput.responseBuilder
          .speak(
            'Não encontrei pizzarias ativas no momento.'
          )
          .getResponse();
      }

      const attributes =
        handlerInput.attributesManager.getSessionAttributes();

      attributes.availableRestaurants =
        pizzerias.map((restaurant) => ({
          id: restaurant.id,
          name: restaurant.name,
          registered: restaurant.registered,
          neighborhood: restaurant.neighborhood,
          distance_km: restaurant.distance_km
        }));

      attributes.conversationState =
        'awaiting_restaurant';

      handlerInput.attributesManager.setSessionAttributes(
        attributes
      );

      const descriptions = pizzerias
        .slice(0, 3)
        .map((restaurant, index) => {
          const position =
            index === 0
              ? 'A mais próxima é'
              : index === 1
                ? 'A segunda é'
                : 'A terceira é';

          const neighborhood = restaurant.neighborhood
            ? `, no bairro ${restaurant.neighborhood}`
            : '';

          const distance =
            formatDistance(restaurant.distance_km);

          const distanceText = distance
            ? `, a ${distance} quilômetros`
            : '';

          return (
            `${position} ${restaurant.name}` +
            `${neighborhood}${distanceText}`
          );
        });

      const quantityText =
        pizzerias.length === 1
          ? 'Encontrei uma pizzaria.'
          : `Encontrei ${pizzerias.length} pizzarias.`;

      const restaurantNames = pizzerias
        .slice(0, 3)
        .map((restaurant) => restaurant.name)
        .join(' ou ');

      return handlerInput.responseBuilder
        .speak(
          `${quantityText} ${descriptions.join('. ')}. Qual delas você escolhe?`
        )
        .reprompt(
          `Você pode dizer ${restaurantNames}.`
        )
        .getResponse();
    } catch (error) {
      console.error(
        'Erro ao consultar pizzarias:',
        error
      );

      return handlerInput.responseBuilder
        .speak(
          'Não consegui consultar as pizzarias agora. Verifique se o servidor está disponível.'
        )
        .getResponse();
    }
  }
};

const SelecionarRestauranteIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        'SelecionarRestauranteIntent'
    );
  },

  async handle(handlerInput) {
    try {
      const restaurantSlot = getResolvedSlot(
        handlerInput.requestEnvelope,
        'restaurante'
      );

      console.log(
        'Slot de restaurante:',
        JSON.stringify(restaurantSlot)
      );

      if (!restaurantSlot.name) {
        return handlerInput.responseBuilder
          .speak(
            'Não consegui identificar o restaurante. Diga Bella Pizza ou Forno da Vila.'
          )
          .reprompt(
            'Qual restaurante você escolhe?'
          )
          .getResponse();
      }

      const loadedRestaurants =
        await loadPizzerias();

      const selectedRestaurant = restaurantSlot.id
        ? loadedRestaurants.find(
            (restaurant) =>
              String(restaurant.id) ===
              String(restaurantSlot.id)
          )
        : findRestaurant(
            loadedRestaurants,
            restaurantSlot.name
          );

      if (!selectedRestaurant) {
        const names = loadedRestaurants
          .map((restaurant) => restaurant.name)
          .join(' ou ');

        return handlerInput.responseBuilder
          .speak(
            `Não encontrei ${restaurantSlot.raw} entre as opções. Você pode escolher ${names}.`
          )
          .reprompt(
            'Qual restaurante você escolhe?'
          )
          .getResponse();
      }

      const menuItems = await loadMenuItems(
        selectedRestaurant.id
      );

      if (menuItems.length === 0) {
        return handlerInput.responseBuilder
          .speak(
            `Você escolheu ${selectedRestaurant.name}, mas não encontrei itens ativos no cardápio.`
          )
          .getResponse();
      }

      const attributes =
        handlerInput.attributesManager.getSessionAttributes();

      attributes.selectedRestaurant = {
        id: selectedRestaurant.id,
        name: selectedRestaurant.name
      };

      attributes.availableMenuItems =
        menuItems.map((item) => ({
          id: item.id,
          restaurant: item.restaurant,
          name: item.name,
          price: item.price
        }));

      attributes.conversationState = 'awaiting_item';

      handlerInput.attributesManager.setSessionAttributes(
        attributes
      );

      const menuDescription = menuItems
        .slice(0, 5)
        .map(
          (item) =>
            `${item.name}, por ${formatPriceForSpeech(
              item.price
            )}`
        )
        .join('. ');

      return handlerInput.responseBuilder
        .speak(
          `Você escolheu ${selectedRestaurant.name}. O cardápio disponível é: ${menuDescription}. Qual item você deseja?`
        )
        .reprompt(
          'Você pode dizer pizza de calabresa, pizza de quatro queijos ou refrigerante.'
        )
        .getResponse();
    } catch (error) {
      console.error(
        'Erro ao selecionar restaurante:',
        error
      );

      return handlerInput.responseBuilder
        .speak(
          'Não consegui consultar o cardápio agora. Verifique se o servidor está disponível.'
        )
        .getResponse();
    }
  }
};

const SelecionarItemIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        'SelecionarItemIntent'
    );
  },

  async handle(handlerInput) {
    try {
      const itemSlot = getResolvedSlot(
        handlerInput.requestEnvelope,
        'item'
      );

      console.log(
        'Slot de item:',
        JSON.stringify(itemSlot)
      );

      const attributes =
        handlerInput.attributesManager.getSessionAttributes();

      if (!attributes.selectedRestaurant) {
        return handlerInput.responseBuilder
          .speak(
            'Primeiro escolha um restaurante. Você pode dizer buscar pizzarias.'
          )
          .reprompt('Diga: buscar pizzarias.')
          .getResponse();
      }

      let menuItems =
        attributes.availableMenuItems || [];

      if (menuItems.length === 0) {
        menuItems = await loadMenuItems(
          attributes.selectedRestaurant.id
        );
      }

      const selectedItem = itemSlot.id
        ? menuItems.find(
            (item) =>
              String(item.id) === String(itemSlot.id)
          )
        : findMenuItem(menuItems, itemSlot.name);

      if (!selectedItem) {
        const names = menuItems
          .map((item) => item.name)
          .join(', ');

        return handlerInput.responseBuilder
          .speak(
            `Não encontrei ${itemSlot.raw} no cardápio. Os itens disponíveis são: ${names}.`
          )
          .reprompt(
            'Qual item você deseja?'
          )
          .getResponse();
      }

      attributes.selectedMenuItem = {
        id: selectedItem.id,
        name: selectedItem.name,
        price: selectedItem.price
      };

      attributes.conversationState =
        'awaiting_quantity';

      handlerInput.attributesManager.setSessionAttributes(
        attributes
      );

      return handlerInput.responseBuilder
        .speak(
          `Você escolheu ${selectedItem.name}, por ${formatPriceForSpeech(selectedItem.price)}. Quantas unidades você deseja?`
        )
        .reprompt(
          'Diga a quantidade, por exemplo, uma unidade.'
        )
        .getResponse();
    } catch (error) {
      console.error(
        'Erro ao selecionar item:',
        error
      );

      return handlerInput.responseBuilder
        .speak(
          'Não consegui selecionar esse item. Tente novamente.'
        )
        .reprompt(
          'Qual item você deseja?'
        )
        .getResponse();
    }
  }
};

const InformarQuantidadeIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        'InformarQuantidadeIntent'
    );
  },

  handle(handlerInput) {
    const attributes =
      handlerInput.attributesManager.getSessionAttributes();

    if (
      !attributes.selectedRestaurant ||
      !attributes.selectedMenuItem
    ) {
      return handlerInput.responseBuilder
        .speak(
          'Primeiro escolha o restaurante e o item do cardápio.'
        )
        .reprompt('Diga: buscar pizzarias.')
        .getResponse();
    }

    const quantitySlot = getResolvedSlot(
      handlerInput.requestEnvelope,
      'quantidade'
    );

    const quantity = parseQuantity(
      quantitySlot.name || quantitySlot.raw
    );

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 99
    ) {
      return handlerInput.responseBuilder
        .speak(
          'Não consegui identificar uma quantidade válida. Diga um número entre um e noventa e nove.'
        )
        .reprompt(
          'Quantas unidades você deseja?'
        )
        .getResponse();
    }

    const unitPrice = Number(
      attributes.selectedMenuItem.price
    );

    const total = unitPrice * quantity;

    attributes.quantity = quantity;
    attributes.pendingTotal = total;
    attributes.conversationState =
      'awaiting_confirmation';

    handlerInput.attributesManager.setSessionAttributes(
      attributes
    );

    return handlerInput.responseBuilder
      .speak(
        `Você pediu ${formatQuantityForSpeech(quantity)} de ${attributes.selectedMenuItem.name}, da ${attributes.selectedRestaurant.name}. O total é ${formatPriceForSpeech(total)}. Confirma o pedido?`
      )
      .reprompt(
        'Diga sim para confirmar ou não para cancelar.'
      )
      .getResponse();
  }
};

const YesIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        'AMAZON.YesIntent'
    );
  },

  async handle(handlerInput) {
    const attributes =
      handlerInput.attributesManager.getSessionAttributes();

    if (
      attributes.conversationState !==
        'awaiting_confirmation' ||
      !attributes.selectedRestaurant ||
      !attributes.selectedMenuItem ||
      !attributes.quantity
    ) {
      return handlerInput.responseBuilder
        .speak(
          'Não há um pedido aguardando confirmação. Você pode dizer buscar pizzarias.'
        )
        .reprompt('Diga: buscar pizzarias.')
        .getResponse();
    }

    try {
      const order = await createOrder({
        restaurantId:
          attributes.selectedRestaurant.id,
        menuItemId:
          attributes.selectedMenuItem.id,
        quantity: attributes.quantity
      });

      console.log(
        'Pedido criado:',
        JSON.stringify(order)
      );

      const reference =
        order?.reference || order?.id;

      const total =
        order?.total ?? attributes.pendingTotal;

      attributes.conversationState = 'completed';
      attributes.createdOrder = {
        id: order?.id || null,
        reference: order?.reference || null
      };

      handlerInput.attributesManager.setSessionAttributes(
        attributes
      );

      const referenceText = reference
        ? ` O número de referência é ${String(reference)
            .replace(/-/g, ' ')
            .replace(/([A-Z])/g, '$1 ')}.`
        : '';

      return handlerInput.responseBuilder
        .speak(
          `Pedido criado com sucesso na ${attributes.selectedRestaurant.name}. O total é ${formatPriceForSpeech(total)}.${referenceText}`
        )
        .getResponse();
    } catch (error) {
      console.error(
        'Erro ao criar pedido:',
        error
      );

      return handlerInput.responseBuilder
        .speak(
          'Não consegui criar o pedido no servidor. O pedido não foi confirmado. Tente novamente.'
        )
        .reprompt(
          'Diga sim para tentar novamente ou não para cancelar.'
        )
        .getResponse();
    }
  }
};

const NoIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        'AMAZON.NoIntent'
    );
  },

  handle(handlerInput) {
    const attributes =
      handlerInput.attributesManager.getSessionAttributes();

    if (
      attributes.conversationState ===
      'awaiting_confirmation'
    ) {
      delete attributes.selectedMenuItem;
      delete attributes.quantity;
      delete attributes.pendingTotal;

      attributes.conversationState = 'awaiting_item';

      handlerInput.attributesManager.setSessionAttributes(
        attributes
      );

      return handlerInput.responseBuilder
        .speak(
          'Tudo bem, o pedido não foi confirmado. Qual outro item você deseja?'
        )
        .reprompt(
          'Você pode dizer pizza de calabresa, pizza de quatro queijos ou refrigerante.'
        )
        .getResponse();
    }

    return handlerInput.responseBuilder
      .speak('Tudo bem. Até logo.')
      .getResponse();
  }
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        'AMAZON.HelpIntent'
    );
  },

  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(
        'Você pode buscar pizzarias, escolher um restaurante, escolher um item, informar a quantidade e confirmar o pedido.'
      )
      .reprompt('Diga: buscar pizzarias.')
      .getResponse();
  }
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    if (
      Alexa.getRequestType(handlerInput.requestEnvelope) !==
      'IntentRequest'
    ) {
      return false;
    }

    const intentName = Alexa.getIntentName(
      handlerInput.requestEnvelope
    );

    return [
      'AMAZON.CancelIntent',
      'AMAZON.StopIntent',
      'AMAZON.NavigateHomeIntent'
    ].includes(intentName);
  },

  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Até logo.')
      .getResponse();
  }
};

const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
        'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        'AMAZON.FallbackIntent'
    );
  },

  handle(handlerInput) {
    const attributes =
      handlerInput.attributesManager.getSessionAttributes();

    const state = attributes.conversationState;

    if (state === 'awaiting_restaurant') {
      return handlerInput.responseBuilder
        .speak(
          'Não entendi o restaurante. Diga Bella Pizza ou Forno da Vila.'
        )
        .reprompt(
          'Qual restaurante você escolhe?'
        )
        .getResponse();
    }

    if (state === 'awaiting_item') {
      return handlerInput.responseBuilder
        .speak(
          'Não entendi o item. Diga pizza de calabresa, pizza de quatro queijos ou refrigerante.'
        )
        .reprompt('Qual item você deseja?')
        .getResponse();
    }

    if (state === 'awaiting_quantity') {
      return handlerInput.responseBuilder
        .speak(
          'Não entendi a quantidade. Diga, por exemplo, uma unidade.'
        )
        .reprompt(
          'Quantas unidades você deseja?'
        )
        .getResponse();
    }

    if (state === 'awaiting_confirmation') {
      return handlerInput.responseBuilder
        .speak(
          'Não entendi. Diga sim para confirmar o pedido ou não para cancelar.'
        )
        .reprompt(
          'Você confirma o pedido?'
        )
        .getResponse();
    }

    return handlerInput.responseBuilder
      .speak(
        'Não entendi. Você pode dizer buscar pizzarias.'
      )
      .reprompt('Diga: buscar pizzarias.')
      .getResponse();
  }
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
      'SessionEndedRequest'
    );
  },

  handle(handlerInput) {
    console.log(
      'Sessão encerrada:',
      JSON.stringify(handlerInput.requestEnvelope)
    );

    return handlerInput.responseBuilder.getResponse();
  }
};

const ErrorHandler = {
  canHandle() {
    return true;
  },

  handle(handlerInput, error) {
    console.error('Erro não tratado:', error);

    return handlerInput.responseBuilder
      .speak(
        'Desculpe, ocorreu um erro ao processar sua solicitação.'
      )
      .getResponse();
  }
};

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    BuscarPizzariasIntentHandler,
    SelecionarRestauranteIntentHandler,
    SelecionarItemIntentHandler,
    InformarQuantidadeIntentHandler,
    YesIntentHandler,
    NoIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
