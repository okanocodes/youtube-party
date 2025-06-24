# YouTube Party

A web application for watching YouTube videos together in real-time. Built with Nuxt 3 (frontend) and Express/Socket.IO (backend).

---

## Project Structure

```
youtube-party-backend/
  index.js
  package.json

youtube-party-frontend/
  app.vue
  nuxt.config.ts
  package.json
  ...
```

---

## Prerequisites

- Node.js (v18 or higher recommended)
- [pnpm](https://pnpm.io/) (for frontend)
- npm (for backend, or use pnpm if you prefer)

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/okanocodes/youtube-party.git
cd youtube-party
```

### 2. Install dependencies

#### Backend

```bash
cd youtube-party-backend
npm install
```

#### Frontend

```bash
cd youtube-party-frontend
pnpm install
```

---

## Development

### Start the backend server

```bash
cd youtube-party-backend
npm run dev
```

The backend will start (by default) on port 3001.

### Start the frontend (Nuxt) dev server

```bash
cd youtube-party-frontend
pnpm dev
```

The frontend will start on [http://localhost:3000](http://localhost:3000).

---

## Production

### Build the frontend

```bash
cd youtube-party-frontend
pnpm build
```

### Preview the production build

```bash
pnpm preview
```

---

## Environment Variables

- Frontend: Copy `.env.example` to `.env` and configure as needed.
- Backend: Add any required environment variables to `youtube-party-backend/.env` if needed.

---

## Features

- Create and join rooms to watch YouTube videos together
- Real-time synchronization
- Host controls for managing the room and playlist

---

## Scripts

### Backend

- `npm run dev` — Start backend with nodemon

### Frontend

- `pnpm dev` — Start Nuxt development server
- `pnpm build` — Build for production
- `pnpm preview` — Preview production build

---

## License

MIT

---

## Acknowledgements

- [Nuxt 3](https://nuxt.com/)
- [Express](https://expressjs.com/)
- [Socket.IO](https://socket.io/)
