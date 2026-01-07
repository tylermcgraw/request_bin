const { MongoClient, ObjectId } = require("mongodb");
const config = require("./config");

// Singleton client - initialize once
const client = new MongoClient(config.MONGO_URI);
let clientPromise;

async function getClient() {
  if (!clientPromise) {
    clientPromise = client.connect()
      .then(connectedClient => {
        console.log("Connected successfully to Mongo server");
        return connectedClient;
      })
      .catch(err => {
        console.error("Mongo connection failed", err);
        clientPromise = null; // Reset promise so we can try again
        throw err;
      });
  }
  return clientPromise;
}

module.exports = {
  mongoInsertBody: async function (body) {
    try {
      const client = await getClient();
      const db = client.db(config.MONGO_DB_NAME);
      const collection = db.collection("request_bodies");
      let result = await collection.insertOne({ body: body });
      return result.insertedId.toString();
    } catch (e) {
      console.error(e);
    }
  },

  mongoGetBody: async function (docId) {
    try {
      const client = await getClient();
      const db = client.db(config.MONGO_DB_NAME);
      const collection = db.collection("request_bodies");
      let result = await collection.findOne({ _id: new ObjectId(docId) });
      return result ? result.body : null;
    } catch (e) {
      console.error(e);
    }
  },

  mongoDeleteBody: async function (docId) {
    try {
      const client = await getClient();
      const db = client.db(config.MONGO_DB_NAME);
      const collection = db.collection("request_bodies");
      let result = await collection.deleteOne({ _id: new ObjectId(docId) });
      return result.deletedCount;
    } catch (e) {
      console.error(e);
    }
  },
};
