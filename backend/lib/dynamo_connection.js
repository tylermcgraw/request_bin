const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require("uuid"); // Helper for generating IDs if not available
const config = require("./config");

// Initialize DynamoDB Client
const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMO_TABLE_NAME || "request_bodies";

module.exports = {
  mongoInsertBody: async function (body) {
    // Mimic the Mongo interface: Insert body, return generated ID
    try {
      const id = uuidv4();
      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          id: id,
          body: body
        }
      });

      await docClient.send(command);
      return id;
    } catch (e) {
      console.error("DynamoDB Insert Error:", e);
      return null;
    }
  },

  mongoGetBody: async function (docId) {
    try {
      const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          id: docId
        }
      });

      const response = await docClient.send(command);
      return response.Item ? response.Item.body : null;
    } catch (e) {
      console.error("DynamoDB Get Error:", e);
      return null;
    }
  },

  mongoDeleteBody: async function (docId) {
    try {
      const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          id: docId
        }
      });

      await docClient.send(command);
      return 1; // Mimic Mongo deletedCount
    } catch (e) {
      console.error("DynamoDB Delete Error:", e);
      return 0;
    }
  },
};
