//Import environment variables
require("dotenv").config();

//Create an express server
const express = require("express");
const app = express();
const cors = require("cors");

//AWS SDK for API Gateway Management
const { ApiGatewayManagementApiClient, PostToConnectionCommand, DeleteConnectionCommand } = require("@aws-sdk/client-apigatewaymanagementapi");

//Create API access variable
const PostgreSQL = require("./lib/pg_api");
const pgApi = new PostgreSQL();
const {
  mongoInsertBody,
  mongoGetBody,
  mongoDeleteBody,
} = require("./lib/dynamo_connection");

//Import and use 'morgan' to log requests
const morgan = require("morgan");
app.use(morgan("dev"));
app.use(cors());

// Create validator
const {
  endpointIsTooLong,
  endpointContainsSymbols,
  endpointIsReserved,
} = require("./lib/validator");

//Add body parsing middlewear to make incoming bodies text, regardless of the type
app.use(express.text({ type: "*/*" }));

// Helper to notify clients
async function notifyClients(endpoint, data) {
  // Check if WEBSOCKET_API_ENDPOINT is set (Lambda environment)
  const endpointUrl = process.env.WEBSOCKET_API_ENDPOINT;
  if (!endpointUrl) {
    console.log("Skipping WebSocket notification: WEBSOCKET_API_ENDPOINT not set");
    return;
  }

  const client = new ApiGatewayManagementApiClient({
    endpoint: endpointUrl
  });

  const connectionIds = await pgApi.getConnections(endpoint);

  const message = JSON.stringify({
    type: "new_request",
    data: data
  });

  const postCalls = connectionIds.map(async (id) => {
    try {
      await client.send(new PostToConnectionCommand({ ConnectionId: id, Data: message }));
    } catch (e) {
      if (e.statusCode === 410) {
        console.log(`Found stale connection, deleting ${id}`);
        await pgApi.removeConnection(id);
      } else {
        console.error(`Error sending to connection ${id}:`, e);
      }
    }
  });

  await Promise.all(postCalls);
}

//Handles requests to clear the basket
app.put("/api/baskets/:endpoint", async (req, res) => {
  let endpoint = req.params.endpoint;
  let errorMessage = "";

  try {
    if (!(await pgApi.basketExists(endpoint))) {
      errorMessage = "Endpoint does not exist.";
      throw new Error(errorMessage);
    }

    //Get the requests from PG, then clear the bodies from mongo
    let requests = await pgApi.getRequests(endpoint);
    for (let i = 0; i < requests.length; i++) {
      if (requests[i].body) {
        let deleted = await mongoDeleteBody(requests[i].body);

        if (!deleted) throw new Error("Mongo deletion issue");
      }
    }

    let basketCleared = await pgApi.clearBasket(endpoint);
    if (!basketCleared) {
      let errorMessage = "Basket couldn't be cleared.";
      throw new Error(errorMessage);
    }

    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(404).send(errorMessage);
  }
});

// Handles requests to delete a basket
app.delete("/api/baskets/:endpoint", async (req, res) => {
  let endpoint = req.params.endpoint;
  let errorMessage = "";

  try {
    if (!(await pgApi.basketExists(endpoint))) {
      errorMessage = "Endpoint does not exist.";
      throw new Error(errorMessage);
    }

    //Clear the basket's request bodies from mongo first
    //Get the requests from PG, then clear the bodies from mongo
    let requests = await pgApi.getRequests(endpoint);
    for (let i = 0; i < requests.length; i++) {
      if (requests[i].body) {
        let deleted = await mongoDeleteBody(requests[i].body);

        if (!deleted) throw new Error("Mongo deletion issue");
      }
    }

    let basketDeleted = await pgApi.deleteBasket(endpoint);
    if (!basketDeleted) {
      errorMessage = "Basket couldn't be deleted.";
      throw new Error(errorMessage);
    }

    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(404).send(errorMessage);
  }
});

// Handles requests to get all of the requests in a basket
app.get("/api/baskets/:endpoint", async (req, res) => {
  let endpoint = req.params.endpoint;
  let errorMessage = "";

  try {
    if (!(await pgApi.basketExists(endpoint))) {
      errorMessage = "Endpoint does not exist.";
      throw new Error(errorMessage);
    }

    let requests = await pgApi.getRequests(endpoint);
    if (!requests) {
      errorMessage = "Requests couldn't be fetched.";
      throw new Error(errorMessage);
    }

    // Get each request's body from mongo and replace the body property on it with what mongo returns
    for (let i = 0; i < requests.length; i++) {
      if (requests[i].id) {
        let mongoDocId = requests[i].body;
        requests[i].body = await mongoGetBody(mongoDocId);
      }
    }

    res
      .setHeader("Content-Type", "application/json")
      .send(JSON.stringify(requests));
  } catch (e) {
    console.error(e);
    res.status(404).send(errorMessage);
  }
});

// Handles requests to create a new basket
app.post("/api/baskets/:endpoint", async (req, res) => {
  let endpoint = req.params.endpoint;
  let errorMessage = "";

  try {
    if (await pgApi.basketExists(endpoint)) {
      // 409 CONFLICT
      errorMessage = "Could not create basket: endpoint already exists.";
      res.status(409).send(errorMessage);
      throw new Error(errorMessage);
    }

    if (endpointIsTooLong(endpoint)) {
      // 414 URI TOO LONG
      errorMessage =
        "Could not create basket: endpoint length cannot exceed 100 characters.";
      res.status(414).send(errorMessage);
      throw new Error(errorMessage);
    }

    if (endpointContainsSymbols(endpoint)) {
      // 400 BAD REQUEST
      errorMessage =
        "Could not create basket: endpoint can only contain alphanumeric characters.";
      res.status(400).send(errorMessage);
      throw new Error(errorMessage);
    }

    if (endpointIsReserved(endpoint)) {
      // 403 FORBIDDEN - /web and /api are reserved
      errorMessage =
        "Could not create basket: endpoint conflicts with reserved system path.";
      res.status(403).send(errorMessage);
      throw new Error(errorMessage);
    }

    let newBasket = await pgApi.createBasket(endpoint);
    if (!newBasket) {
      errorMessage = "Couldn't create basket.";
      throw new Error(errorMessage);
    }

    res.status(201).send();
  } catch (e) {
    console.error(e);
    res.status(404).send(errorMessage);
  }
});

// Handles requests to create a new url endpoint
app.get("/api/new_url_endpoint", async (_req, res) => {
  let errorMessage = "";
  try {
    let newURLEndpoint = await pgApi.getNewURLEndpoint();
    if (!newURLEndpoint) {
      errorMessage = "Couldn't generate new url endpoint.";
      throw new Error(errorMessage);
    }

    res.json(newURLEndpoint);
  } catch (e) {
    console.error(e);
    // Be more explicit about DB errors for debugging (safe-ish in this context, or log properly)
    errorMessage = "Couldn't generate new url endpoint. DB Error: " + e.message;
    res.status(404).send(errorMessage);
  }
});

//Handles any type of request to the exposed endpoint, sends request data to request table (webhooks use this endpoint)
app.all("/api/:endpoint", async (req, res) => {
  let headers = JSON.stringify(req.headers);
  let method = req.method;
  let body = req.body; //Stored in Mongo
  let endpoint = req.params.endpoint;
  let errorMessage = "";

  try {
    if (!(await pgApi.basketExists(endpoint))) {
      errorMessage = "Endpoint does not exist.";
      throw new Error(errorMessage);
    }

    //Add the body to Mongo and get a document ID
    let documentId = await mongoInsertBody(body);

    // Try adding the request to the SQL database if it fails, send 404 error
    let requestAdded = await pgApi.addRequest(
      endpoint,
      headers,
      method,
      documentId
    );
    if (!requestAdded) {
      errorMessage = "Request couldn't be added.";
      throw new Error(errorMessage);
    }

    // Notify clients via WebSocket
    let request = { timestamp: new Date(), method, headers, body, endpoint };
    await notifyClients(endpoint, request);

    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(404).send(errorMessage);
  }
});

//Error handler (Last Line of Defense)
app.use((error, _req, res, _next) => {
  console.log(error);
  res.status(404).render("error", { error: error });
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
