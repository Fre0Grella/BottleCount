<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useStore } from '../lib/store';
import Icon from './Icon.vue';
import AppFooter from './AppFooter.vue';
import HomeScreen from './HomeScreen.vue';
import PartyHeader from './PartyHeader.vue';
import KpiBar from './KpiBar.vue';
import PlanTab from './tabs/PlanTab.vue';
import MenuTab from './tabs/MenuTab.vue';
import ShoppingTab from './tabs/ShoppingTab.vue';
import GuestsTab from './tabs/GuestsTab.vue';
import AddBottleModal from './modals/AddBottleModal.vue';
import CocktailBuilderModal from './modals/CocktailBuilderModal.vue';
import ManageIngredientsModal from './modals/ManageIngredientsModal.vue';
import ShareModal from './modals/ShareModal.vue';
import SendTicketModal from './modals/SendTicketModal.vue';
import TicketModal from './modals/TicketModal.vue';
import AddGuestModal from './modals/AddGuestModal.vue';
import DoorScannerModal from './modals/DoorScannerModal.vue';

const store = useStore();

onMounted(() => {
  void store.load();
});

const tabs = computed(() => {
  const s = store.state;
  return [
    { key: 'plan' as const, label: 'Plan', icon: 'calc' },
    { key: 'menu' as const, label: 'Menu', icon: 'glass' },
    { key: 'shop' as const, label: 'Shopping', icon: 'cart' },
    { key: 'guests' as const, label: 'Guests', icon: 'users' },
  ].map((t) => ({
    ...t,
    active: s.tab === t.key,
    bg: s.tab === t.key ? 'var(--accent)' : 'transparent',
    fg: s.tab === t.key ? 'var(--on-accent)' : 'var(--dim)',
  }));
});
</script>

<template>
  <div
    style="
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-body);
    "
  >
    <!-- splash -->
    <div
      v-if="!store.state.ready"
      style="
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 18px;
      "
    >
      <span
        style="
          display: flex;
          width: 52px;
          height: 52px;
          border-radius: 14px;
          align-items: center;
          justify-content: center;
          background: var(--accent);
          color: var(--on-accent);
          animation: bcPulse 1.4s ease-in-out infinite;
        "
      >
        <Icon name="bottle" :size="26" />
      </span>
      <div style="font-size: 14px; color: var(--dim)">Pouring the data…</div>
    </div>

    <!-- app shell -->
    <template v-else>
      <!-- HOME -->
      <HomeScreen v-if="store.state.route === 'home'" />

      <!-- PARTY WORKSPACE -->
      <template v-else>
        <!-- header -->
        <PartyHeader />

        <!-- desktop tab bar -->
        <div
          v-if="store.state.device === 'desktop'"
          style="border-bottom: 1px solid var(--border)"
        >
          <div
            style="
              display: flex;
              justify-content: center;
              padding: 12px 24px 0 24px;
            "
          >
            <div
              style="
                display: flex;
                gap: 4px;
                background: var(--surface);
                border: 1px solid var(--border);
                border-radius: 999px;
                padding: 4px;
              "
            >
              <button
                v-for="t in tabs"
                :key="t.key"
                style="
                  cursor: pointer;
                  border: none;
                  display: flex;
                  align-items: center;
                  gap: 7px;
                  font-size: 13px;
                  font-weight: 600;
                  padding: 8px 18px;
                  border-radius: 999px;
                "
                :style="{ background: t.bg, color: t.fg }"
                @click="store.setTab(t.key)"
              >
                <Icon :name="t.icon" :size="15" />
                {{ t.label }}
              </button>
            </div>
          </div>

          <!-- desktop KPI bar -->
          <KpiBar />
        </div>

        <!-- scrollable content area -->
        <div
          style="flex: 1; overflow: auto; display: flex; flex-direction: column"
        >
          <!-- phone KPI strip -->
          <KpiBar v-if="store.state.device === 'phone'" />

          <!-- phone tab nav -->
          <div
            v-if="store.state.device === 'phone'"
            style="
              position: sticky;
              top: 0;
              z-index: 5;
              display: flex;
              gap: 6px;
              padding: 10px 14px;
              background: var(--bg);
              border-bottom: 1px solid var(--border);
            "
          >
            <button
              v-for="t in tabs"
              :key="t.key"
              style="
                flex: 1;
                cursor: pointer;
                border: 1px solid var(--border);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                font-size: 12px;
                font-weight: 600;
                padding: 7px 4px;
                border-radius: 999px;
              "
              :style="{
                background: t.bg,
                color: t.fg,
                borderColor: t.active ? 'var(--accent)' : 'var(--border)',
              }"
              @click="store.setTab(t.key)"
            >
              <Icon :name="t.icon" :size="14" />
              {{ t.label }}
            </button>
          </div>

          <!-- active tab -->
          <div
            style="
              width: 100%;
              max-width: 960px;
              margin: 0 auto;
              padding: 24px 20px;
              width: 100%;
            "
          >
            <PlanTab v-if="store.state.tab === 'plan'" />
            <MenuTab v-else-if="store.state.tab === 'menu'" />
            <ShoppingTab v-else-if="store.state.tab === 'shop'" />
            <GuestsTab v-else-if="store.state.tab === 'guests'" />
          </div>

          <AppFooter />
        </div>

        <!-- modals (self-hide via store flags) -->
        <AddBottleModal />
        <CocktailBuilderModal />
        <ManageIngredientsModal />
        <ShareModal />
        <SendTicketModal />
        <TicketModal />
        <AddGuestModal />
        <DoorScannerModal />
      </template>
    </template>
  </div>
</template>
