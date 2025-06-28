# frozen_string_literal: true

module LotteryPlugin
  module Parser
    def self.parse(post, doc)
      # Rails.logger.info "LotteryPlugin Parser: Entered parse for post ID #{post.id}"
      return unless post.post_number == 1 # 示例：仅允许在第一个帖子中创建抽奖
      # Rails.logger.info "LotteryPlugin Parser: Post #{post.id} is first post."

      # 使用正确的命名空间 LotteryPlugin::Lottery
      if LotteryPlugin::Lottery.exists?(post_id: post.id)
        # Rails.logger.info "LotteryPlugin Parser: Lottery already exists for post ID #{post.id}. Skipping."
        return
      end

      # --- 抽奖解析逻辑 ---
      # 支持两种格式：
      # 1. 简单格式：[在此创建抽奖]
      # 2. 自定义格式：[lottery title="我的抽奖" prize="iPhone 15" cost="10" max="100"]

      # 检查简单格式
      if doc.text.include?("[在此创建抽奖]")
        create_default_lottery(post)
      end

      # 检查自定义格式
      lottery_matches = doc.text.scan(/\[lottery\s+([^\]]+)\]/)
      lottery_matches.each do |match|
        create_custom_lottery(post, match[0])
      end
    end

    private

    def self.create_default_lottery(post)
      Rails.logger.info "LotteryPlugin Parser: Found simple trigger text in post ID #{post.id}."
      begin
        created_lottery = LotteryPlugin::Lottery.create!(
          post_id: post.id,
          topic_id: post.topic_id,
          title: "帖子 #{post.id} 的示例抽奖",
          prize_name: "一份惊喜奖品!",
          points_cost: 5,
          max_entries: 50
        )
        Rails.logger.info "LotteryPlugin Parser: Successfully created default lottery ##{created_lottery.id} for post ID #{post.id}"
      rescue ActiveRecord::RecordInvalid => e
        Rails.logger.error "LotteryPlugin Parser: Failed to create default lottery for post ID #{post.id}. Errors: #{e.record.errors.full_messages.join(", ")}"
      rescue StandardError => e
        Rails.logger.error "LotteryPlugin Parser: Error creating default lottery for post ID #{post.id}. Error: #{e.class.name} - #{e.message}"
      end
    end

    def self.create_custom_lottery(post, params_string)
      Rails.logger.info "LotteryPlugin Parser: Found custom lottery params in post ID #{post.id}: #{params_string}"

      # 解析参数
      params = parse_lottery_params(params_string)

      begin
        lottery_attrs = {
          post_id: post.id,
          topic_id: post.topic_id,
          title: params[:title] || "社区抽奖",
          prize_name: params[:prize] || "神秘奖品",
          points_cost: params[:cost] || 0,
          max_entries: params[:max],
          prize_count: params[:count] || 1
        }

        # 添加自动开奖时间
        if params[:auto_draw_at]
          lottery_attrs[:auto_draw_at] = params[:auto_draw_at]
          lottery_attrs[:auto_draw_enabled] = true
        end

        created_lottery = LotteryPlugin::Lottery.create!(lottery_attrs)
        Rails.logger.info "LotteryPlugin Parser: Successfully created custom lottery ##{created_lottery.id} for post ID #{post.id}"

        # 如果启用了自动开奖，安排后台任务
        if created_lottery.auto_draw_enabled? && created_lottery.auto_draw_at
          schedule_auto_draw(created_lottery)
        end
      rescue ActiveRecord::RecordInvalid => e
        Rails.logger.error "LotteryPlugin Parser: Failed to create custom lottery for post ID #{post.id}. Errors: #{e.record.errors.full_messages.join(", ")}"
      rescue StandardError => e
        Rails.logger.error "LotteryPlugin Parser: Error creating custom lottery for post ID #{post.id}. Error: #{e.class.name} - #{e.message}"
      end
    end

    def self.parse_lottery_params(params_string)
      params = {}

      # 解析 key="value" 格式的参数
      params_string.scan(/(\w+)=["']([^"']+)["']/) do |key, value|
        case key.downcase
        when 'title', 'name'
          params[:title] = value
        when 'prize', 'reward'
          params[:prize] = value
        when 'cost', 'points'
          params[:cost] = value.to_i
        when 'max', 'limit', 'max_entries'
          params[:max] = value.to_i if value.to_i > 0
        when 'count', 'prize_count', 'winners'
          params[:count] = value.to_i if value.to_i > 0
        when 'auto_draw', 'draw_at', 'end_time'
          params[:auto_draw_at] = parse_time_param(value)
        end
      end

      params
    end

    def self.parse_time_param(time_string)
      begin
        # 支持多种时间格式
        case time_string.downcase
        when /^(\d+)h$/ # 例如: "2h" = 2小时后
          $1.to_i.hours.from_now
        when /^(\d+)d$/ # 例如: "3d" = 3天后
          $1.to_i.days.from_now
        when /^(\d+)m$/ # 例如: "30m" = 30分钟后
          $1.to_i.minutes.from_now
        when /^(\d+)s$/ # 例如: "300s" = 300秒后
          $1.to_i.seconds.from_now
        when /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/ # 例如: "2024-12-25 18:00"
          Time.zone.parse(time_string)
        when /^\d{4}-\d{2}-\d{2}$/ # 例如: "2024-12-25"
          Time.zone.parse("#{time_string} 23:59")
        else
          # 尝试直接解析
          Time.zone.parse(time_string)
        end
      rescue => e
        Rails.logger.error "LotteryPlugin Parser: Failed to parse time '#{time_string}': #{e.message}"
        nil
      end
    end

    def self.schedule_auto_draw(lottery)
      # 使用 Discourse 的 Jobs 系统安排自动开奖任务
      delay_seconds = (lottery.auto_draw_at - Time.current).to_i

      if delay_seconds > 0
        Jobs.enqueue_in(delay_seconds, :lottery_auto_draw, lottery_id: lottery.id)
        Rails.logger.info "LotteryPlugin Parser: Scheduled auto draw for lottery ##{lottery.id} at #{lottery.auto_draw_at}"
      elsif delay_seconds <= 0 && lottery.should_auto_draw?
        # 如果时间已经过了，立即安排开奖
        Jobs.enqueue(:lottery_auto_draw, lottery_id: lottery.id)
        Rails.logger.info "LotteryPlugin Parser: Immediately scheduled auto draw for lottery ##{lottery.id}"
      end
    end
  end
end
