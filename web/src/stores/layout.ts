import { defineStore } from "pinia";
import { ref, watch } from "vue";

export const useLayoutStore = defineStore("layout", () => {
  const leftWidth = ref(250);
  const rightWidth = ref(300);
  const leftCollapsed = ref(false);
  const rightCollapsed = ref(false);

  function loadFromStorage() {
    const saved = localStorage.getItem("storyforge-layout");
    if (saved) {
      const data = JSON.parse(saved) as {
        leftWidth?: number;
        rightWidth?: number;
        leftCollapsed?: boolean;
        rightCollapsed?: boolean;
      };
      leftWidth.value = data.leftWidth ?? 250;
      rightWidth.value = data.rightWidth ?? 300;
      leftCollapsed.value = data.leftCollapsed ?? false;
      rightCollapsed.value = data.rightCollapsed ?? false;
    }
  }

  function toggleLeft() {
    leftCollapsed.value = !leftCollapsed.value;
  }
  function toggleRight() {
    rightCollapsed.value = !rightCollapsed.value;
  }

  watch([leftWidth, rightWidth, leftCollapsed, rightCollapsed], () => {
    localStorage.setItem(
      "storyforge-layout",
      JSON.stringify({
        leftWidth: leftWidth.value,
        rightWidth: rightWidth.value,
        leftCollapsed: leftCollapsed.value,
        rightCollapsed: rightCollapsed.value,
      }),
    );
  });

  return { leftWidth, rightWidth, leftCollapsed, rightCollapsed, toggleLeft, toggleRight, loadFromStorage };
});
