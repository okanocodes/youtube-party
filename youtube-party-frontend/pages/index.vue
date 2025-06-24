<script setup>
import { useRouter } from 'vue-router';
const { loggedIn, user, session, fetch, clear, openInPopup } = useUserSession()



const username = ref(''); // user input
const roomId = ref('');
const router = useRouter();
const { $socket } = useNuxtApp();


function createRoom() {
  if (!username.value || !roomId.value) {
    alert('Please enter both username and room ID');
    return;
  }

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

  <div class="flex gap-4 w-full justify-center">
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
      <input v-model="username" type="text" class="input max-w-sm" aria-label="input"
        placeholder="Enter your username" />
      <input v-model="roomId" type="text" class="input max-w-sm" aria-label="input" placeholder="Enter room name" />
      <button @click="createRoom"
        class="w-full flex flex-row items-center justify-center gap-5 rounded-md h-12 font-medium bg-white text-2 hover:text-1 border border-3 hover:bg-gray-50 hover:border-2 shadow-sm">Create
        Room</button>
    </div>

    <!-- <div v-if="loggedIn">
      <input v-model="username" placeholder="Enter your username" />
      <input v-model="roomId" placeholder="Enter room ID" />
      <button @click="createRoom">Create Room</button>
    </div> -->
  </div>
</template>