<script setup>
import { useRouter } from 'vue-router';
const { loggedIn, user, session, fetch, clear, openInPopup } = useUserSession()



const username = ref(''); // user input
const roomId = ref('');
const roomLoading = ref(false);
const router = useRouter();
const { $socket } = useNuxtApp();

// Simple security check: only allow alphanumeric, dashes, and underscores, 3-20 chars
function isValidInput(str) {
  return /^[a-z0-9_-]{3,20}$/.test(str);
}

function createRoom() {
  // Trim and lowercase
  const cleanUsername = username.value.trim().toLowerCase();
  const cleanRoomId = roomId.value.trim().toLowerCase();

  if (!cleanUsername || !cleanRoomId) {
    alert('Please enter both username and room name');
    return;
  }

  if (!isValidInput(cleanUsername) || !isValidInput(cleanRoomId)) {
    alert('Only 3-20 lowercase letters, numbers, dashes, and underscores are allowed.');
    return;
  }

  // Update refs so UI stays in sync
  username.value = cleanUsername;
  roomId.value = cleanRoomId;

  roomLoading.value = true;

  // Tell backend to create the room with this user as host
  $socket.emit('create-room', {
    roomId: roomId.value,
    username: username.value
  });
}

onMounted(() => {
  // Listen for confirmation from backend that room is created & user is host
  $socket.on('host-confirmation', () => {
    // Navigate to room page as host
    roomLoading.value = false;
    router.push(`/${username.value}/room/${roomId.value}`);
  });

  $socket.on('room-error', (message) => {
    alert(message);
  });
})

onUnmounted(() => {
  $socket.off('host-confirmation');
})
</script>

<template>

  <div class="flex flex-col md:flex-row gap-4 w-full justify-center">
    <div class="flex flex-col gap-5 justify-between">

      <div class="text-4xl font-bold text-gray-900 tracking-tight">
        <span v-if="loggedIn" class="">Hello, {{ user.name }}</span>
        <span v-else>🎉 YouTube Party</span>
      </div>

      <div class="space-y-5">

        <ul class="space-y-2 text-xl leading-relaxed font-semibold">
          <li>Create Youtube playlists</li>
          <li>Watch it together with your friends!</li>
        </ul>

        <button v-if="!loggedIn" @click="openInPopup('/api/auth/google')"
          class="w-full flex flex-row items-center justify-center gap-5 rounded-md h-12 font-medium bg-white text-gray-700 border border-3 hover:bg-gray-50 hover:border-2 shadow-sm">
          <Icon name="logos:google-icon" />

          <span>Sign in with Google</span>
        </button>
      </div>
    </div>

    <div v-if="loggedIn" class="flex flex-col space-y-5">
      <input v-model="username" name="username" type="text" class="input max-w-sm" aria-label="input"
        placeholder="Enter your username" />
      <input v-model="roomId" name="roomId" type="text" class="input max-w-sm" aria-label="input"
        placeholder="Enter room name" />
      <button @click="createRoom" :disabled="roomLoading"
        class="w-full flex flex-row items-center justify-center gap-5 rounded-md h-12 font-medium bg-white text-2 hover:text-1 border border-3 hover:bg-gray-50 hover:border-2 hover:cursor-pointer shadow-sm relative">
        <span v-if="loading" class="absolute left-4">
          <!-- Simple spinner, you can use your own or a library spinner -->
          <svg class="animate-spin h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none"
            viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
          </svg>
        </span>
        <span :class="{ 'opacity-50': roomLoading }">Create Room</span>
      </button>
    </div>

    <!-- <div v-if="loggedIn">
      <input v-model="username" placeholder="Enter your username" />
      <input v-model="roomId" placeholder="Enter room ID" />
      <button @click="createRoom">Create Room</button>
    </div> -->
  </div>
</template>