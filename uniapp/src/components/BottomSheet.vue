<script setup lang="ts">
import { nextTick, onBeforeUnmount, watch } from 'vue'

const props = defineProps<{ visible: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
let previousFocus: HTMLElement | null = null

function dialogElement() {
  // #ifdef H5
  return document.querySelector<HTMLElement>('.bottom-sheet')
  // #endif
  return null
}

function focusableElements() {
  const elements = Array.from(dialogElement()?.querySelectorAll<HTMLElement>(
    'uni-button:not([disabled]), button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ) ?? [])
  elements.forEach((element) => {
    if (element.tagName !== 'UNI-BUTTON') return
    if (!element.hasAttribute('role')) element.setAttribute('role', 'button')
    if (!element.hasAttribute('tabindex')) element.tabIndex = 0
  })
  return elements.filter((element) => !element.hasAttribute('hidden') && element.getClientRects().length > 0)
}

function handleKeydown(event: KeyboardEvent) {
  // #ifdef H5
  if (event.defaultPrevented || document.querySelector('.method-card')) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if ((event.key === 'Enter' || event.key === ' ')
    && event.target instanceof HTMLElement && event.target.tagName === 'UNI-BUTTON') {
    event.preventDefault()
    event.target.click()
    return
  }
  if (event.key !== 'Tab') return
  const focusable = focusableElements()
  if (!focusable.length) {
    event.preventDefault()
    dialogElement()?.focus()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
  // #endif
}

watch(() => props.visible, async (visible) => {
  // #ifdef H5
  if (visible) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.addEventListener('keydown', handleKeydown)
    await nextTick()
    focusableElements()[0]?.focus()
  } else {
    document.removeEventListener('keydown', handleKeydown)
    previousFocus?.focus()
    previousFocus = null
  }
  // #endif
})

onBeforeUnmount(() => {
  // #ifdef H5
  document.removeEventListener('keydown', handleKeydown)
  // #endif
})
</script>

<template>
  <view v-if="visible" class="sheet-mask" @click="emit('close')">
    <view
      class="bottom-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bottom-sheet-title"
      tabindex="-1"
      @click.stop
    >
      <view class="handle" />
      <view class="sheet-head">
        <text id="bottom-sheet-title">{{ title }}</text>
        <button class="sheet-close" role="button" tabindex="0" @click="emit('close')">关闭</button>
      </view>
      <scroll-view scroll-y class="sheet-scroll"><slot /></scroll-view>
    </view>
  </view>
</template>

<style scoped>
.sheet-mask { position: fixed; z-index: 10; inset: 0; background: rgba(11, 31, 35, 0.34); }
.bottom-sheet { position: fixed; right: 0; bottom: 0; left: 0; max-height: 74vh; border-radius: 30rpx 30rpx 0 0; background: #faf6ed; padding-bottom: env(safe-area-inset-bottom); box-shadow: 0 -18rpx 60rpx rgba(12, 35, 39, 0.28); }
.handle { width: 70rpx; height: 7rpx; margin: 14rpx auto 7rpx; border-radius: 99rpx; background: #c0b9ae; }
.sheet-head { display: flex; align-items: center; justify-content: space-between; border-bottom: 1rpx solid rgba(23, 52, 58, 0.14); padding: 12rpx 28rpx; color: #17343a; font-family: serif; font-size: 28rpx; font-weight: 700; }
.sheet-close { margin: 0; border: 0; background: transparent; padding: 8rpx; color: #b64c39; font-size: 21rpx; line-height: 1; }
.sheet-close::after { display: none; }
.sheet-scroll { max-height: calc(74vh - 96rpx - env(safe-area-inset-bottom)); }
</style>
