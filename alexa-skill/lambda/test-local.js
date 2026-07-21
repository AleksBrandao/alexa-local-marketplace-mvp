const { handler } = require('./index');

function invokeLambda(event) {
  return new Promise((resolve, reject) => {
    let finished = false;

    const finish = (error, response) => {
      if (finished) {
        return;
      }

      finished = true;

      if (error) {
        reject(error);
        return;
      }

      resolve(response);
    };

    try {
      const result = handler(event, {}, finish);

      if (result && typeof result.then === 'function') {
        result
          .then((response) => finish(null, response))
          .catch((error) => finish(error));
      }
    } catch (error) {
      finish(error);
    }
  });
}

function createIntentRequest({
  intentName,
  slots = {},
  sessionAttributes = {},
  newSession = false
}) {
  const timestamp = new Date().toISOString();
  const uniqueId = Date.now();

  return {
    version: '1.0',

    session: {
      new: newSession,
      sessionId:
        `amzn1.echo-api.session.local-${uniqueId}`,

      application: {
        applicationId:
          'amzn1.ask.skill.local-test'
      },

      attributes: sessionAttributes,

      user: {
        userId:
          'amzn1.ask.account.local-test'
      }
    },

    context: {
      System: {
        application: {
          applicationId:
            'amzn1.ask.skill.local-test'
        },

        user: {
          userId:
            'amzn1.ask.account.local-test'
        },

        device: {
          deviceId: 'local-test-device',
          supportedInterfaces: {}
        },

        apiEndpoint:
          'https://api.amazonalexa.com',

        apiAccessToken:
          'local-test-token'
      }
    },

    request: {
      type: 'IntentRequest',
      requestId:
        `amzn1.echo-api.request.local-${uniqueId}`,
      timestamp,
      locale: 'pt-BR',

      intent: {
        name: intentName,
        confirmationStatus: 'NONE',
        slots
      }
    }
  };
}

function getSpeech(responseEnvelope) {
  const outputSpeech =
    responseEnvelope?.response?.outputSpeech;

  if (!outputSpeech) {
    return 'A resposta não contém fala.';
  }

  return (
    outputSpeech.ssml ||
    outputSpeech.text ||
    JSON.stringify(outputSpeech)
  );
}

async function runTest() {
  const orderText =
    process.argv.slice(2).join(' ') ||
    'uma pizza de calabresa grande e 1 refrigerante 2 litros da pizzaria bela pizza';

  console.log('\n=== PEDIDO INFORMADO ===');
  console.log(orderText);

  /*
   * Primeiro turno:
   * simula o PedidoCompletoIntent.
   */
  const completeOrderEvent = createIntentRequest({
    intentName: 'PedidoCompletoIntent',

    slots: {
      pedido: {
        name: 'pedido',
        value: orderText,
        confirmationStatus: 'NONE'
      }
    },

    sessionAttributes: {},
    newSession: true
  });

  console.log('\n=== PRIMEIRO TURNO ===');

  const firstResponse =
    await invokeLambda(completeOrderEvent);

  console.log(
    'Resposta da Alexa:',
    getSpeech(firstResponse)
  );

  console.log(
    'Atributos da sessão:',
    JSON.stringify(
      firstResponse.sessionAttributes || {},
      null,
      2
    )
  );

  const sessionAttributes =
    firstResponse.sessionAttributes || {};

  /*
   * Só envia o "sim" quando o parser conseguiu
   * montar um pedido pronto para confirmação.
   */
  if (!sessionAttributes.pendingOrder) {
    console.log(
      '\nO pedido não ficou pronto para confirmação.'
    );

    console.log(
      'Nenhum pedido será criado no banco.'
    );

    return;
  }

  /*
   * Segundo turno:
   * simula o AMAZON.YesIntent.
   *
   * Atenção: esse passo cria um pedido real
   * no banco de dados local.
   */
  const yesEvent = createIntentRequest({
    intentName: 'AMAZON.YesIntent',
    slots: {},
    sessionAttributes,
    newSession: false
  });

  console.log('\n=== SEGUNDO TURNO: SIM ===');

  const secondResponse =
    await invokeLambda(yesEvent);

  console.log(
    'Resposta da Alexa:',
    getSpeech(secondResponse)
  );

  console.log(
    '\nTeste finalizado.'
  );
}

runTest().catch((error) => {
  console.error('\n=== ERRO NO TESTE ===');
  console.error(error);
  process.exitCode = 1;
});