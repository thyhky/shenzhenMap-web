<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'

onLaunch(() => {
  console.info('Shenzhen Housing Atlas uni-app client started')
})
</script>

<style>
page {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #d9d1c1;
  color: #17343a;
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
}

view,
text,
button,
input,
picker,
scroll-view,
map {
  box-sizing: border-box;
}
</style>
