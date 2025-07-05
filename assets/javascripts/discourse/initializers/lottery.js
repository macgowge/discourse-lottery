import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "lottery",
  initialize() {
    withPluginApi("1.0.0", api => {
      // 插件初始化代码
    });
  }
};
