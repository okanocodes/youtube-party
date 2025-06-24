<script setup>
const { loggedIn } = useUserSession()

const layout = loggedIn ? "logged" : "default";


useHead({
  titleTemplate: (titleChunk) => {
    return titleChunk ? `${titleChunk} - Youtube Party ` : 'Youtube Party';
  }
})
</script>
<template>

  <div class=" p-8 ">


    <NuxtLayout :name="layout"
      class="flex shadow-xl/50 shadow-white/10 flex-col bg-3 min-h-[calc(100vh-4rem)] min-w-[calc(100vw-4rem)] rounded-3xl">

      <div class="p-8 flex flex-1 justify-center items-center">
        <NuxtPage />
      </div>
      <footer class="text-center text-sm mt-auto mb-2">
        made with ❤️ by <a href="https://github.com/okanocodes/"
          class="font-bold underline hover:text-2/80 hover:underline">okan</a>
      </footer>
    </NuxtLayout>


  </div>
</template>
