const PostgreSQL = require("./lib/pg_api");
const pgApi = new PostgreSQL();

module.exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const routeKey = event.requestContext.routeKey;

  try {
    if (routeKey === "$connect") {
      // API Gateway WebSockets allow query params in connection URL
      // e.g. wss://...?basket_id=xyz
      const urlEndpoint = event.queryStringParameters ? event.queryStringParameters.basket_id : null;

      if (!urlEndpoint) {
        return { statusCode: 400, body: "Missing basket_id" };
      }

      await pgApi.addConnection(connectionId, urlEndpoint);
      return { statusCode: 200, body: "Connected" };
    }
    else if (routeKey === "$disconnect") {
      await pgApi.removeConnection(connectionId);
      return { statusCode: 200, body: "Disconnected" };
    }

    return { statusCode: 200, body: "Default" };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Failed to connect: " + JSON.stringify(err) };
  }
};
