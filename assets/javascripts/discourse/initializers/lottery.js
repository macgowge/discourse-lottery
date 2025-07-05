import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "truman-lottery",
  initialize() {
    withPluginApi("1.0.0", api => {
      // 插件初始化代码
    });
  }
};
