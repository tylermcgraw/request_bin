# Request Bin

A developer tool for receiving, persisting, and inspecting HTTP requests and webhooks via a generated URL endpoint.

## Description

Request Bin allows developers to create unique URL endpoints (baskets) to capture incoming HTTP traffic. It is designed for testing webhooks, debugging API integrations, and inspecting raw HTTP requests in real-time. The application provides a persistent record of every request received, including methods, headers, and payloads.

## Key Features

* **Unique Endpoint Generation**: Instantly generate random or custom URL endpoints to receive HTTP requests.
* **Real-Time Inspection**: View incoming requests as they happen through a live-updating dashboard powered by WebSockets.
* **Persistent Storage**: Requests are stored using a hybrid architecture: PostgreSQL for structured metadata (headers, timestamps, methods) and MongoDB for flexible payload storage.
* **Full Request Visibility**: Inspect detailed information for every request, including HTTP method, arrival timestamp, raw headers, and the request body.
* **Basket Management**: Manage your endpoints by clearing captured request history or deleting endpoints entirely when no longer needed.
* **Clipboard Integration**: Easily copy generated endpoints with a single click to integrate them into your testing workflow.

## Technology Stack

* **Backend**: Node.js, Express
* **Databases**: PostgreSQL (Relational), MongoDB (NoSQL)
* **Frontend**: React, Vite, Axios, React Router
* **Real-Time**: WebSockets (via the `ws` library)

## Getting Started

### Prerequisites

* **Node.js** (v18+ recommended)
* **PostgreSQL**
* **MongoDB**

### Backend Setup

1.  Navigate to the `backend` directory and install dependencies:
    ```bash
    cd backend
    npm install
    ```
2.  Create a `.env` file in the `backend` directory with the following configuration:
    ```env
    HOST=localhost
    PORT=3000
    PGUSER=your_postgres_user
    PGPASSWORD=your_postgres_password
    PGDATABASE="request_bin"
    MONGO_URI="mongodb://localhost:27017"
    MONGO_DB_NAME="request_bin"
    MONGO_COLLECTION_NAME="request_bodies"
    ```
3.  Initialize the PostgreSQL database:
    ```bash
    psql -d postgres -f db/schema.sql
    psql -d request_bin -f db/seed_data.sql
    ```
4.  Ensure your local **MongoDB** server is running.
5.  Start the backend server:
    ```bash
    npm start
    ```

### Frontend Setup

1.  Navigate to the `frontend` directory and install dependencies:
    ```bash
    cd frontend
    npm install
    ```
2.  Start the development server:
    ```bash
    npm run dev
    ```
3.  Alternatively, you can build the UI from the backend directory to serve it statically:
    ```bash
    npm run build:ui
    ```

## Usage

1.  **Create a Basket**: On the home page, use the "New Basket" card to generate a unique endpoint.
2.  **Send Requests**: Send HTTP requests (GET, POST, etc.) or configure a webhook to point to the generated URL.
3.  **Inspect**: Open the basket in the dashboard to view the request details in real-time. If "auto-refresh" is enabled, new requests will appear automatically.

## Authors

Benjamin Stevens, Saurabh Kamboj, Tyler McGraw, and Xiran Lu.
