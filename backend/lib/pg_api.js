const pgQuery = require("./pg_connection");

module.exports = class PostgreSQL {
  //Returns the id of a basket based on an endpoint
  async getBasketId(urlEndpoint) {
    try {
      let basketId = await pgQuery(
        "SELECT id FROM baskets WHERE url_endpoint = $1",
        urlEndpoint
      );
      if (basketId.rows.length === 0) return false;
      return basketId.rows[0].id;
    } catch (e) {
      console.error(`Couldn't get basketId: ${e}`);
      return false;
    }
  }

  // Checks if a basket exists (url endpoint is in db)
  async basketExists(urlEndpoint) {
    return await this.getBasketId(urlEndpoint) !== false;
  }

  // Return a potential url endpoint
  async getNewURLEndpoint() {
    try {
      let urlEndpoint;
      do {
        urlEndpoint = generateURLEndpoint();
      } while (await this.basketExists(urlEndpoint));

      return urlEndpoint;
    } catch (e) {
      console.error(`Couldn't create url endpoint: ${e}`);
      return false;
    }

    function generateURLEndpoint() {
      const CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";
      const URL_LENGTH = 7;
      let url = "";
      for (let idx = 0; idx < URL_LENGTH; idx += 1) {
        let randomChar = CHARS[Math.floor(Math.random() * CHARS.length)];
        url += randomChar;
      }
      return url;
    }
  }

  // Creates a new basket with the specified endpoint
  async createBasket(urlEndpoint) {
    try {
      let result = await pgQuery(
        "INSERT INTO baskets (url_endpoint) VALUES ($1)",
        urlEndpoint
      );

      return result.rowCount > 0;
    } catch (e) {
      console.error(`Couldn't create basket: ${e}`);
      return false;
    }
  }

  // Deletes the corresponding basket
  async deleteBasket(urlEndpoint) {
    try {
      let basketId = await this.getBasketId(urlEndpoint);
      if (basketId === false) {
        throw new Error("Could not delete basket: endpoint does not exist");
      }

      let result = await pgQuery("DELETE FROM baskets WHERE id = $1", basketId);

      return result.rowCount > 0;
    } catch (e) {
      console.error(`Couldn't delete basket: ${e}`);
      return false;
    }
  }

  // Deletes all requests from the corresponding basket
  async clearBasket(urlEndpoint) {
    try {
      let basketId = await this.getBasketId(urlEndpoint);
      if (basketId === false) {
        throw new Error("Could not clear basket: endpoint does not exist");
      }

      let result = await pgQuery(
        "DELETE FROM requests WHERE basket_id = $1",
        basketId
      );

      return result.rowCount > 0;
    } catch (e) {
      console.error(`Couldn't clear basket: ${e}`);
      return false;
    }
  }

  // Adds a request to the database
  async addRequest(urlEndpoint, headers, method, mongoDocumentId) {
    try {
      let basketId = await this.getBasketId(urlEndpoint);
      if (basketId === false) {
        throw new Error("Could not add request: endpoint does not exist");
      }

      let requestAdded = await pgQuery(
        "INSERT INTO requests (basket_id, headers, method, body) VALUES ($1, $2, $3, $4)",
        basketId,
        headers,
        method,
        mongoDocumentId
      );

      //Signifies whether the query truly worked
      return requestAdded.rowCount > 0;
    } catch (e) {
      console.error(`Couldn't add request: ${e}`);
      return false;
    }
  }

  // Returns an array of objects representing requests
  async getRequests(urlEndpoint) {
    try {
      let basketId = await this.getBasketId(urlEndpoint);
      if (basketId === false) {
        throw new Error("Could not get requests: endpoint does not exist");
      }

      let result = await pgQuery(
        "SELECT id, arrival_timestamp as timestamp, headers, method, body FROM requests WHERE basket_id = $1 ORDER BY timestamp DESC",
        basketId
      );

      return result.rows;
    } catch (e) {
      console.error(`Couldn't get requests: ${e}`);
      return false;
    }
  }

  // WebSocket Connections
  async addConnection(connectionId, urlEndpoint) {
    try {
      let basketId = await this.getBasketId(urlEndpoint);
      if (basketId === false) {
        console.error("Basket does not exist for connection");
        return false;
      }
      await pgQuery(
        "INSERT INTO connections (connection_id, basket_id) VALUES ($1, $2)",
        connectionId,
        basketId
      );
      return true;
    } catch (e) {
      console.error(`Couldn't add connection: ${e}`);
      return false;
    }
  }

  async removeConnection(connectionId) {
    try {
      await pgQuery("DELETE FROM connections WHERE connection_id = $1", connectionId);
      return true;
    } catch (e) {
      console.error(`Couldn't remove connection: ${e}`);
      return false;
    }
  }

  async getConnections(urlEndpoint) {
    try {
      let basketId = await this.getBasketId(urlEndpoint);
      if (basketId === false) return [];

      let result = await pgQuery(
        "SELECT connection_id FROM connections WHERE basket_id = $1",
        basketId
      );
      return result.rows.map(row => row.connection_id);
    } catch (e) {
      console.error(`Couldn't get connections: ${e}`);
      return [];
    }
  }
};
