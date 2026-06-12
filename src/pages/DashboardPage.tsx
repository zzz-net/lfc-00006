import AppLayout from '@/components/layout/AppLayout'
import StatCard from '@/components/ui/StatCard'
import EventTable from '@/components/ui/EventTable'
import EventDrawer from '@/components/ui/EventDrawer'
import { useAppStore } from '@/store'
import { AlertTriangle, Clock, Eye, CheckCircle2, Users, Timer, StarOff, Repeat, Banknote } from 'lucide-react'

export default function DashboardPage() {
  const events = useAppStore((s) => s.events)

  const total = events.length
  const pending = events.filter((e) => e.status === 'pending').length
  const reviewing = events.filter((e) => e.status === 'reviewing').length
  const closed = events.filter((e) => e.status === 'closed').length
  const customers = new Set(events.map((e) => e.customer_id)).size

  const timeoutCount = events.filter((e) => e.types.includes('timeout')).length
  const lowScoreCount = events.filter((e) => e.types.includes('low_score')).length
  const repeatCount = events.filter((e) => e.types.includes('repeat_complaint')).length
  const highRefundCount = events.filter((e) => e.types.includes('high_refund')).length

  return (
    <AppLayout title="分析看板">
      <div className="space-y-6">
        <section className="grid grid-cols-5 gap-4">
          <StatCard
            title="事件总数"
            value={total}
            icon={AlertTriangle}
            color="amber"
            subtitle="累计检测到的质量事件"
          />
          <StatCard
            title="待复核"
            value={pending}
            icon={Clock}
            color="red"
            subtitle="需要人工复核的事件"
          />
          <StatCard
            title="复核中"
            value={reviewing}
            icon={Eye}
            color="blue"
            subtitle="正在处理的事件"
          />
          <StatCard
            title="已关闭"
            value={closed}
            icon={CheckCircle2}
            color="emerald"
            subtitle="已完成复核并关闭"
          />
          <StatCard
            title="涉及客户数"
            value={customers}
            icon={Users}
            color="slate"
            subtitle="受影响的客户数量"
          />
        </section>

        <section className="grid grid-cols-4 gap-4">
          <StatCard
            title="超时工单"
            value={timeoutCount}
            icon={Timer}
            color="amber"
            subtitle="解决耗时超过阈值"
          />
          <StatCard
            title="低分投诉"
            value={lowScoreCount}
            icon={StarOff}
            color="rose"
            subtitle="回访评分低于标准"
          />
          <StatCard
            title="重复投诉"
            value={repeatCount}
            icon={Repeat}
            color="violet"
            subtitle="同一客户多次投诉"
          />
          <StatCard
            title="高额退款"
            value={highRefundCount}
            icon={Banknote}
            color="blue"
            subtitle="退款金额超过阈值"
          />
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-slate-700">质量事件列表</h3>
            <span className="text-xs text-slate-500">共 {events.length} 条 · 点击行查看详情</span>
          </div>
          <EventTable />
        </section>
      </div>
      <EventDrawer />
    </AppLayout>
  )
}
