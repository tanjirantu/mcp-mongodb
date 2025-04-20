import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import chalk from "chalk";
import util from "util";

const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/server.js"],
});

const client = new Client({
    name: "mcp/mongodb",
    version: "1.0.0"
});

export async function runClient() {
    console.info(chalk.yellow("Connecting to MCP MongoDB server..."));
    await client.connect(transport);
    console.info(chalk.green("✓ Connected to MCP MongoDB server"));

    // List prompts
    // const prompts = await client.listPrompts();
    // console.info(chalk.green("Available prompts:"));
    // prompts.prompts.forEach((prompt, index) => {
    //     console.info(chalk.cyanBright(index + 1), prompt);
    // });

    // List resources
    console.info(chalk.cyan("Fetching available collections..."));
    const resources = await client.listResources();
    console.info(chalk.green("Available collections:"));
    if (resources.resources.length === 0) {
        console.info(chalk.yellow("No collections found in the database."));
    } else {
        resources.resources.forEach((resource, index) => {
            console.log(`${index + 1}. Schema: ${chalk.yellow(resource.name)}`);
            console.table(JSON.parse(resource.properties as string));
        });
    }

    // Read a resource
    const resourceUri = resources.resources[0].uri || "mongodb://localhost:27017/mcp_db/users/schema";
    console.log(chalk.blue("Fetching resource contents..."));
    const resource = await client.readResource({
        uri: resourceUri
    });
    console.log(chalk.green("Resource contents:"));
    console.info("uri: ", util.inspect(resource.contents[0].uri, false, null, true));
    console.table(JSON.parse(resource.contents[0].text as string));

    const toolResponse = await client.callTool({
        name: "find",
        arguments: {
            collection: "products",
            query: { color: "#000" },
            options: { limit: 10 },
        }
    });

    const toolResponse2 = await client.callTool({
        name: "findOne",
        arguments: {
            collection: "products",
            query: { color: "#000" },
        }
    });

    const toolResponse3 = await client.callTool({
        name: "aggregate",
        arguments: {
            collection: "products",
            pipeline: [{
                $group: {
                    _id: "$category",  // Groups documents by the "category" field
                    count: { $sum: 1 } // Counts documents per category
                }
            }],
        }
    });

    console.info(chalk.redBright("Tool response:"));
    if (toolResponse.content && Array.isArray(toolResponse.content) && toolResponse.content[0]?.text) {
        console.log(util.inspect(JSON.parse(toolResponse.content[0].text as string), false, null, true));
    } else {
        console.error(chalk.red("Invalid tool response format"));
    }

    console.log(chalk.green("Tool response 2:"));
    if (toolResponse2.content && Array.isArray(toolResponse2.content) && toolResponse2.content[0]?.text) {
        console.log(util.inspect(JSON.parse(toolResponse2.content[0].text as string), false, null, true));
    } else {
        console.error(chalk.red("Invalid tool response format"));
    }

    console.log(chalk.green("Tool response 3:"));
    if (toolResponse3.content && Array.isArray(toolResponse3.content) && toolResponse3.content[0]?.text) {
        console.log(util.inspect(JSON.parse(toolResponse3.content[0].text as string), false, null, true));
    } else {
        console.error(chalk.red("Invalid tool response format"));
    }
}