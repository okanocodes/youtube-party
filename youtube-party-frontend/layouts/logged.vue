<script setup>
const { loggedIn, user, clear } = useUserSession()

const route = useRoute()
const router = useRouter()
const { $socket } = useNuxtApp()

function handleHomeClick(e) {
    // Check if user is in a room page (adjust path as needed)
    if (route.path.includes('/room/')) {
        e.preventDefault()
        if (confirm('Are you sure you want to leave the room and go home?')) {
            // Optionally emit leave/delete room event
            // Try to get roomId from route params
            const roomId = route.params.roomId
            if (roomId) {
                $socket.emit('delete-room', { roomId })
            }
            router.push('/')
        }
    }
}


</script>

<template>
    <div>
        <nav v-if="loggedIn"
            class="navbar overflow-hidden flex justify-between items-center px-6 py-3 bg-2  rounded-3xl gap-4 ">
            <div class="navbar-start items-center">
                <!-- <div class="text-xl font-bold text-gray-900 tracking-tight">🎉 YouTube Party</div> -->

                <NuxtLink class="link text-xl font-bold no-underline tracking-tight flex gap-3" to="/"
                    @click="handleHomeClick">
                    <span>🎉 </span>
                    <h1 class="text-white/60  hover:text-white/70 ">YouTube Party</h1>
                </NuxtLink>
            </div>
            <div class="navbar-end flex items-center gap-4">
                <button @click="clear"
                    class="px-3 py-1 bg-red-700 hover:bg-red-800 text-gray-300 rounded  hover:cursor-pointer">Sign
                    Out</button>

                <div class="avatar">
                    <div class="size-9.5">
                        <img :src="user.imageUrl" class=" rounded-full" alt="avatar 1" />
                    </div>
                </div>
            </div>
        </nav>
        <slot />
    </div>
</template>
