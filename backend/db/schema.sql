CREATE TABLE IF NOT EXISTS baskets(
  id serial PRIMARY KEY,
  url_endpoint varchar(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS requests(
  id serial PRIMARY KEY,
  arrival_timestamp timestamptz NOT NULL DEFAULT NOW(),
  headers text NOT NULL,
  method text NOT NULL,
  body text,
  basket_id integer NOT NULL REFERENCES baskets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS connections(
  connection_id text PRIMARY KEY,
  basket_id integer NOT NULL REFERENCES baskets(id) ON DELETE CASCADE
);
