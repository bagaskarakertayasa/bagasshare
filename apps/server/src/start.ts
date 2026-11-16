import { createServer } from './index.js';

const { app, config } = await createServer();
await app.listen({ port: config.port, host: config.host });
console.log(`Bagas Share signaling server berjalan di http://${config.host}:${config.port}`);
