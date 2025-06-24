<script setup>
import { onMounted, onUnmounted, ref, computed, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const { $socket } = useNuxtApp()
const route = useRoute();
const router = useRouter();

// Reactive state
const roomId = route.params.roomId;
const hostUsername = ref(null);
const guestUsername = ref("");
const isHost = ref(false);
const joined = ref(false);
const loading = ref(true);
const errorMessage = ref(null);
const users = ref([]);
const videoUrl = ref('');
const connectionStatus = ref('connecting');
const syncStatus = ref('synced');

// Player state
let player = null;
let syncInterval = null;
let heartbeatInterval = null;
let youtubeApiLoaded = false;
const playerReady = ref(false);
const currentVideoId = ref(null);
let lastVideoTime = null;
let lastVideoState = null;

// Computed properties
const isValidYouTubeUrl = computed(() => {
  if (!videoUrl.value) return false;
  const videoId = extractVideoId(videoUrl.value);
  return videoId && videoId.length === 11;
});

const userCount = computed(() => users.value.length);

// Utility functions
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function showError(message, duration = 5000, redirect = false) {
  console.log('showError called:', { message, duration, redirect });

  errorMessage.value = message;
  if (redirect == false) {
    setTimeout(() => {
      if (errorMessage.value === message) {
        errorMessage.value = null;
      }
    }, duration);
  }
}

function showSyncStatus(status, duration = 2000) {
  syncStatus.value = status;
  setTimeout(() => {
    if (syncStatus.value === status) {
      syncStatus.value = 'synced';
    }
  }, duration);
}


function loadYouTubeAPI() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      console.log("YouTube API already loaded");
      resolve()
    } else {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      const firstScriptTag = document.getElementsByTagName('script')[0]
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag)
      window.onYouTubeIframeAPIReady = () => resolve()
      console.log("YouTube API script added")
    }
  })
}

function createPlayer(videoId) {
  if (!videoId) {
    showError("Invalid YouTube video ID");
    return;
  }

  // If player already exists, just load the new video
  if (player && player.loadVideoById) {
    player.loadVideoById(videoId);
    return;
  }

  player = new window.YT.Player('player', {
    height: '400',
    width: '100%',
    videoId,
    playerVars: {
      'playsinline': 1,
      'rel': 0,
      'modestbranding': 1
    },
    events: {
      onReady: (event) => {
        playerReady.value = true;
        if (!isHost.value) {
          player.setVolume(80);
        }
        // Sync to last known state if available
        if (lastVideoTime !== null && lastVideoState !== null) {
          syncPlayerToState(lastVideoTime, lastVideoState);
        }
      },
      onStateChange: handlePlayerStateChange,
      onError: (event) => {
        showError("Video playback error. The video might be unavailable.");
      }
    },
  });
}

function handlePlayerStateChange(event) {
  if (!player || !playerReady.value) return;

  const currentTime = player.getCurrentTime();

  try {
    if (event.data === window.YT.PlayerState.PLAYING) {
      if (isHost.value) {
        $socket.emit('video-action', {
          roomId,
          action: 'play',
          time: currentTime
        });
      }
    } else if (event.data === window.YT.PlayerState.PAUSED) {
      if (isHost.value) {
        $socket.emit('video-action', {
          roomId,
          action: 'pause',
          time: currentTime
        });
      }
    }

  } catch (error) {
    console.error("Error handling player state change:", error);
  }
}

// Room functions
function loadVideo() {
  playerReady.value = true

  const videoId = extractVideoId(videoUrl.value);
  console.log("Extracted video ID:", videoId);
  // console.log("Loading video with URL:", videoUrl.value);
  if (!isValidYouTubeUrl.value) {
    showError("Please enter a valid YouTube URL");
    return;
  }

  try {

    if (videoId) {
      currentVideoId.value = videoId;
      createPlayer(videoId);

      $socket.emit('change-video', { roomId, videoId });
      videoUrl.value = '';
      showSyncStatus('loading');

    }
  } catch (error) {
    console.error("Error loading video:", error);
    showError("Failed to load video");
  }



}

function syncPlayerToState(videoTime, videoState) {
  try {
    if (player && typeof player.seekTo === "function" && playerReady.value) {
      if (typeof videoTime === "number") {
        player.seekTo(videoTime, true);
      }
      if (videoState === "play") {
        player.playVideo();
      } else {
        player.pauseVideo();
      }
    }
  } catch (err) {
    console.error("Error syncing video:", err);
  }
}

function playVideo() {
  if (!isHost.value || !player || !playerReady.value) return;

  try {
    const time = player.getCurrentTime();
    $socket.emit('video-action', { roomId, action: 'play', time });
    player.playVideo();
  } catch (error) {
    console.error("Error playing video:", error);
  }
}

function pauseVideo() {
  if (!isHost.value || !player || !playerReady.value) return;

  try {
    const time = player.getCurrentTime();
    $socket.emit('video-action', { roomId, action: 'pause', time });
    player.pauseVideo();
  } catch (error) {
    console.error("Error pausing video:", error);
  }
}

function joinAsGuest() {
  const username = guestUsername.value.trim();
  if (!username) {
    showError("Please enter a username");
    return;
  }

  if (username.length > 50) {
    showError("Username is too long (max 50 characters)");
    return;
  }

  loading.value = true;
  $socket.emit('join-room', { roomId, username });
}

function leaveRoom() {
  if (confirm('Are you sure you want to leave the room?')) {
    // $socket.disconnect();
    if (isHost.value) {
      $socket.emit('delete-room', { roomId });
    }
    else {
      $socket.emit('leave-room', { roomId });
    }
    router.push('/');
  }
}

// Socket event handlers
function setupSocketEvents() {
  // Connection status
  $socket.on('connect', () => {
    connectionStatus.value = 'connected';
    console.log('Connected to server');

  });

  $socket.on('disconnect', () => {
    connectionStatus.value = 'disconnected';
    showError("Lost connection to server. Trying to reconnect...");
  });

  $socket.on('reconnect', () => {
    connectionStatus.value = 'connected';
    showError("Reconnected to server!", 2000);
    // Re-get room info after reconnection
    $socket.emit("get-room-info", roomId);
  });

  // Room events
  $socket.on("room-info", ({ exists, hostSocketId, hostUsername: hostname, userList, isUserInRoom, error, videoId, videoTime, videoState }) => {
    loading.value = false;

    if (error || !exists) {
      errorMessage.value = error || "Room does not exist";
      return;
    }

    hostUsername.value = hostname || "Unknown Host";
    isHost.value = $socket.id === hostSocketId;
    // console.log("Room info from room-info received:", { exists, hostSocketId, hostUsername: hostname, userList, isUserInRoom, videoId, videoTime, videoState });

    if (videoId) {
      currentVideoId.value = videoId;
      if (joined.value && import.meta.client) {
        // Store the desired sync state
        lastVideoTime = videoTime;
        lastVideoState = videoState;
        createPlayer(videoId);
        // Do NOT call syncPlayerToState here!
      }
    }

    if (isHost.value || isUserInRoom) {
      joined.value = true;
      users.value = userList || [];
      connectionStatus.value = userList && userList.length > 0 ? 'connected' : 'disconnected';
    }
  });

  $socket.on('host-confirmation', () => {
    isHost.value = true;
    joined.value = true;
    showError("You are now the host!", 3000);
  });

  // $socket.on('host-changed', ({ newHostUsername }) => {
  //   showError(`${newHostUsername} is now the host`, 3000);
  // });



  $socket.on('join-success', () => {
    joined.value = true;
    loading.value = false;
    connectionStatus.value = 'connected';
  });

  // when guest joins room get room info and load youtube player with current video
  $socket.on('update-room-info', ({ users: userList, hostUsername: hostName, roomId, videoId, videoTime, videoState }) => {
    // console.log('update-room-info received:', userList, hostName, roomId);
    users.value = userList || [];
    hostUsername.value = hostName;
    connectionStatus.value = userList && userList.length > 0 ? 'connected' : 'disconnected';


    if (!isHost.value && videoId) {
      currentVideoId.value = videoId;
      createPlayer(videoId);
      // syncPlayerToState(videoTime, videoState);
      if (joined.value) {
        lastVideoTime = videoTime;
        lastVideoState = videoState;
      }
    }
  });

  // Video sync events
  $socket.on('sync-video', ({ action, time }) => {
    if (!player || !playerReady.value) return;

    try {
      player.seekTo(time, true);
      if (action === 'play') {
        player.playVideo();
      } else if (action === 'pause') {
        player.pauseVideo();
      }
      showSyncStatus('syncing');
    } catch (error) {
      console.error("Error syncing video:", error);
    }
  });

  $socket.on('change-video', ({ videoId }) => {
    if (player && playerReady.value) {
      try {
        player.loadVideoById(videoId);
        currentVideoId.value = videoId;
        showSyncStatus('loading');
      } catch (error) {
        console.error("Error changing video:", error);
      }
    }
  });

  $socket.on('sync-time', ({ time }) => {
    if (!player || !playerReady.value) return;

    try {
      const current = player.getCurrentTime();
      const timeDiff = Math.abs(current - time);

      // Only sync if difference is significant
      if (timeDiff > 1.5) {
        player.seekTo(time, true);
        showSyncStatus('syncing');
      }
    } catch (error) {
      console.error("Error syncing time:", error);
    }
  });

  // Error events
  $socket.on('room-error', (message, options = {}) => {
    loading.value = false;
    // Use options.noRedirect if provided, otherwise default to false
    showError(message, 5000, !!options.noRedirect);
    console.log("room error:", message, options)
    // if (message && message.toLowerCase().includes('room was deleted')) {
    //   setTimeout(() => {
    //     router.push('/');
    //   }, 2000); // 2 seconds to let user see the error
    // }
  });

  $socket.on('video-error', (message) => {
    showError(message);
  });

  $socket.on('delete-room', (message) => {
    showError(message || "Room was deleted.", 5000, true);
    // setTimeout(() => {
    //   router.push('/');
    // }, 3000);
  });


}

// Lifecycle hooks
onMounted(() => {
  // console.log("Component mounted at", new Date().toISOString());
  loadYouTubeAPI()

  if (import.meta.client) {
    setupSocketEvents();


    if ($socket.connected) {
      $socket.emit("get-room-info", roomId);
    } else {
      const onConnect = () => {
        $socket.emit("get-room-info", roomId);
        $socket.off('connect', onConnect); // Remove handler after first use
      };
      $socket.on('connect', onConnect);
    }


    // Set up periodic sync for hosts
    syncInterval = setInterval(() => {
      if (isHost.value && player && playerReady.value) {
        try {
          const time = player.getCurrentTime();
          $socket.emit('host-time', { roomId, time });
        } catch (error) {
          console.error("Error sending host time:", error);
        }
      }
    }, 5000);

    // Heartbeat to maintain connection
    heartbeatInterval = setInterval(() => {
      if ($socket.connected) {
        $socket.emit('heartbeat');
      }
    }, 30000);
  }


});

onUnmounted(() => {
  if (syncInterval) clearInterval(syncInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);

  // Clean up player
  if (player) {
    try {
      player.destroy();
    } catch (error) {
      console.error("Error destroying player:", error);
    }
  }
  $socket.off('room-error');
  $socket.off('video-error');
  $socket.off('room-info');
  // $socket.off('host-confirmation');
  $socket.off('join-success');
  $socket.off('update-room-info');
  $socket.off('sync-video');
  $socket.off('change-video');
  $socket.off('sync-time');
  $socket.off('connect');
  $socket.off('disconnect');
  $socket.off('reconnect');


});


// Set page title
const pageTitle = computed(() => {
  return `${hostUsername.value}'s YouTube Party - Room ${roomId}`;
});

useHead({
  title: pageTitle,
})
</script>

<template>
  <div class="party-page">
    <!-- Header -->
    <div class="header">
      <h1 class="text-1 text-xl">🎉 Welcome to {{ hostUsername }}'s YouTube Party - Room {{ roomId }}</h1>
      <div class="status-bar">
        <span :class="['status', connectionStatus]">
          {{ connectionStatus === 'connected' ? '🟢 Connected' : '🔴 Disconnected' }}
        </span>
        <span class="user-count">{{ userCount }} users</span>
        <button @click="leaveRoom" class="leave-btn">Leave Room</button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading room...</p>
    </div>

    <!-- Error Message -->
    <div v-if="errorMessage" class="error-message">
      <p>{{ errorMessage }}</p>
    </div>

    <!-- Join Interface for Guests -->
    <div v-else-if="!isHost && !joined" class="join-box">
      <h2>Join Watch Party</h2>
      <div class="input-group">
        <input type="text" v-model="guestUsername" placeholder="Enter your username" maxlength="50"
          @keyup.enter="joinAsGuest" />
        <button :disabled="!guestUsername.trim() || loading" @click="joinAsGuest" class="join-button">
          {{ loading ? 'Joining...' : 'Join Party' }}
        </button>
      </div>
    </div>

    <!-- Main Party Interface -->
    <div v-else-if="joined" class="main-content">
      <!-- Host Controls -->
      <div v-if="isHost" class="host-controls bg-4/50 border-2">
        <h3 class="text-xl font-semibold">🎬 Host Controls</h3>
        <div class="video-url-section">
          <div class="input-group">
            <input name="videoUrl" v-model="videoUrl" placeholder="Paste YouTube URL or Video ID"
              @keyup.enter="loadVideo"
              :class="{ 'valid': isValidYouTubeUrl, 'invalid': videoUrl && !isValidYouTubeUrl }" />
            <button class="load-video" @click="loadVideo" :disabled="!isValidYouTubeUrl">
              Load Video
            </button>
          </div>
        </div>

        <div class="playback-controls">
          <button @click="playVideo" :disabled="!playerReady" class="control-btn play">
            ▶️ Play
          </button>
          <button @click="pauseVideo" :disabled="!playerReady" class="control-btn pause">
            ⏸️ Pause
          </button>
        </div>
      </div>



      <!-- YouTube Player -->
      <div class="video-container">
        <div id="player" :class="{ 'player-loading': !playerReady }"></div>
        <div v-if="!playerReady" class="player-overlay">
          <div class="spinner"></div>
          <p>Loading player...</p>
        </div>
      </div>

      <!-- Sync Status -->
      <div v-if="syncStatus !== 'synced'" class="sync-status">
        {{ syncStatus === 'syncing' ? '🔄 Syncing...' : '📹 Loading video...' }}
      </div>

      <!-- Users List -->
      <div class="users-section bg-4/50 border-2">
        <h3 class="font-semibold">👥 Users in Room ({{ userCount }})</h3>
        <div class="users-grid">
          <div v-for="user in users" :key="user.id"
            :class="['user-card', { 'host': user.isHost, 'me': user.id === $socket.id }]">
            <span class="username">{{ user.username }}</span>
            <div class="user-badges">
              <span v-if="user.isHost" class="badge host-badge">👑 Host</span>
              <span v-if="user.id === $socket.id" class="badge me-badge">You</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>


<style scoped>
.party-page {
  padding: 1.5rem;
  max-width: 1000px;
  margin: 0 auto;
  min-height: 100vh;
  font-family: system-ui, -apple-system, sans-serif;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 1rem;
}

/* .header h1 {
  margin: 0;
  color: #1f2937;
  font-size: 1.75rem;
} */

.status-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.status {
  font-weight: 600;
  font-size: 0.875rem;
}

.status.connected {
  color: #10b981;
}

.status.disconnected {
  color: #ef4444;
}

.user-count {
  background: #e5e7eb;
  padding: 0.25rem 0.75rem;
  border-radius: 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

.leave-btn {
  background: #ef4444;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.leave-btn:hover {
  background: #dc2626;
}

/* Loading State */
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem;
  text-align: center;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e5e7eb;
  border-top: 4px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

/* Error Messages */
.error-message {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 1rem;
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Join Interface */
.join-box {
  text-align: center;
  padding: 3rem 2rem;
  background: #f9fafb;
  border-radius: 1rem;
  margin: 2rem 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.join-box h2 {
  margin-bottom: 1.5rem;
  color: #1f2937;
}

.input-group {
  display: flex;
  gap: 0.75rem;
  max-width: 400px;
  margin: 0 auto;
  flex-wrap: wrap;
}

.input-group input {
  flex: 1;
  padding: 0.75rem;
  border: 2px solid var(--color-1);
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: border-color 0.2s;
  min-width: 200px;
}

.input-group input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.input-group input.valid {
  border-color: #10b981;
}

.input-group input.invalid {
  border-color: #ef4444;
}

.join-button {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
}

.join-button:hover:not(:disabled) {
  background: #2563eb;
}

.join-button:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

/* Main Content */
.main-content {
  display: grid;
  gap: 2rem;
}

/* Host Controls */
.host-controls {
  /* background: #f0f9ff; */
  padding: 1.5rem;
  border-radius: 1rem;
  border-width: 2px;
  border-style: solid;
}

.host-controls h3 {
  margin: 0 0 1rem 0;
  /* color: #0c4a6e; */
}

.video-url-section {
  margin-bottom: 1.5rem;
}

.video-url-section .input-group {
  max-width: none;
}

.video-url-section input {
  min-width: 300px;
}

.playback-controls {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.control-btn {
  background: #0ea5e9;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.load-video {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
}

.control-btn:hover:not(:disabled) {
  background: #0284c7;
}

.control-btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.control-btn.play {
  background: #10b981;
}

.control-btn.play:hover:not(:disabled) {
  background: #059669;
}

.control-btn.pause {
  background: #f59e0b;
}

.control-btn.pause:hover:not(:disabled) {
  background: #d97706;
}

/* Sync Status */
.sync-status {
  background: #fef3c7;
  color: #92400e;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  text-align: center;
  font-weight: 600;
  animation: pulse 1.5s ease-in-out infinite alternate;
}

@keyframes pulse {
  from {
    opacity: 0.8;
  }

  to {
    opacity: 1;
  }
}

/* Video Container */
.video-container {
  position: relative;
  background: #000;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

#player {
  width: 100%;
  height: 400px;
  border-radius: 1rem;
}

.player-loading {
  opacity: 0.5;
}

.player-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  z-index: 10;
}

.player-overlay .spinner {
  border-color: rgba(255, 255, 255, 0.3);
  border-top-color: white;
}

/* Users Section */
.users-section {
  /* background: white; */
  padding: 1.5rem;
  border-radius: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  /* border: 1px solid #e5e7eb; */
  border-width: 2px;
  border-style: solid;
}

.users-section h3 {
  margin: 0 0 1rem 0;
  /* color: #1f2937; */
}

.users-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.75rem;
}

.user-card {
  /* background: #aaaaaa; */
  background: color-mix(in srgb, var(--color-4) 40%, transparent);
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: transform 0.2s, box-shadow 0.2s;
}

.user-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.user-card.host {
  background: #fef3c7;
  border-color: #f59e0b;
}

.user-card.me {
  background: #dbeafe;
  border-color: #3b82f6;
}

.username {
  font-weight: 600;
  color: var(--color-2);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-badges {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 1rem;
  font-weight: 600;
  white-space: nowrap;
}

.host-badge {
  background: #fbbf24;
  color: #92400e;
}

.me-badge {
  background: #3b82f6;
  color: white;
}

/* Responsive Design */
@media (max-width: 768px) {
  .party-page {
    padding: 1rem;
  }

  .header {
    flex-direction: column;
    align-items: stretch;
    text-align: center;
  }

  .status-bar {
    justify-content: center;
  }

  .input-group {
    flex-direction: column;
  }

  .input-group input {
    min-width: auto;
  }

  .playback-controls {
    justify-content: center;
  }

  #player {
    height: 250px;
  }

  .users-grid {
    grid-template-columns: 1fr;
  }

  .user-card {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }

  .user-badges {
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .party-page {
    padding: 0.75rem;
  }

  .header h1 {
    font-size: 1.25rem;
  }

  .join-box {
    padding: 2rem 1rem;
  }

  .host-controls {
    padding: 1rem;
  }

  #player {
    height: 200px;
  }
}
</style>