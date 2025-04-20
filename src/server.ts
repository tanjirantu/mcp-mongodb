import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Resource
} from "@modelcontextprotocol/sdk/types.js";
import { Db, MongoClient } from "mongodb";

const server = new Server({
  name: "mcp/mongodb",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {},
    resources: {},
    prompts: {},
  },
});

const connectionString =
  process.env.DATABASE_URL || "mongodb://localhost:27017/mcp_db";

let client: MongoClient;
let db: Db;
let dbName: string;

const url = new URL(connectionString);
dbName = url.pathname.substring(1).split("/")[0];

async function connect_to_db() {
  try {
    client = new MongoClient(connectionString);
    await client.connect();

    if (!dbName && client.options.dbName) {
      dbName = client.options.dbName;
    }
    if (!dbName) {
      throw new Error(
        "Could not determine database name from connection string. Please include it (e.g., mongodb://host/dbName)."
      );
    }

    db = client.db(dbName);
    console.info(`Database connection successful.`);

    client.on("close", () => console.log("MongoDB connection closed."));
    client.on("error", (err) =>
      console.error("MongoDB connection error:", err)
    );
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    throw error;
  }
}

function get_resource_base_url() {
  let resourceBaseUrl: URL;
  try {
    resourceBaseUrl = new URL(connectionString);
    resourceBaseUrl.protocol = "mongodb:";
    resourceBaseUrl.password = ""; // Clear credentials for resource URIs
    resourceBaseUrl.username = "";
    // Ensure pathname starts correctly for building collection URIs
    if (!resourceBaseUrl.pathname || resourceBaseUrl.pathname === "/") {
      resourceBaseUrl.pathname = `/${dbName}/`;
    } else {
      // Ensure dbName is part of the base path if provided in original string path
      const pathParts = resourceBaseUrl.pathname.substring(1).split("/");
      if (pathParts[0] !== dbName) {
        // Prepend dbName if it wasn't the first part of the path
        resourceBaseUrl.pathname = `/${dbName}${resourceBaseUrl.pathname}`;
      }
      // Ensure trailing slash for easier joining
      if (!resourceBaseUrl.pathname.endsWith("/")) {
        resourceBaseUrl.pathname += "/";
      }
    }
  } catch (e) {
    console.error(
      "Invalid MongoDB connection string format for URI generation:",
      e
    );
    process.exit(1);
  }
  return resourceBaseUrl;
}

const SCHEMA_PATH = "schema";

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  if (!db) throw new Error("Database connection not initialized.");
  try {
    const resourceBaseUrl = get_resource_base_url();

    const collections = await db.listCollections({}, { nameOnly: true })
      .toArray();

    const resources = await Promise.all(
      collections.map(async (coll): Promise<Resource> => {
        const sample = await db.collection(coll.name).findOne({});
        const properties: Record<string, string> = {};
        if (sample) {
          Object.entries(sample).forEach(([key, val]) => {
            properties[key] = Array.isArray(val)
              ? "array"
              : val === null
                ? "null"
                : typeof val;
          });
        }

        return {
          uri: new URL(`${coll.name}/${SCHEMA_PATH}`, resourceBaseUrl)
            .href,
          mimeType: "application/json",
          name: `${coll.name}`,
          properties: JSON.stringify(properties, null, 2),
        };
      })
    );

    return { resources };
  } catch (error) {
    console.error("Error listing collections:", error);
    throw error;
  }
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (!db) throw new Error("Database connection not initialized.");

  const resourceUrl = new URL(request.params.uri);
  const pathComponents = resourceUrl.pathname.substring(1).split("/");

  if (
    pathComponents.length < 3 ||
    pathComponents[pathComponents.length - 1] !== SCHEMA_PATH
  ) {
    throw new Error(
      `Invalid resource URI format. Expected mongodb://.../dbName/collectionName/${SCHEMA_PATH}`
    );
  }

  const reqDbName = pathComponents[0];
  const collectionName = pathComponents[1];

  if (reqDbName !== dbName) {
    throw new Error(
      `Requested database "${reqDbName}" does not match connected database "${dbName}"`
    );
  }

  try {
    const collection = db.collection(collectionName);

    // Can be slow on very large collections. Consider sampling ($sample) for performance.
    const pipeline = [
      { $sample: { size: 100 } },
      {
        $project: {
          arrayOfKeyValue: { $objectToArray: "$$ROOT" }
        }
      },
      { $unwind: "$arrayOfKeyValue" },
      {
        $group: {
          _id: "$arrayOfKeyValue.k",
          types: { $addToSet: { $type: "$arrayOfKeyValue.v" } },
          count: { $sum: 1 }
        }
      }
    ]

    const result = await collection.aggregate(pipeline).toArray();

    // const schemaRepresentation = {
    //   inferred_top_level_fields: result,
    //   note: "Schema inferred from distinct top-level fields across documents. MongoDB is schemaless; actual document structures may vary.",
    // };
    const schemaRepresentation = result;

    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(schemaRepresentation, null, 2),
        },
      ],
    };
  } catch (error) {
    console.error(
      `Error reading schema for collection "${collectionName}":`,
      error
    );
    if (error instanceof Error && error.message.includes("ns not found")) {
      throw new Error(`Collection not found: ${collectionName}`);
    }
    throw error;
  }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "find",
        description: "Run a find query",
        inputSchema: {
          type: "object",
          properties: {
            collection: { type: "string" },
            query: { type: "object" },
            options: { type: "object" },
          },
        },
      },
      {
        name: "findOne",
        description: "Run a find one query",
        inputSchema: {
          type: "object",
          properties: {
            collection: { type: "string" },
            query: { type: "object" },
            options: { type: "object" },
          },
        },
      },
      {
        name: "aggregate",
        description: "Run an aggregation pipeline",
        inputSchema: {
          type: "object",
          properties: {
            collection: { type: "string" },
            pipeline: { type: "array" },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { params: { name, arguments: args } } = request;
  if (!args || typeof args !== 'object') {
    throw new Error('Invalid arguments format');
  }

  const collection = args.collection as string;
  const query = (args.query as Record<string, unknown>) || {};
  const pipeline = (args.pipeline as Record<string, unknown>[]) || [];
  const options = (args.options as Record<string, unknown>) || {};

  if (!collection) {
    throw new Error('Collection name is required.');
  }

  if (name === 'find') {
    const results = await db.collection(collection).find(query, options).toArray();

    const response = {
      type: 'find',
      content: [{
        type: "text",
        text: JSON.stringify(results, null, 2),
      }]
    };

    return response;
  }

  if (name === 'findOne') {
    const results = await db.collection(collection).findOne(query, options);

    const response = {
      type: 'findOne',
      content: [{
        type: "text",
        text: JSON.stringify(results, null, 2),
      }]
    };

    return response;
  }
  if (name === 'aggregate') {
    const results = await db.collection(collection).aggregate(pipeline).toArray();

    const response = {
      type: 'aggregate',
      content: [{
        type: "text",
        text: JSON.stringify(results, null, 2),
      }]
    };

    return response;
  }

  // Unknown tool case
  throw new Error(`Unknown tool: ${name}`);
});

export async function runServer() {
  await connect_to_db();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("MongoDB MCP server running.");

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    try {
      if (client) {
        await client.close();
        console.log("MongoDB connection closed.");
      }
    } catch (err) {
      console.error("Error during shutdown:", err);
      process.exit(1);
    }
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

runServer().catch((error) => {
  console.error(
    "Server failed to start or encountered a fatal error:",
    error
  );
  process.exit(1);
});

