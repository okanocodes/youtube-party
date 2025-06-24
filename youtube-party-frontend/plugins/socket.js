import { defineNuxtPlugin } from "#app";
import { io } from "socket.io-client";

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig();
  // Ensure we only initialize the WebSocket client on the client-side
  if (import.meta.browser) {
    // if production, use the environment variable SERVER_URL, otherwise use localhost
    const socketUrl =
      process.env.NODE_ENV === "production"
        ? config.public.SERVER_URL
        : "http://localhost:3001";

    const socket = io(socketUrl, {
      transports: ["websocket"], // Ensure WebSocket is used
    });

    // Inject `socket` so you can access it with `nuxtApp.$socket` in your app
    nuxtApp.provide("socket", socket);
  }
});
// import { io } from 'socket.io-client';

// export default defineNuxtPlugin(() => {
//   const socket = io('http://localhost:3001');
//   return {
//     provide: {
//       socket,
//     },
//   };
// });
