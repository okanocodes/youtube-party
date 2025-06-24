import { ref } from "vue";

const username = ref<string>(""); // shared state

export function useUserName() {
  function setUsername(newName: string) {
    username.value = newName;
  }

  return {
    username,
    setUsername,
  };
}
