<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useStore } from '../store/store';
import { runsBar } from '../features/party/core';
import Icon from '../components/ui/Icon.vue';
import Logo from '../components/ui/Logo.vue';
import AppFooter from '../components/site/AppFooter.vue';
import HomeScreen from './HomeScreen.vue';
import PartyHeader from '../features/party/PartyHeader.vue';
import KpiBar from '../features/party/KpiBar.vue';
import PlanTab from '../features/party/PlanTab.vue';
import MenuTab from '../features/menu/MenuTab.vue';
import ShoppingTab from '../features/menu/ShoppingTab.vue';
import GuestsTab from '../features/guests/GuestsTab.vue';
import AddBottleModal from '../features/menu/AddBottleModal.vue';
import CocktailBuilderModal from '../features/menu/CocktailBuilderModal.vue';
import ManageIngredientsModal from '../features/menu/ManageIngredientsModal.vue';
import ShareModal from '../features/sharing/ShareModal.vue';
import SendTicketModal from '../features/tickets/SendTicketModal.vue';
import TicketModal from '../features/tickets/TicketModal.vue';
import AddGuestModal from '../features/guests/AddGuestModal.vue';
import DoorScannerModal from '../features/tickets/DoorScannerModal.vue';
import UpgradeModal from '../features/account/UpgradeModal.vue';
import CoOrganisersModal from '../features/sharing/CoOrganisersModal.vue';

const store = useStore();

onMounted(() => {
  void store.load();
});

// When the venue runs the bar there is no menu to plan and nothing to buy, so
// those two tabs go rather than showing screens that no longer mean anything.
const barTabs = new Set(['menu', 'shop']);
const planningDrinks = computed(() => {
  const p = store.activeParty();
  return p ? runsBar(p) : true;
});

/**
 * The tab to render. Falls back to Plan when the open one was hidden — the
 * switch was just flipped here, or by a co-organiser on another device.
 */
const shownTab = computed(() =>
  !planningDrinks.value && barTabs.has(store.state.tab)
    ? 'plan'
    : store.state.tab,
);

const tabs = computed(() => {
  const active = shownTab.value;
  return [
    { key: 'plan' as const, label: 'Plan', icon: 'calc' as const },
    { key: 'menu' as const, label: 'Menu', icon: 'glass' as const },
    { key: 'shop' as const, label: 'Shopping', icon: 'cart' as const },
    { key: 'guests' as const, label: 'Guests', icon: 'users' as const },
  ]
    .filter((t) => planningDrinks.value || !barTabs.has(t.key))
    .map((t) => ({ ...t, active: active === t.key }));
});
</script>

<template>
  <div class="app">
    <!-- splash -->
    <div v-if="!store.state.ready" class="splash">
      <Logo :size="52" class="splash__mark" />
      <div class="splash__note">Pouring the data…</div>
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
        <div v-if="store.state.device === 'desktop'" class="app-desk-nav">
          <div class="app-desk-nav__row">
            <div class="app-desk-nav__tabs">
              <button
                v-for="t in tabs"
                :key="t.key"
                class="app-tab app-tab--desk"
                :class="{ 'app-tab--active': t.active }"
                :aria-current="t.active ? 'page' : undefined"
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
        <div class="app-scroll">
          <!-- phone KPI strip -->
          <KpiBar v-if="store.state.device === 'phone'" />

          <!-- phone tab nav -->
          <div v-if="store.state.device === 'phone'" class="app-phone-nav">
            <button
              v-for="t in tabs"
              :key="t.key"
              class="app-tab app-tab--phone"
              :class="{ 'app-tab--active': t.active }"
              :aria-current="t.active ? 'page' : undefined"
              @click="store.setTab(t.key)"
            >
              <Icon :name="t.icon" :size="14" />
              {{ t.label }}
            </button>
          </div>

          <!-- active tab -->
          <div class="app-tab-content">
            <PlanTab v-if="shownTab === 'plan'" />
            <MenuTab v-else-if="shownTab === 'menu'" />
            <ShoppingTab v-else-if="shownTab === 'shop'" />
            <GuestsTab v-else-if="shownTab === 'guests'" />
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
        <CoOrganisersModal />
      </template>

      <!--
        Outside the party-workspace branch: the upgrade prompt is reachable from
        the home screen too, and unmounting it on navigation would close it
        mid-redemption.
      -->
      <UpgradeModal />
    </template>
  </div>
</template>

<style scoped>
.app {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
}

.splash {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
}
.splash__mark {
  animation: bcPulse 1.4s ease-in-out infinite;
}
.splash__note {
  font-size: 14px;
  color: var(--dim);
}
.app-desk-nav {
  border-bottom: 1px solid var(--border);
}
.app-desk-nav__row {
  display: flex;
  justify-content: center;
  padding: 12px 24px 0 24px;
}
.app-desk-nav__tabs {
  display: flex;
  gap: 4px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px;
}

.app-scroll {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.app-phone-nav {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  gap: 6px;
  padding: 10px 14px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

.app-tab {
  cursor: pointer;
  display: flex;
  align-items: center;
  font-weight: 600;
  border-radius: 999px;
  background: transparent;
  color: var(--dim);
}
.app-tab--desk {
  border: none;
  gap: 7px;
  font-size: 13px;
  padding: 8px 18px;
}
.app-tab--phone {
  flex: 1;
  border: 1px solid var(--border);
  justify-content: center;
  gap: 5px;
  font-size: 12px;
  padding: 7px 4px;
}
.app-tab--active {
  background: var(--accent);
  color: var(--on-accent);
  border-color: var(--accent);
}

.app-tab-content {
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 20px;
}
</style>
