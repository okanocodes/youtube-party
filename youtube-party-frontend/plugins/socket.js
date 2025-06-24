
import { defineNuxtPlugin } from "#app";
import { io } from "socket.io-client";

export default defineNuxtPlugin((nuxtApp) => {
  // Ensure we only initialize the WebSocket client on the client-side
  if (import.meta.browser) {
    const socket = io( import.meta.dev ? "http://localhost:3001": import.meta.env.SERVER_URL , {
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