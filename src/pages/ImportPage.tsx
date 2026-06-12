import { useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import FileUploadZone from '@/components/ui/FileUploadZone'
import ImportRecordList from '@/components/ui/ImportRecordList'
import ValidationReport from '@/components/ui/ValidationReport'
import { useAppStore } from '@/store'
import { useToast } from '@/components/ToastProvider'
import { Sparkles, Loader2 } from 'lucide-react'

export default function ImportPage() {
  const importTickets = useAppStore((s) => s.importTickets)
  const importScores = useAppStore((s) => s.importScores)
  const importRefunds = useAppStore((s) => s.importRefunds)
  const generateSampleData = useAppStore((s) => s.generateSampleData)
  const records = useAppStore((s) => s.importRecords)
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  const handleGenerateSample = async () => {
    setLoading(true)
    try {
      const result = await generateSampleData()
      toast.success(
        `样例数据生成成功：工单 ${result.ticketCount} 条、评分 ${result.scoreCount} 条、退款 ${result.refundCount} 条，共检测到 ${result.eventCount} 个质量事件`,
        5000
      )
    } catch (e: any) {
      toast.error(`生成失败：${e?.message || '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppLayout title="数据导入">
      <div className="space-y-6">
        <section className="grid grid-cols-3 gap-4">
          <FileUploadZone
            theme="blue"
            label="客服工单CSV"
            description="字段: ticket_no, customer_id, title, content, category, created_at, resolved_at, status, agent_id"
            accept=".csv"
            onUpload={async (file) => {
              const r = await importTickets(file)
              if (r.success && r.errors.length === 0) {
                toast.success(`工单导入成功：新增 ${r.record?.valid_count || 0} 条有效记录`)
              } else if (r.errors.length > 0) {
                toast.warning(`工单导入完成：有效 ${r.record?.valid_count || 0} 条，错误 ${r.errors.length} 条`)
              } else {
                toast.error(`工单导入失败：${r.errors[0] || '未知错误'}`)
              }
              return { success: r.success, warnings: r.warnings, errors: r.errors }
            }}
          />
          <FileUploadZone
            theme="violet"
            label="回访评分CSV"
            description="字段: customer_id, ticket_no, score, comment, visited_at"
            accept=".csv"
            onUpload={async (file) => {
              const r = await importScores(file)
              if (r.success && r.errors.length === 0) {
                toast.success(`评分导入成功：新增 ${r.record?.valid_count || 0} 条有效记录`)
              } else if (r.errors.length > 0) {
                toast.warning(`评分导入完成：有效 ${r.record?.valid_count || 0} 条，错误 ${r.errors.length} 条`)
              } else {
                toast.error(`评分导入失败：${r.errors[0] || '未知错误'}`)
              }
              return { success: r.success, warnings: r.warnings, errors: r.errors }
            }}
          />
          <FileUploadZone
            theme="red"
            label="退款JSON"
            description="字段数组: refund_no, customer_id, order_no, amount, reason, refunded_at"
            accept=".json"
            onUpload={async (file) => {
              const r = await importRefunds(file)
              if (r.success && r.errors.length === 0) {
                toast.success(`退款导入成功：新增 ${r.record?.valid_count || 0} 条有效记录`)
              } else if (r.errors.length > 0) {
                toast.warning(`退款导入完成：有效 ${r.record?.valid_count || 0} 条，错误 ${r.errors.length} 条`)
              } else {
                toast.error(`退款导入失败：${r.errors[0] || '未知错误'}`)
              }
              return { success: r.success, warnings: r.warnings, errors: r.errors }
            }}
          />
        </section>

        <section>
          <button
            onClick={handleGenerateSample}
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 text-white font-bold text-base shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:from-emerald-600 hover:to-teal-700 transition-all disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2.5"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                正在生成样例数据...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                一键生成样例数据
              </>
            )}
          </button>
          <p className="text-center text-xs text-slate-500 mt-2.5">
            快速体验：生成包含工单、评分、退款的完整测试数据集
          </p>
        </section>

        {records.length > 0 && (
          <section>
            <ValidationReport />
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-slate-700">导入历史</h3>
            <span className="text-xs text-slate-500">共 {records.length} 条记录</span>
          </div>
          <ImportRecordList />
        </section>
      </div>
    </AppLayout>
  )
}
