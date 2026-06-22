<script setup lang="ts">
const year = new Date().getFullYear();
</script>

<template>
  <footer class="app-footer">
    <div class="app-footer__inner">
      <div class="app-footer__group">
        <span class="app-footer__muted">© {{ year }} BottleCount</span>
      </div>

      <div class="app-footer__group">
        <span class="app-footer__muted">Made with ❤️ by FreoGrella</span>
        <span class="app-footer__sep">·</span>
        <a
          class="app-footer__link"
          href="https://github.com/Fre0Grella"
          target="_blank"
          rel="noreferrer"
          >GitHub</a
        >
        <span class="app-footer__sep">·</span>
        <a
          class="app-footer__link"
          href="https://www.linkedin.com/in/marco-galeri-2b6500384/"
          target="_blank"
          rel="noreferrer"
          >LinkedIn</a
        >
        <span class="app-footer__sep">·</span>
        <a
          class="app-footer__link app-footer__donate"
          href="https://ko-fi.com/freogrella"
          target="_blank"
          rel="noreferrer"
          >☕ Donate</a
        >
      </div>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  border-top: 1px solid var(--border);
  margin-top: auto;
  padding: 18px 20px;
  background: var(--surface);
  font-size: 12px;
}
.app-footer__inner {
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 18px;
}
.app-footer__group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.app-footer__muted {
  color: var(--dim);
}
.app-footer__sep {
  color: var(--faint);
}
.app-footer__link {
  color: var(--dim);
  text-decoration: none;
  transition: color 0.15s;
}
.app-footer__link:hover {
  color: var(--text);
}
.app-footer__donate {
  color: var(--accent);
  font-weight: 600;
}
.app-footer__donate:hover {
  color: var(--accent);
}
@media (max-width: 560px) {
  .app-footer__inner {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
