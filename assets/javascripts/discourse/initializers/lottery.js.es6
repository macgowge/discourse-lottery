import { apiInitializer } from "discourse/lib/api";
import I18n from "I18n"; // 确保导入 I18n

export default apiInitializer("1.0.1", (api) => {
  // 使用 Discourse 的 bootbox 显示警报的辅助函数
  const showAlert = (message, type = "error") => {
    if (window.bootbox && window.bootbox.alert) {
      window.bootbox.alert({
        message: message,
        // Discourse 的 bootbox 没有 type，但你可以用 CSS 或自定义逻辑
      });
    } else {
      window.alert(message);
    }
  };

  // 更新抽奖框状态显示的函数
  function updateStatusDisplay(box, currentEntries, maxEntries, prizeName, pointsCost) {
    const statusDiv = box.querySelector(".lottery-status-display");
    if (!statusDiv) return;

    let entriesText;
    if (maxEntries && maxEntries > 0) {
      const remaining = Math.max(0, maxEntries - currentEntries);
      entriesText = I18n.t("js.lottery.status_limited", {
        current: currentEntries,
        total: maxEntries,
        remaining: remaining,
      });
    } else {
      entriesText = I18n.t("js.lottery.status_unlimited", { count: currentEntries });
    }

    const costText =
      pointsCost > 0
        ? I18n.t("js.lottery.cost_info", { cost: pointsCost })
        : I18n.t("js.lottery.cost_free");

    statusDiv.innerHTML = "";

    const prizeElement = document.createElement("div");
    prizeElement.className = "lottery-prize";
    prizeElement.textContent = I18n.t("js.lottery.prize", {
      prizeName: prizeName || I18n.t("js.lottery.default_prize"),
    });

    const statsElement = document.createElement("div");
    statsElement.className = "lottery-stats";
    statsElement.textContent = entriesText;

    const costElement = document.createElement("div");
    costElement.className = "lottery-cost";
    costElement.textContent = costText;

    statusDiv.append(prizeElement, statsElement, costElement);
  }

  api.decorateCookedElement(
    (cookedElem, postDecorator) => {
      if (!postDecorator) return;

      const post = postDecorator.getModel();
      if (!post || !post.id) return;

      const lotteryData = post.lottery_data;

      if (lotteryData && lotteryData.id) {
        let lotteryBox = cookedElem.querySelector(
          `.lottery-box[data-lottery-id="${lotteryData.id}"]`
        );

        if (!lotteryBox) {
          let placeholder = cookedElem.querySelector(
            ".lottery-placeholder-for-post-" + post.id
          );
          if (!placeholder) {
            placeholder = document.createElement("div");
            placeholder.className = `lottery-box auto-created-lottery-box lottery-placeholder-for-post-${post.id}`;
            cookedElem.appendChild(placeholder);
          }
          lotteryBox = placeholder;
          lotteryBox.dataset.lotteryId = lotteryData.id;
        }

        if (lotteryBox.dataset.lotteryInitialized === "true") return;
        lotteryBox.dataset.lotteryInitialized = "true";

        lotteryBox.dataset.prizeName =
          lotteryData.prize_name || I18n.t("js.lottery.default_prize");
        lotteryBox.dataset.pointsCost = lotteryData.points_cost;
        lotteryBox.dataset.maxEntries = lotteryData.max_entries || "";
        lotteryBox.dataset.totalEntries = lotteryData.total_entries;
        lotteryBox.dataset.lotteryTitle =
          lotteryData.title || I18n.t("js.lottery.default_title");

        lotteryBox.innerHTML = "";

        const lotteryId = lotteryData.id;
        const cost = parseInt(lotteryData.points_cost, 10) || 0;
        const maxEntries = lotteryData.max_entries
          ? parseInt(lotteryData.max_entries, 10)
          : null;
        let currentEntries = parseInt(lotteryData.total_entries, 10) || 0;
        const prizeName = lotteryData.prize_name;
        const lotteryTitle = lotteryData.title;

        const container = document.createElement("div");
        container.className = "lottery-ui-container";

        const titleElement = document.createElement("h3");
        titleElement.className = "lottery-title-display";
        titleElement.textContent =
          lotteryTitle || I18n.t("js.lottery.default_title");
        container.appendChild(titleElement);

        const statusDisplay = document.createElement("div");
        statusDisplay.className = "lottery-status-display";
        container.appendChild(statusDisplay);

        updateStatusDisplay(lotteryBox, currentEntries, maxEntries, prizeName, cost);

        const button = document.createElement("button");
        button.className = "btn btn-primary join-lottery-btn";
        button.innerHTML =
          cost > 0
            ? I18n.t("js.lottery.participate_with_cost_btn", { cost })
            : I18n.t("js.lottery.participate_btn");

        if (maxEntries && currentEntries >= maxEntries) {
          button.disabled = true;
          button.innerHTML = I18n.t("js.lottery.max_entries_reached_btn");
        }

        const messageArea = document.createElement("div");
        messageArea.className = "lottery-message-area";

        button.addEventListener("click", async () => {
          if (cost > 0) {
            if (window.bootbox && window.bootbox.confirm) {
              window.bootbox.confirm({
                message: I18n.t("js.lottery.confirm_cost_participation", { cost }),
                callback: async function (result) {
                  if (result) {
                    await tryJoinLottery();
                  }
                },
              });
            } else {
              // 简单降级回退
              if (
                window.confirm(
                  I18n.t("js.lottery.confirm_cost_participation", { cost })
                )
              ) {
                await tryJoinLottery();
              }
            }
          } else {
            await tryJoinLottery();
          }
        });

        async function tryJoinLottery() {
          button.disabled = true;
          messageArea.textContent = I18n.t("js.lottery.joining");
          messageArea.className = "lottery-message-area lottery-processing";

          try {
            // 使用 Discourse 推荐方式直接用 window._csrf_token
            const token = window._csrf_token;

            if (!token) {
              throw new Error(I18n.t("js.lottery.csrf_token_error"));
            }

            const response = await fetch("/lottery_plugin/entries", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": token,
              },
              body: JSON.stringify({ lottery_id: lotteryId }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
              showAlert(
                data.message || I18n.t("js.lottery.success_joined_alert"),
                "success"
              );
              currentEntries = data.total_entries;
              lotteryBox.dataset.totalEntries = currentEntries;
              updateStatusDisplay(
                lotteryBox,
                currentEntries,
                maxEntries,
                prizeName,
                cost
              );

              if (maxEntries && currentEntries >= maxEntries) {
                button.disabled = true;
                button.innerHTML = I18n.t("js.lottery.max_entries_reached_btn");
              }
              messageArea.textContent = I18n.t("js.lottery.success_message_inline");
              messageArea.className = "lottery-message-area lottery-success";
            } else {
              const errorMessage =
                data.error ||
                (data.errors && data.errors.join(", ")) ||
                I18n.t("js.lottery.generic_error_client");
              showAlert(errorMessage, "error");
              messageArea.textContent = errorMessage;
              messageArea.className = "lottery-message-area lottery-error";
              if (
                response.status !== 403 &&
                response.status !== 422 &&
                !(
                  data.error &&
                  data.error.includes(
                    I18n.t("lottery.errors.already_participated")
                  )
                )
              ) {
                button.disabled = false;
              }
            }
          } catch (e) {
            console.error("Lottery Plugin JS Error:", e);
            const networkErrorMsg = I18n.t("js.lottery.network_error_client");
            showAlert(
              networkErrorMsg + (e.message ? ` (${e.message})` : ""),
              "error"
            );
            messageArea.textContent = networkErrorMsg;
            messageArea.className = "lottery-message-area lottery-error";
            button.disabled = false;
          }
        }

        lotteryBox.appendChild(container);
        if (!(maxEntries && currentEntries >= maxEntries)) {
          container.appendChild(button);
        }
        container.appendChild(messageArea);
      }
    },
    {
      id: "discourse-lottery-decorator",
      onlyStream: true,
    }
  );
});
