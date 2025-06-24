import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

app.use(limiter);
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin:
      process.env.NODE_ENV === "production" ? process.env.FRONTEND_URL : "*",
    methods: ["GET", "POST"],
  },
});

// In memory storage
// Maybe I should consider redis for production
const rooms = new Map();
const userSockets = new Map(); // Track socket to user mapping

// Constants
const ROOM_CLEANUP_DELAY = 30 * 60 * 1000; // 30 minutes
const MAX_USERS_PER_ROOM = 50;
const SYNC_INTERVAL = 5000; // 5 seconds

// Utility functions
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function validateInput(data, schema) {
  for (const [key, validator] of Object.entries(schema)) {
    if (!validator(data[key])) {
      return false;
    }
  }
  return true;
}

function sanitizeString(str) {
  return str?.trim().slice(0, 50) || "";
}

function isValidYouTubeVideoId(videoId) {
  return /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

function isHost(roomId, socketId) {
  const room = rooms.get(roomId);
  return room?.hostId === socketId;
}

function getRoomHostUsername(room) {
  return room.users.find((u) => u.id === room.hostId)?.username || null;
}

function scheduleRoomCleanup(roomId) {
  setTimeout(() => {
    const room = rooms.get(roomId);
    if (room && room.users.length === 0) {
      rooms.delete(roomId);
      console.log(`Room ${roomId} auto-deleted due to inactivity.`);
    }
  }, ROOM_CLEANUP_DELAY);
}

function getUsersInRoom(roomId) {
  const room = rooms.get(roomId);
  return (
    room?.users.map((user) => ({
      id: user.id,
      username: user.username,
      isHost: user.id === room.hostId,
    })) || []
  );
}

// Socket rate limiting
const socketRateLimit = new Map();

function checkSocketRateLimit(socketId, action, limit = 10, window = 60000) {
  const key = `${socketId}:${action}`;
  const now = Date.now();

  if (!socketRateLimit.has(key)) {
    socketRateLimit.set(key, { count: 1, resetTime: now + window });
    return true;
  }

  const data = socketRateLimit.get(key);

  if (now > data.resetTime) {
    data.count = 1;
    data.resetTime = now + window;
    return true;
  }

  if (data.count >= limit) {
    return false;
  }

  data.count++;
  return true;
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Track user connection
  userSockets.set(socket.id, { connectedAt: Date.now() });

  socket.on("create-room", ({ roomId, username }) => {
    try {
      // Rate limiting
      if (!checkSocketRateLimit(socket.id, "create-room", 5)) {
        socket.emit(
          "room-error",
          "Too many room creation attempts. Please wait."
        );
        return;
      }

      // Validation
      const sanitizedUsername = sanitizeString(username);
      const sanitizedRoomId = sanitizeString(roomId) || generateRoomId();

      if (!sanitizedUsername) {
        socket.emit("room-error", "Username is required");
        return;
      }

      if (rooms.has(sanitizedRoomId)) {
        socket.emit("room-error", "Room already exists! Try another room ID.");
        return;
      }

      // Create room
      const newRoom = {
        id: sanitizedRoomId,
        hostId: socket.id,
        users: [{ id: socket.id, username: sanitizedUsername }],
        createdAt: Date.now(),
        currentVideo: null,
        isPlaying: false,
        currentTime: 0,
        lastSync: Date.now(),
        playlist: [],
      };

      rooms.set(sanitizedRoomId, newRoom);
      socket.join(sanitizedRoomId);

      socket.emit("room-created", { roomId: sanitizedRoomId });
      socket.emit("host-confirmation");

      io.to(sanitizedRoomId).emit("update-room-info", {
        users: getUsersInRoom(sanitizedRoomId),
        hostUsername: sanitizedUsername,
        roomId: sanitizedRoomId,
        playlist: newRoom.playlist, // Include playlist
        currentVideo: newRoom.currentVideo,
      });

      console.log(
        `Room created: ${sanitizedRoomId} by ${sanitizedUsername} (${socket.id})`
      );
    } catch (error) {
      console.error("Error creating room:", error);
      socket.emit("room-error", "Failed to create room. Please try again.");
    }
  });

  socket.on("join-room", ({ roomId, username }) => {
    try {
      // Rate limiting
      if (!checkSocketRateLimit(socket.id, "join-room", 10)) {
        socket.emit("room-error", "Too many join attempts. Please wait.");
        return;
      }

      const sanitizedUsername = sanitizeString(username);
      const sanitizedRoomId = sanitizeString(roomId);

      if (!sanitizedUsername || !sanitizedRoomId) {
        socket.emit("room-error", "Username and room ID are required");
        return;
      }

      const room = rooms.get(sanitizedRoomId);
      if (!room) {
        socket.emit("room-error", "Room does not exist!");
        return;
      }

      if (room.users.length >= MAX_USERS_PER_ROOM) {
        socket.emit("room-error", "Room is full!");
        return;
      }

      // Check if user already in room
      if (room.users.some((u) => u.id === socket.id)) {
        socket.emit("room-error", "You are already in this room!");
        return;
      }

      socket.join(sanitizedRoomId);
      room.users.push({ id: socket.id, username: sanitizedUsername });

      // Send current video state to new user
      if (room.currentVideo) {
        socket.emit("change-video", { videoId: room.currentVideo });
        socket.emit("sync-video", {
          action: room.isPlaying ? "play" : "pause",
          time: room.currentTime,
        });
      }

      // --- FIX: Send full room info including video state ---
      io.to(socket.id).emit("room-info", {
        exists: true,
        hostSocketId: room.hostId,
        hostUsername: getRoomHostUsername(room),
        userCount: room.users.length,
        userList: getUsersInRoom(sanitizedRoomId),
        playlist: room.playlist,
        videoId: room.currentVideo, // <-- for frontend compatibility
        videoTime: room.currentTime, // <-- current playback time
        videoState: room.isPlaying ? "play" : "pause", // <-- play/pause state
        isUserInRoom: true,
      });

      io.to(sanitizedRoomId).emit("update-room-info", {
        users: getUsersInRoom(sanitizedRoomId),
        hostUsername: getRoomHostUsername(room),
        roomId: sanitizedRoomId,
        playlist: room.playlist,
        currentVideo: room.currentVideo,
        videoId: room.currentVideo, // <-- for frontend compatibility
        videoTime: room.currentTime, // <-- current playback time
        videoState: room.isPlaying ? "play" : "pause", // <-- play/pause state
      });

      socket.emit("join-success", { roomId: sanitizedRoomId });
      console.log(
        `Current video in room ${sanitizedRoomId}:`,
        room.currentVideo
      );
    } catch (error) {
      console.error("Error joining room:", error);
      socket.emit("room-error", "Failed to join room. Please try again.");
    }
  });

  socket.on("get-room-info", (roomId) => {
    try {
      const sanitizedRoomId = sanitizeString(roomId);
      const room = rooms.get(sanitizedRoomId);

      if (!room) {
        socket.emit("room-info", { exists: false });
        return;
      }

      // --- FIX: Send full room info including video state ---
      socket.emit("room-info", {
        exists: true,
        hostSocketId: room.hostId,
        hostUsername: getRoomHostUsername(room),
        userList: getUsersInRoom(roomId),
        userCount: room.users.length,
        playlist: room.playlist,
        videoId: room.currentVideo, // <-- for frontend compatibility
        videoTime: room.currentTime, // <-- current playback time
        videoState: room.isPlaying ? "play" : "pause", // <-- play/pause state
        isUserInRoom: room.users.some((u) => u.id === socket.id),
      });
    } catch (error) {
      console.error("Error getting room info:", error);
      socket.emit("room-info", {
        exists: false,
        error: "Failed to get room info",
      });
    }
  });

  socket.on("video-action", ({ roomId, action, time }) => {
    try {
      // Rate limiting for video actions
      if (!checkSocketRateLimit(socket.id, "video-action", 20)) {
        return;
      }

      const sanitizedRoomId = sanitizeString(roomId);

      if (!isHost(sanitizedRoomId, socket.id)) {
        console.warn(
          `Unauthorized video-action from ${socket.id} in ${sanitizedRoomId}`
        );
        return;
      }

      if (
        !validateInput(
          { action, time },
          {
            action: (val) => ["play", "pause", "seek"].includes(val),
            time: (val) => typeof val === "number" && val >= 0,
          }
        )
      ) {
        return;
      }

      const room = rooms.get(sanitizedRoomId);
      if (room) {
        room.isPlaying = action === "play";
        room.currentTime = time;
        room.lastSync = Date.now();
      }

      socket.to(sanitizedRoomId).emit("sync-video", { action, time });
    } catch (error) {
      console.error("Error handling video action:", error);
    }
  });

  socket.on("host-time", ({ roomId, time }) => {
    try {
      const sanitizedRoomId = sanitizeString(roomId);

      if (!isHost(sanitizedRoomId, socket.id)) return;

      if (typeof time !== "number" || time < 0) return;

      const room = rooms.get(sanitizedRoomId);
      if (room) {
        room.currentTime = time;
        room.lastSync = Date.now();
      }

      socket.to(sanitizedRoomId).emit("sync-time", { time });
    } catch (error) {
      console.error("Error syncing time:", error);
    }
  });

  socket.on("change-video", ({ roomId, videoId }) => {
    try {
      // Rate limiting for video changes
      if (!checkSocketRateLimit(socket.id, "change-video", 10)) {
        return;
      }

      const sanitizedRoomId = sanitizeString(roomId);

      if (!isHost(sanitizedRoomId, socket.id)) return;

      if (!videoId || !isValidYouTubeVideoId(videoId)) {
        socket.emit("video-error", "Invalid YouTube video ID");
        return;
      }

      const room = rooms.get(sanitizedRoomId);
      if (room) {
        room.currentVideo = videoId;
        room.currentTime = 0;
        room.isPlaying = false;
      }

      io.to(sanitizedRoomId).emit("change-video", { videoId });
    } catch (error) {
      console.error("Error changing video:", error);
      socket.emit("video-error", "Failed to change video");
    }
  });

  // Add video(s) to playlist

  socket.on("add-to-playlist", ({ roomId, videos, videoId }) => {
    try {
      const sanitizedRoomId = sanitizeString(roomId);
      const room = rooms.get(sanitizedRoomId);

      if (!room) {
        socket.emit("playlist-error", "Room not found");
        return;
      }

      if (!isHost(sanitizedRoomId, socket.id)) {
        socket.emit("playlist-error", "Only host can modify playlist");
        return;
      }

      // Handle both 'videos' array and single 'videoId'
      const videoIds = videos
        ? Array.isArray(videos)
          ? videos
          : [videos]
        : videoId
        ? [videoId]
        : [];

      const validIds = videoIds.filter(isValidYouTubeVideoId);

      if (validIds.length === 0) {
        socket.emit("playlist-error", "No valid YouTube video IDs provided.");
        return;
      }

      // Add videos to playlist
      room.playlist.push(
        ...validIds.map((id) => ({
          id,
          url: `https://www.youtube.com/watch?v=${id}`,
        }))
      );

      // If no current video, set first added video as current
      let shouldEmitVideoChange = false;
      if (!room.currentVideo && validIds.length > 0) {
        room.currentVideo = validIds[0];
        room.currentTime = 0;
        room.isPlaying = false;
        shouldEmitVideoChange = true;
      }

      // Emit updated playlist to all users in room
      io.to(sanitizedRoomId).emit("playlist-updated", {
        playlist: room.playlist,
        currentVideo: room.currentVideo, // Include current video
      });

      // If we set a new current video, also emit change-video
      if (shouldEmitVideoChange) {
        io.to(sanitizedRoomId).emit("change-video", {
          videoId: room.currentVideo,
        });
      }

      console.log(
        "[backend] playlist-updated emitted:",
        room.playlist,
        room.currentVideo
      );

      console.log(
        `Video added to playlist in room ${sanitizedRoomId}:`,
        validIds
      );
    } catch (error) {
      console.error("Error adding to playlist:", error);
      socket.emit("playlist-error", "Failed to add video to playlist");
    }
  });

  // // Also update the room-info response to include currentVideo:
  // socket.on("get-room-info", (roomId) => {
  //   try {
  //     const sanitizedRoomId = sanitizeString(roomId);
  //     const room = rooms.get(sanitizedRoomId);

  //     if (!room) {
  //       socket.emit("room-info", { exists: false });
  //       return;
  //     }

  //     socket.emit("room-info", {
  //       exists: true,
  //       hostSocketId: room.hostId,
  //       hostUsername: getRoomHostUsername(room),
  //       userList: getUsersInRoom(roomId),
  //       userCount: room.users.length,
  //       playlist: room.playlist,
  //       currentVideo: room.currentVideo, // Make sure this is included
  //       isUserInRoom: room.users.some((u) => u.id === socket.id),
  //     });
  //   } catch (error) {
  //     console.error("Error getting room info:", error);
  //     socket.emit("room-info", {
  //       exists: false,
  //       error: "Failed to get room info",
  //     });
  //   }
  // });

  // Remove video from playlist by index
  socket.on("remove-from-playlist", ({ roomId, index }) => {
    const sanitizedRoomId = sanitizeString(roomId);
    const room = rooms.get(sanitizedRoomId);

    if (!room) return;
    if (!isHost(sanitizedRoomId, socket.id)) return;

    if (
      typeof index !== "number" ||
      index < 0 ||
      index >= room.playlist.length
    ) {
      socket.emit("playlist-error", "Invalid playlist index.");
      return;
    }

    room.playlist.splice(index, 1);

    io.to(sanitizedRoomId).emit("playlist-updated", {
      playlist: room.playlist,
    });
  });

  // Get current playlist
  socket.on("get-playlist", ({ roomId }) => {
    const sanitizedRoomId = sanitizeString(roomId);
    const room = rooms.get(sanitizedRoomId);

    if (!room) {
      socket.emit("playlist", { playlist: [] });
      return;
    }

    socket.emit("playlist", { playlist: room.playlist });
  });

  socket.on("delete-room", ({ roomId }) => {
    const sanitizedRoomId = sanitizeString(roomId);
    const room = rooms.get(sanitizedRoomId);
    if (room && room.hostId === socket.id) {
      // Notify all users in the room
      io.to(sanitizedRoomId).emit(
        "room-error",
        "Room was deleted by the host.",
        { noRedirect: true }
      );
      // Remove all users from the room
      rooms.delete(sanitizedRoomId);
      // Optionally, force disconnect all sockets in the room
      io.in(sanitizedRoomId).socketsLeave(sanitizedRoomId);
      console.log(`Room ${sanitizedRoomId} deleted by host.`);
    }
  });

  socket.on("leave-room", ({ roomId }) => {
    try {
      const sanitizedRoomId = sanitizeString(roomId);
      const room = rooms.get(sanitizedRoomId);

      if (!room) {
        socket.emit("room-error", "Room does not exist.");
        return;
      }

      const userIndex = room.users.findIndex((u) => u.id === socket.id);
      if (userIndex === -1) {
        socket.emit("room-error", "You are not in this room.");
        return;
      }

      // Remove user from room
      room.users.splice(userIndex, 1);
      socket.leave(sanitizedRoomId);

      // If host leaves, trigger delete-room logic
      if (room.hostId === socket.id) {
        socket.emit("delete-room", { roomId: sanitizedRoomId });
        return;
      }

      // Update room info for remaining users
      io.to(sanitizedRoomId).emit("update-room-info", {
        users: getUsersInRoom(sanitizedRoomId),
        hostUsername: getRoomHostUsername(room),
        roomId: sanitizedRoomId,
        currentVideo: room.currentVideo,
        playlist: room.playlist,
        videoId: room.currentVideo,
        videoTime: room.currentTime,
        videoState: room.isPlaying ? "play" : "pause",
      });

      socket.emit("leave-success", { roomId: sanitizedRoomId });
      console.log(`User ${socket.id} left room ${sanitizedRoomId}`);
    } catch (error) {
      console.error("Error leaving room:", error);
      socket.emit("room-error", "Failed to leave room. Please try again.");
    }
  });

  socket.on("disconnect", () => {
    try {
      console.log("User disconnected:", socket.id);

      // Clean up user socket tracking
      userSockets.delete(socket.id);

      // Handle room cleanup
      for (const [roomId, room] of rooms.entries()) {
        const userIndex = room.users.findIndex((u) => u.id === socket.id);

        if (userIndex !== -1) {
          room.users.splice(userIndex, 1);

          // If host left, transfer host or delete room
          if (room.hostId === socket.id) {
            rooms.delete(roomId);
            scheduleRoomCleanup(roomId);
            continue;
            // if (room.users.length > 0) {
            //   // Transfer host to next user
            //   room.hostId = room.users[0].id;
            //   io.to(room.hostId).emit("host-confirmation");
            //   io.to(roomId).emit("host-changed", {
            //     newHostId: room.hostId,
            //     newHostUsername: room.users[0].username,
            //   });
            // } else {
            //   // No users left, schedule cleanup
            //   rooms.delete(roomId);
            //   scheduleRoomCleanup(roomId);
            //   continue;
            // }
          }

          // Update room info for remaining users
          io.to(roomId).emit("update-room-info", {
            users: getUsersInRoom(roomId),
            hostUsername: getRoomHostUsername(room),
            roomId,
            currentVideo: room.currentVideo,
            playlist: room.playlist,
            videoId: room.currentVideo, // <-- for frontend compatibility
            videoTime: room.currentTime, // <-- current playback time
            videoState: room.isPlaying ? "play" : "pause", // <-- play/pause state
          });

          break;
        }
      }
    } catch (error) {
      console.error("Error handling disconnect:", error);
    }
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    rooms: rooms.size,
    connections: userSockets.size,
    uptime: process.uptime(),
  });
});

// Cleanup old socket rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of socketRateLimit.entries()) {
    if (now > data.resetTime) {
      socketRateLimit.delete(key);
    }
  }
}, 60000); // Clean up every minute

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
