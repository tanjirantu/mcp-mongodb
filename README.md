# MongoDB

A Model Context Protocol server that provides read access to MongoDB databases. This server enables LLMs to interact with MongoDB collections and execute read queries.

## Components

### Tools

-   **find**

    -   Query documents in a MongoDB collection
    -   Input:
        -   `collection` (string): The collection name
        -   `query` (object): MongoDB query object
        -   `options` (object, optional): Query options like limit, sort, projection

-   **findOne**

    -   Find a single document in a collection
    -   Input:
        -   `collection` (string): The collection name
        -   `query` (object): MongoDB query object
        -   `options` (object, optional): Query options

-   **aggregate**

    -   Execute an aggregation pipeline
    -   Input:
        -   `collection` (string): The collection name
        -   `pipeline` (array): Array of aggregation stages

-   **listCollections**

    -   List all collections in the database
    -   Input: None

-   **getCollectionInfo**
    -   Get information about a specific collection
    -   Input: `collection` (string): The collection name

## Usage with custom client

I have added a custom client. I'll add claud desktop integration example later.

`pnpm install`

`pnpm run build`

`pnpm run dev`

Replace `mydb` with your database name.
