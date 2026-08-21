<script lang="ts">
export default {}
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

/* #ifdef H5 */
button:focus-visible,
input:focus-visible,
[role="button"]:focus-visible,
[role="tab"]:focus-visible,
[role="dialog"]:focus-visible {
  outline: 2px solid #b64c39;
  outline-offset: 2px;
}
/* #endif */
</style>
