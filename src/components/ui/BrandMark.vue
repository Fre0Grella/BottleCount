<script setup lang="ts">
/**
 * The marks of the payment apps a guest can pay the host with.
 *
 * Kept apart from Icon, whose icons are stroked outlines: these are filled
 * shapes, drawn in `currentColor` so each sits white on its own coloured
 * button. Satispay's is the symbol from the logo on satispay.com; Revolut's
 * comes from Simple Icons.
 */
defineProps<{ name: 'satispay' | 'revolut'; size?: number | string }>();

const marks = {
  satispay: {
    viewBox: '0 0.8 23 24',
    paths: [
      'M4.18305 24.4375H11.0671L21.9432 14.7292C22.4869 14.2437 22.7997 13.5518 22.7997 12.8332C22.7997 12.1147 22.4869 11.4228 21.9432 10.9372L11.0671 1.229H4.18305C3.91742 1.229 3.75606 1.39893 3.694 1.55673C3.63193 1.71453 3.6344 1.94516 3.82804 2.11995L15.4786 12.5201C15.568 12.6002 15.6201 12.7167 15.6201 12.8357C15.6201 12.9546 15.568 13.0712 15.4786 13.1513L3.82804 23.5514C3.63191 23.7262 3.62945 23.9568 3.694 24.1146C3.75606 24.2724 3.91742 24.4423 4.18305 24.4423V24.4375Z',
      'M6.28082 6.09176L0.856466 10.9325C0.312789 11.4181 0 12.1099 0 12.8285C0 13.5471 0.312789 14.239 0.856466 14.7245L6.28082 19.5653L10.3969 15.8898L7.31854 13.1417C7.22917 13.0616 7.17702 12.9451 7.17702 12.8261C7.17702 12.7071 7.22917 12.5906 7.31854 12.5105L10.3969 9.76239L6.28082 6.08691V6.09176Z',
      'M18.6192 1.22314H13.0781L16.5239 4.29899L18.9717 2.11409C19.1678 1.9393 19.1703 1.70867 19.1082 1.55087C19.0462 1.39308 18.8848 1.22314 18.6192 1.22314Z',
      'M16.5239 21.3589L13.0781 24.4347H18.6192C18.8848 24.4347 19.0462 24.2648 19.1082 24.107C19.1703 23.9492 19.1678 23.7186 18.9717 23.5438L16.5239 21.3589Z',
    ],
  },
  revolut: {
    viewBox: '0 0 24 24',
    paths: [
      'M20.9133 6.9566C20.9133 3.1208 17.7898 0 13.9503 0H2.424v3.8605h10.9782c1.7376 0 3.177 1.3651 3.2087 3.043.016.84-.2994 1.633-.8878 2.2324-.5886.5998-1.375.9303-2.2144.9303H9.2322a.2756.2756 0 0 0-.2755.2752v3.431c0 .0585.018.1142.052.1612L16.2646 24h5.3114l-7.2727-10.094c3.6625-.1838 6.61-3.2612 6.61-6.9494zM6.8943 5.9229H2.424V24h4.4704z',
    ],
  },
} as const;
</script>

<template>
  <svg
    :width="size ?? 18"
    :height="size ?? 18"
    :viewBox="marks[name].viewBox"
    fill="currentColor"
    aria-hidden="true"
    class="bc-brand-mark"
  >
    <path v-for="d in marks[name].paths" :key="d" :d="d" />
  </svg>
</template>

<style scoped>
.bc-brand-mark {
  display: block;
  flex-shrink: 0;
}
</style>
