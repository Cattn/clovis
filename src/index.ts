import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { existsSync } from "node:fs";
import { tokenRoutes } from "./routes/token";
import { searchRoutes } from "./routes/flights/search";
import { returnRoutes } from "./routes/flights/return";
import { cheapestRoutes } from "./routes/flights/cheapest";
import { cheapestOneWayRoutes } from "./routes/flights/cheapestOneWay";
import { oneWayRoutes } from "./routes/flights/explore";

const port = Number(process.env.CLOVIS_BACKEND_PORT ?? process.env.PORT ?? 3000);
const hasClientDist = existsSync("dist/client");

let app = new Elysia({ adapter: node() })
  .use(cors({ origin: true }))
  .get("/api", () => ({ 
    name: "Clovis Flight API",
    version: "1.0.0",
    endpoints: [
      "GET /token - Get fresh authentication tokens",
      "GET /flights/search/roundTrip?from=XXX&to=XXX - Search round-trip flights (all results)",
      "GET /flights/cheapest?from=XXX&to=XXX - Get cheapest round-trip pair",
      "GET /flights/cheapest/oneWay?from=XXX&to=XXX&departDate=YYYY-MM-DD - Cheapest one-way",
      "GET /flights/search/oneWay?from=XXX&to=XXX&departDate=YYYY-MM-DD - One-way flights",
      "POST /flights/return - Search return flights with selected outbound token",
    ],
  }))
  .use(tokenRoutes)
  .use(searchRoutes)
  .use(returnRoutes)
  .use(cheapestRoutes)
  .use(cheapestOneWayRoutes)
  .use(oneWayRoutes);

if (hasClientDist) {
  app = app.use(staticPlugin({
    assets: "dist/client",
    prefix: "/",
  }));
}

app = app.listen({
    hostname: "127.0.0.1",
    port,
  });

console.log(`🦊 Clovis API is running at http://127.0.0.1:${port}`);