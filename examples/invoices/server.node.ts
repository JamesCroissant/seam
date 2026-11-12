// Production entry for Node.js: `vite build --app` → `node dist/server/server.js`
import { app } from "virtual:seam/app";
import { serve } from "seam/adapters/node";

serve(app, { port: Number(process.env.PORT ?? 3000), staticDir: "dist/client" });
